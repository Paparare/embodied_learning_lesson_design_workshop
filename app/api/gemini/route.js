// Server-side proxy that calls the Gemini image generation API.
// The browser POSTs { prompt } to /api/gemini and gets back
// { imageBase64, mimeType } on success, or { error } on failure.
//
// Model: gemini-2.0-flash-exp  (supports responseModalities: ["TEXT","IMAGE"])
// The old preview model name "gemini-2.0-flash-preview-image-generation" was retired.
// Set GEMINI_API_KEY in your Vercel dashboard under Settings → Environment Variables.

// Vercel Pro: allow up to 60 seconds per invocation.
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-2.0-flash-exp";
const MAX_PROMPT_CHARS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry on 429 (rate limit) and transient 5xx — with jittered exponential backoff.
const fetchWithRetry = async (url, options, retries = 3, baseMs = 1000) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt === retries - 1) return res;
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
      `${GEMINI_MODEL}:generateContent` +
      `?key=${process.env.GEMINI_API_KEY}`;

    const geminiRes = await fetchWithRetry(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: safePrompt }] }],
        generationConfig: {
          // TEXT must be included — gemini-2.0-flash-exp returns a text part
          // alongside the image. ["IMAGE"] alone returns no candidates.
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      const msg = errBody?.error?.message || `HTTP ${geminiRes.status}`;
      console.error("/api/gemini upstream error:", geminiRes.status, msg);
      return Response.json({ error: msg }, { status: geminiRes.status >= 500 ? 502 : geminiRes.status });
    }

    const data = await geminiRes.json();

    // Find the inline image part in the response.
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Response.json({
          imageBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
        });
      }
    }

    const reason = data?.candidates?.[0]?.finishReason ?? "unknown";
    console.warn("/api/gemini: no image in response, finishReason:", reason);
    return Response.json({ error: `No image generated (reason: ${reason})` }, { status: 422 });
  } catch (err) {
    console.error("/api/gemini error:", err);
    return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
