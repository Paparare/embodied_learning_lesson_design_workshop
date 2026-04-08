// Debug endpoint — visit /api/test-gemini in browser to diagnose Gemini issues.
// Tests the active model and reports the exact error from Google's API.

export const maxDuration = 60;

const MODELS_TO_TRY = [
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

async function testModel(modelName, key) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${modelName}:generateContent?key=${key}`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Draw a simple red circle on white background." }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
    const data = await res.json().catch(() => null);
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const hasImage = parts.some((p) => p.inlineData?.data);
    return {
      model: modelName,
      httpStatus: res.status,
      imageGenerated: hasImage,
      finishReason: data?.candidates?.[0]?.finishReason ?? null,
      error: res.ok ? null : (data?.error?.message || `HTTP ${res.status}`),
    };
  } catch (err) {
    return { model: modelName, httpStatus: null, imageGenerated: false, error: err?.message };
  }
}

export async function GET() {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: "GEMINI_API_KEY env var is missing on this deployment." });
  }

  const keyPrefix = process.env.GEMINI_API_KEY.slice(0, 8) + "…";

  // Test each model in sequence — stop at the first one that works.
  const results = [];
  let working = null;
  for (const model of MODELS_TO_TRY) {
    const result = await testModel(model, process.env.GEMINI_API_KEY);
    results.push(result);
    if (result.imageGenerated) { working = model; break; }
  }

  return Response.json({
    keyPresent: true,
    keyPrefix,
    activeModel: "gemini-2.0-flash-exp",  // what /api/gemini currently uses
    workingModel: working,
    allResults: results,
    verdict: working
      ? `✓ Images work with model: ${working}`
      : "✗ No model produced an image — check allResults for per-model errors",
  });
}
