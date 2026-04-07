// Server-side proxy that exposes a tiny key-value API backed by Vercel KV.
// Mirrors the shape of the artifact runtime's window.storage helper so that
// the existing storage layer in the React component can call it through a
// thin shim with no other changes.
//
// All keys are prefixed with "embodied:" to avoid collisions if you reuse the
// KV store across other projects.
//
// Operations are dispatched via the "op" field in the POST body:
//   { op: "get",    key }                  -> { value }    (or null)
//   { op: "set",    key, value }           -> { ok: true }
//   { op: "delete", key }                  -> { ok: true }
//   { op: "list",   prefix }               -> { keys }
//
// Vercel KV is automatically wired up via env vars KV_REST_API_URL and
// KV_REST_API_TOKEN, which Vercel injects when you connect a KV store to the
// project from the dashboard.

import { kv } from "@vercel/kv";

const NAMESPACE = "embodied:";
const ns = (key) => NAMESPACE + key;
const unns = (key) => key.startsWith(NAMESPACE) ? key.slice(NAMESPACE.length) : key;

// Defensive value-size cap so a malicious client can't fill the KV with huge
// blobs. 1 MB per value is much more than any single lesson needs.
const MAX_VALUE_BYTES = 1024 * 1024;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { op } = body;

    if (op === "get") {
      const key = String(body.key || "");
      if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
      const value = await kv.get(ns(key));
      if (value === null || value === undefined) return Response.json({ value: null });
      // KV stores JSON natively. The artifact code passes JSON.stringify-ed strings,
      // so we always return strings to keep the contract identical.
      const str = typeof value === "string" ? value : JSON.stringify(value);
      return Response.json({ value: str });
    }

    if (op === "set") {
      const key = String(body.key || "");
      if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
      const value = String(body.value || "");
      if (value.length > MAX_VALUE_BYTES) {
        return Response.json({ error: "Value too large" }, { status: 413 });
      }
      await kv.set(ns(key), value);
      return Response.json({ ok: true });
    }

    if (op === "delete") {
      const key = String(body.key || "");
      if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
      await kv.del(ns(key));
      return Response.json({ ok: true });
    }

    if (op === "list") {
      const prefix = String(body.prefix || "");
      // KV's scan returns keys matching the pattern. We iterate the cursor
      // until done so that the list is complete.
      const matchPattern = ns(prefix) + "*";
      const keys = [];
      let cursor = 0;
      do {
        const [next, batch] = await kv.scan(cursor, { match: matchPattern, count: 200 });
        cursor = Number(next) || 0;
        for (const k of batch) keys.push(unns(k));
      } while (cursor !== 0);
      return Response.json({ keys });
    }

    return Response.json({ error: `Unknown op: ${op}` }, { status: 400 });
  } catch (err) {
    console.error("/api/storage error:", err);
    return Response.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
