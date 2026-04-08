// Server-side proxy that calls the Gemini image generation API.
// The browser POSTs { prompt } to /api/gemini and gets back
// { imageBase64, mimeType } on success, or { error } on failure.
//
// Uses the Gemini REST API directly (no SDK dependency) to avoid
// adding a heavy package and to keep the route self-contained.
//
// Model: gemini-2.0-flash-preview-image-generation
// Set GEMINI_API_KEY in your Vercel dashboard under Settings → Environment Variables.

// Vercel: allow up to 60 seconds — Gemini image generation can take 15-30s.
// Requires Vercel Pro or higher (Hobby plan caps at 10s, which is not enough).
export const maxDuration = 60;

// Maximum prompt length to prevent abuse.
const MAX_PROMPT_CHARS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry helper for 429 (rate limit) and transient 5xx from Gemini.
// With 20-25 teachers generating simultaneously, Gemini free-tier quota
// will occasionally return 429 — retry with jittered backoff.
const fetchWithRetry = async (url, options, retries = 3, baseMs = 1000) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429 && res.status < 500) return res; // success or non-retryable error
    if (attempt === retries - 1) return res; // final attempt — return as-is
    const delay = baseMs * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4);
    console.warn(`/api/gemini: attempt ${attempt + 1} got ${res.status}, retrying in ${Math.round(delay)}ms`);
    await sleep(delay);
  }
};

export async function POST(req) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "GEMINI_API_KEY is not configured on the server." },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { prompt } = body;
    if (typeof prompt !== "string" || !prompt.trim()) {
      return Response.json({ error: "'prompt' must be a non-empty string" }, { status: 400 });
    }

    const safePrompt = prompt.trim().slice(0, MAX_PROMPT_CHARS);

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `gemini-2.0-flash-preview-image-generation:generateContent` +
      `?key=${process.env.GEMINI_API_KEY}`;

    const geminiRes = await fetchWithRetry(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: safePrompt }] }],
          generationConfig: {
            responseModalities: ["IMAGE"],
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      console.error("/api/gemini upstream error:", geminiRes.status, errText);
      return Response.json(
        { error: `Gemini API error ${geminiRes.status}` },
        { status: geminiRes.status >= 500 ? 502 : geminiRes.status }
      );
    }

    const data = await geminiRes.json();

    // Extract the first inline image part from the response.
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Response.json({
          imageBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
        });
      }
    }

    // No image returned (e.g. safety filter blocked it).
    const reason = data?.candidates?.[0]?.finishReason ?? "unknown";
    console.warn("/api/gemini no image in response, finishReason:", reason);
    return Response.json({ error: `No image generated (reason: ${reason})` }, { status: 422 });
  } catch (err) {
    console.error("/api/gemini error:", err);
    return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
