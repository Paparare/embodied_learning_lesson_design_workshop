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

// Exponential backoff retry for rate-limit (429) and transient (5xx) errors.
// With 20-25 teachers hitting Generate at once, bursts will occasionally exceed
// the API's per-minute token limit — retry transparently rather than failing.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const withRetry = async (fn, retries = 3, baseMs = 800) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err?.status === 429 ||
        err?.status === 529 || // Anthropic overload
        (err?.status >= 500 && err?.status < 600);
      if (!isRetryable || attempt === retries - 1) throw err;
      // Jitter ± 20% so simultaneous requests don't all retry in sync.
      const delay = baseMs * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4);
      console.warn(`/api/claude: attempt ${attempt + 1} failed (${err.status}), retrying in ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }
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

    const result = await withRetry(() =>
      getClient().messages.create({
        model: resolvedModel,
        max_tokens: cappedMaxTokens,
        system,
        messages: [{ role: "user", content: user }],
      })
    );

    // Flatten the content blocks into a single text string, matching the shape
    // the artifact's existing callClaude() helper expects.
    const text = (result.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return Response.json({ text });
  } catch (err) {
    console.error("/api/claude error:", err);
    const status = err?.status || 500;
    const message = err?.message || "Unknown error";
    // Surface rate-limit status so the client can back off if needed.
    return Response.json({ error: message }, { status: status === 429 ? 429 : 500 });
  }
}
