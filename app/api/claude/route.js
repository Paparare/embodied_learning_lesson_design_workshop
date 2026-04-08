// Server-side proxy that calls the Anthropic API with the secret key.
// The browser POSTs { system, user, max_tokens } to /api/claude and gets back
// { text } — same shape as the artifact's window.claude.complete return value.
//
// The ANTHROPIC_API_KEY environment variable lives only on the server. It is
// never sent to the browser. Set it in the Vercel dashboard under
// Settings → Environment Variables.

import Anthropic from "@anthropic-ai/sdk";

// Lazy singleton — created on first request, reused across invocations on the
// same warm Lambda instance.
let client = null;
const getClient = () => {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set on the server.");
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
};

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { system, user, max_tokens, model } = body;
    if (typeof system !== "string" || typeof user !== "string") {
      return Response.json(
        { error: "Both 'system' and 'user' must be strings" },
        { status: 400 }
      );
    }

    // Bound max_tokens defensively so a client can't ask for huge generations.
    const cappedMaxTokens = Math.min(
      Math.max(parseInt(max_tokens, 10) || 1500, 64),
      4096
    );

    // Allow callers to specify a cheaper model (e.g. Haiku) for cost savings.
    // Default to Sonnet. Only allow known Anthropic model strings.
    const ALLOWED_MODELS = [
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5-20251001",
    ];
    const resolvedModel =
      typeof model === "string" && ALLOWED_MODELS.includes(model)
        ? model
        : "claude-sonnet-4-5-20250929";

    const result = await getClient().messages.create({
      model: resolvedModel,
      max_tokens: cappedMaxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });

    // Flatten the content blocks into a single text string, matching the shape
    // the artifact's existing callClaude() helper expects.
    const text = (result.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return Response.json({ text });
  } catch (err) {
    console.error("/api/claude error:", err);
    const message = err?.message || "Unknown error";
    // Don't leak the API key or stack trace; return a clean error.
    return Response.json({ error: message }, { status: 500 });
  }
}
