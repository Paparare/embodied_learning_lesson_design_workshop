// Debug endpoint — visit /api/test-gemini in the browser to diagnose Gemini issues.
// Returns a JSON report: key present, model reachable, image generated, raw error if any.
// Safe to leave deployed — it generates only a tiny test image and exposes no secrets.

export const maxDuration = 60;

export async function GET() {
  const report = {
    keyPresent: !!process.env.GEMINI_API_KEY,
    keyPrefix: process.env.GEMINI_API_KEY
      ? process.env.GEMINI_API_KEY.slice(0, 8) + "…"
      : null,
    model: "gemini-2.0-flash-preview-image-generation",
    imageGenerated: false,
    httpStatus: null,
    error: null,
    rawResponseSnippet: null,
  };

  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ ...report, error: "GEMINI_API_KEY env var is missing on this deployment." });
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `gemini-2.0-flash-preview-image-generation:generateContent` +
    `?key=${process.env.GEMINI_API_KEY}`;

  try {
    // Try with TEXT+IMAGE modalities (required for this model)
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Draw a simple red circle on white background." }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });

    report.httpStatus = res.status;
    const data = await res.json().catch(() => null);
    report.rawResponseSnippet = JSON.stringify(data)?.slice(0, 400);

    if (!res.ok) {
      report.error = data?.error?.message || `HTTP ${res.status}`;
      return Response.json(report);
    }

    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p.inlineData?.data);
    if (imgPart) {
      report.imageGenerated = true;
      report.mimeType = imgPart.inlineData.mimeType;
    } else {
      report.error =
        "API returned 200 but no image part found. finishReason: " +
        (data?.candidates?.[0]?.finishReason ?? "unknown");
    }
  } catch (err) {
    report.error = err?.message || String(err);
  }

  return Response.json(report);
}
