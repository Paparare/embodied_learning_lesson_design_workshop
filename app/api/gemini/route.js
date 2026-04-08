// Server-side proxy that calls the Gemini image generation API.
// The browser POSTs { prompt } to /api/gemini and gets back
// { imageBase64, mimeType } on success, or { error } on failure.
//
// Uses the Gemini REST API directly (no SDK dependency) to avoid
// adding a heavy package and to keep the route self-contained.
//
// Model: gemini-2.0-flash-preview-image-generation
// Set GEMINI_API_KEY in your Vercel dashboard under Settings → Environment Variables.

// Maximum prompt length to prevent abuse.
const MAX_PROMPT_CHARS = 1000;

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

    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: safePrompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
        },
      }),
    });

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
