"use client";

import React, { useState, useEffect, useRef } from "react";

// ============================================================
// Embodied AIED Studio — Experience Edition
// Teachers build. Then play each other's lessons as students.
// ============================================================

const C = {
  ink: "#2a2522",
  paper: "#f6f0e4",
  paperDeep: "#ecdfc8",
  cream: "#fffaf0",
  coral: "#e8624a",
  sage: "#8ba888",
  mustard: "#d4a017",
  muted: "#8a7d6e",
};

const FD = "'Fraunces', Georgia, serif";
const FB = "'Inter', system-ui, sans-serif";
const FM = "'JetBrains Mono', monospace";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Claude API ----------
// ---------- Claude API ----------
// Calls our server-side proxy at /api/claude, which holds the secret
// ANTHROPIC_API_KEY. The browser never sees the key.
const callClaude = async (system, user, maxTokens = 1500) => {
  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user, max_tokens: maxTokens }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.text || null;
  } catch (e) {
    return null;
  }
};

// Variant that accepts an optional model string (for cheaper Haiku calls in the visualizer).
const callClaudeModel = async (system, user, maxTokens = 1500, model = null) => {
  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user, max_tokens: maxTokens, model }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.text || null;
  } catch (e) {
    return null;
  }
};

// Calls the /api/gemini proxy which uses Gemini image generation.
// Returns { imageBase64, mimeType } on success, or null on failure.
const callGemini = async (prompt) => {
  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.imageBase64 ? data : null;
  } catch (e) {
    return null;
  }
};

// ---------- Prompts ----------
// Only experienceable non-embodied types.
const genPiecesSystem = `You generate lesson building blocks for teachers. Given a subject and learning goal, output exactly 8 NON-EMBODIED lesson activities as JSON — traditional teaching formats where students sit, listen, read, watch, or write alone. ONLY use these five types: lecture, worksheet, video, quiz, reading, slide. Do NOT use discussion, group work, demo, or anything requiring another person. Do NOT include any activity where students move, gesture, or use their bodies. Each activity is 6-12 words, concrete to the subject. Mix the types. Return ONLY valid JSON, no prose, no markdown fences:
{"pieces":[{"id":"p1","title":"...","type":"lecture|worksheet|video|quiz|reading|slide","icon":"📖"},...]}
Icons: lecture 🎙️, worksheet 📝, video 📺, quiz ✅, reading 📖, slide 🖼️.`;

const genEmbodiedSwapSystem = `A teacher has a non-embodied lesson activity. Propose 3 ways to transform it into an embodied version where a SINGLE student learning alone can physically perform the action — using their own body, gestures, movement, or small objects within reach (no partner needed). Each transformation is 8-15 words, specific and concrete. Return ONLY valid JSON, no prose:
{"swaps":[{"id":"s1","title":"...","why":"one short sentence on the cognitive rationale"},...]}`;

const genDebriefSystem = `A teacher built a lesson. Give them a warm, 2-3 sentence reflection on the embodied/non-embodied balance and one gentle question. Plain text only, no markdown.`;

// Per-type "experience content" generation
const expPrompts = {
  lecture: `Generate a short lecture (150-200 words) a student could read on screen, in a warm teaching voice. Return JSON only: {"script":"..."}`,
  reading: `Generate a short reading passage (150-220 words) on this topic suitable for the given grade level. Return JSON only: {"passage":"..."}`,
  slide: `Generate content for a single clear slide. Return JSON only: {"title":"...","bullets":["...","...","..."],"visual":"one-sentence description of the key visual/diagram"}`,
  video: `Generate a realistic video-style explainer that will be presented as a narrated storyboard (since real video embedding is not possible). Return JSON only: {"narration":"~120 word narration script","scenes":[{"visual":"what's on screen","caption":"caption under it"},...3-4 scenes total]}`,
  worksheet: `Generate 3 short practice problems with answers. Each problem should be solvable by typing a short answer. Return JSON only: {"problems":[{"q":"question text","a":"expected short answer","hint":"one line hint"},...]}`,
  quiz: `Generate 3 multiple-choice questions. Return JSON only: {"questions":[{"q":"...","options":["A","B","C","D"],"correct":0,"explain":"one-line explanation"},...]}`,
  embodied: `Generate step-by-step instructions a single student can perform alone using their body/gestures/small objects. 4-6 numbered steps, each 1 sentence in second person. Include a short "what to notice" reflection afterward. Return JSON only: {"steps":["step 1","step 2",...],"notice":"one sentence on what to reflect on"}`,
};

const makeExpSystem = (type) => `You generate student-facing learning content for a live workshop. ${expPrompts[type]} Keep tone warm and grade-appropriate. No markdown, no prose outside JSON.`;

// ---------- Visualization Prompts ----------

const vizSlideSystem = `You are an expert in embodied cognition and learning design. Generate exactly 3 presentation slides that demonstrate an embodied learning transformation for an education research audience. Each slide has a clear before/after/why structure. Return ONLY valid JSON, no prose:
{"slides":[
  {"num":1,"label":"BEFORE","badge":"Non-Embodied 💺","title":"...","subtitle":"The Traditional Approach","bullets":["...","...","..."],"visualDesc":"one sentence describing an illustration for this slide"},
  {"num":2,"label":"AFTER","badge":"Embodied 🤸","title":"...","subtitle":"The Embodied Transformation","bullets":["...","...","..."],"visualDesc":"one sentence describing a scene of students doing the activity"},
  {"num":3,"label":"WHY","badge":"Research-Backed 🧠","title":"Why It Works","subtitle":"The Cognitive Science","bullets":["...","...","..."],"visualDesc":"one sentence describing a conceptual diagram of the cognitive mechanism"}
]}
Bullets are concrete and audience-ready (8-15 words each). No markdown inside strings.`;

const vizCardSystem = `You are a learning design expert. Generate a compact scenario card for an embodied learning activity, for an audience of teachers and researchers. Return ONLY valid JSON, no prose:
{"cardTitle":"...","scenario":"One sentence setting the scene — what the student does, where, and why (present tense).","steps":["Step 1: ...","Step 2: ...","Step 3: ...","Step 4: ..."],"bodyConnection":"One sentence on how the body movement connects to the abstract concept.","cognitiveRationale":"One sentence citing the core cognitive principle (e.g. embodied cognition, gesture-thought link, sensorimotor grounding).","researchTag":"e.g. 'Barsalou, 2008 — Grounded Cognition'"}`;

// ---------- Helpers ----------
const safeJSON = (txt) => {
  if (!txt) return null;
  try {
    const cleaned = txt.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
};

const iconForType = (t) => ({
  lecture: "🎙️", worksheet: "📝", video: "📺", quiz: "✅",
  reading: "📖", slide: "🖼️",
}[t] || "📌");

// Convert a YouTube/Vimeo URL to an embeddable iframe URL, or return null.
const toEmbedUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  const s = url.trim();
  if (!s) return null;
  // YouTube: watch?v=, youtu.be/, shorts/, embed/
  const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  // Vimeo: vimeo.com/ID
  const vm = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
};

// Extract richer info from a video URL: id, kind, watch URL, and thumbnail.
// Used to render a clickable preview card since the artifact sandbox blocks
// third-party iframes (YouTube/Vimeo embeds won't load inside Claude artifacts).
const getVideoInfo = (url) => {
  if (!url || typeof url !== "string") return null;
  const s = url.trim();
  if (!s) return null;
  const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  if (yt) {
    const id = yt[1];
    return {
      kind: "youtube",
      id,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      // hqdefault is a 480x360 thumbnail that always exists for any video
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }
  const vm = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) {
    const id = vm[1];
    return {
      kind: "vimeo",
      id,
      watchUrl: `https://vimeo.com/${id}`,
      // Vimeo doesn't expose a stable no-API thumbnail, so we just show a generic card
      thumbnail: null,
    };
  }
  return null;
};

// ---------- Storage ----------
// Sharded storage model for high concurrency:
//   lessons:index    -> [{id, authorId, updatedAt}, ...] (small, rarely written)
//   lesson:<id>      -> full lesson JSON (one key per lesson; only the author writes it)
//
// All operations go through kvStorage, which is a thin shim over the
// /api/storage server route backed by Vercel KV. The shape of each method
// matches the artifact runtime's window.storage so the rest of the file did
// not need to be rewritten when porting from the artifact to Vercel.

const KEY_INDEX = "lessons:index";
const lessonKey = (id) => `lesson:${id}`;

// Browser-side shim for the server's /api/storage endpoint.
// Returns the same shapes the artifact's window.storage returned, so all the
// downstream sharded-storage helpers (loadIndex, saveLessonById, etc.) work
// unchanged. The trailing `_shared` arg is accepted for compatibility but
// ignored — everything in the KV is shared by default in the deployed app.
const kvStorage = {
  async get(key, _shared) {
    const res = await fetch("/api/storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "get", key }),
    });
    if (!res.ok) throw new Error(`storage get failed: ${res.status}`);
    const data = await res.json();
    if (data?.value === null || data?.value === undefined) return null;
    return { value: data.value };
  },
  async set(key, value, _shared) {
    const res = await fetch("/api/storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "set", key, value }),
    });
    if (!res.ok) throw new Error(`storage set failed: ${res.status}`);
    return await res.json();
  },
  async delete(key, _shared) {
    const res = await fetch("/api/storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "delete", key }),
    });
    if (!res.ok) throw new Error(`storage delete failed: ${res.status}`);
    return await res.json();
  },
  async list(prefix, _shared) {
    const res = await fetch("/api/storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "list", prefix: prefix || "" }),
    });
    if (!res.ok) throw new Error(`storage list failed: ${res.status}`);
    return await res.json();
  },
};

// Sleep helper
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Generic retry-with-backoff for transient storage failures.
// Returns the wrapped function's resolved value, or null if all attempts fail.
const withRetry = async (fn, { attempts = 4, baseMs = 120 } = {}) => {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      // Backoff: 120ms, 280ms, 560ms, 1080ms (with small jitter)
      const wait = baseMs * Math.pow(2, i) + Math.random() * 60;
      await sleep(wait);
    }
  }
  console.error("storage retry exhausted:", lastErr);
  return null;
};

// ---- Index ----
const loadIndex = async () => {
  try {
    const r = await kvStorage.get(KEY_INDEX, true);
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
};
const saveIndex = async (entries) => {
  return withRetry(() => kvStorage.set(KEY_INDEX, JSON.stringify(entries), true));
};

// ---- Single lesson key ----
const loadLessonById = async (id) => {
  try {
    const r = await kvStorage.get(lessonKey(id), true);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
};
const saveLessonById = async (lesson) => {
  return withRetry(() =>
    kvStorage.set(lessonKey(lesson.id), JSON.stringify(lesson), true)
  );
};
const deleteLessonKey = async (id) => {
  return withRetry(() => kvStorage.delete(lessonKey(id), true));
};

// ---- High-level operations ----

// Load every lesson by reading the index then fetching each key in parallel.
// Read all lessons by listing the index then fetching each lesson key in parallel.
const loadAllLessons = async () => {
  const index = await loadIndex();
  if (!index || index.length === 0) return [];

  // Fetch all lessons in parallel
  const results = await Promise.all(
    index.map(entry => loadLessonById(entry.id).catch(() => null))
  );
  // Drop null/missing entries (could happen if a lesson was deleted but index not yet updated)
  const lessons = results.filter(Boolean);
  // Keep them sorted newest-first by createdAt
  lessons.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return lessons;
};

// Delta sync: given a previous map of {id -> updatedAt}, fetch only lessons
// whose index entry has a newer updatedAt or that are new. Returns the full
// merged list and the new index map. Cheap when nothing changed.
const loadLessonsDelta = async (prevMap, prevLessons) => {
  const index = await loadIndex();
  if (!index) return { lessons: prevLessons || [], indexMap: prevMap || {} };
  const newMap = {};
  index.forEach(e => { newMap[e.id] = e.updatedAt; });

  // Decide which to fetch
  const toFetch = index.filter(e => !prevMap || prevMap[e.id] !== e.updatedAt);
  // Pieces still present in the index keep whatever we already had locally
  const stillPresent = new Set(index.map(e => e.id));
  const kept = (prevLessons || []).filter(l => stillPresent.has(l.id) && !toFetch.find(e => e.id === l.id));

  let fetched = [];
  if (toFetch.length > 0) {
    const results = await Promise.all(
      toFetch.map(e => loadLessonById(e.id).catch(() => null))
    );
    fetched = results.filter(Boolean);
  }
  const merged = [...fetched, ...kept];
  merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { lessons: merged, indexMap: newMap };
};

// Add or replace a lesson. Writes the lesson key, then updates the index
// with retry-on-conflict so concurrent publishers don't clobber each other.
const upsertLesson = async (lesson) => {
  // Step 1: write the lesson's own key (no contention)
  await saveLessonById(lesson);
  // Step 2: update the index with retry-on-conflict
  for (let attempt = 0; attempt < 5; attempt++) {
    const fresh = await loadIndex();
    const filtered = fresh.filter(e => e.id !== lesson.id);
    const updated = [
      { id: lesson.id, authorId: lesson.authorId, updatedAt: Date.now() },
      ...filtered,
    ];
    try {
      await kvStorage.set(KEY_INDEX, JSON.stringify(updated), true);
      return true;
    } catch (e) {
      // Backoff and retry
      await sleep(120 * Math.pow(2, attempt) + Math.random() * 60);
    }
  }
  return false;
};

// Update a single lesson via a mutator function, with retry-on-conflict.
// Used for stars and comments. Also bumps the index entry's updatedAt.
const updateLesson = async (id, mutate) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await loadLessonById(id);
    if (!current) return null;
    const next = mutate(current);
    if (!next) return null;
    try {
      await kvStorage.set(lessonKey(id), JSON.stringify(next), true);
      // Touch the index entry so other clients see the change on next poll
      await touchIndexEntry(id);
      return next;
    } catch (e) {
      await sleep(100 * Math.pow(2, attempt) + Math.random() * 50);
    }
  }
  return null;
};

// Bump updatedAt for a single index entry (with retry).
const touchIndexEntry = async (id) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const fresh = await loadIndex();
    const next = fresh.map(e => e.id === id ? { ...e, updatedAt: Date.now() } : e);
    try {
      await kvStorage.set(KEY_INDEX, JSON.stringify(next), true);
      return true;
    } catch {
      await sleep(100 * Math.pow(2, attempt));
    }
  }
  return false;
};

// Remove a lesson. Deletes the lesson key and removes from the index.
// `requestingUserId`: if facilitator pass null; otherwise the lesson's author check is enforced here.
const removeLessonStrict = async (id, requestingUserId) => {
  if (requestingUserId !== null) {
    const current = await loadLessonById(id);
    if (!current || current.authorId !== requestingUserId) return false;
  }
  // Delete the lesson key first
  await deleteLessonKey(id);
  // Then remove from index, with retry
  for (let attempt = 0; attempt < 5; attempt++) {
    const fresh = await loadIndex();
    const next = fresh.filter(e => e.id !== id);
    try {
      await kvStorage.set(KEY_INDEX, JSON.stringify(next), true);
      return true;
    } catch {
      await sleep(120 * Math.pow(2, attempt));
    }
  }
  return false;
};

// Wipe everything (facilitator clear).
const clearAllLessons = async () => {
  const index = await loadIndex();
  await Promise.all((index || []).map(e => deleteLessonKey(e.id).catch(() => null)));
  await withRetry(() => kvStorage.set(KEY_INDEX, JSON.stringify([]), true));
  return true;
};

// ---- Compatibility shims for existing callers ----
// These keep older code paths working while the rest of the app migrates.
const loadLessons = async () => loadAllLessons();
const saveLessons = async (_lessons) => {
  // No-op: in the sharded model, callers should use upsertLesson / updateLesson / removeLessonStrict.
  // We keep this so any stray callers don't crash.
  console.warn("saveLessons() is deprecated in the sharded storage model — use upsertLesson/updateLesson/removeLessonStrict.");
};

// ---------- Concurrency-limited parallel map ----------
// Run `mapper(item)` for each item in `items` with at most `limit` in flight at once.
// Used to throttle the "Generate Full Lesson" API calls so each teacher only puts
// 3 requests against the conversation rate limit at any moment, instead of 8.
const parallelMapLimit = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try { results[i] = await mapper(items[i], i); }
      catch (e) { results[i] = null; }
    }
  });
  await Promise.all(workers);
  return results;
};

// ============================================================
// Main
// ============================================================
export default function EmbodiedAiedStudio() {
  const [me, setMe] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [view, setView] = useState("design");
  const [lessons, setLessons] = useState([]);
  // Facilitator mode: click the studio title 3 times quickly to unlock.
  const [facilitatorMode, setFacilitatorMode] = useState(false);
  const titleClickRef = useRef({ count: 0, timer: null });
  // Designer registers its resetAll here so the logo click can invoke it.
  const designerResetRef = useRef(null);

  const onTitleClick = () => {
    // Triple-click (within 800ms) toggles facilitator mode.
    const ref = titleClickRef.current;
    ref.count += 1;
    if (ref.timer) clearTimeout(ref.timer);
    ref.timer = setTimeout(() => { ref.count = 0; }, 800);
    if (ref.count >= 3) {
      ref.count = 0;
      setFacilitatorMode((m) => !m);
      return;
    }
    // Single-click while in design view → back to beginning.
    if (view === "design" && designerResetRef.current) {
      designerResetRef.current();
    }
  };

  // Delta-sync index map: { lessonId -> updatedAt }. Lets the poll loop fetch
  // only lessons that actually changed since the last tick, instead of re-pulling
  // every key every 5 seconds.
  const indexMapRef = useRef({});
  const lessonsRef = useRef([]);
  // Bump this to trigger an immediate re-sync (manual refresh button).
  const [refreshTick, setRefreshTick] = useState(0);

  const refreshNow = async () => {
    const { lessons: merged, indexMap } = await loadLessonsDelta(indexMapRef.current, lessonsRef.current);
    indexMapRef.current = indexMap;
    lessonsRef.current = merged;
    setLessons(merged);
  };

  useEffect(() => {
    (async () => {
      // User identity lives in localStorage — it's per-browser, not shared
      // across teachers, so it has no business being in the shared KV store.
      try {
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem("embodied:me");
          if (raw) setMe(JSON.parse(raw));
        }
      } catch {}
      // Seed the example lesson if the gallery doesn't have one yet
      // (idempotent — safe to run on every load).
      await seedExampleLessonIfMissing();
      // Initial load — full sync
      const all = await loadAllLessons();
      const map = {};
      // Pull the index once to seed the delta map
      const idx = await loadIndex();
      (idx || []).forEach(e => { map[e.id] = e.updatedAt; });
      indexMapRef.current = map;
      lessonsRef.current = all;
      setLessons(all);
    })();
  }, []);

  useEffect(() => {
    // 10-second poll using delta sync — much cheaper than re-fetching everything.
    const t = setInterval(refreshNow, 10000);
    return () => clearInterval(t);
  }, []);

  // Manual refresh trigger (e.g. from the Gallery refresh button)
  useEffect(() => {
    if (refreshTick === 0) return;
    refreshNow();
  }, [refreshTick]);

  const join = async () => {
    if (!nameInput.trim()) return;
    const u = { id: uid(), name: nameInput.trim() };
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("embodied:me", JSON.stringify(u));
      }
    } catch {}
    setMe(u);
  };

  // Note: Google Fonts are loaded once in app/layout.js, not here.

  if (!me) return <Onboarding v={nameInput} setV={setNameInput} join={join} />;

  return (
    <div style={{
      fontFamily: FB, background: C.paper, minHeight: "100vh", color: C.ink,
      backgroundImage: `radial-gradient(circle at 20% 10%, ${C.paperDeep}55, transparent 50%), radial-gradient(circle at 80% 80%, ${C.sage}22, transparent 50%)`,
    }}>
      <Header
        view={view} setView={setView} me={me} count={lessons.length}
        facilitatorMode={facilitatorMode} onTitleClick={onTitleClick}
      />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 80px" }}>
        {view === "design" && (
          <Designer
            me={me} lessons={lessons} setLessons={setLessons}
            lessonsRef={lessonsRef} indexMapRef={indexMapRef}
            setView={setView}
            onRegisterReset={(fn) => { designerResetRef.current = fn; }}
          />
        )}
        {view === "gallery" && (
          <Gallery
            me={me} lessons={lessons} setLessons={setLessons}
            onRefresh={refreshNow} lessonsRef={lessonsRef} indexMapRef={indexMapRef}
          />
        )}
        {view === "facilitator" && facilitatorMode && (
            <FacilitatorView
              lessons={lessons} setLessons={setLessons} me={me}
              onRefresh={refreshNow} lessonsRef={lessonsRef} indexMapRef={indexMapRef}
            />
          )}
      </div>
    </div>
  );
}

// ============================================================
// Onboarding
// ============================================================
function Onboarding({ v, setV, join }) {
  return (
    <div style={{
      fontFamily: FB, background: C.paper, minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      backgroundImage: `radial-gradient(circle at 30% 20%, ${C.sage}33, transparent 50%), radial-gradient(circle at 70% 80%, ${C.coral}22, transparent 50%)`,
    }}>
      <div style={{
        maxWidth: 520, width: "100%", background: C.cream,
        border: `1.5px solid ${C.ink}`, borderRadius: 20,
        padding: "48px 40px", boxShadow: `0 20px 40px -20px ${C.ink}44`,
      }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>🤸‍♀️</div>
        <h1 style={{
          fontFamily: FD, fontSize: 40, fontWeight: 700,
          margin: "0 0 12px", lineHeight: 1, letterSpacing: -1,
        }}>
          Embodied <em style={{ color: C.coral, fontStyle: "italic" }}>AI-ED</em><br />Studio
        </h1>
        <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, margin: "0 0 28px" }}>
          Build a lesson. Transform it. Then play each other's as students.
        </p>
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && join()}
          placeholder="Your name"
          style={{
            width: "100%", padding: "14px 18px", fontSize: 16, fontFamily: FB,
            border: `1.5px solid ${C.ink}`, borderRadius: 12, background: C.paper,
            outline: "none", boxSizing: "border-box",
          }}
        />
        <button onClick={join} style={{
          width: "100%", marginTop: 14, padding: "14px", background: C.coral, color: "white",
          border: "none", borderRadius: 12, fontFamily: FD, fontSize: 18, fontWeight: 600,
          cursor: "pointer",
        }}>
          Enter Studio →
        </button>
      </div>
    </div>
  );
}

function Header({ view, setView, me, count, facilitatorMode, onTitleClick }) {
  const tab = (id, label, icon) => (
    <button onClick={() => setView(id)} style={{
      background: view === id ? C.ink : "transparent",
      color: view === id ? C.paper : C.ink,
      border: `1.5px solid ${C.ink}`,
      padding: "8px 16px", borderRadius: 20, fontFamily: FM, fontSize: 11,
      letterSpacing: 0.8, cursor: "pointer", textTransform: "uppercase",
    }}>
      {icon} {label}
    </button>
  );
  return (
    <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      flexWrap: "wrap", gap: 12 }}>
      <div>
        <div
          onClick={onTitleClick}
          style={{
            fontFamily: FD, fontSize: 24, fontWeight: 700, letterSpacing: -0.5,
            cursor: "pointer", userSelect: "none",
          }}
          title=""
        >
          Embodied <em style={{ color: C.coral }}>AI-ED</em> Studio
          {facilitatorMode && (
            <span style={{
              marginLeft: 10, fontFamily: FM, fontSize: 10, color: C.coral,
              letterSpacing: 1, textTransform: "uppercase",
            }}>
              · facilitator
            </span>
          )}
        </div>
        <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 0.8, marginTop: 2 }}>
          {me.name.toUpperCase()}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {tab("design", "Build", "✏️")}
        {tab("gallery", `Gallery ${count > 0 ? `· ${count}` : ""}`, "🎭")}
        {facilitatorMode && tab("facilitator", "Debrief", "📊")}
      </div>
    </div>
  );
}

// ============================================================
// Designer
// ============================================================
function Designer({ me, lessons, setLessons, setView, onRegisterReset }) {
  const [stage, setStage] = useState("setup"); // setup | assemble | review | published
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [goal, setGoal] = useState("");
  const [pieces, setPieces] = useState([]);
  const [timeline, setTimeline] = useState({ open: [], core: [], close: [] });
  const [loading, setLoading] = useState(false);
  const [published, setPublished] = useState(false);
  const [debrief, setDebrief] = useState("");
  // Pre-generated content: map of pieceUid -> { type, data }
  const [generatedContent, setGeneratedContent] = useState({});
  const [generatingAll, setGeneratingAll] = useState(false);
  const [regenerating, setRegenerating] = useState({});    // uid -> bool  (content)
  const [regeneratingViz, setRegeneratingViz] = useState({}); // uid -> bool  (visual)
  const [generatedViz, setGeneratedViz] = useState({}); // uid -> { format, slides?, card?, slideImages?, cardImage? }
  // Snapshot of the original AI-generated pieces (for facilitator walkthrough).
  // Captured once at generate time; never mutated, even as teacher edits.
  const [originalPieces, setOriginalPieces] = useState([]);

  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  // Touch drag: tracks current finger position and a preview card.
  // { pieceUid, from, x, y } while active; null otherwise.
  const [touchDrag, setTouchDrag] = useState(null);
  const touchDragRef = useRef(null);

  const generate = async () => {
    if (!subject.trim()) return;
    setLoading(true);
    const prompt = `Subject: ${subject}\nGrade: ${grade || "(any)"}\nLearning goal: ${goal || "(teacher has not specified — infer a good one)"}\n\nGenerate 8 non-embodied pieces.`;
    const raw = await callClaude(genPiecesSystem, prompt, 1500);
    const parsed = safeJSON(raw);
    let initial;
    if (parsed?.pieces) {
      initial = parsed.pieces.map(p => ({ ...p, uid: uid() }));
    } else {
      initial = fallbackPieces(subject);
    }
    setPieces(initial);
    // Snapshot a deep-ish copy of the original pool for later facilitator review.
    setOriginalPieces(initial.map(p => ({ ...p })));
    setStage("assemble");
    setLoading(false);
  };

  const isEmbodied = (p) => !!p.transformedTo;

  const onDragStart = (pieceUid, from) => setDragging({ uid: pieceUid, from });
  const onDragEnd = () => { setDragging(null); setDragOver(null); };

  // ---------- Touch drag ----------
  // Start a touch drag after a short long-press (handled in PieceCard).
  // Designer installs a single global touchmove/touchend listener while active.
  const onTouchDragStart = (pieceUid, from, x, y) => {
    const td = { pieceUid, from, x, y };
    touchDragRef.current = td;
    setTouchDrag(td);
    setDragging({ uid: pieceUid, from }); // re-use desktop dragging state for visual styling
  };

  // Resolve drop target from the element under the finger.
  const resolveTouchDrop = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return { slot: null, index: null };
    const gapEl = el.closest("[data-drop-gap]");
    if (gapEl) {
      const [slot, idxStr] = gapEl.getAttribute("data-drop-gap").split(":");
      return { slot, index: parseInt(idxStr, 10) };
    }
    const slotEl = el.closest("[data-drop-slot]");
    if (slotEl) return { slot: slotEl.getAttribute("data-drop-slot"), index: null };
    return { slot: null, index: null };
  };

  useEffect(() => {
    if (!touchDrag) return;
    const onMove = (e) => {
      const t = e.touches[0];
      if (!t) return;
      const x = t.clientX, y = t.clientY;
      touchDragRef.current = { ...touchDragRef.current, x, y };
      setTouchDrag((td) => td ? { ...td, x, y } : td);
      const { slot } = resolveTouchDrop(x, y);
      setDragOver(slot);
      // Prevent page scroll while dragging
      e.preventDefault();
    };
    const onEnd = (e) => {
      const td = touchDragRef.current;
      touchDragRef.current = null;
      setTouchDrag(null);
      if (!td) { onDragEnd(); return; }
      const { slot, index } = resolveTouchDrop(td.x, td.y);
      if (slot) {
        doMove(td.pieceUid, slot, index);
      }
      onDragEnd();
    };
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [touchDrag?.pieceUid]);

  const doMove = (pieceUid, toSlot, toIndex = null) => {
    let found = pieces.find(p => p.uid === pieceUid);
    let newPool = pieces;
    const newTL = { open: [...timeline.open], core: [...timeline.core], close: [...timeline.close] };
    let fromSlot = null;
    let fromIndex = -1;

    if (found) {
      newPool = pieces.filter(p => p.uid !== pieceUid);
      fromSlot = "pool";
    } else {
      for (const slot of ["open", "core", "close"]) {
        const i = newTL[slot].findIndex(p => p.uid === pieceUid);
        if (i >= 0) {
          found = newTL[slot][i];
          newTL[slot].splice(i, 1);
          fromSlot = slot;
          fromIndex = i;
          break;
        }
      }
    }
    if (!found) return;

    if (toSlot === "pool") {
      newPool = [...newPool, found];
    } else {
      // Adjust insertion index if moving within the same slot and original position was before target
      let insertAt = toIndex;
      if (insertAt == null) {
        insertAt = newTL[toSlot].length; // append
      } else if (fromSlot === toSlot && fromIndex !== -1 && fromIndex < insertAt) {
        insertAt -= 1;
      }
      insertAt = Math.max(0, Math.min(insertAt, newTL[toSlot].length));
      newTL[toSlot] = [
        ...newTL[toSlot].slice(0, insertAt),
        found,
        ...newTL[toSlot].slice(insertAt),
      ];
    }
    setPieces(newPool);
    setTimeline(newTL);
  };

  const onDrop = (toSlot, toIndex = null) => {
    if (!dragging) return;
    doMove(dragging.uid, toSlot, toIndex);
    onDragEnd();
  };

  // Double-click: smart default — pool→core, timeline→pool
  const onDoubleClick = (pieceUid, from) => {
    if (from === "pool") doMove(pieceUid, "core");
    else doMove(pieceUid, "pool");
  };

  const transformPiece = (pieceUid, newTitle, newWhy) => {
    const newTL = { ...timeline };
    for (const slot of ["open", "core", "close"]) {
      const i = newTL[slot].findIndex(p => p.uid === pieceUid);
      if (i >= 0) {
        newTL[slot] = [...newTL[slot]];
        newTL[slot][i] = {
          ...newTL[slot][i],
          transformedTo: newTitle,
          transformWhy: newWhy || "",
          icon: "🤸",
        };
        setTimeline(newTL);
        return;
      }
    }
  };

  const revertPiece = (pieceUid) => {
    const newTL = { ...timeline };
    for (const slot of ["open", "core", "close"]) {
      const i = newTL[slot].findIndex(p => p.uid === pieceUid);
      if (i >= 0) {
        newTL[slot] = [...newTL[slot]];
        const p = { ...newTL[slot][i] };
        delete p.transformedTo;
        delete p.transformWhy;
        p.icon = iconForType(p.type);
        newTL[slot][i] = p;
        setTimeline(newTL);
        return;
      }
    }
  };

  // Generate learning content for a single piece, with retry on transient failures.
  // Will try up to 3 times with backoff before giving up.
  const generateContentForPiece = async (piece) => {
    const type = piece.transformedTo ? "embodied" : piece.type;
    const title = piece.transformedTo || piece.title;
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = await callClaude(
        makeExpSystem(type),
        `Subject: ${subject}\nGrade: ${grade || "(any)"}\nLearning goal: ${goal || ""}\n\nActivity to generate: "${title}"`,
        1500
      );
      const parsed = safeJSON(raw);
      if (parsed) return { type, data: parsed };
      // Backoff before retrying
      await sleep(400 * (attempt + 1) + Math.random() * 200);
    }
    return null;
  };

  // Move from assemble → review, generating content then visualizations.
  // Two sequential phases keeps peak API concurrency manageable for 20-25 simultaneous
  // teachers: content first (3 concurrent), viz second (2 concurrent).
  // Doing them in parallel per-piece would double concurrent calls and reliably hit
  // Claude/Gemini rate limits.
  const generateAllAndReview = async () => {
    const all = [...timeline.open, ...timeline.core, ...timeline.close];
    if (all.length < 3) {
      alert("Add at least 3 pieces to your timeline first.");
      return;
    }
    setGeneratingAll(true);
    setStage("review");

    // Generate learning content only — visualizations are on-demand via
    // the "Generate Visual" button on each piece card so the designer can
    // finish editing first.
    const toGenerate = all.filter(p => !generatedContent[p.uid]);
    if (toGenerate.length > 0) {
      await parallelMapLimit(toGenerate, 3, async (p) => {
        const result = await generateContentForPiece(p);
        if (result) {
          setGeneratedContent(prev => ({ ...prev, [p.uid]: result }));
        }
      });
    }

    setGeneratingAll(false);
  };

  // Regenerate learning content only for a single piece.
  const regenerateOne = async (piece) => {
    setRegenerating(r => ({ ...r, [piece.uid]: true }));
    const result = await generateContentForPiece(piece);
    if (result) setGeneratedContent(c => ({ ...c, [piece.uid]: result }));
    setRegenerating(r => ({ ...r, [piece.uid]: false }));
  };

  // Regenerate (or generate for the first time) the visualization for a single piece.
  // Called by both the "Generate Visual" button (first run) and "↻ Visual" (re-run).
  const regenerateVizOne = async (piece) => {
    setRegeneratingViz(r => ({ ...r, [piece.uid]: true }));
    const viz = await generateVizForPiece(piece);
    if (viz) setGeneratedViz(v => ({ ...v, [piece.uid]: viz }));
    setRegeneratingViz(r => ({ ...r, [piece.uid]: false }));
  };

  // Generate a visualization (slide deck or scenario card) for a single piece.
  // Uses recommendViz() to pick format, then calls Claude (Haiku) + Gemini.
  // Returns { format, slides?, slideImages?, card?, cardImage? } or null on failure.
  const generateVizForPiece = async (piece) => {
    const rec = recommendViz(piece);
    const isEmb = !!piece.transformedTo;
    const origTitle = piece.title || "activity";
    const embTitle = piece.transformedTo?.title || origTitle;
    const why = piece.transformedTo?.why || piece.transformWhy || "";

    const prompt = [
      `Subject: ${subject}`,
      `Grade: ${grade || "(any)"}`,
      `Learning goal: ${goal || ""}`,
      `Original non-embodied activity: "${origTitle}" (type: ${piece.type || "activity"})`,
      isEmb
        ? `Embodied transformation: "${embTitle}"${why ? `\nRationale: ${why}` : ""}`
        : `Note: this activity has not been transformed yet — propose an embodied version.`,
    ].join("\n");

    const buildImgPrompt = (idx) => {
      if (idx === 1 || idx === "card") {
        return `Flat illustration, educational style, warm muted colors. A student performing: "${embTitle}" for ${subject || "school"}. Body posture clearly visible. No text. Clean lines. Academic presentation style.`;
      }
      if (idx === 2) {
        return `Minimal flat illustration. Abstract: body movement connected to cognitive learning. Stylized brain and body. Warm muted palette. No text.`;
      }
      return `Flat illustration, educational style. A student doing a passive activity: "${origTitle}". Traditional classroom. Clean lines. No text.`;
    };

    // Retry helper: backs off 600ms, 1.2s, 2.4s on null/failure.
    // callClaudeModel already swallows errors, so null = rate-limit or network issue.
    const withRetry = async (fn, attempts = 3) => {
      for (let i = 0; i < attempts; i++) {
        const result = await fn();
        if (result !== null) return result;
        if (i < attempts - 1) await sleep(600 * Math.pow(2, i) + Math.random() * 300);
      }
      return null;
    };

    try {
      if (rec.format === "card") {
        const raw = await withRetry(() =>
          callClaudeModel(vizCardSystem, prompt, 800, "claude-haiku-4-5-20251001")
        );
        const parsed = safeJSON(raw);
        if (!parsed) return null;
        // Single Gemini call for card — no burst issue.
        const img = await callGemini(buildImgPrompt("card"));
        return { format: "card", card: parsed, cardImage: img };
      } else {
        const raw = await withRetry(() =>
          callClaudeModel(vizSlideSystem, prompt, 1200, "claude-haiku-4-5-20251001")
        );
        const parsed = safeJSON(raw);
        if (!parsed?.slides) return null;
        // SEQUENTIAL Gemini calls — NOT Promise.all — so we don't fire 3 concurrent
        // Gemini requests per piece. With 25 users × 2 concurrent pieces × 3 parallel
        // images = 150 simultaneous Gemini calls, which reliably 429s.
        const slideImages = [];
        for (let i = 0; i < parsed.slides.length; i++) {
          slideImages.push(await callGemini(buildImgPrompt(i)));
        }
        return { format: "slides", slides: parsed.slides, slideImages };
      }
    } catch {
      return null;
    }
  };

  // Update one piece's generated content manually
  const updateContent = (pieceUid, newData) => {
    setGeneratedContent(c => ({
      ...c,
      [pieceUid]: { ...c[pieceUid], data: newData },
    }));
  };

  const allInLesson = [...timeline.open, ...timeline.core, ...timeline.close];
  const embodiedCount = allInLesson.filter(isEmbodied).length;
  const totalCount = allInLesson.length;

  const publish = async () => {
    if (totalCount < 3) { alert("Add at least 3 pieces to your timeline first."); return; }
    // Attach generated content directly to pieces in the timeline
    const attach = (arr) => arr.map(p => ({
      ...p,
      content: generatedContent[p.uid] || null,
    }));
    const finalTimeline = {
      open: attach(timeline.open),
      core: attach(timeline.core),
      close: attach(timeline.close),
    };
    const lessonName = `${me.name}'s ${subject} Lesson`;
    const lesson = {
      id: uid(), authorId: me.id, authorName: me.name,
      name: lessonName,
      subject, grade, goal, timeline: finalTimeline,
      // Snapshot of the original AI pool (for facilitator walkthrough).
      originalPieces: originalPieces.map(p => ({ ...p })),
      embodiedCount, totalCount,
      comments: [], stars: [], createdAt: Date.now(),
    };
    // Sharded write: lesson key + index (with retry inside upsertLesson).
    // No contention with other publishers since each writes their own key.
    const ok = await upsertLesson(lesson);
    if (!ok) {
      alert("Couldn't save your lesson — please tap Share again.");
      return;
    }
    // Optimistic local update so the teacher sees their lesson immediately,
    // and update the local index map so the next poll doesn't redundantly fetch.
    setLessons(prev => [lesson, ...prev.filter(l => l.id !== lesson.id)]);
    setPublished(true);
    setStage("published");

    const d = await callClaude(
      genDebriefSystem,
      `Subject: ${subject}\nGoal: ${goal}\nTotal: ${totalCount}, Embodied: ${embodiedCount}\nFlow: Open: ${timeline.open.map(p => p.transformedTo || p.title).join("; ") || "none"}. Core: ${timeline.core.map(p => p.transformedTo || p.title).join("; ") || "none"}. Close: ${timeline.close.map(p => p.transformedTo || p.title).join("; ") || "none"}.`,
      400
    );
    if (d) setDebrief(d);
  };

  const resetAll = (skipConfirm = false) => {
    // Warn before discarding work unless called from a context that already confirmed.
    if (!skipConfirm && stage !== "setup") {
      const ok = window.confirm(
        "This will clear your current lesson and take you back to the beginning. Any unsaved content will be lost. Continue?"
      );
      if (!ok) return;
    }
    setStage("setup"); setSubject(""); setGrade(""); setGoal("");
    setPieces([]); setTimeline({ open: [], core: [], close: [] });
    setOriginalPieces([]);
    setPublished(false); setDebrief("");
    setGeneratedContent({}); setGeneratingAll(false); setRegenerating({}); setRegeneratingViz({});
    setGeneratedViz({});
  };

  // Register resetAll with the parent so the logo click can invoke it.
  useEffect(() => {
    onRegisterReset?.(() => resetAll());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stage === "setup") {
    return <SetupStage
      subject={subject} setSubject={setSubject}
      grade={grade} setGrade={setGrade}
      goal={goal} setGoal={setGoal}
      onGenerate={generate} loading={loading}
    />;
  }

  const dndProps = {
    dragging, dragOver, setDragOver,
    onDragStart, onDragEnd, onDrop, onDoubleClick,
    onTouchDragStart,
  };

  if (stage === "review" || stage === "published") {
    return (
      <ReviewStage
        me={me}
        subject={subject} grade={grade} goal={goal}
        timeline={timeline}
        generatedContent={generatedContent}
        generatedViz={generatedViz}
        generatingAll={generatingAll}
        regenerating={regenerating}
        regeneratingViz={regeneratingViz}
        onRegenerate={regenerateOne}
        onRegenerateViz={regenerateVizOne}
        onUpdate={updateContent}
        onBack={() => {
          setGeneratedContent({});
          setGeneratedViz({});
          setRegenerating({});
          setRegeneratingViz({});
          setStage("assemble");
        }}
        onPublish={publish}
        published={stage === "published"}
        debrief={debrief}
        onReset={resetAll}
        onGoToGallery={() => { resetAll(); setView && setView("gallery"); }}
        embodiedCount={embodiedCount}
        totalCount={totalCount}
      />
    );
  }

  return (
    <div>
      <TopBanner subject={subject} grade={grade} goal={goal} onReset={resetAll} />
      <Meter embodied={embodiedCount} total={totalCount} />

      <SectionLabel num="01" title="Pieces" hint="Drag (or long-press on phones) to move pieces. Double-click to quick-add or remove." />
      <PiecePool pieces={pieces} dnd={dndProps} />

      <SectionLabel num="02" title="Your Lesson" hint="Drag to rearrange. Double-click to send back. Click ✦ to make a piece embodied." />
      <Timeline
        timeline={timeline} dnd={dndProps}
        onTransform={transformPiece} onRevert={revertPiece}
        context={{ subject, grade, goal }}
      />

      <div style={{ textAlign: "center", marginTop: 40 }}>
        <button onClick={generateAllAndReview} style={{
          background: C.coral, color: "white", border: "none",
          padding: "16px 44px", borderRadius: 50, fontFamily: FD,
          fontSize: 20, fontWeight: 600, cursor: "pointer",
          boxShadow: `0 8px 20px -8px ${C.coral}aa`,
        }}>
          Generate Full Lesson →
        </button>
        <div style={{
          marginTop: 10, fontFamily: FM, fontSize: 10, color: C.muted,
          letterSpacing: 0.5, textTransform: "uppercase",
        }}>
          AI will expand every piece. You can edit before sharing.
        </div>
      </div>

      {/* Floating touch-drag ghost */}
      {touchDrag && (() => {
        const all = [...pieces, ...timeline.open, ...timeline.core, ...timeline.close];
        const p = all.find(x => x.uid === touchDrag.pieceUid);
        if (!p) return null;
        const em = !!p.transformedTo;
        return (
          <div style={{
            position: "fixed",
            left: touchDrag.x,
            top: touchDrag.y,
            transform: "translate(-50%, -50%) rotate(-2deg)",
            pointerEvents: "none",
            zIndex: 9999,
            background: em ? C.coral : C.cream,
            color: em ? "white" : C.ink,
            border: `1.5px solid ${em ? C.coral : C.ink}`,
            borderRadius: 14,
            padding: "10px 14px",
            minWidth: 160,
            maxWidth: 200,
            boxShadow: `0 12px 24px -8px ${C.ink}77`,
            opacity: 0.92,
          }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{p.icon || "📌"}</div>
            <div style={{ fontSize: 12, lineHeight: 1.35, fontWeight: 500 }}>
              {p.transformedTo || p.title}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// Review Stage — AI generates all content, teacher reviews & edits
// ============================================================
function ReviewStage({
  me, subject, grade, goal, timeline,
  generatedContent, generatedViz, generatingAll, regenerating, regeneratingViz,
  onRegenerate, onRegenerateViz, onUpdate, onBack, onPublish,
  published, debrief, onReset, onGoToGallery,
  embodiedCount, totalCount,
}) {
  const lessonName = `${me.name}'s ${subject} Lesson`;
  const allPieces = [
    ...timeline.open.map(p => ({ ...p, _phase: "Opening", _phaseIcon: "🌅" })),
    ...timeline.core.map(p => ({ ...p, _phase: "Core", _phaseIcon: "🔥" })),
    ...timeline.close.map(p => ({ ...p, _phase: "Close", _phaseIcon: "🌙" })),
  ];

  return (
    <div>
      {/* Header banner */}
      <div style={{
        background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 16,
        padding: "18px 22px", marginBottom: 20, display: "flex",
        justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{
            fontFamily: FM, fontSize: 10, color: C.coral,
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 4,
          }}>
            {published ? "Shared" : "Review"} · {subject} {grade && `· ${grade}`}
          </div>
          <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>
            {lessonName}
          </div>
          {goal && (
            <div style={{ fontSize: 13, color: C.muted, marginTop: 2, fontStyle: "italic" }}>
              {goal}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 700, color: C.coral }}>
            🤸 {embodiedCount}/{totalCount}
          </div>
          <div style={{ fontFamily: FM, fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>
            embodied pieces
          </div>
        </div>
      </div>

      {!published && (
        <div style={{
          background: C.paperDeep + "66", border: `1.5px dashed ${C.muted}`,
          borderRadius: 12, padding: "12px 18px", marginBottom: 20, fontSize: 13,
          color: C.muted, fontStyle: "italic", display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>📖</span>
          <span>
            {generatingAll
              ? "AI is expanding every piece into student-facing content. This takes a few seconds…"
              : "Review each piece below. Edit any text directly, or tap ↻ to regenerate. When ready, share it."}
          </span>
        </div>
      )}

      {/* Pieces in order */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {allPieces.map((p, i) => (
          <ReviewPieceCard
            key={p.uid}
            idx={i + 1}
            piece={p}
            content={generatedContent[p.uid]}
            viz={generatedViz ? generatedViz[p.uid] : null}
            isRegenerating={!!regenerating[p.uid]}
            isRegeneratingViz={!!regeneratingViz[p.uid]}
            isLoadingAll={generatingAll && !generatedContent[p.uid]}
            onRegenerate={() => onRegenerate(p)}
            onRegenerateViz={() => onRegenerateViz(p)}
            onUpdate={(data) => onUpdate(p.uid, data)}
            locked={published}
            lessonContext={{ subject, grade, goal }}
          />
        ))}
      </div>

      {/* Action bar */}
      {(() => {
        const anyVizGenerating = Object.values(regeneratingViz || {}).some(Boolean);
        const busy = generatingAll || anyVizGenerating;
        const handleBack = () => {
          if (busy) return;
          const ok = window.confirm(
            "Going back will take you to the assemble stage. All generated content and visuals will be removed. Continue?"
          );
          if (ok) onBack();
        };
        return (
        <div style={{ marginTop: 32, textAlign: "center" }}>
        {!published ? (
          <>
            {anyVizGenerating && (
              <div style={{
                marginBottom: 14, fontFamily: FM, fontSize: 10, color: C.coral,
                letterSpacing: 0.8, textTransform: "uppercase",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <span>✦</span>
                <span>Visual generation in progress — please wait before sharing</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={handleBack} disabled={busy} style={{
                background: "transparent", border: `1.5px solid ${busy ? C.muted : C.ink}`,
                color: busy ? C.muted : C.ink,
                padding: "14px 28px", borderRadius: 50, fontFamily: FM, fontSize: 11,
                letterSpacing: 1, cursor: busy ? "not-allowed" : "pointer",
                textTransform: "uppercase", opacity: busy ? 0.5 : 1,
                transition: "all 0.15s",
              }}>
                ← Back to assemble
              </button>
              <button onClick={onPublish} disabled={busy} style={{
                background: busy ? C.muted : C.coral, color: "white",
                border: "none", padding: "14px 36px", borderRadius: 50, fontFamily: FD,
                fontSize: 18, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
                boxShadow: busy ? "none" : `0 8px 20px -8px ${C.coral}aa`,
                transition: "all 0.15s",
              }}>
                {generatingAll ? "Generating content…" : anyVizGenerating ? "Generating visual…" : "Share to Gallery →"}
              </button>
            </div>
          </>
        ) : (
          <div style={{
            background: C.cream, border: `1.5px solid ${C.sage}`, borderRadius: 16,
            padding: 24, maxWidth: 600, margin: "0 auto",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
            <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
              Shared! Now go play other teachers' lessons.
            </div>
            {debrief && (
              <div style={{ fontSize: 14, lineHeight: 1.6, color: C.ink, marginTop: 12, fontStyle: "italic" }}>
                {debrief}
              </div>
            )}
            <div style={{
              marginTop: 18, display: "flex", gap: 10,
              justifyContent: "center", flexWrap: "wrap",
            }}>
              <button onClick={onGoToGallery} style={{
                background: C.coral, color: "white", border: "none",
                padding: "12px 28px", borderRadius: 50, fontFamily: FD,
                fontSize: 16, fontWeight: 600, cursor: "pointer",
                boxShadow: `0 6px 16px -6px ${C.coral}aa`,
              }}>
                🎭 Open the Gallery →
              </button>
              <button onClick={onReset} style={{
                background: "transparent", border: `1.5px solid ${C.ink}`, color: C.ink,
                padding: "12px 22px", borderRadius: 50, fontFamily: FM, fontSize: 11,
                letterSpacing: 1, cursor: "pointer", textTransform: "uppercase",
              }}>
                Build another
              </button>
            </div>
          </div>
        )}
        </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// Review Piece Card — shows generated content, allows edit/regen
// ============================================================
function ReviewPieceCard({ idx, piece, content, viz, isRegenerating, isRegeneratingViz, isLoadingAll, onRegenerate, onRegenerateViz, onUpdate, locked, lessonContext }) {
  const isEmbodied = !!piece.transformedTo;
  const borderColor = isEmbodied ? C.coral : C.ink;
  const [slideIdx, setSlideIdx] = useState(0);

  return (
    <div style={{
      background: C.cream, border: `1.5px solid ${borderColor}`,
      borderLeft: `6px solid ${borderColor}`, borderRadius: 14,
      padding: "18px 22px", boxShadow: `0 3px 10px -4px ${C.ink}44`,
    }}>
      {/* Piece header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: FM, fontSize: 10, color: C.muted,
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 4,
          }}>
            {piece._phaseIcon} {piece._phase} · Step {idx} {isEmbodied && "· Embodied"}
          </div>
          <div style={{
            fontFamily: FD, fontSize: 17, fontWeight: 700, lineHeight: 1.3,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 22 }}>{piece.icon}</span>
            <span>{piece.transformedTo || piece.title}</span>
          </div>
        </div>
        {!locked && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* ↻ Content */}
            <button
              onClick={onRegenerate}
              disabled={isRegenerating || isLoadingAll}
              title="Regenerate the learning content for this activity"
              style={{
                background: "transparent", border: `1.5px solid ${C.ink}`, color: C.ink,
                padding: "5px 12px", borderRadius: 20, fontFamily: FM, fontSize: 10,
                letterSpacing: 0.5, cursor: (isRegenerating || isLoadingAll) ? "wait" : "pointer",
                textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap",
                opacity: (isRegenerating || isLoadingAll) ? 0.5 : 1,
              }}
            >
              {isRegenerating ? "…" : "↻ Content"}
            </button>
            {/* Generate Visual / ↻ Visual */}
            <button
              onClick={onRegenerateViz}
              disabled={isRegeneratingViz || isLoadingAll}
              title={viz ? "Regenerate the visualization" : "Generate a slide deck or scenario card for this activity"}
              style={{
                background: isRegeneratingViz ? C.muted : viz ? "transparent" : C.coral,
                border: `1.5px solid ${viz ? C.coral : C.coral}`,
                color: viz ? C.coral : "white",
                padding: "5px 12px", borderRadius: 20, fontFamily: FM, fontSize: 10,
                letterSpacing: 0.5, cursor: (isRegeneratingViz || isLoadingAll) ? "wait" : "pointer",
                textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap",
                opacity: (isRegeneratingViz || isLoadingAll) ? 0.6 : 1,
                transition: "all 0.15s",
              }}
            >
              {isRegeneratingViz ? "✦ Generating…" : viz ? "↻ Visual" : "🎨 Generate Visual"}
            </button>
          </div>
        )}
      </div>

      {/* Generated content */}
      {isLoadingAll && !content ? (
        <div style={{
          padding: 20, textAlign: "center", color: C.muted, fontStyle: "italic", fontSize: 13,
          background: C.paper, borderRadius: 10,
        }}>
          Generating content…
        </div>
      ) : content ? (
        <div style={{ position: "relative" }}>
          <div style={{ opacity: isRegenerating ? 0.35 : 1, transition: "opacity 0.15s", pointerEvents: isRegenerating ? "none" : "auto" }}>
            <ContentEditor type={content.type} data={content.data} onChange={onUpdate} locked={locked} />
          </div>
          {isRegenerating && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}>
              <div style={{
                background: C.ink, color: C.paper, padding: "8px 16px", borderRadius: 20,
                fontFamily: FM, fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
                boxShadow: `0 4px 12px -4px ${C.ink}88`,
              }}>
                ↻ Regenerating…
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          padding: 20, textAlign: "center", color: C.muted, fontSize: 13,
          background: C.paper, borderRadius: 10,
        }}>
          No content yet. {!locked && "Tap ↻ Regenerate."}
        </div>
      )}

      {/* ── Visualization section ── */}
      {isRegeneratingViz ? (
        <div style={{
          marginTop: 20, borderTop: `1.5px dashed ${isEmbodied ? C.coral + "55" : C.muted + "44"}`,
          paddingTop: 16, display: "flex", alignItems: "center", gap: 8,
          fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 0.8,
          textTransform: "uppercase",
        }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>✦</span>
          <span>Generating {isEmbodied ? "scenario card" : "slide deck"}…</span>
        </div>
      ) : viz ? (
        <div style={{
          marginTop: 20,
          borderTop: `1.5px dashed ${isEmbodied ? C.coral + "66" : C.muted + "55"}`,
          paddingTop: 16,
        }}>
          <div style={{
            fontFamily: FM, fontSize: 9, color: isEmbodied ? C.coral : C.muted,
            letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {viz.format === "card" ? "🃏 Scenario Card" : "🖼️ Slide Deck"}
            <span style={{ opacity: 0.6 }}>· AI-generated visualization</span>
          </div>
          {viz.format === "card" ? (
            <ScenarioCardView
              card={viz.card}
              image={viz.cardImage}
              generatingImage={false}
              lesson={lessonContext}
              piece={piece}
            />
          ) : viz.format === "slides" && viz.slides ? (
            <VizSlideDeckView
              slides={viz.slides}
              images={viz.slideImages || []}
              generatingImages={false}
              currentSlide={slideIdx}
              setCurrentSlide={setSlideIdx}
              lesson={lessonContext}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// Video Preview Card — clickable poster that opens in a new tab.
// We use this instead of an <iframe> because the Claude artifact sandbox
// blocks third-party iframe embeds (YouTube/Vimeo will not load inline).
// ============================================================
function VideoPreviewCard({ url, compact = false }) {
  const info = getVideoInfo(url);
  if (!info) return null;
  return (
    <a
      href={info.watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        position: "relative",
        aspectRatio: "16 / 9",
        width: "100%",
        borderRadius: 10,
        overflow: "hidden",
        background: info.thumbnail ? "#000" : "#1a1a1a",
        textDecoration: "none",
        color: "white",
        cursor: "pointer",
      }}
      title="Open video in a new tab"
    >
      {info.thumbnail ? (
        <img
          src={info.thumbnail}
          alt="Video thumbnail"
          style={{
            width: "100%", height: "100%", objectFit: "cover", display: "block",
          }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      ) : (
        <div style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: FM, fontSize: 12, color: "#aaa", letterSpacing: 1, textTransform: "uppercase",
        }}>
          {info.kind} · click to open
        </div>
      )}
      {/* Play button overlay */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 100%)",
      }}>
        <div style={{
          width: compact ? 48 : 64, height: compact ? 48 : 64,
          borderRadius: "50%",
          background: "rgba(232, 98, 74, 0.92)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          fontSize: compact ? 18 : 24,
          color: "white",
          paddingLeft: 4, // optical centering for the triangle glyph
        }}>
          ▶
        </div>
      </div>
      {/* "Opens in new tab" badge */}
      <div style={{
        position: "absolute", bottom: 8, right: 8,
        background: "rgba(0,0,0,0.6)", color: "white",
        padding: "3px 8px", borderRadius: 12,
        fontFamily: FM, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase",
      }}>
        Opens in new tab ↗
      </div>
    </a>
  );
}

// ============================================================
// Content Editor — per-type editable view
// ============================================================
function ContentEditor({ type, data, onChange, locked }) {
  const fieldStyle = {
    width: "100%", padding: "10px 14px", fontSize: 14, fontFamily: FB,
    border: `1.5px solid ${locked ? C.muted : C.ink}`, borderRadius: 10,
    background: locked ? C.paperDeep + "55" : "white", outline: "none",
    boxSizing: "border-box", lineHeight: 1.55, resize: "vertical",
  };

  const readOnlyText = (text) => (
    <div style={{
      padding: "12px 16px", background: C.paper, borderRadius: 10,
      fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap",
    }}>{text}</div>
  );

  if (type === "lecture") {
    return locked ? readOnlyText(data.script || "") : (
      <textarea
        value={data.script || ""}
        onChange={(e) => onChange({ ...data, script: e.target.value })}
        style={{ ...fieldStyle, minHeight: 140 }}
      />
    );
  }

  if (type === "reading") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Real article link option */}
        <div style={{
          background: C.paperDeep + "55", border: `1px dashed ${C.muted}`,
          borderRadius: 10, padding: "12px 14px",
        }}>
          <div style={{
            fontFamily: FM, fontSize: 10, color: C.coral, letterSpacing: 1,
            textTransform: "uppercase", marginBottom: 6,
          }}>
            📖 Link to a real article (optional)
          </div>
          {!locked ? (
            <>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
                Paste a URL for students to read on their own, instead of the AI passage below.
              </div>
              <input
                value={data.externalUrl || ""}
                onChange={(e) => onChange({ ...data, externalUrl: e.target.value })}
                placeholder="https://…"
                style={fieldStyle}
              />
            </>
          ) : data.externalUrl ? (
            <a href={data.externalUrl} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 13, color: C.coral, wordBreak: "break-all",
            }}>
              {data.externalUrl} ↗
            </a>
          ) : null}
        </div>

        <div style={{
          fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase",
        }}>AI-generated passage</div>
        {locked ? readOnlyText(data.passage || "") : (
          <textarea
            value={data.passage || ""}
            onChange={(e) => onChange({ ...data, passage: e.target.value })}
            style={{ ...fieldStyle, minHeight: 140 }}
          />
        )}
      </div>
    );
  }

  if (type === "slide") {
    const bullets = data.bullets || [];
    const updateBullets = (next) => onChange({ ...data, bullets: next });
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {locked ? (
          <div style={{ fontFamily: FD, fontSize: 18, fontWeight: 700 }}>{data.title}</div>
        ) : (
          <input
            value={data.title || ""}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Slide title"
            style={{ ...fieldStyle, fontFamily: FD, fontSize: 16, fontWeight: 600 }}
          />
        )}
        {bullets.map((b, i) => locked ? (
          <div key={i} style={{ fontSize: 14, paddingLeft: 16 }}>• {b}</div>
        ) : (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ color: C.muted, fontSize: 14 }}>•</span>
            <input
              value={b}
              onChange={(e) => {
                const nb = [...bullets]; nb[i] = e.target.value;
                updateBullets(nb);
              }}
              placeholder={`Bullet ${i + 1}`}
              style={{ ...fieldStyle, flex: 1 }}
            />
            {bullets.length > 1 && (
              <button
                onClick={() => updateBullets(bullets.filter((_, k) => k !== i))}
                style={{
                  background: "transparent", color: C.muted, border: "none",
                  cursor: "pointer", fontSize: 16, padding: "0 6px", lineHeight: 1,
                }}
                title="Remove this bullet"
              >×</button>
            )}
          </div>
        ))}
        {!locked && bullets.length < 8 && (
          <button
            onClick={() => updateBullets([...bullets, ""])}
            style={{
              alignSelf: "flex-start", background: "transparent", color: C.coral,
              border: `1px dashed ${C.coral}`, padding: "4px 12px", borderRadius: 10,
              fontFamily: FM, fontSize: 10, letterSpacing: 0.5, cursor: "pointer",
              textTransform: "uppercase", marginTop: 2,
            }}
          >+ add bullet</button>
        )}
        <div style={{ marginTop: 6 }}>
          <div style={{
            fontFamily: FM, fontSize: 9, color: C.muted, letterSpacing: 1,
            textTransform: "uppercase", marginBottom: 4,
          }}>🖼️ Visual description</div>
          {locked ? (
            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>
              {data.visual || "(none)"}
            </div>
          ) : (
            <input
              value={data.visual || ""}
              onChange={(e) => onChange({ ...data, visual: e.target.value })}
              placeholder="Describe the key visual or diagram"
              style={{ ...fieldStyle, fontSize: 12, fontStyle: "italic" }}
            />
          )}
        </div>
      </div>
    );
  }

  if (type === "video") {
    const scenes = data.scenes || [];
    const videoInfo = getVideoInfo(data.externalUrl);
    const hasVideo = !!videoInfo;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Real video link option */}
        <div style={{
          background: C.paperDeep + "55", border: `1px dashed ${C.muted}`,
          borderRadius: 10, padding: "12px 14px",
        }}>
          <div style={{
            fontFamily: FM, fontSize: 10, color: C.coral, letterSpacing: 1,
            textTransform: "uppercase", marginBottom: 6,
          }}>
            📺 Use a real video (recommended)
          </div>
          {!locked && (
            <>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
                Paste a YouTube or Vimeo link. Students will see a clickable preview that opens the video in a new tab. (Embedded playback is blocked by the artifact sandbox.)
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={data.externalUrl || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange({ ...data, externalUrl: v, embedUrl: toEmbedUrl(v) });
                  }}
                  placeholder="https://youtube.com/watch?v=…"
                  style={{ ...fieldStyle, flex: 1 }}
                />
                {data.externalUrl && (
                  <button
                    onClick={() => onChange({ ...data, externalUrl: "", embedUrl: null })}
                    style={{
                      background: "transparent", border: `1.5px solid ${C.muted}`,
                      color: C.muted, padding: "0 12px", borderRadius: 10,
                      fontFamily: FM, fontSize: 10, letterSpacing: 0.5, cursor: "pointer",
                      textTransform: "uppercase",
                    }}
                  >Clear</button>
                )}
              </div>
              {data.externalUrl && !hasVideo && (
                <div style={{ fontSize: 11, color: C.coral, marginTop: 6, fontStyle: "italic" }}>
                  Couldn't recognize that link. Only YouTube and Vimeo links work.
                </div>
              )}
            </>
          )}
          {hasVideo && (
            <div style={{ marginTop: locked ? 0 : 10 }}>
              <VideoPreviewCard url={data.externalUrl} />
            </div>
          )}
        </div>

        {/* AI-generated storyboard fallback */}
        {!hasVideo && (
          <>
            <div style={{
              fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase",
            }}>AI storyboard (fallback)</div>
            {locked ? readOnlyText(data.narration || "") : (
              <textarea
                value={data.narration || ""}
                onChange={(e) => onChange({ ...data, narration: e.target.value })}
                placeholder="Narration script"
                style={{ ...fieldStyle, minHeight: 100 }}
              />
            )}
            <div style={{
              fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginTop: 4,
            }}>Scenes</div>
            {scenes.map((s, i) => (
              <div key={i} style={{
                background: C.paper, padding: "10px 14px", borderRadius: 10, fontSize: 13,
              }}>
                {locked ? (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>Scene {i + 1}: {s.visual}</div>
                    <div style={{ color: C.muted, fontStyle: "italic" }}>{s.caption}</div>
                  </>
                ) : (
                  <>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      marginBottom: 6,
                    }}>
                      <div style={{ fontFamily: FM, fontSize: 9, color: C.coral, letterSpacing: 1 }}>
                        SCENE {i + 1}
                      </div>
                      {scenes.length > 1 && (
                        <button
                          onClick={() => onChange({
                            ...data,
                            scenes: scenes.filter((_, k) => k !== i),
                          })}
                          style={{
                            background: "transparent", color: C.muted, border: `1px solid ${C.muted}`,
                            padding: "2px 8px", borderRadius: 10, fontFamily: FM, fontSize: 9,
                            letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase",
                          }}
                        >× remove</button>
                      )}
                    </div>
                    <input
                      value={s.visual || ""}
                      onChange={(e) => {
                        const ns = [...scenes]; ns[i] = { ...s, visual: e.target.value };
                        onChange({ ...data, scenes: ns });
                      }}
                      placeholder="What's on screen"
                      style={{ ...fieldStyle, marginBottom: 6, fontSize: 13 }}
                    />
                    <input
                      value={s.caption || ""}
                      onChange={(e) => {
                        const ns = [...scenes]; ns[i] = { ...s, caption: e.target.value };
                        onChange({ ...data, scenes: ns });
                      }}
                      placeholder="Caption"
                      style={{ ...fieldStyle, fontSize: 12, fontStyle: "italic" }}
                    />
                  </>
                )}
              </div>
            ))}
            {!locked && scenes.length < 6 && (
              <button
                onClick={() => onChange({
                  ...data,
                  scenes: [...scenes, { visual: "", caption: "" }],
                })}
                style={{
                  alignSelf: "flex-start", background: "transparent", color: C.coral,
                  border: `1px dashed ${C.coral}`, padding: "4px 12px", borderRadius: 10,
                  fontFamily: FM, fontSize: 10, letterSpacing: 0.5, cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >+ add scene</button>
            )}
          </>
        )}
      </div>
    );
  }

  if (type === "worksheet") {
    const problems = data.problems || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {problems.map((p, i) => (
          <div key={i} style={{
            background: C.paper, padding: "12px 14px", borderRadius: 10,
          }}>
            <div style={{ fontFamily: FM, fontSize: 10, color: C.coral, letterSpacing: 1, marginBottom: 4 }}>
              PROBLEM {i + 1}
            </div>
            {locked ? (
              <>
                <div style={{ fontSize: 14, marginBottom: 4 }}>{p.q}</div>
                <div style={{ fontSize: 12, color: C.sage }}>Answer: {p.a}</div>
                <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>Hint: {p.hint}</div>
              </>
            ) : (
              <>
                <input value={p.q} onChange={(e) => {
                  const np = [...problems]; np[i] = { ...p, q: e.target.value };
                  onChange({ ...data, problems: np });
                }} style={{ ...fieldStyle, marginBottom: 6 }} />
                <input value={p.a} onChange={(e) => {
                  const np = [...problems]; np[i] = { ...p, a: e.target.value };
                  onChange({ ...data, problems: np });
                }} placeholder="Answer" style={{ ...fieldStyle, marginBottom: 6, fontSize: 12 }} />
                <input value={p.hint} onChange={(e) => {
                  const np = [...problems]; np[i] = { ...p, hint: e.target.value };
                  onChange({ ...data, problems: np });
                }} placeholder="Hint" style={{ ...fieldStyle, fontSize: 12 }} />
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (type === "quiz") {
    const qs = data.questions || [];
    const updateQs = (next) => onChange({ ...data, questions: next });
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {qs.map((q, i) => {
          const opts = q.options || [];
          return (
            <div key={i} style={{
              background: C.paper, padding: "12px 14px", borderRadius: 10,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 4,
              }}>
                <div style={{ fontFamily: FM, fontSize: 10, color: C.coral, letterSpacing: 1 }}>
                  QUESTION {i + 1}
                </div>
                {!locked && qs.length > 1 && (
                  <button
                    onClick={() => updateQs(qs.filter((_, k) => k !== i))}
                    style={{
                      background: "transparent", color: C.muted, border: `1px solid ${C.muted}`,
                      padding: "2px 8px", borderRadius: 10, fontFamily: FM, fontSize: 9,
                      letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase",
                    }}
                  >× remove</button>
                )}
              </div>

              {locked ? (
                <div style={{ fontSize: 14, marginBottom: 6 }}>{q.q}</div>
              ) : (
                <input
                  value={q.q}
                  onChange={(e) => {
                    const nq = [...qs]; nq[i] = { ...q, q: e.target.value };
                    updateQs(nq);
                  }}
                  placeholder="Question text"
                  style={{ ...fieldStyle, marginBottom: 6 }}
                />
              )}

              {opts.map((opt, j) => {
                const isCorrect = j === q.correct;
                if (locked) {
                  return (
                    <div key={j} style={{
                      fontSize: 13, padding: "4px 10px", marginTop: 3,
                      background: isCorrect ? C.sage + "33" : "transparent",
                      borderRadius: 6,
                      color: isCorrect ? C.ink : C.muted,
                      fontWeight: isCorrect ? 600 : 400,
                    }}>
                      {String.fromCharCode(65 + j)}. {opt}{isCorrect && " ✓"}
                    </div>
                  );
                }
                // Editable: radio-style "set correct" + text input + remove
                return (
                  <div key={j} style={{
                    display: "flex", alignItems: "center", gap: 6, marginTop: 4,
                    background: isCorrect ? C.sage + "22" : "transparent",
                    border: isCorrect ? `1.5px solid ${C.sage}` : `1.5px solid transparent`,
                    borderRadius: 8, padding: "4px 6px",
                  }}>
                    <button
                      onClick={() => {
                        const nq = [...qs]; nq[i] = { ...q, correct: j };
                        updateQs(nq);
                      }}
                      title={isCorrect ? "This is the correct answer" : "Mark as correct answer"}
                      style={{
                        background: isCorrect ? C.sage : "transparent",
                        color: isCorrect ? "white" : C.muted,
                        border: `1.5px solid ${isCorrect ? C.sage : C.muted}`,
                        width: 22, height: 22, borderRadius: "50%",
                        cursor: "pointer", fontFamily: FM, fontSize: 10, fontWeight: 700,
                        flexShrink: 0, padding: 0, lineHeight: 1,
                      }}
                    >
                      {isCorrect ? "✓" : String.fromCharCode(65 + j)}
                    </button>
                    <input
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...opts]; newOpts[j] = e.target.value;
                        const nq = [...qs]; nq[i] = { ...q, options: newOpts };
                        updateQs(nq);
                      }}
                      placeholder={`Option ${String.fromCharCode(65 + j)}`}
                      style={{ ...fieldStyle, flex: 1, fontSize: 13, padding: "6px 10px" }}
                    />
                    {opts.length > 2 && (
                      <button
                        onClick={() => {
                          const newOpts = opts.filter((_, k) => k !== j);
                          let newCorrect = q.correct;
                          if (newCorrect === j) newCorrect = 0;
                          else if (newCorrect > j) newCorrect -= 1;
                          const nq = [...qs]; nq[i] = { ...q, options: newOpts, correct: newCorrect };
                          updateQs(nq);
                        }}
                        style={{
                          background: "transparent", color: C.muted, border: "none",
                          cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1,
                        }}
                        title="Remove this option"
                      >×</button>
                    )}
                  </div>
                );
              })}

              {!locked && opts.length < 6 && (
                <button
                  onClick={() => {
                    const newOpts = [...opts, ""];
                    const nq = [...qs]; nq[i] = { ...q, options: newOpts };
                    updateQs(nq);
                  }}
                  style={{
                    marginTop: 6, background: "transparent", color: C.coral,
                    border: `1px dashed ${C.coral}`, padding: "4px 12px", borderRadius: 10,
                    fontFamily: FM, fontSize: 10, letterSpacing: 0.5, cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                >+ add option</button>
              )}

              {locked ? (
                q.explain && (
                  <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginTop: 6 }}>
                    {q.explain}
                  </div>
                )
              ) : (
                <div style={{ marginTop: 8 }}>
                  <div style={{
                    fontFamily: FM, fontSize: 9, color: C.muted, letterSpacing: 1,
                    textTransform: "uppercase", marginBottom: 4,
                  }}>Explanation</div>
                  <input
                    value={q.explain || ""}
                    onChange={(e) => {
                      const nq = [...qs]; nq[i] = { ...q, explain: e.target.value };
                      updateQs(nq);
                    }}
                    placeholder="Why this answer is correct (shown after the student answers)"
                    style={{ ...fieldStyle, fontSize: 12 }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {!locked && (
          <button
            onClick={() => updateQs([...qs, {
              q: "", options: ["", "", "", ""], correct: 0, explain: "",
            }])}
            style={{
              alignSelf: "flex-start", background: "transparent", color: C.coral,
              border: `1px dashed ${C.coral}`, padding: "8px 16px", borderRadius: 12,
              fontFamily: FM, fontSize: 11, letterSpacing: 0.5, cursor: "pointer",
              textTransform: "uppercase",
            }}
          >+ add question</button>
        )}
      </div>
    );
  }

  if (type === "embodied") {
    const steps = data.steps || [];
    const updateSteps = (next) => onChange({ ...data, steps: next });
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((s, i) => locked ? (
          <div key={i} style={{ display: "flex", gap: 10, fontSize: 14, padding: "6px 0" }}>
            <span style={{
              fontFamily: FM, fontSize: 12, color: C.coral, fontWeight: 700, minWidth: 20,
            }}>{i + 1}.</span>
            <span style={{ lineHeight: 1.5 }}>{s}</span>
          </div>
        ) : (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{
              fontFamily: FM, fontSize: 12, color: C.coral, fontWeight: 700, minWidth: 20,
            }}>{i + 1}.</span>
            <input
              value={s}
              onChange={(e) => {
                const ns = [...steps]; ns[i] = e.target.value;
                updateSteps(ns);
              }}
              style={{ ...fieldStyle, flex: 1 }}
            />
            {steps.length > 1 && (
              <button
                onClick={() => updateSteps(steps.filter((_, k) => k !== i))}
                title="Remove this step"
                style={{
                  background: "transparent", color: C.muted, border: "none",
                  cursor: "pointer", fontSize: 18, padding: "0 6px", lineHeight: 1,
                  flexShrink: 0,
                }}
              >×</button>
            )}
          </div>
        ))}
        {!locked && steps.length < 10 && (
          <button
            onClick={() => updateSteps([...steps, ""])}
            style={{
              alignSelf: "flex-start", background: "transparent", color: C.coral,
              border: `1px dashed ${C.coral}`, padding: "4px 12px", borderRadius: 10,
              fontFamily: FM, fontSize: 10, letterSpacing: 0.5, cursor: "pointer",
              textTransform: "uppercase", marginTop: 2,
            }}
          >+ add step</button>
        )}
        <div style={{
          background: C.coral + "15", border: `1px dashed ${C.coral}`, borderRadius: 10,
          padding: "10px 14px", marginTop: 6,
        }}>
          <div style={{
            fontFamily: FM, fontSize: 10, color: C.coral, letterSpacing: 1,
            textTransform: "uppercase", marginBottom: 4,
          }}>What to notice</div>
          {locked ? (
            <div style={{ fontSize: 13, fontStyle: "italic" }}>{data.notice}</div>
          ) : (
            <textarea
              value={data.notice || ""}
              onChange={(e) => onChange({ ...data, notice: e.target.value })}
              style={{ ...fieldStyle, minHeight: 50 }}
            />
          )}
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>
      (Unknown content type: {type})
    </div>
  );
}

function SetupStage({ subject, setSubject, grade, setGrade, goal, setGoal, onGenerate, loading }) {
  const input = {
    width: "100%", padding: "14px 16px", fontSize: 16, fontFamily: FB,
    border: `1.5px solid ${C.ink}`, borderRadius: 12, background: C.cream,
    outline: "none", boxSizing: "border-box",
  };
  const label = {
    display: "block", fontFamily: FM, fontSize: 10, letterSpacing: 1,
    color: C.muted, marginBottom: 6, textTransform: "uppercase",
  };
  return (
    <div style={{
      background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 20,
      padding: "40px 36px", maxWidth: 640, margin: "20px auto",
      boxShadow: `0 12px 30px -15px ${C.ink}55`,
    }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>🌱</div>
      <h2 style={{ fontFamily: FD, fontSize: 32, fontWeight: 700, margin: "0 0 8px", letterSpacing: -0.5 }}>
        What are you teaching?
      </h2>
      <p style={{ color: C.muted, fontSize: 14, margin: "0 0 28px" }}>
        Any subject. Any level. Be rough — the AI will fill in.
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={label}>Subject or topic *</label>
        <input style={input} value={subject} onChange={e => setSubject(e.target.value)}
          placeholder="Fractions · Water cycle · Haiku · Newton's laws" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, marginBottom: 16 }}>
        <div>
          <label style={label}>Grade</label>
          <input style={input} value={grade} onChange={e => setGrade(e.target.value)}
            placeholder="G4 (opt.)" />
        </div>
        <div>
          <label style={label}>Learning goal</label>
          <input style={input} value={goal} onChange={e => setGoal(e.target.value)}
            placeholder="(optional — AI will infer)" />
        </div>
      </div>

      <button onClick={onGenerate} disabled={loading || !subject.trim()} style={{
        width: "100%", marginTop: 16, padding: "16px", background: loading ? C.muted : C.ink,
        color: C.paper, border: "none", borderRadius: 14, fontFamily: FD,
        fontSize: 18, fontWeight: 600, cursor: loading ? "wait" : "pointer",
      }}>
        {loading ? "Generating pieces…" : "Generate Lesson Pieces ✨"}
      </button>
    </div>
  );
}

function TopBanner({ subject, grade, goal, onReset }) {
  return (
    <div style={{
      background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 16,
      padding: "16px 20px", marginBottom: 24, display: "flex",
      justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
    }}>
      <div>
        <div style={{ fontFamily: FM, fontSize: 10, color: C.coral, letterSpacing: 1, textTransform: "uppercase" }}>
          {subject} {grade && `· ${grade}`}
        </div>
        {goal && <div style={{ fontFamily: FD, fontSize: 18, fontWeight: 600, marginTop: 2 }}>{goal}</div>}
      </div>
      <button onClick={onReset} style={{
        background: "transparent", border: `1px solid ${C.muted}`, color: C.muted,
        padding: "6px 14px", borderRadius: 20, fontFamily: FM, fontSize: 10,
        letterSpacing: 1, cursor: "pointer", textTransform: "uppercase",
      }}>
        ↻ New topic
      </button>
    </div>
  );
}

function Meter({ embodied, total }) {
  const pct = total > 0 ? Math.round((embodied / total) * 100) : 0;
  return (
    <div style={{
      background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 16,
      padding: "14px 20px", marginBottom: 24,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1, color: C.muted, textTransform: "uppercase" }}>
          Embodiment in your lesson
        </div>
        <div style={{ fontFamily: FD, fontSize: 18, fontWeight: 700, color: C.coral }}>
          {embodied} / {total || "—"} <span style={{ fontSize: 12, color: C.muted }}>({pct}%)</span>
        </div>
      </div>
      <div style={{ height: 8, background: C.paperDeep, borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: `linear-gradient(90deg, ${C.sage}, ${C.coral})`,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

function SectionLabel({ num, title, hint }) {
  return (
    <div style={{ marginTop: 24, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: FM, fontSize: 11, color: C.coral, letterSpacing: 1 }}>{num}</span>
        <h3 style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>
          {title}
        </h3>
      </div>
      {hint && <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0 24px", fontStyle: "italic" }}>{hint}</p>}
    </div>
  );
}

// ============================================================
// Piece Pool
// ============================================================
function PiecePool({ pieces, dnd }) {
  const isOver = dnd.dragOver === "pool";
  const empty = pieces.length === 0;
  const dragCounter = useRef(0);
  return (
    <div
      data-drop-slot="pool"
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounter.current += 1;
        dnd.setDragOver("pool");
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDragLeave={() => {
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
          dragCounter.current = 0;
          if (dnd.dragOver === "pool") dnd.setDragOver(null);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        dnd.onDrop("pool");
      }}
      style={{
        display: empty ? "flex" : "grid",
        gridTemplateColumns: empty ? undefined : "repeat(auto-fill, minmax(180px, 1fr))",
        alignItems: empty ? "center" : undefined,
        justifyContent: empty ? "center" : undefined,
        gap: 12, padding: 16, minHeight: empty ? 100 : "auto",
        background: isOver ? C.sage + "33" : C.paperDeep + "66",
        border: `1.5px dashed ${isOver ? C.sage : C.muted}`,
        borderRadius: 16, transition: "all 0.15s",
      }}
    >
      {empty ? (
        <div style={{ color: C.muted, fontSize: 13, fontStyle: "italic", textAlign: "center" }}>
          All pieces are in your lesson. Drag or double-click to bring back.
        </div>
      ) : (
        pieces.map(p => <PieceCard key={p.uid} piece={p} location="pool" dnd={dnd} />)
      )}
    </div>
  );
}

// ============================================================
// Piece Card
// ============================================================
function PieceCard({ piece, location, dnd, onOpenTransform, onRevert }) {
  const [hover, setHover] = useState(false);
  const touchTimerRef = useRef(null);
  const touchStartRef = useRef(null);
  const isEmbodied = !!piece.transformedTo;
  const bg = isEmbodied ? C.coral : C.cream;
  const fg = isEmbodied ? "white" : C.ink;
  const border = isEmbodied ? C.coral : C.ink;
  const isDragging = dnd.dragging?.uid === piece.uid;
  const inTimeline = location !== "pool";

  // --- Touch drag: long-press 200ms without moving starts a touch drag ---
  const cancelTouchTimer = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };
  const handleTouchStart = (e) => {
    // Ignore multi-touch (pinch, etc.)
    if (e.touches.length > 1) { cancelTouchTimer(); return; }
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    cancelTouchTimer();
    touchTimerRef.current = setTimeout(() => {
      const start = touchStartRef.current;
      if (!start) return;
      // Begin touch drag
      dnd.onTouchDragStart?.(piece.uid, location, start.x, start.y);
    }, 200);
  };
  const handleTouchMove = (e) => {
    const start = touchStartRef.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - start.x);
    const dy = Math.abs(t.clientY - start.y);
    if (dx > 8 || dy > 8) {
      // User is scrolling, not pressing — cancel pending long-press
      cancelTouchTimer();
    }
  };
  const handleTouchEnd = () => {
    cancelTouchTimer();
    touchStartRef.current = null;
  };

  return (
    <div
      data-piece-uid={piece.uid}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", piece.uid); } catch {}
        dnd.onDragStart(piece.uid, location);
      }}
      onDragEnd={dnd.onDragEnd}
      onDoubleClick={(e) => { e.stopPropagation(); dnd.onDoubleClick(piece.uid, location); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      title={location === "pool" ? "Drag or double-click to add to Core" : "Drag to move, or double-click to remove"}
      style={{
        background: bg, color: fg, border: `1.5px solid ${border}`,
        borderRadius: 14, padding: "12px 14px", position: "relative",
        minHeight: 90, display: "flex", flexDirection: "column",
        justifyContent: "space-between", cursor: "grab",
        boxShadow: hover ? `0 6px 16px -6px ${C.ink}55` : `0 2px 6px -2px ${C.ink}33`,
        transform: hover && !isDragging ? "translateY(-2px)" : "none",
        opacity: isDragging ? 0.4 : 1, transition: "all 0.15s ease", userSelect: "none",
        touchAction: "manipulation",
      }}
    >
      <div>
        <div style={{ fontSize: 22, marginBottom: 4 }}>{piece.icon || "📌"}</div>
        <div style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 500 }}>
          {piece.transformedTo || piece.title}
        </div>
      </div>

      {piece.transformedTo && (
        <div style={{
          fontFamily: FM, fontSize: 8, letterSpacing: 0.5,
          marginTop: 6, opacity: 0.85, textTransform: "uppercase",
        }}>
          ✦ transformed
        </div>
      )}

      {inTimeline && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {!isEmbodied ? (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenTransform(piece); }}
              onDoubleClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              draggable={false}
              style={{
                flex: 1, background: C.coral, color: "white", border: "none",
                padding: "6px 10px", borderRadius: 10, fontFamily: FM, fontSize: 10,
                letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase", fontWeight: 600,
              }}
            >
              ✦ Make embodied
            </button>
          ) : (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onOpenTransform(piece); }}
                onDoubleClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                draggable={false}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.25)", color: "white", border: "none",
                  padding: "6px 10px", borderRadius: 10, fontFamily: FM, fontSize: 10,
                  letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase",
                }}
              >
                ↻ retry
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRevert(piece.uid); }}
                onDoubleClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                draggable={false}
                style={{
                  background: "rgba(255,255,255,0.25)", color: "white", border: "none",
                  padding: "6px 10px", borderRadius: 10, fontFamily: FM, fontSize: 10,
                  letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase",
                }}
              >
                undo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Timeline
// ============================================================
// ============================================================
// Timeline (assemble phase)
// ============================================================
// Lifted to module level so React doesn't remount these on every parent render
// (which was killing dragCounter refs mid-drag and causing drop flicker).

function DropGap({ slot, index, active, gapOver, setGapOver, onDrop }) {
  const key = `${slot}:${index}`;
  const isOver = gapOver === key;
  return (
    <div
      data-drop-gap={key}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setGapOver(key); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; }}
      onDragLeave={(e) => { e.stopPropagation(); setGapOver(prev => (prev === key ? null : prev)); }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setGapOver(null);
        onDrop(slot, index);
      }}
      style={{
        height: active ? (isOver ? 20 : 8) : 0,
        margin: active ? "2px 0" : 0,
        borderRadius: 6,
        background: isOver ? C.coral : "transparent",
        transition: "all 0.12s ease",
        pointerEvents: active ? "auto" : "none",
        flexShrink: 0,
      }}
    />
  );
}

function TimelineSlot({
  id, label, icon, items, dnd,
  onOpenTransform, onRevert, gapOver, setGapOver,
}) {
  const isOver = dnd.dragOver === id;
  const dragCounter = useRef(0);
  const dragActive = !!dnd.dragging;
  return (
    <div
      data-drop-slot={id}
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounter.current += 1;
        dnd.setDragOver(id);
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDragLeave={() => {
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
          dragCounter.current = 0;
          if (dnd.dragOver === id) dnd.setDragOver(null);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        dnd.onDrop(id);
      }}
      style={{
        background: isOver ? C.sage + "22" : C.cream,
        border: `1.5px solid ${isOver ? C.sage : C.ink}`,
        borderRadius: 16, padding: 14, minHeight: 220,
        display: "flex", flexDirection: "column", transition: "all 0.15s",
      }}
    >
      <div style={{
        fontFamily: FD, fontSize: 14, fontWeight: 700, letterSpacing: 0.3,
        marginBottom: 10, display: "flex", alignItems: "center", gap: 6, color: C.ink,
      }}>
        <span style={{ fontSize: 16 }}>{icon}</span> {label}
      </div>
      {items.length === 0 ? (
        <div
          data-drop-slot-empty={id}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            color: C.muted, fontSize: 12, fontStyle: "italic", textAlign: "center",
            border: `1.5px dashed ${C.muted}`, borderRadius: 10, padding: 12,
          }}
        >
          Drop pieces here
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <DropGap slot={id} index={0} active={dragActive}
            gapOver={gapOver} setGapOver={setGapOver} onDrop={dnd.onDrop} />
          {items.map((p, i) => (
            <React.Fragment key={p.uid}>
              <PieceCard
                piece={p} location={id} dnd={dnd}
                onOpenTransform={onOpenTransform} onRevert={onRevert}
              />
              <DropGap slot={id} index={i + 1} active={dragActive}
                gapOver={gapOver} setGapOver={setGapOver} onDrop={dnd.onDrop} />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function Timeline({ timeline, dnd, onTransform, onRevert, context }) {
  const [transformTarget, setTransformTarget] = useState(null);
  const [gapOver, setGapOver] = useState(null);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <TimelineSlot id="open" label="Opening" icon="🌅" items={timeline.open}
          dnd={dnd} onOpenTransform={setTransformTarget} onRevert={onRevert}
          gapOver={gapOver} setGapOver={setGapOver} />
        <TimelineSlot id="core" label="Core" icon="🔥" items={timeline.core}
          dnd={dnd} onOpenTransform={setTransformTarget} onRevert={onRevert}
          gapOver={gapOver} setGapOver={setGapOver} />
        <TimelineSlot id="close" label="Close" icon="🌙" items={timeline.close}
          dnd={dnd} onOpenTransform={setTransformTarget} onRevert={onRevert}
          gapOver={gapOver} setGapOver={setGapOver} />
      </div>
      {transformTarget && (
        <TransformModal
          piece={transformTarget} context={context}
          onClose={() => setTransformTarget(null)}
          onApply={(title, why) => {
            onTransform(transformTarget.uid, title, why);
            setTransformTarget(null);
          }}
        />
      )}
    </>
  );
}

// ============================================================
// Transform Modal
// ============================================================
function TransformModal({ piece, context, onClose, onApply }) {
  const [swaps, setSwaps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    (async () => {
      const raw = await callClaude(
        genEmbodiedSwapSystem,
        `Subject: ${context.subject}\nGrade: ${context.grade || "(any)"}\nGoal: ${context.goal || "(general understanding)"}\n\nOriginal activity: "${piece.title}"\nPropose embodied alternatives for a single student learning alone.`,
        900
      );
      const parsed = safeJSON(raw);
      setSwaps(parsed?.swaps || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(42,37,34,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: 20, backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 20,
        maxWidth: 600, width: "100%", padding: "28px 32px", maxHeight: "85vh",
        overflowY: "auto", boxShadow: `0 20px 60px -20px ${C.ink}`,
      }}>
        <div style={{
          fontFamily: FM, fontSize: 10, color: C.coral,
          letterSpacing: 1, textTransform: "uppercase", marginBottom: 6,
        }}>
          Transform into embodied
        </div>
        <h2 style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, margin: "0 0 4px", lineHeight: 1.2 }}>
          {piece.icon} {piece.title}
        </h2>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 20, fontStyle: "italic" }}>
          Pick an AI suggestion, or write your own:
        </div>

        {loading && <div style={{ color: C.muted, textAlign: "center", padding: 20 }}>Thinking of embodied alternatives…</div>}

        {!loading && swaps && swaps.map((s, i) => (
          <div key={i} onClick={() => onApply(s.title, s.why)} style={{
            background: "white", border: `1.5px solid ${C.coral}`, borderRadius: 12,
            padding: "14px 16px", marginBottom: 10, cursor: "pointer", transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.coral; e.currentTarget.style.color = "white"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = C.ink; }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🤸 {s.title}</div>
            <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>{s.why}</div>
          </div>
        ))}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px dashed ${C.muted}` }}>
          <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>
            Or your own transformation
          </div>
          <textarea
            value={custom} onChange={e => setCustom(e.target.value)}
            placeholder="How would YOU make this embodied?"
            style={{
              width: "100%", padding: "10px 14px", fontSize: 14, fontFamily: FB,
              border: `1.5px solid ${C.ink}`, borderRadius: 10, background: "white",
              outline: "none", boxSizing: "border-box", minHeight: 60, resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={onClose} style={{
              flex: 1, background: "transparent", border: `1.5px solid ${C.ink}`,
              padding: "10px", borderRadius: 10, fontFamily: FM, fontSize: 11,
              letterSpacing: 1, cursor: "pointer", textTransform: "uppercase",
            }}>Cancel</button>
            <button
              disabled={!custom.trim()}
              onClick={() => onApply(custom.trim(), "")}
              style={{
                flex: 2, background: custom.trim() ? C.coral : C.muted, color: "white",
                border: "none", padding: "10px", borderRadius: 10, fontFamily: FM,
                fontSize: 11, letterSpacing: 1, cursor: custom.trim() ? "pointer" : "not-allowed",
                textTransform: "uppercase",
              }}>Apply my version</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Gallery
// ============================================================
function Gallery({ me, lessons, setLessons, onRefresh, lessonsRef, indexMapRef }) {
  const [openId, setOpenId] = useState(null);
  const [playId, setPlayId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await onRefresh?.(); }
    finally { setTimeout(() => setRefreshing(false), 400); }
  };

  // Apply a star/comment update both locally (instant) and to sharded storage (durable).
  // Uses the new updateLesson() helper which handles read-modify-write retries on the
  // single lesson key — much less contention than the old "rewrite the whole array" approach.
  const applyAndSync = (lid, mutator) => {
    // Optimistic local update
    setLessons(prev => prev.map(l => l.id === lid ? mutator(l) : l));
    // Durable update (with retry inside updateLesson)
    updateLesson(lid, mutator).then((updated) => {
      if (updated) {
        // Re-sync local copy with whatever actually landed in storage
        setLessons(prev => prev.map(l => l.id === lid ? updated : l));
        if (lessonsRef) lessonsRef.current = (lessonsRef.current || []).map(l => l.id === lid ? updated : l);
      }
    });
  };

  const toggleStar = (lid) => {
    applyAndSync(lid, (l) => ({
      ...l,
      stars: (l.stars || []).includes(me.id)
        ? l.stars.filter(s => s !== me.id)
        : [...(l.stars || []), me.id],
    }));
  };

  const addComment = (lid, text) => {
    applyAndSync(lid, (l) => ({
      ...l,
      comments: [...(l.comments || []), {
        id: uid(), authorId: me.id, authorName: me.name, text, createdAt: Date.now(),
      }],
    }));
  };

  const deleteLesson = async (lid) => {
    // Only the author can delete here (facilitator view has its own path).
    const ok = await removeLessonStrict(lid, me.id);
    if (!ok) return;
    setLessons(prev => prev.filter(l => l.id !== lid));
    if (lessonsRef) lessonsRef.current = (lessonsRef.current || []).filter(l => l.id !== lid);
    if (indexMapRef && indexMapRef.current) delete indexMapRef.current[lid];
    if (openId === lid) setOpenId(null);
    if (playId === lid) setPlayId(null);
  };

  const refreshButton = (
    <button onClick={handleRefresh} disabled={refreshing} style={{
      background: "transparent", border: `1px solid ${C.muted}`, color: C.muted,
      padding: "6px 14px", borderRadius: 16, fontFamily: FM, fontSize: 10,
      letterSpacing: 0.8, cursor: refreshing ? "wait" : "pointer", textTransform: "uppercase",
    }}>
      {refreshing ? "Refreshing…" : "↻ Refresh"}
    </button>
  );

  if (lessons.length === 0) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          {refreshButton}
        </div>
        <div style={{ textAlign: "center", padding: 80 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🌱</div>
          <div style={{ fontFamily: FD, fontSize: 24, color: C.muted }}>No lessons shared yet</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <SectionLabel num="✨" title="Shared Lessons" hint="Click ▶ Play to experience a lesson as a student. Star and comment to discuss." />
        <div style={{ marginTop: 30 }}>{refreshButton}</div>
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16,
      }}>
        {lessons.map(l => (
          <GalleryCard key={l.id} lesson={l} me={me}
            onOpen={() => setOpenId(l.id)}
            onPlay={() => setPlayId(l.id)}
            onStar={() => toggleStar(l.id)}
            onDelete={() => deleteLesson(l.id)}
          />
        ))}
      </div>
      {openId && (
        <LessonModal
          lesson={lessons.find(l => l.id === openId)} me={me}
          onClose={() => setOpenId(null)}
          onComment={(t) => addComment(openId, t)}
          onStar={() => toggleStar(openId)}
          onPlay={() => { setPlayId(openId); setOpenId(null); }}
          onDelete={() => deleteLesson(openId)}
        />
      )}
      {playId && (
        <StudentPlayer
          lesson={lessons.find(l => l.id === playId)}
          onClose={() => setPlayId(null)}
        />
      )}
    </div>
  );
}

function GalleryCard({ lesson, me, onOpen, onPlay, onStar, onDelete }) {
  const starred = (lesson.stars || []).includes(me.id);
  const isMine = lesson.authorId === me.id;
  const pct = lesson.totalCount > 0 ? Math.round((lesson.embodiedCount / lesson.totalCount) * 100) : 0;
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div style={{
      background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 16,
      padding: 18, position: "relative",
      boxShadow: `0 4px 14px -6px ${C.ink}55`, transition: "all 0.15s",
    }}
    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px)"}
    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
    >
      {isMine && (
        <div style={{
          position: "absolute", top: -8, right: 12, background: C.mustard, color: C.ink,
          padding: "2px 10px", borderRadius: 10, fontFamily: FM, fontSize: 9, letterSpacing: 1,
        }}>YOURS</div>
      )}
      {lesson.isExample && !isMine && (
        <div style={{
          position: "absolute", top: -8, right: 12, background: C.sage, color: "white",
          padding: "2px 10px", borderRadius: 10, fontFamily: FM, fontSize: 9, letterSpacing: 1,
        }}>EXAMPLE</div>
      )}
      <div onClick={onOpen} style={{ cursor: "pointer" }}>
        <div style={{
          fontFamily: FM, fontSize: 10, color: C.coral,
          letterSpacing: 1, textTransform: "uppercase", marginBottom: 4,
        }}>
          {lesson.subject} {lesson.grade && `· ${lesson.grade}`}
        </div>
        <div style={{ fontFamily: FD, fontSize: 18, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 }}>
          {lesson.name || `${lesson.authorName}'s Lesson`}
        </div>
        {lesson.goal && (
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4, marginBottom: 12, fontStyle: "italic" }}>
            {lesson.goal}
          </div>
        )}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 10, fontSize: 11, color: C.muted, fontFamily: FM,
        }}>
          <span>🤸 {lesson.embodiedCount}/{lesson.totalCount} embodied</span>
          <span>{pct}%</span>
        </div>
        <div style={{ height: 6, background: C.paperDeep, borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: `linear-gradient(90deg, ${C.sage}, ${C.coral})`,
          }} />
        </div>

        {/* Activity strip — visual timeline of lesson activities */}
        {(() => {
          const acts = [
            ...(lesson.timeline?.open || []),
            ...(lesson.timeline?.core || []),
            ...(lesson.timeline?.close || []),
          ];
          if (acts.length === 0) return null;
          return (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                fontFamily: FM, fontSize: 9, letterSpacing: 1, color: C.muted,
                textTransform: "uppercase", marginBottom: 5,
              }}>Activities</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {acts.map((p, i) => {
                  const isEmb = !!p.transformedTo;
                  return (
                    <div
                      key={p.uid || i}
                      title={isEmb ? `🤸 ${p.transformedTo?.title || p.title}\n(was: ${p.title})` : p.title}
                      style={{
                        background: isEmb ? C.coral + "18" : C.paperDeep,
                        border: `1px solid ${isEmb ? C.coral + "88" : C.muted + "55"}`,
                        borderRadius: 20, padding: "3px 8px",
                        fontFamily: FM, fontSize: 9, letterSpacing: 0.2,
                        color: isEmb ? C.coral : C.muted,
                        maxWidth: 130, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                        cursor: "default",
                      }}
                    >
                      {isEmb ? "🤸" : (p.icon || "📌")} {isEmb ? (p.transformedTo?.title || p.title) : p.title}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button onClick={onPlay} style={{
          flex: 1, background: C.ink, color: C.paper, border: "none",
          padding: "10px", borderRadius: 10, fontFamily: FM, fontSize: 11,
          letterSpacing: 1, cursor: "pointer", textTransform: "uppercase", fontWeight: 600,
        }}>
          ▶ Play as student
        </button>
      </div>
      {isMine && (
        <div style={{ marginBottom: 10 }}>
          {!confirmDel ? (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDel(true); }}
              style={{
                width: "100%", background: "transparent", color: C.coral,
                border: `1px solid ${C.coral}`,
                padding: "8px", borderRadius: 10, fontFamily: FM, fontSize: 10,
                letterSpacing: 1, cursor: "pointer", textTransform: "uppercase",
              }}
            >
              🗑 Delete & restart
            </button>
          ) : (
            <div style={{
              display: "flex", gap: 6, alignItems: "center",
              background: C.coral + "15", border: `1px solid ${C.coral}`,
              borderRadius: 10, padding: "6px",
            }}>
              <span style={{ fontSize: 11, color: C.ink, flex: 1, padding: "0 6px" }}>
                Delete this lesson?
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); setConfirmDel(false); }}
                style={{
                  background: C.coral, color: "white", border: "none",
                  padding: "5px 10px", borderRadius: 6, fontFamily: FM, fontSize: 9,
                  letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase",
                }}>Yes</button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDel(false); }}
                style={{
                  background: "transparent", color: C.muted, border: `1px solid ${C.muted}`,
                  padding: "5px 10px", borderRadius: 6, fontFamily: FM, fontSize: 9,
                  letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase",
                }}>No</button>
            </div>
          )}
        </div>
      )}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        paddingTop: 10, borderTop: `1px dashed ${C.muted}`,
        fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 0.5,
      }}>
        <span>{lesson.authorName}</span>
        <div style={{ display: "flex", gap: 10 }}>
          <span>💬 {(lesson.comments || []).length}</span>
          <button onClick={e => { e.stopPropagation(); onStar(); }} style={{
            background: "none", border: "none", fontFamily: FM, fontSize: 11,
            color: starred ? C.coral : C.muted, padding: 0, cursor: "pointer",
          }}>
            {starred ? "★" : "☆"} {(lesson.stars || []).length}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Visual-need evaluator — heuristic per activity
// Returns { format: "slides"|"card", priority: "high"|"medium"|"low", reason }
// ============================================================
function recommendViz(piece) {
  const isEmb = !!piece.transformedTo;
  const type  = piece.type || "";

  if (isEmb) {
    return {
      format: "card",
      priority: "high",
      badge: "🃏 Scenario card",
      reason: "Embodied activity — a scenario card illustrates the body action and cognitive rationale best.",
    };
  }
  if (["lecture", "reading", "video"].includes(type)) {
    return {
      format: "slides",
      priority: "high",
      badge: "🖼️ Slide deck",
      reason: "Abstract/content-heavy — a Before / After / Why slide deck shows the embodied potential most clearly.",
    };
  }
  if (type === "slide") {
    return {
      format: "slides",
      priority: "medium",
      badge: "🖼️ Slide deck",
      reason: "Already visual — a slide deck can show how it could be further embodied.",
    };
  }
  // worksheet, quiz, other
  return {
    format: "slides",
    priority: "medium",
    badge: "🖼️ Slide deck",
    reason: "A slide deck is the clearest way to compare the original and an embodied version.",
  };
}

// ============================================================
// Lesson Visualizer Panel — embedded inside LessonModal
// Lets the reviewer generate a slide deck or scenario card
// for any activity in the lesson without leaving the modal.
// trigger = { uid, format, ts } — set from outside to auto-fire.
// ============================================================
function LessonVisualizerPanel({ lesson, trigger }) {
  // Start open if a trigger is already present (auto-fired from parent on mount).
  const [open, setOpen] = useState(!!trigger);
  const [selectedUid, setSelectedUid] = useState("");
  const [outputType, setOutputType] = useState("slides");
  const [generating, setGenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [slides, setSlides] = useState(null);
  const [card, setCard] = useState(null);
  const [cardImage, setCardImage] = useState(null);
  const [slideImages, setSlideImages] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [error, setError] = useState("");
  // Track which trigger ts we last processed to avoid double-fire.
  const lastTriggerTs = useRef(null);

  // When parent fires a trigger (button click on an activity row):
  // auto-open, pre-select, pre-set format, then generate.
  useEffect(() => {
    if (!trigger || trigger.ts === lastTriggerTs.current) return;
    lastTriggerTs.current = trigger.ts;
    // Reset output first
    setSlides(null); setCard(null);
    setCardImage(null); setSlideImages([]);
    setCurrentSlide(0); setError("");
    // Pre-fill
    setSelectedUid(trigger.uid);
    setOutputType(trigger.format);
    setOpen(true);
    // Scroll panel into view
    setTimeout(() => {
      document.getElementById("lvp-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, [trigger]);

  const allPieces = [
    ...(lesson.timeline?.open || []),
    ...(lesson.timeline?.core || []),
    ...(lesson.timeline?.close || []),
  ];
  const selectedPiece = allPieces.find((p) => p.uid === selectedUid);

  const buildPrompt = () => {
    if (!selectedPiece) return "";
    const isEmb = !!selectedPiece.transformedTo;
    const origTitle = selectedPiece.title || "activity";
    const embTitle = selectedPiece.transformedTo?.title || origTitle;
    const why = selectedPiece.transformedTo?.why || selectedPiece.transformWhy || "";
    return [
      `Subject: ${lesson.subject || "General"}`,
      `Grade: ${lesson.grade || "K-12"}`,
      `Learning goal: ${lesson.goal || "(not specified)"}`,
      `Original non-embodied activity: "${origTitle}" (type: ${selectedPiece.type || "activity"})`,
      isEmb
        ? `Embodied transformation: "${embTitle}"${why ? `\nRationale: ${why}` : ""}`
        : `Note: this activity has not been transformed yet — propose an embodied version.`,
    ].join("\n");
  };

  const buildImgPrompt = (idx) => {
    const isEmb = !!selectedPiece?.transformedTo;
    const embTitle = isEmb ? selectedPiece.transformedTo?.title : selectedPiece?.title;
    if (idx === 1 || idx === "card") {
      return `Flat illustration, educational style, warm muted colors. A student performing: "${embTitle}" for ${lesson.subject || "school"}. Body posture clearly visible. No text. Clean lines. Academic presentation style.`;
    }
    if (idx === 2) {
      return `Minimal flat illustration. Abstract: body movement connected to cognitive learning. Stylized brain and body. Warm muted palette. No text.`;
    }
    return `Flat illustration, educational style. A student doing a passive activity: "${selectedPiece?.title}". Traditional classroom. Clean lines. No text.`;
  };

  const generate = async () => {
    if (!selectedPiece) return;
    setError("");
    setGenerating(true);
    setSlides(null);
    setCard(null);
    setCardImage(null);
    setSlideImages([]);
    setCurrentSlide(0);

    const prompt = buildPrompt();

    if (outputType === "slides") {
      const raw = await callClaudeModel(vizSlideSystem, prompt, 1200, "claude-haiku-4-5-20251001");
      const parsed = safeJSON(raw);
      if (!parsed?.slides) {
        setError("Could not generate — try again.");
        setGenerating(false);
        return;
      }
      setSlides(parsed.slides);
      setGenerating(false);
      setGeneratingImage(true);
      const imgs = await Promise.all(parsed.slides.map((_, i) => callGemini(buildImgPrompt(i))));
      setSlideImages(imgs);
      setGeneratingImage(false);
    } else {
      const raw = await callClaudeModel(vizCardSystem, prompt, 800, "claude-haiku-4-5-20251001");
      const parsed = safeJSON(raw);
      if (!parsed) {
        setError("Could not generate — try again.");
        setGenerating(false);
        return;
      }
      setCard(parsed);
      setGenerating(false);
      setGeneratingImage(true);
      const img = await callGemini(buildImgPrompt("card"));
      setCardImage(img);
      setGeneratingImage(false);
    }
  };

  // Auto-fire when trigger sets selectedUid (piece was pre-selected via row button).
  // We use a ref to track whether we've auto-fired for the current trigger so we
  // don't fire again when the user manually changes the dropdown.
  const autoFiredForTs = useRef(null);
  useEffect(() => {
    if (!trigger || !selectedUid || trigger.ts === autoFiredForTs.current) return;
    if (trigger.uid !== selectedUid) return; // state hasn't caught up yet
    autoFiredForTs.current = trigger.ts;
    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUid, trigger]);

  const reset = () => {
    setSlides(null); setCard(null);
    setCardImage(null); setSlideImages([]);
    setCurrentSlide(0); setError("");
    setSelectedUid(""); setOutputType("slides");
  };

  return (
    <div style={{
      marginTop: 20, marginBottom: 4,
      border: `1.5px solid ${C.ink}`, borderRadius: 14,
      overflow: "hidden",
    }}>
      {/* Collapsible header */}
      <button
        onClick={() => { setOpen(o => !o); if (open) reset(); }}
        style={{
          width: "100%", background: open ? C.ink : C.paperDeep,
          color: open ? C.paper : C.ink,
          border: "none", padding: "12px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: FM, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        <span>
          🎨 Embodied Learning Visualization
          {generating && (
            <span style={{ marginLeft: 10, fontFamily: FM, fontSize: 9, opacity: 0.7, letterSpacing: 0.5 }}>
              · generating…
            </span>
          )}
        </span>
        <span style={{ fontFamily: FM, fontSize: 14 }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div style={{ padding: "18px 20px", background: C.cream }}>
          {/* Activity + format row */}
          {!slides && !card && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Activity picker */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontFamily: FM, fontSize: 9, letterSpacing: 1, color: C.muted, textTransform: "uppercase" }}>
                    Activity
                  </label>
                  <select
                    value={selectedUid}
                    onChange={e => setSelectedUid(e.target.value)}
                    style={{
                      padding: "8px 12px", fontSize: 13, fontFamily: FB,
                      border: `1.5px solid ${C.ink}`, borderRadius: 8,
                      background: C.paper, outline: "none", cursor: "pointer",
                    }}
                  >
                    <option value="">— pick an activity —</option>
                    {allPieces.map((p) => (
                      <option key={p.uid} value={p.uid}>
                        {p.transformedTo ? "🤸 " : "💺 "}
                        {p.title}
                        {p.transformedTo ? ` → ${p.transformedTo.title || p.transformedTo}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Format toggle */}
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { id: "slides", label: "🖼️ Slides" },
                    { id: "card", label: "🃏 Card" },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setOutputType(opt.id)}
                      style={{
                        padding: "8px 14px", fontFamily: FB, fontSize: 12,
                        background: outputType === opt.id ? C.ink : C.paper,
                        color: outputType === opt.id ? C.paper : C.ink,
                        border: `1.5px solid ${C.ink}`, borderRadius: 8, cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={generate}
                  disabled={!selectedUid || generating}
                  style={{
                    padding: "8px 18px", fontFamily: FD, fontSize: 14, fontWeight: 600,
                    background: (!selectedUid || generating) ? C.muted : C.coral,
                    color: "white", border: "none", borderRadius: 8,
                    cursor: (!selectedUid || generating) ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {generating ? "Generating…" : "Generate →"}
                </button>
              </div>

              {error && (
                <div style={{ fontFamily: FM, fontSize: 11, color: C.coral }}>⚠ {error}</div>
              )}
            </div>
          )}

          {/* Result + reset */}
          {(slides || card) && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <button
                  onClick={reset}
                  style={{
                    background: "transparent", border: `1px solid ${C.muted}`, color: C.muted,
                    padding: "5px 12px", borderRadius: 16, fontFamily: FM, fontSize: 9,
                    letterSpacing: 0.8, textTransform: "uppercase", cursor: "pointer",
                  }}
                >
                  ↺ Reset
                </button>
              </div>

              {slides && (
                <VizSlideDeckView
                  slides={slides}
                  images={slideImages}
                  generatingImages={generatingImage}
                  currentSlide={currentSlide}
                  setCurrentSlide={setCurrentSlide}
                  lesson={lesson}
                />
              )}

              {card && (
                <ScenarioCardView
                  card={card}
                  image={cardImage}
                  generatingImage={generatingImage}
                  lesson={lesson}
                  piece={selectedPiece}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Lesson Modal (preview)
// ============================================================
function LessonModal({ lesson, me, onClose, onComment, onStar, onPlay, onDelete }) {
  const [text, setText] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  // vizTrigger fires the LessonVisualizerPanel: { uid, format, ts }
  const [vizTrigger, setVizTrigger] = useState(null);
  const starred = (lesson.stars || []).includes(me.id);
  const isMine = lesson.authorId === me.id;
  const submit = () => { if (text.trim()) { onComment(text.trim()); setText(""); } };

  const fireViz = (piece) => {
    const rec = recommendViz(piece);
    setVizTrigger({ uid: piece.uid, format: rec.format, ts: Date.now() });
  };

  // Auto-generate a visualization as soon as the modal opens.
  // Pick the highest-priority activity: embodied first, then lecture/reading/video.
  useEffect(() => {
    const flat = [
      ...(lesson.timeline?.open  || []),
      ...(lesson.timeline?.core  || []),
      ...(lesson.timeline?.close || []),
    ];
    if (flat.length === 0) return;
    // Sort: high-priority first, then preserve original order as tiebreaker.
    const sorted = flat
      .map((p, i) => ({ p, i, rec: recommendViz(p) }))
      .sort((a, b) => {
        const pa = a.rec.priority === "high" ? 0 : 1;
        const pb = b.rec.priority === "high" ? 0 : 1;
        return pa - pb || a.i - b.i;
      });
    const best = sorted[0];
    setVizTrigger({ uid: best.p.uid, format: best.rec.format, ts: Date.now() });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allPieces = [
    ...lesson.timeline.open.map(p => ({ ...p, _phase: "Opening", _phaseIcon: "🌅" })),
    ...lesson.timeline.core.map(p => ({ ...p, _phase: "Core", _phaseIcon: "🔥" })),
    ...lesson.timeline.close.map(p => ({ ...p, _phase: "Close", _phaseIcon: "🌙" })),
  ];

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(42,37,34,0.65)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "40px 20px", zIndex: 100, overflowY: "auto", backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.paper, border: `1.5px solid ${C.ink}`, borderRadius: 20,
        maxWidth: 760, width: "100%", padding: "28px 32px",
        boxShadow: `0 20px 60px -20px ${C.ink}`, position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 12, background: C.ink, color: C.paper,
          border: "none", width: 30, height: 30, borderRadius: 15, cursor: "pointer", fontSize: 14,
        }}>✕</button>

        <div style={{ fontFamily: FM, fontSize: 10, color: C.coral, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
          {lesson.subject} {lesson.grade && `· ${lesson.grade}`} · by {lesson.authorName}
        </div>
        <h2 style={{ fontFamily: FD, fontSize: 26, fontWeight: 700, margin: "0 0 4px", lineHeight: 1.15 }}>
          {lesson.name || `${lesson.authorName}'s Lesson`}
        </h2>
        {lesson.goal && (
          <div style={{ fontSize: 13, color: C.muted, fontStyle: "italic", marginBottom: 18 }}>
            {lesson.goal}
          </div>
        )}

        <button onClick={onPlay} style={{
          width: "100%", background: C.coral, color: "white", border: "none",
          padding: "14px", borderRadius: 12, fontFamily: FD, fontSize: 17, fontWeight: 600,
          cursor: "pointer", marginBottom: 24,
        }}>
          ▶ Experience this lesson as a student
        </button>

        {/* Full walkthrough with all generated content */}
        <div style={{
          fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1,
          textTransform: "uppercase", marginBottom: 10,
        }}>
          Full lesson walkthrough · for discussion
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          {allPieces.map((p, i) => {
            const em = !!p.transformedTo;
            return (
              <div key={p.uid} style={{
                background: C.cream,
                border: `1.5px solid ${em ? C.coral : C.ink}`,
                borderLeft: `6px solid ${em ? C.coral : C.ink}`,
                borderRadius: 12, padding: "14px 18px",
              }}>
                {/* Row header: phase label + viz recommendation + button */}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginBottom: 4, flexWrap: "wrap", gap: 6,
                }}>
                  <div style={{
                    fontFamily: FM, fontSize: 9, color: C.muted,
                    letterSpacing: 1, textTransform: "uppercase",
                  }}>
                    {p._phaseIcon} {p._phase} · Step {i + 1} {em && "· Embodied"}
                  </div>
                  {/* Visual recommendation badge + trigger button */}
                  {(() => {
                    const rec = recommendViz(p);
                    const isActive = vizTrigger?.uid === p.uid;
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontFamily: FM, fontSize: 8, letterSpacing: 0.5,
                          color: rec.priority === "high" ? C.coral : C.muted,
                          background: rec.priority === "high" ? C.coral + "15" : C.paperDeep,
                          border: `1px solid ${rec.priority === "high" ? C.coral + "55" : C.muted + "44"}`,
                          borderRadius: 20, padding: "2px 8px",
                          textTransform: "uppercase",
                        }}
                          title={rec.reason}
                        >
                          {rec.badge}
                        </span>
                        <button
                          onClick={() => fireViz(p)}
                          title={rec.reason}
                          style={{
                            background: isActive ? C.coral : "transparent",
                            color: isActive ? "white" : C.coral,
                            border: `1.5px solid ${C.coral}`,
                            padding: "3px 10px", borderRadius: 20,
                            fontFamily: FM, fontSize: 8, letterSpacing: 0.8,
                            textTransform: "uppercase", cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isActive ? "✓ Visualizing" : "🎨 Visualize"}
                        </button>
                      </div>
                    );
                  })()}
                </div>
                <div style={{
                  fontFamily: FD, fontSize: 15, fontWeight: 700, lineHeight: 1.3,
                  marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 18 }}>{p.icon}</span>
                  <span>{p.transformedTo || p.title}</span>
                </div>
                {p.content ? (
                  <ContentEditor
                    type={p.content.type}
                    data={p.content.data}
                    onChange={() => {}}
                    locked={true}
                  />
                ) : (
                  <div style={{
                    fontSize: 12, color: C.muted, fontStyle: "italic",
                    padding: "8px 12px", background: C.paper, borderRadius: 8,
                  }}>
                    (No pre-generated content — play the lesson to see it.)
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Inline visualizer — auto-triggered by per-activity buttons above */}
        <div id="lvp-anchor" />
        <LessonVisualizerPanel lesson={lesson} trigger={vizTrigger} />

        <div style={{
          marginTop: 16, paddingTop: 16, borderTop: `1.5px solid ${C.ink}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>
            Discussion ({(lesson.comments || []).length})
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isMine && (
              !confirmDel ? (
                <button onClick={() => setConfirmDel(true)} style={{
                  background: "transparent", color: C.coral,
                  border: `1px solid ${C.coral}`,
                  padding: "6px 12px", borderRadius: 20, fontFamily: FM, fontSize: 10,
                  letterSpacing: 0.8, cursor: "pointer", textTransform: "uppercase",
                }}>
                  🗑 Delete
                </button>
              ) : (
                <div style={{
                  display: "flex", gap: 6, alignItems: "center",
                  background: C.coral + "15", border: `1px solid ${C.coral}`,
                  borderRadius: 20, padding: "4px 8px",
                }}>
                  <span style={{ fontSize: 10, color: C.ink }}>Sure?</span>
                  <button onClick={onDelete} style={{
                    background: C.coral, color: "white", border: "none",
                    padding: "4px 10px", borderRadius: 14, fontFamily: FM, fontSize: 9,
                    letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase",
                  }}>Yes</button>
                  <button onClick={() => setConfirmDel(false)} style={{
                    background: "transparent", color: C.muted, border: `1px solid ${C.muted}`,
                    padding: "4px 10px", borderRadius: 14, fontFamily: FM, fontSize: 9,
                    letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase",
                  }}>No</button>
                </div>
              )
            )}
            <button onClick={onStar} style={{
              background: starred ? C.coral : "transparent", color: starred ? "white" : C.ink,
              border: `1.5px solid ${C.ink}`, padding: "6px 14px", borderRadius: 20,
              fontFamily: FM, fontSize: 10, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase",
            }}>
              {starred ? "★" : "☆"} {(lesson.stars || []).length}
            </button>
          </div>
        </div>

        {(lesson.comments || []).map(c => (
          <div key={c.id} style={{
            background: C.cream, border: `1px solid ${C.ink}`, borderRadius: 10,
            padding: "10px 14px", marginTop: 8,
          }}>
            <div style={{ fontFamily: FM, fontSize: 9, color: C.coral, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>
              {c.authorName}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>{c.text}</div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="What's the embodied tradeoff in this lesson?"
            style={{
              flex: 1, padding: "10px 14px", fontFamily: FB, fontSize: 14,
              border: `1.5px solid ${C.ink}`, borderRadius: 10, background: "white", outline: "none",
            }}
          />
          <button onClick={submit} style={{
            background: C.ink, color: C.paper, border: "none", padding: "0 18px",
            borderRadius: 10, fontFamily: FM, fontSize: 11, letterSpacing: 1, cursor: "pointer",
          }}>POST</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STUDENT PLAYER — experience the lesson
// ============================================================
function StudentPlayer({ lesson, onClose }) {
  // Flatten all pieces in order
  const allPieces = [
    ...lesson.timeline.open.map(p => ({ ...p, _phase: "Opening 🌅" })),
    ...lesson.timeline.core.map(p => ({ ...p, _phase: "Core 🔥" })),
    ...lesson.timeline.close.map(p => ({ ...p, _phase: "Close 🌙" })),
  ];
  const [idx, setIdx] = useState(0);
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const cacheRef = useRef({});

  const current = allPieces[idx];
  const total = allPieces.length;

  useEffect(() => {
    if (!current) return;
    setError(false);

    // If the piece has pre-generated content (new lessons), use it instantly.
    if (current.content) {
      setContent(current.content);
      setLoading(false);
      return;
    }

    // Fallback for legacy lessons without pre-generated content: generate on the fly.
    const cached = cacheRef.current[current.uid];
    if (cached) {
      setContent(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    setContent(null);

    const type = current.transformedTo ? "embodied" : current.type;
    const title = current.transformedTo || current.title;

    (async () => {
      const raw = await callClaude(
        makeExpSystem(type),
        `Subject: ${lesson.subject}\nGrade: ${lesson.grade || "(any)"}\nLearning goal: ${lesson.goal || ""}\n\nActivity to generate: "${title}"\nPhase in lesson: ${current._phase}`,
        1500
      );
      const parsed = safeJSON(raw);
      if (parsed) {
        cacheRef.current[current.uid] = { type, data: parsed };
        setContent({ type, data: parsed });
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, [idx, current?.uid]);

  if (!current) {
    return <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={playerBox}>
        <h2 style={{ fontFamily: FD, fontSize: 24 }}>Empty lesson!</h2>
        <button onClick={onClose}>Close</button>
      </div>
    </div>;
  }

  const progress = ((idx + 1) / total) * 100;
  const isLast = idx === total - 1;

  return (
    <div style={overlay}>
      <div style={playerBox}>
        {/* Player header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 14, paddingBottom: 14, borderBottom: `1px dashed ${C.muted}`,
        }}>
          <div>
            <div style={{ fontFamily: FM, fontSize: 10, color: C.coral, letterSpacing: 1, textTransform: "uppercase" }}>
              {current._phase} · Step {idx + 1} of {total}
            </div>
            <div style={{ fontFamily: FD, fontSize: 14, color: C.muted, marginTop: 2 }}>
              Playing “{lesson.name || lesson.goal || lesson.subject}” · by {lesson.authorName}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: C.ink, color: C.paper, border: "none", width: 32, height: 32,
            borderRadius: 16, cursor: "pointer", fontSize: 14,
          }}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 4, background: C.paperDeep, borderRadius: 2, marginBottom: 20 }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: `linear-gradient(90deg, ${C.sage}, ${C.coral})`,
            borderRadius: 2, transition: "width 0.3s",
          }} />
        </div>

        {/* Piece title */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 6,
        }}>
          <span style={{ fontSize: 28 }}>{current.icon}</span>
          <div style={{
            fontFamily: FM, fontSize: 10, letterSpacing: 1, color: C.muted,
            textTransform: "uppercase",
          }}>
            {current.transformedTo ? "embodied" : current.type}
          </div>
        </div>
        <h2 style={{ fontFamily: FD, fontSize: 24, fontWeight: 700, margin: "0 0 18px", lineHeight: 1.2 }}>
          {current.transformedTo || current.title}
        </h2>

        {/* Content area */}
        <div style={{
          background: C.cream, border: `1.5px solid ${C.ink}`,
          borderLeft: current.transformedTo ? `6px solid ${C.coral}` : `6px solid ${C.ink}`,
          borderRadius: 14, padding: "20px 24px", minHeight: 200,
        }}>
          {loading && <div style={{ textAlign: "center", color: C.muted, padding: 30, fontStyle: "italic" }}>
            Generating your learning experience…
          </div>}
          {error && <div style={{ textAlign: "center", color: C.coral, padding: 30, fontStyle: "italic" }}>
            Something glitched generating this step. Click Next to continue.
          </div>}
          {!loading && !error && content && <PieceContent content={content} />}
        </div>

        {/* Nav */}
        <div style={{
          display: "flex", justifyContent: "space-between", gap: 10, marginTop: 20,
        }}>
          <button
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0}
            style={{
              background: "transparent", border: `1.5px solid ${C.ink}`, color: C.ink,
              padding: "12px 24px", borderRadius: 12, fontFamily: FM, fontSize: 11,
              letterSpacing: 1, cursor: idx === 0 ? "not-allowed" : "pointer",
              textTransform: "uppercase", opacity: idx === 0 ? 0.3 : 1,
            }}
          >
            ← Previous
          </button>
          <button
            onClick={() => isLast ? onClose() : setIdx(i => i + 1)}
            style={{
              background: C.coral, color: "white", border: "none",
              padding: "12px 28px", borderRadius: 12, fontFamily: FD, fontSize: 16,
              fontWeight: 600, cursor: "pointer",
            }}
          >
            {isLast ? "Finish ✓" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, background: "rgba(42,37,34,0.75)",
  display: "flex", alignItems: "flex-start", justifyContent: "center",
  padding: "30px 20px", zIndex: 200, overflowY: "auto", backdropFilter: "blur(6px)",
};
const playerBox = {
  background: C.paper, border: `1.5px solid ${C.ink}`, borderRadius: 20,
  maxWidth: 720, width: "100%", padding: "24px 28px",
  boxShadow: `0 20px 60px -20px ${C.ink}`,
};

// ============================================================
// Piece Content Renderers — one per type
// ============================================================
function PieceContent({ content }) {
  const { type, data } = content;
  if (type === "lecture") return <LectureView data={data} />;
  if (type === "reading") return <ReadingView data={data} />;
  if (type === "slide") return <SlideView data={data} />;
  if (type === "video") return <VideoView data={data} />;
  if (type === "worksheet") return <WorksheetView data={data} />;
  if (type === "quiz") return <QuizView data={data} />;
  if (type === "embodied") return <EmbodiedView data={data} />;
  return <div>Unsupported piece type.</div>;
}

function LectureView({ data }) {
  return (
    <div>
      <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
        🎙️ Listen / Read along
      </div>
      <div style={{ fontFamily: FD, fontSize: 16, lineHeight: 1.7, color: C.ink, whiteSpace: "pre-wrap" }}>
        {data.script}
      </div>
    </div>
  );
}

function ReadingView({ data }) {
  return (
    <div>
      <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
        📖 Read carefully
      </div>
      {data.externalUrl && (
        <a
          href={data.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            background: C.paperDeep, border: `1px dashed ${C.muted}`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 14,
            fontSize: 13, color: C.coral, textDecoration: "none",
            wordBreak: "break-all",
          }}
        >
          🔗 Open article: {data.externalUrl} ↗
        </a>
      )}
      <div style={{
        fontFamily: FD, fontSize: 15, lineHeight: 1.75, color: C.ink,
        whiteSpace: "pre-wrap", columnCount: 1,
      }}>
        {data.passage}
      </div>
    </div>
  );
}

function SlideView({ data }) {
  return (
    <div style={{
      background: "white", border: `1px solid ${C.ink}`, borderRadius: 10,
      padding: "28px 32px", minHeight: 180,
    }}>
      <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
        🖼️ Slide
      </div>
      <h3 style={{ fontFamily: FD, fontSize: 24, fontWeight: 700, margin: "0 0 16px" }}>
        {data.title}
      </h3>
      <ul style={{ fontSize: 15, lineHeight: 1.7, margin: "0 0 16px", paddingLeft: 20 }}>
        {(data.bullets || []).map((b, i) => <li key={i}>{b}</li>)}
      </ul>
      {data.visual && (
        <div style={{
          background: C.paperDeep, border: `1px dashed ${C.muted}`, borderRadius: 8,
          padding: 12, fontSize: 12, fontStyle: "italic", color: C.muted,
        }}>
          [Visual: {data.visual}]
        </div>
      )}
    </div>
  );
}

function VideoView({ data }) {
  const [scene, setScene] = useState(0);
  const scenes = data.scenes || [];
  const videoInfo = getVideoInfo(data.externalUrl);

  // Real video — show clickable preview (sandbox blocks iframe embeds)
  if (videoInfo) {
    return (
      <div>
        <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
          📺 Video
        </div>
        <VideoPreviewCard url={data.externalUrl} />
        <div style={{
          marginTop: 10, fontSize: 11, color: C.muted, fontStyle: "italic",
          textAlign: "center",
        }}>
          Tap the play button to open the video in a new tab.
        </div>
        {data.narration && (
          <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", lineHeight: 1.5, marginTop: 10 }}>
            {data.narration}
          </div>
        )}
      </div>
    );
  }

  // AI storyboard fallback
  return (
    <div>
      <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
        📺 Video storyboard
      </div>
      <div style={{
        background: "#1a1a1a", color: "white", borderRadius: 10,
        padding: "24px", minHeight: 120, marginBottom: 12,
      }}>
        {scenes.length > 0 ? (
          <>
            <div style={{ fontFamily: FM, fontSize: 10, opacity: 0.6, marginBottom: 8 }}>
              SCENE {scene + 1} / {scenes.length}
            </div>
            <div style={{
              fontStyle: "italic", fontSize: 13, marginBottom: 10, opacity: 0.9,
              background: "rgba(255,255,255,0.08)", padding: 10, borderRadius: 6,
            }}>
              🎬 {scenes[scene].visual}
            </div>
            <div style={{ fontSize: 14, fontFamily: FD }}>
              {scenes[scene].caption}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14 }}>{data.narration}</div>
        )}
      </div>
      {scenes.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {scenes.map((_, i) => (
            <button key={i} onClick={() => setScene(i)} style={{
              flex: 1, background: scene === i ? C.coral : C.paperDeep,
              color: scene === i ? "white" : C.ink, border: "none",
              padding: "6px", borderRadius: 6, fontFamily: FM, fontSize: 10, cursor: "pointer",
            }}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", lineHeight: 1.5 }}>
        Narration: {data.narration}
      </div>
    </div>
  );
}

function WorksheetView({ data }) {
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState({});
  return (
    <div>
      <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
        📝 Worksheet
      </div>
      {(data.problems || []).map((p, i) => (
        <div key={i} style={{
          background: "white", border: `1px solid ${C.ink}`, borderRadius: 10,
          padding: 14, marginBottom: 10,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            {i + 1}. {p.q}
          </div>
          <input
            value={answers[i] || ""}
            onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
            placeholder="Your answer"
            style={{
              width: "100%", padding: "8px 12px", fontFamily: FB, fontSize: 14,
              border: `1px solid ${C.muted}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => setRevealed(r => ({ ...r, [i]: "answer" }))} style={wsBtn}>
              Show answer
            </button>
            <button onClick={() => setRevealed(r => ({ ...r, [i]: "hint" }))} style={wsBtn}>
              Hint
            </button>
          </div>
          {revealed[i] === "hint" && (
            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginTop: 6 }}>
              💡 {p.hint}
            </div>
          )}
          {revealed[i] === "answer" && (
            <div style={{ fontSize: 13, color: C.sage, marginTop: 6, fontWeight: 600 }}>
              ✓ Answer: {p.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const wsBtn = {
  background: C.paperDeep, border: "none", padding: "4px 10px",
  borderRadius: 6, fontFamily: FM, fontSize: 10, color: C.ink,
  cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase",
};

function QuizView({ data }) {
  const [picks, setPicks] = useState({});
  return (
    <div>
      <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
        ✅ Quiz
      </div>
      {(data.questions || []).map((q, i) => (
        <div key={i} style={{
          background: "white", border: `1px solid ${C.ink}`, borderRadius: 10,
          padding: 14, marginBottom: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            {i + 1}. {q.q}
          </div>
          {q.options.map((opt, j) => {
            const picked = picks[i] === j;
            const showResult = picks[i] != null;
            const isCorrect = j === q.correct;
            let bg = "white", color = C.ink, border = C.muted;
            if (showResult && isCorrect) { bg = C.sage; color = "white"; border = C.sage; }
            else if (picked && !isCorrect) { bg = "#d04a3a"; color = "white"; border = "#d04a3a"; }
            return (
              <button
                key={j}
                onClick={() => picks[i] == null && setPicks(p => ({ ...p, [i]: j }))}
                disabled={picks[i] != null}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: bg, color, border: `1px solid ${border}`,
                  padding: "8px 12px", borderRadius: 8, marginBottom: 5,
                  fontFamily: FB, fontSize: 13,
                  cursor: picks[i] == null ? "pointer" : "default",
                }}
              >
                {String.fromCharCode(65 + j)}. {opt}
              </button>
            );
          })}
          {picks[i] != null && (
            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginTop: 6 }}>
              {q.explain}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EmbodiedView({ data }) {
  const [done, setDone] = useState({});
  const allDone = (data.steps || []).every((_, i) => done[i]);
  return (
    <div>
      <div style={{ fontFamily: FM, fontSize: 10, color: C.coral, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
        🤸 Embodied — do it with your body
      </div>
      <div style={{
        background: C.coral + "15", border: `1.5px dashed ${C.coral}`, borderRadius: 10,
        padding: 14, marginBottom: 14, fontSize: 13, color: C.ink, fontStyle: "italic",
      }}>
        You are the student now. Stand up, make space, try each step. Check each off as you do it.
      </div>
      {(data.steps || []).map((s, i) => (
        <div
          key={i}
          onClick={() => setDone(d => ({ ...d, [i]: !d[i] }))}
          style={{
            background: done[i] ? C.sage + "22" : "white",
            border: `1.5px solid ${done[i] ? C.sage : C.ink}`,
            borderRadius: 10, padding: "12px 14px", marginBottom: 8,
            display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <div style={{
            width: 26, height: 26, borderRadius: 13, flexShrink: 0,
            background: done[i] ? C.sage : "transparent",
            border: `2px solid ${done[i] ? C.sage : C.muted}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 14, fontWeight: 700,
          }}>
            {done[i] ? "✓" : i + 1}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, paddingTop: 2 }}>{s}</div>
        </div>
      ))}
      {allDone && data.notice && (
        <div style={{
          background: C.mustard + "33", border: `1.5px solid ${C.mustard}`,
          borderRadius: 10, padding: 14, marginTop: 12,
        }}>
          <div style={{ fontFamily: FM, fontSize: 10, color: C.ink, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
            ✨ What did you notice?
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, fontStyle: "italic" }}>
            {data.notice}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Facilitator View — live debrief dashboard
// ============================================================
function FacilitatorView({ lessons, setLessons, me, onRefresh, lessonsRef, indexMapRef }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Which lessons have their full walkthrough expanded
  const [expanded, setExpanded] = useState({});
  // Which lessons are awaiting delete confirmation
  const [confirmDelete, setConfirmDelete] = useState({});

  const toggleExpand = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await onRefresh?.(); }
    finally { setTimeout(() => setRefreshing(false), 400); }
  };

  const deleteLessonAsFacilitator = async (lid) => {
    // null requestingUserId = facilitator override (no author check)
    const ok = await removeLessonStrict(lid, null);
    if (!ok) return;
    setLessons(prev => prev.filter(l => l.id !== lid));
    if (lessonsRef) lessonsRef.current = (lessonsRef.current || []).filter(l => l.id !== lid);
    if (indexMapRef && indexMapRef.current) delete indexMapRef.current[lid];
    setConfirmDelete(d => ({ ...d, [lid]: false }));
    setExpanded(e => ({ ...e, [lid]: false }));
  };

  // ---- Aggregate stats ----
  const totalLessons = lessons.length;
  const uniqueTeachers = new Set(lessons.map(l => l.authorId)).size;
  const allPieces = lessons.flatMap(l => [
    ...l.timeline.open, ...l.timeline.core, ...l.timeline.close,
  ]);
  const totalPieces = allPieces.length;
  const totalEmbodied = allPieces.filter(p => !!p.transformedTo).length;
  const avgEmbodimentPct = totalPieces > 0 ? Math.round((totalEmbodied / totalPieces) * 100) : 0;

  // Transformation rate per piece type: of all pieces of each original type,
  // what fraction got transformed into embodied?
  const typeStats = {};
  allPieces.forEach(p => {
    const t = p.type || "other";
    if (!typeStats[t]) typeStats[t] = { total: 0, transformed: 0 };
    typeStats[t].total += 1;
    if (p.transformedTo) typeStats[t].transformed += 1;
  });
  const typeRows = Object.entries(typeStats)
    .map(([type, s]) => ({
      type,
      total: s.total,
      transformed: s.transformed,
      pct: s.total > 0 ? Math.round((s.transformed / s.total) * 100) : 0,
      icon: iconForType(type),
    }))
    .sort((a, b) => b.pct - a.pct);

  // Most-starred lessons
  const topStarred = [...lessons]
    .map(l => ({ ...l, _starCount: (l.stars || []).length }))
    .filter(l => l._starCount > 0)
    .sort((a, b) => b._starCount - a._starCount)
    .slice(0, 5);

  // Activities that most resisted embodiment — pieces that are NOT transformed,
  // grouped by original title, ranked by frequency.
  const resistedMap = {};
  allPieces.forEach(p => {
    if (p.transformedTo) return;
    const key = `${iconForType(p.type)} ${p.title}`;
    resistedMap[key] = (resistedMap[key] || 0) + 1;
  });
  const resisted = Object.entries(resistedMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // ---- Session management ----
  const clearGallery = async () => {
    try {
      await clearAllLessons();
      // Re-seed the example so the gallery isn't bare after a clear
      await seedExampleLessonIfMissing();
      // Reload to pick up the freshly-seeded example
      if (onRefresh) await onRefresh();
      else setLessons([]);
      setConfirmClear(false);
    } catch (e) {
      alert("Could not clear gallery: " + (e?.message || "unknown error"));
    }
  };

  const exportSession = () => {
    setExporting(true);
    const html = buildSessionHTML(lessons, { totalLessons, uniqueTeachers, avgEmbodimentPct, typeRows, topStarred, resisted });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `embodied-aied-session-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); setExporting(false); }, 500);
  };

  // ---- Render ----
  const statBox = {
    background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 14,
    padding: "18px 22px", flex: 1, minWidth: 160,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <SectionLabel num="📊" title="Facilitator Debrief" hint="Live stats aggregated from all shared lessons. For leading the closing discussion." />
        <button onClick={handleRefresh} disabled={refreshing} style={{
          marginTop: 30,
          background: "transparent", border: `1px solid ${C.muted}`, color: C.muted,
          padding: "6px 14px", borderRadius: 16, fontFamily: FM, fontSize: 10,
          letterSpacing: 0.8, cursor: refreshing ? "wait" : "pointer", textTransform: "uppercase",
        }}>
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {totalLessons === 0 ? (
        <div style={{
          background: C.cream, border: `1.5px dashed ${C.muted}`, borderRadius: 16,
          padding: 40, textAlign: "center", color: C.muted,
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🌱</div>
          <div style={{ fontFamily: FD, fontSize: 18 }}>
            No lessons shared yet. Stats will appear here as teachers publish.
          </div>
        </div>
      ) : (
        <>
          {/* Top-level stats */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
            <div style={statBox}>
              <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>
                Lessons shared
              </div>
              <div style={{ fontFamily: FD, fontSize: 32, fontWeight: 700, marginTop: 4 }}>{totalLessons}</div>
            </div>
            <div style={statBox}>
              <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>
                Teachers
              </div>
              <div style={{ fontFamily: FD, fontSize: 32, fontWeight: 700, marginTop: 4 }}>{uniqueTeachers}</div>
            </div>
            <div style={statBox}>
              <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>
                Avg. embodiment
              </div>
              <div style={{ fontFamily: FD, fontSize: 32, fontWeight: 700, marginTop: 4, color: C.coral }}>
                {avgEmbodimentPct}%
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {totalEmbodied} of {totalPieces} pieces
              </div>
            </div>
          </div>

          {/* Transformation rate per type */}
          <div style={{
            background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 16,
            padding: "20px 24px", marginBottom: 20,
          }}>
            <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>
              Which piece types got transformed most?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {typeRows.map(row => (
                <div key={row.type} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 100, fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>
                    {row.icon} {row.type}
                  </div>
                  <div style={{ flex: 1, height: 14, background: C.paperDeep, borderRadius: 7, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${row.pct}%`,
                      background: `linear-gradient(90deg, ${C.sage}, ${C.coral})`,
                      transition: "width 0.4s",
                    }} />
                  </div>
                  <div style={{ fontFamily: FM, fontSize: 11, color: C.muted, minWidth: 70, textAlign: "right" }}>
                    {row.transformed}/{row.total} · {row.pct}%
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.muted}`,
              fontSize: 12, color: C.muted, fontStyle: "italic", lineHeight: 1.5,
            }}>
              💡 High % = teachers saw clear embodied potential. Low % = teachers felt that type resisted embodiment — a rich discussion starter.
            </div>
          </div>

          {/* Resisted activities */}
          {resisted.length > 0 && (
            <div style={{
              background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 16,
              padding: "20px 24px", marginBottom: 20,
            }}>
              <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>
                Activities most often left non-embodied
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {resisted.map(([title, n], i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", background: C.paper, borderRadius: 8, fontSize: 13,
                  }}>
                    <span>{title}</span>
                    <span style={{
                      fontFamily: FM, fontSize: 10, color: C.coral, letterSpacing: 0.5,
                      background: C.coral + "22", padding: "2px 8px", borderRadius: 10,
                    }}>×{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Most starred */}
          {topStarred.length > 0 && (
            <div style={{
              background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 16,
              padding: "20px 24px", marginBottom: 20,
            }}>
              <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>
                Most-starred lessons
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topStarred.map((l, i) => {
                  const pct = l.totalCount > 0 ? Math.round((l.embodiedCount / l.totalCount) * 100) : 0;
                  return (
                    <div key={l.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                      padding: "10px 14px", background: C.paper, borderRadius: 10,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: FD, fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                          {l.name || `${l.authorName}'s Lesson`}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                          {l.subject} · {l.authorName} · 🤸 {pct}% embodied
                        </div>
                      </div>
                      <div style={{ fontFamily: FM, fontSize: 14, color: C.coral, fontWeight: 700 }}>
                        ★ {l._starCount}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full walkthrough — every lesson's complete process */}
          <div style={{
            background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 16,
            padding: "20px 24px", marginBottom: 20,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 14, flexWrap: "wrap", gap: 8,
            }}>
              <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>
                All lessons · full process
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => {
                    const all = {};
                    lessons.forEach(l => { all[l.id] = true; });
                    setExpanded(all);
                  }}
                  style={{
                    background: "transparent", border: `1px solid ${C.muted}`, color: C.muted,
                    padding: "5px 12px", borderRadius: 14, fontFamily: FM, fontSize: 9,
                    letterSpacing: 0.8, cursor: "pointer", textTransform: "uppercase",
                  }}
                >Expand all</button>
                <button
                  onClick={() => setExpanded({})}
                  style={{
                    background: "transparent", border: `1px solid ${C.muted}`, color: C.muted,
                    padding: "5px 12px", borderRadius: 14, fontFamily: FM, fontSize: 9,
                    letterSpacing: 0.8, cursor: "pointer", textTransform: "uppercase",
                  }}
                >Collapse all</button>
              </div>
            </div>
            <div style={{
              fontSize: 12, color: C.muted, fontStyle: "italic", lineHeight: 1.5, marginBottom: 14,
            }}>
              For each teacher: the original AI pool they received, the lesson they assembled, and the final generated content.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {lessons.map(l => (
                <LessonWalkthrough
                  key={l.id}
                  lesson={l}
                  isExpanded={!!expanded[l.id]}
                  onToggle={() => toggleExpand(l.id)}
                  confirmDelete={!!confirmDelete[l.id]}
                  onRequestDelete={() => setConfirmDelete(d => ({ ...d, [l.id]: true }))}
                  onCancelDelete={() => setConfirmDelete(d => ({ ...d, [l.id]: false }))}
                  onDelete={() => deleteLessonAsFacilitator(l.id)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Session management */}
      <div style={{
        background: C.cream, border: `1.5px solid ${C.ink}`, borderRadius: 16,
        padding: "20px 24px", marginTop: 30,
      }}>
        <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>
          Session management
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={exportSession}
            disabled={exporting || totalLessons === 0}
            style={{
              background: C.ink, color: C.paper, border: "none",
              padding: "12px 20px", borderRadius: 12, fontFamily: FM, fontSize: 11,
              letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
              cursor: (exporting || totalLessons === 0) ? "not-allowed" : "pointer",
              opacity: totalLessons === 0 ? 0.4 : 1,
            }}
          >
            {exporting ? "Exporting…" : "⬇ Export Session (.html)"}
          </button>
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              disabled={totalLessons === 0}
              style={{
                background: "transparent", color: C.coral,
                border: `1.5px solid ${C.coral}`,
                padding: "12px 20px", borderRadius: 12, fontFamily: FM, fontSize: 11,
                letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
                cursor: totalLessons === 0 ? "not-allowed" : "pointer",
                opacity: totalLessons === 0 ? 0.4 : 1,
              }}
            >
              🗑 Clear Gallery
            </button>
          ) : (
            <div style={{
              display: "flex", gap: 8, alignItems: "center",
              background: C.coral + "15", border: `1.5px solid ${C.coral}`,
              borderRadius: 12, padding: "8px 14px",
            }}>
              <span style={{ fontSize: 12, color: C.ink }}>
                Delete all {totalLessons} lessons?
              </span>
              <button onClick={clearGallery} style={{
                background: C.coral, color: "white", border: "none",
                padding: "6px 14px", borderRadius: 8, fontFamily: FM, fontSize: 10,
                letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
              }}>Yes, clear</button>
              <button onClick={() => setConfirmClear(false)} style={{
                background: "transparent", color: C.muted, border: `1px solid ${C.muted}`,
                padding: "6px 14px", borderRadius: 8, fontFamily: FM, fontSize: 10,
                letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
              }}>Cancel</button>
            </div>
          )}
        </div>
        <div style={{
          marginTop: 12, fontSize: 11, color: C.muted, fontStyle: "italic", lineHeight: 1.5,
        }}>
          Export saves every shared lesson as a single printable HTML file for your records. Clearing the gallery cannot be undone.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Lesson Walkthrough — shows the full creation process for one lesson
// (used inside Facilitator view)
// ============================================================
function LessonWalkthrough({
  lesson, isExpanded, onToggle,
  confirmDelete, onRequestDelete, onCancelDelete, onDelete,
}) {
  const pct = lesson.totalCount > 0 ? Math.round((lesson.embodiedCount / lesson.totalCount) * 100) : 0;
  const hasOriginal = Array.isArray(lesson.originalPieces) && lesson.originalPieces.length > 0;

  // Flatten timeline pieces in play order for final content display
  const allPieces = [
    ...lesson.timeline.open.map(p => ({ ...p, _phase: "Opening", _phaseIcon: "🌅" })),
    ...lesson.timeline.core.map(p => ({ ...p, _phase: "Core", _phaseIcon: "🔥" })),
    ...lesson.timeline.close.map(p => ({ ...p, _phase: "Close", _phaseIcon: "🌙" })),
  ];

  // Which original pieces ended up in the lesson? Which were discarded?
  // We match by uid if available, falling back to title.
  const usedUids = new Set(allPieces.map(p => p.uid));
  const usedTitles = new Set(allPieces.map(p => p.title));
  const isUsed = (op) => usedUids.has(op.uid) || usedTitles.has(op.title);

  // Mini card for the original pool (Stage 1) — small, flat, non-interactive
  const MiniCard = ({ piece, used }) => (
    <div style={{
      background: used ? C.cream : C.paperDeep + "99",
      border: `1.5px solid ${used ? C.ink : C.muted}`,
      borderRadius: 10, padding: "8px 10px",
      opacity: used ? 1 : 0.55,
      minWidth: 130, maxWidth: 170, flex: "0 0 auto",
    }}>
      <div style={{ fontSize: 16, marginBottom: 2 }}>{piece.icon || "📌"}</div>
      <div style={{ fontSize: 11, lineHeight: 1.3, fontWeight: 500, color: C.ink }}>
        {piece.title}
      </div>
      {!used && (
        <div style={{
          fontFamily: FM, fontSize: 8, letterSpacing: 0.5, marginTop: 4,
          color: C.muted, textTransform: "uppercase", fontStyle: "italic",
        }}>
          unused
        </div>
      )}
    </div>
  );

  // Timeline card for Stage 2 — shows before/after if transformed
  const TLCard = ({ piece }) => {
    const em = !!piece.transformedTo;
    return (
      <div style={{
        background: em ? C.coral + "15" : "white",
        border: `1.5px solid ${em ? C.coral : C.ink}`,
        borderRadius: 10, padding: "10px 12px", marginBottom: 6,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{em ? "🤸" : piece.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {em ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.coral, lineHeight: 1.3 }}>
                  {piece.transformedTo}
                </div>
                <div style={{
                  fontSize: 10, color: C.muted, fontStyle: "italic",
                  marginTop: 3, lineHeight: 1.3,
                  textDecoration: "line-through", textDecorationColor: C.muted,
                }}>
                  was: {piece.icon} {piece.title}
                </div>
                {piece.transformWhy && (
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
                    💡 {piece.transformWhy}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, fontWeight: 500, color: C.ink, lineHeight: 1.3 }}>
                {piece.title}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: C.paper, border: `1.5px solid ${C.ink}`,
      borderRadius: 12, overflow: "hidden",
    }}>
      {/* Collapsed header — always visible */}
      <div
        onClick={onToggle}
        style={{
          padding: "14px 18px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          background: isExpanded ? C.paperDeep + "55" : "transparent",
          transition: "background 0.15s",
        }}
      >
        <div style={{
          fontFamily: FM, fontSize: 16, color: C.coral,
          width: 20, textAlign: "center", userSelect: "none",
        }}>
          {isExpanded ? "▾" : "▸"}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{
            fontFamily: FM, fontSize: 9, color: C.muted,
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 2,
          }}>
            {lesson.subject} {lesson.grade && `· ${lesson.grade}`} · by {lesson.authorName}
          </div>
          <div style={{ fontFamily: FD, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
            {lesson.name || `${lesson.authorName}'s Lesson`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 700, color: C.coral }}>
              🤸 {pct}%
            </div>
            <div style={{ fontFamily: FM, fontSize: 9, color: C.muted, letterSpacing: 0.5 }}>
              {lesson.embodiedCount}/{lesson.totalCount} embodied
            </div>
          </div>
          <div style={{ fontFamily: FM, fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>
            ★ {(lesson.stars || []).length} · 💬 {(lesson.comments || []).length}
          </div>
        </div>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div style={{ padding: "8px 22px 22px", borderTop: `1px dashed ${C.muted}` }}>
          {lesson.goal && (
            <div style={{
              fontSize: 13, color: C.muted, fontStyle: "italic",
              padding: "10px 0 14px",
            }}>
              Learning goal: {lesson.goal}
            </div>
          )}

          {/* ---- Stage 1: Original AI pool ---- */}
          <div style={{ marginTop: 10, marginBottom: 18 }}>
            <div style={{
              fontFamily: FM, fontSize: 10, color: C.coral,
              letterSpacing: 1, textTransform: "uppercase", marginBottom: 8,
            }}>
              ① The 8 AI-generated pieces (all non-embodied)
            </div>
            {hasOriginal ? (
              <>
                <div style={{
                  display: "flex", gap: 8, flexWrap: "wrap",
                  background: C.paperDeep + "66", border: `1.5px dashed ${C.muted}`,
                  borderRadius: 10, padding: 10,
                }}>
                  {lesson.originalPieces.map((op, i) => (
                    <MiniCard key={op.uid || i} piece={op} used={isUsed(op)} />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginTop: 6 }}>
                  Faded cards were generated but not used. {lesson.originalPieces.filter(op => !isUsed(op)).length} of {lesson.originalPieces.length} left out.
                </div>
              </>
            ) : (
              <div style={{
                fontSize: 12, color: C.muted, fontStyle: "italic",
                padding: "10px 14px", background: C.paperDeep + "66", borderRadius: 10,
              }}>
                (This lesson was published before the full-walkthrough feature, so the original pool wasn't captured.)
              </div>
            )}
          </div>

          {/* ---- Stage 2: Assembled timeline with transformations ---- */}
          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontFamily: FM, fontSize: 10, color: C.coral,
              letterSpacing: 1, textTransform: "uppercase", marginBottom: 8,
            }}>
              ② Assembled lesson & embodied transformations
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {[
                { id: "open", label: "Opening", icon: "🌅", items: lesson.timeline.open },
                { id: "core", label: "Core", icon: "🔥", items: lesson.timeline.core },
                { id: "close", label: "Close", icon: "🌙", items: lesson.timeline.close },
              ].map(col => (
                <div key={col.id} style={{
                  background: C.cream, border: `1px solid ${C.ink}`,
                  borderRadius: 10, padding: 10, minHeight: 120,
                }}>
                  <div style={{
                    fontFamily: FD, fontSize: 12, fontWeight: 700, marginBottom: 8,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{ fontSize: 14 }}>{col.icon}</span> {col.label}
                  </div>
                  {col.items.length === 0 ? (
                    <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>
                      (empty)
                    </div>
                  ) : (
                    col.items.map(p => <TLCard key={p.uid} piece={p} />)
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ---- Stage 3: Full generated lesson content ---- */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontFamily: FM, fontSize: 10, color: C.coral,
              letterSpacing: 1, textTransform: "uppercase", marginBottom: 8,
            }}>
              ③ Full lesson content (what students experience)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {allPieces.map((p, i) => {
                const em = !!p.transformedTo;
                return (
                  <div key={p.uid} style={{
                    background: C.cream,
                    border: `1px solid ${em ? C.coral : C.ink}`,
                    borderLeft: `5px solid ${em ? C.coral : C.ink}`,
                    borderRadius: 10, padding: "12px 16px",
                  }}>
                    <div style={{
                      fontFamily: FM, fontSize: 9, color: C.muted,
                      letterSpacing: 1, textTransform: "uppercase", marginBottom: 4,
                    }}>
                      {p._phaseIcon} {p._phase} · Step {i + 1}{em ? " · Embodied" : ""}
                    </div>
                    <div style={{
                      fontFamily: FD, fontSize: 14, fontWeight: 700, lineHeight: 1.3,
                      marginBottom: 8, display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ fontSize: 16 }}>{p.icon}</span>
                      <span>{p.transformedTo || p.title}</span>
                    </div>
                    {p.content ? (
                      <ContentEditor
                        type={p.content.type}
                        data={p.content.data}
                        onChange={() => {}}
                        locked={true}
                      />
                    ) : (
                      <div style={{
                        fontSize: 11, color: C.muted, fontStyle: "italic",
                        padding: "6px 10px", background: C.paper, borderRadius: 6,
                      }}>
                        (No pre-generated content captured.)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---- Facilitator delete button ---- */}
          <div style={{
            marginTop: 16, paddingTop: 14, borderTop: `1px dashed ${C.muted}`,
            display: "flex", justifyContent: "flex-end",
          }}>
            {!confirmDelete ? (
              <button onClick={onRequestDelete} style={{
                background: "transparent", color: C.coral,
                border: `1px solid ${C.coral}`,
                padding: "6px 14px", borderRadius: 16, fontFamily: FM, fontSize: 10,
                letterSpacing: 0.8, cursor: "pointer", textTransform: "uppercase",
              }}>
                🗑 Remove this lesson
              </button>
            ) : (
              <div style={{
                display: "flex", gap: 8, alignItems: "center",
                background: C.coral + "15", border: `1px solid ${C.coral}`,
                borderRadius: 16, padding: "6px 10px",
              }}>
                <span style={{ fontSize: 11, color: C.ink }}>
                  Delete {lesson.authorName}'s lesson?
                </span>
                <button onClick={onDelete} style={{
                  background: C.coral, color: "white", border: "none",
                  padding: "5px 12px", borderRadius: 10, fontFamily: FM, fontSize: 9,
                  letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase",
                }}>Yes, delete</button>
                <button onClick={onCancelDelete} style={{
                  background: "transparent", color: C.muted, border: `1px solid ${C.muted}`,
                  padding: "5px 12px", borderRadius: 10, fontFamily: FM, fontSize: 9,
                  letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase",
                }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Build a standalone printable HTML page of the full session
function buildSessionHTML(lessons, stats) {
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const dateStr = new Date().toLocaleString();

  const renderPiece = (p, i) => {
    const em = !!p.transformedTo;
    const title = esc(p.transformedTo || p.title);
    const c = p.content || null;
    let body = "";
    if (c) {
      const d = c.data || {};
      if (c.type === "lecture") body = `<p>${esc(d.script || "")}</p>`;
      else if (c.type === "reading") {
        body = "";
        if (d.externalUrl) body += `<p><a href="${esc(d.externalUrl)}">${esc(d.externalUrl)}</a></p>`;
        body += `<p>${esc(d.passage || "")}</p>`;
      }
      else if (c.type === "slide") {
        body = `<h4>${esc(d.title || "")}</h4><ul>${(d.bullets || []).map(b => `<li>${esc(b)}</li>`).join("")}</ul><p><em>Visual: ${esc(d.visual || "")}</em></p>`;
      }
      else if (c.type === "video") {
        if (d.embedUrl || d.externalUrl) {
          body = `<p><strong>Video:</strong> <a href="${esc(d.externalUrl || d.embedUrl)}">${esc(d.externalUrl || d.embedUrl)}</a></p>`;
        }
        body += `<p><em>${esc(d.narration || "")}</em></p>`;
        if (d.scenes) body += (d.scenes || []).map((s, j) => `<p><strong>Scene ${j + 1}:</strong> ${esc(s.visual)}<br><em>${esc(s.caption)}</em></p>`).join("");
      }
      else if (c.type === "worksheet") {
        body = "<ol>" + (d.problems || []).map(pr => `<li>${esc(pr.q)}<br><small>Answer: ${esc(pr.a)} — Hint: ${esc(pr.hint)}</small></li>`).join("") + "</ol>";
      }
      else if (c.type === "quiz") {
        body = "<ol>" + (d.questions || []).map(q => {
          const opts = (q.options || []).map((o, k) => `<li${k === q.correct ? ' style="font-weight:700;color:#2d4a3e"' : ''}>${esc(o)}${k === q.correct ? " ✓" : ""}</li>`).join("");
          return `<li>${esc(q.q)}<ol type="A">${opts}</ol><small><em>${esc(q.explain || "")}</em></small></li>`;
        }).join("") + "</ol>";
      }
      else if (c.type === "embodied") {
        body = "<ol>" + (d.steps || []).map(s => `<li>${esc(s)}</li>`).join("") + `</ol><p><em>What to notice: ${esc(d.notice || "")}</em></p>`;
      }
    }
    return `<div class="piece ${em ? 'embodied' : ''}">
      <div class="piece-head">
        <span class="step">Step ${i + 1}${em ? ' · Embodied' : ''}</span>
        <h3>${p.icon || "📌"} ${title}</h3>
      </div>
      <div class="piece-body">${body || '<p class="empty">(no content)</p>'}</div>
    </div>`;
  };

  const renderLesson = (l) => {
    const pieces = [
      ...l.timeline.open.map(p => ({ ...p, phase: "Opening" })),
      ...l.timeline.core.map(p => ({ ...p, phase: "Core" })),
      ...l.timeline.close.map(p => ({ ...p, phase: "Close" })),
    ];
    const pct = l.totalCount > 0 ? Math.round((l.embodiedCount / l.totalCount) * 100) : 0;
    const comments = (l.comments || []).map(c => `<div class="comment"><strong>${esc(c.authorName)}</strong>: ${esc(c.text)}</div>`).join("");

    // Stage 1: original AI pool
    const usedTitles = new Set(pieces.map(p => p.title));
    const originalPool = Array.isArray(l.originalPieces) && l.originalPieces.length > 0
      ? `<div class="stage-label">① AI-generated piece pool (all non-embodied)</div>
         <div class="pool">${l.originalPieces.map(op => {
           const used = usedTitles.has(op.title);
           return `<div class="pool-card${used ? '' : ' unused'}">
             <div class="pool-icon">${op.icon || "📌"}</div>
             <div class="pool-title">${esc(op.title)}</div>
             ${used ? '' : '<div class="pool-unused">unused</div>'}
           </div>`;
         }).join("")}</div>`
      : "";

    // Stage 2: timeline columns (brief)
    const col = (label, icon, items) => `<div class="tl-col">
      <div class="tl-col-head">${icon} ${label}</div>
      ${items.length === 0 ? '<div class="tl-empty">(empty)</div>' :
        items.map(p => {
          const em = !!p.transformedTo;
          return `<div class="tl-card${em ? ' embodied' : ''}">
            ${em
              ? `<div class="tl-new">🤸 ${esc(p.transformedTo)}</div>
                 <div class="tl-old">was: ${p.icon || ""} ${esc(p.title)}</div>
                 ${p.transformWhy ? `<div class="tl-why">💡 ${esc(p.transformWhy)}</div>` : ""}`
              : `<div class="tl-title">${p.icon || ""} ${esc(p.title)}</div>`
            }
          </div>`;
        }).join("")
      }
    </div>`;

    return `<section class="lesson">
      <header>
        <div class="meta">${esc(l.subject)}${l.grade ? ` · ${esc(l.grade)}` : ""} · by ${esc(l.authorName)}</div>
        <h2>${esc(l.name || `${l.authorName}'s Lesson`)}</h2>
        ${l.goal ? `<p class="goal"><em>${esc(l.goal)}</em></p>` : ""}
        <p class="stats">🤸 ${l.embodiedCount}/${l.totalCount} embodied (${pct}%) · ★ ${(l.stars || []).length} stars · 💬 ${(l.comments || []).length} comments</p>
      </header>
      ${originalPool}
      <div class="stage-label">② Assembled lesson & transformations</div>
      <div class="timeline">
        ${col("Opening", "🌅", l.timeline.open)}
        ${col("Core", "🔥", l.timeline.core)}
        ${col("Close", "🌙", l.timeline.close)}
      </div>
      <div class="stage-label">③ Full lesson content</div>
      ${pieces.map(renderPiece).join("")}
      ${comments ? `<div class="comments"><h4>Discussion</h4>${comments}</div>` : ""}
    </section>`;
  };

  const typeRows = stats.typeRows.map(r => `<tr><td>${r.icon} ${esc(r.type)}</td><td>${r.transformed} / ${r.total}</td><td>${r.pct}%</td></tr>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Embodied AI-ED Studio · Session Export · ${esc(dateStr)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 900px; margin: 0 auto; padding: 40px 30px; color: #2a2522; background: #f6f0e4; line-height: 1.55; }
  h1 { font-size: 36px; margin: 0 0 6px; letter-spacing: -0.5px; }
  h1 em { color: #e8624a; }
  .header-meta { color: #8a7d6e; font-family: 'Courier New', monospace; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 30px; }
  .summary { background: #fffaf0; border: 1.5px solid #2a2522; border-radius: 10px; padding: 20px 24px; margin-bottom: 30px; }
  .summary h2 { margin: 0 0 10px; font-size: 18px; }
  .summary table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  .summary td { padding: 6px 8px; border-bottom: 1px dashed #ecdfc8; }
  .summary td:first-child { font-weight: 600; }
  .lesson { background: #fffaf0; border: 1.5px solid #2a2522; border-radius: 10px; padding: 24px 28px; margin-bottom: 26px; page-break-inside: avoid; break-inside: avoid; }
  .lesson header { border-bottom: 1.5px solid #2a2522; margin-bottom: 16px; padding-bottom: 12px; }
  .lesson h2 { margin: 0 0 4px; font-size: 22px; }
  .lesson .meta { font-family: 'Courier New', monospace; font-size: 11px; color: #e8624a; text-transform: uppercase; letter-spacing: 1px; }
  .lesson .goal { color: #8a7d6e; margin: 4px 0 8px; font-size: 14px; }
  .lesson .stats { font-family: 'Courier New', monospace; font-size: 11px; color: #8a7d6e; margin: 0; }
  .piece { border: 1px solid #2a2522; border-left: 5px solid #2a2522; border-radius: 8px; padding: 12px 16px; margin: 10px 0; background: white; }
  .piece.embodied { border-color: #e8624a; border-left-color: #e8624a; background: #fff6f3; }
  .piece-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
  .piece-head .step { font-family: 'Courier New', monospace; font-size: 10px; color: #8a7d6e; text-transform: uppercase; letter-spacing: 1px; }
  .piece h3 { margin: 0; font-size: 14px; font-weight: 700; flex: 1; }
  .piece-body { font-size: 13px; }
  .piece-body ul, .piece-body ol { padding-left: 22px; }
  .piece-body .empty { color: #8a7d6e; font-style: italic; }
  .comments { margin-top: 16px; padding-top: 12px; border-top: 1px dashed #8a7d6e; }
  .comment { padding: 6px 10px; background: #f6f0e4; border-radius: 6px; margin-top: 6px; font-size: 13px; }
  .stage-label { font-family: 'Courier New', monospace; font-size: 10px; color: #e8624a; letter-spacing: 1px; text-transform: uppercase; margin: 18px 0 8px; }
  .pool { display: flex; flex-wrap: wrap; gap: 6px; background: #ecdfc866; border: 1.5px dashed #8a7d6e; border-radius: 8px; padding: 8px; }
  .pool-card { background: #fffaf0; border: 1px solid #2a2522; border-radius: 6px; padding: 6px 8px; min-width: 110px; max-width: 160px; flex: 0 0 auto; font-size: 11px; }
  .pool-card.unused { opacity: 0.5; background: #ecdfc899; }
  .pool-icon { font-size: 14px; margin-bottom: 2px; }
  .pool-title { font-size: 11px; line-height: 1.3; }
  .pool-unused { font-size: 9px; color: #8a7d6e; font-style: italic; margin-top: 3px; letter-spacing: 0.5px; text-transform: uppercase; }
  .timeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .tl-col { background: #fffaf0; border: 1px solid #2a2522; border-radius: 8px; padding: 8px; }
  .tl-col-head { font-size: 12px; font-weight: 700; margin-bottom: 6px; }
  .tl-empty { font-size: 10px; color: #8a7d6e; font-style: italic; }
  .tl-card { background: white; border: 1px solid #2a2522; border-radius: 6px; padding: 6px 8px; margin-bottom: 4px; font-size: 11px; }
  .tl-card.embodied { border-color: #e8624a; background: #fff6f3; }
  .tl-new { font-weight: 600; color: #e8624a; font-size: 11px; }
  .tl-old { font-size: 10px; color: #8a7d6e; font-style: italic; text-decoration: line-through; margin-top: 2px; }
  .tl-why { font-size: 10px; color: #8a7d6e; margin-top: 3px; }
  .tl-title { font-size: 11px; }
  @media print { body { background: white; } .lesson, .summary { box-shadow: none; } }
</style>
</head>
<body>
  <h1>Embodied <em>AI-ED</em> Studio</h1>
  <div class="header-meta">Session exported · ${esc(dateStr)}</div>
  <section class="summary">
    <h2>Session Summary</h2>
    <p><strong>${stats.totalLessons}</strong> lessons shared by <strong>${stats.uniqueTeachers}</strong> teachers · Average embodiment <strong>${stats.avgEmbodimentPct}%</strong></p>
    <h3 style="margin-top:16px;font-size:14px;">Transformation rate by piece type</h3>
    <table><thead><tr><th style="text-align:left;padding:4px 8px;">Type</th><th style="text-align:left;padding:4px 8px;">Transformed</th><th style="text-align:left;padding:4px 8px;">Rate</th></tr></thead><tbody>${typeRows}</tbody></table>
  </section>
  ${lessons.map(renderLesson).join("")}
</body>
</html>`;
}

function fallbackPieces(subject) {
  return [
    { uid: uid(), id: "p1", title: `Short lecture introducing ${subject}`, type: "lecture", icon: "🎙️" },
    { uid: uid(), id: "p2", title: `Worksheet with ${subject} practice problems`, type: "worksheet", icon: "📝" },
    { uid: uid(), id: "p3", title: `Video explaining ${subject} concepts`, type: "video", icon: "📺" },
    { uid: uid(), id: "p4", title: `Quiz on key ${subject} terms`, type: "quiz", icon: "✅" },
    { uid: uid(), id: "p5", title: `Textbook reading about ${subject}`, type: "reading", icon: "📖" },
    { uid: uid(), id: "p6", title: `Slide summarizing ${subject}`, type: "slide", icon: "🖼️" },
    { uid: uid(), id: "p7", title: `Second reading passage on ${subject}`, type: "reading", icon: "📖" },
    { uid: uid(), id: "p8", title: `Concept-check quiz on ${subject}`, type: "quiz", icon: "✅" },
  ];
}

// ============================================================
// Example seed lesson — appears in a fresh gallery so teachers
// have something to inspect before they build their own.
// ============================================================
const EXAMPLE_LESSON_ID = "example-fractions-grade-4";
const EXAMPLE_AUTHOR_ID = "example-author";

function buildExampleLesson() {
  // Stable uids so the example always renders the same.
  // Original AI pool — 8 non-embodied pieces.
  const op = (id, title, type, icon) => ({ uid: `ex-${id}`, id, title, type, icon });
  const originalPieces = [
    op("p1", "Short lecture introducing the idea of fractions", "lecture", "🎙️"),
    op("p2", "Worksheet on identifying numerator and denominator", "worksheet", "📝"),
    op("p3", "Animated video showing pizza slices as fractions", "video", "📺"),
    op("p4", "Multiple-choice quiz on basic fraction terms", "quiz", "✅"),
    op("p5", "Textbook reading on equal parts of a whole", "reading", "📖"),
    op("p6", "Slide diagramming a fraction bar", "slide", "🖼️"),
    op("p7", "Reading passage on fractions in everyday life", "reading", "📖"),
    op("p8", "Concept-check quiz on equivalent fractions", "quiz", "✅"),
  ];

  // Helper to attach pre-generated content to a piece
  const withContent = (piece, content) => ({ ...piece, content });

  // ---- Stage 2: Assembled timeline ----
  // Opening: keep the slide as a quick visual hook
  const openingSlide = withContent(
    { ...originalPieces[5] }, // p6 slide
    {
      type: "slide",
      data: {
        title: "What is a fraction?",
        bullets: [
          "A fraction is one or more equal parts of a whole.",
          "The bottom number tells you how many equal parts the whole is split into.",
          "The top number tells you how many of those parts you have.",
        ],
        visual: "A horizontal bar split into 4 equal coral segments, with 3 of them shaded to show 3/4.",
      },
    }
  );

  // Core: transform the lecture into walking the number line
  const coreLectureTransformed = withContent(
    {
      ...originalPieces[0], // p1 lecture
      transformedTo: "Walk a paper tape labeled 0 to 1, stopping at the halfway mark, then quarters",
      transformWhy: "Walking the line gives students a felt sense of equal spacing — fractions become distances they cover with their bodies, not symbols on a page.",
      icon: "🤸",
    },
    {
      type: "embodied",
      data: {
        steps: [
          "Stand at the start of a strip of paper or tape that runs along the floor, marked 0 at one end and 1 at the other.",
          "Walk slowly toward the 1, counting your footsteps as you go.",
          "Stop when you feel exactly halfway between 0 and 1, and place a small marker at your feet — that's 1/2.",
          "Now walk back to 0 and try to stop at 1/4 of the way — your marker for 1/2 should be twice as far as 1/4.",
          "Repeat for 3/4 and check: is the distance from 0 to 3/4 three times the distance from 0 to 1/4?",
        ],
        notice: "Notice that each fraction is a position you reach by taking equal-sized steps — the denominator tells you how many steps make a whole, and the numerator tells you how many you've taken.",
      },
    }
  );

  // Core: transform the video into tearing paper
  const corePaperTear = withContent(
    {
      ...originalPieces[2], // p3 video
      transformedTo: "Tear a sheet of paper into equal parts and name each piece as a fraction",
      transformWhy: "Tearing paper into equal pieces forces students to physically negotiate what 'equal' means — and feel the difference between 1/3 and 1/4 in their hands.",
      icon: "🤸",
    },
    {
      type: "embodied",
      data: {
        steps: [
          "Take a sheet of paper and fold it carefully in half, then unfold it. You now have two equal parts — each part is 1/2.",
          "Fold the paper in half again so it's split into four equal parts. Tear along the folds. Hold up one piece — what fraction is it?",
          "Now arrange three of the four pieces together on your desk. What fraction of the original sheet do you have in front of you?",
          "Try to fold a fresh sheet into three equal parts without measuring. Tear it. Compare your three pieces — are they really equal?",
          "Hold up one of your thirds and one of your fourths side by side. Which is bigger? Why?",
        ],
        notice: "Notice that the more parts you split the whole into, the smaller each part becomes. A bigger denominator means smaller pieces, even though the number 'looks' bigger.",
      },
    }
  );

  // Core: keep the multiple-choice quiz as a non-embodied check
  const coreQuiz = withContent(
    { ...originalPieces[3] }, // p4 quiz
    {
      type: "quiz",
      data: {
        questions: [
          {
            q: "In the fraction 3/4, what does the 4 tell you?",
            options: [
              "How many parts the whole is divided into",
              "How many parts you have",
              "The total number you're counting up to",
              "How big the whole is",
            ],
            correct: 0,
            explain: "The bottom number (denominator) tells you how many equal parts the whole has been split into.",
          },
          {
            q: "Which fraction is bigger: 1/3 or 1/4?",
            options: ["1/4", "1/3", "They are equal", "It depends on the whole"],
            correct: 1,
            explain: "When the numerators are the same, the fraction with the smaller denominator is bigger — fewer pieces means each piece is larger.",
          },
          {
            q: "If you tear a sheet of paper into 4 equal pieces and keep 3, what fraction do you have?",
            options: ["1/4", "3/4", "4/3", "1/3"],
            correct: 1,
            explain: "You have 3 of the 4 equal parts, which is written as 3/4.",
          },
        ],
      },
    }
  );

  // Close: keep the reading passage as a reflective wrap-up
  const closeReading = withContent(
    { ...originalPieces[6] }, // p7 reading
    {
      type: "reading",
      data: {
        passage: "Fractions are everywhere once you start looking for them. When your family orders a pizza and slices it into eight equal pieces, each slice is one-eighth of the whole pie. If you eat three slices, you have eaten three-eighths. When the clock shows quarter past three, the minute hand has moved through one quarter of an hour — fifteen minutes out of sixty. When a recipe asks for half a cup of milk, it's asking you to fill a measuring cup exactly to the halfway line. Even the way we share things — half for you, half for me — is a fraction we use without thinking. Every time you split something fairly, you are doing fraction work. Try to spot three fractions on your way home today: in shapes, in time, in food, in anything that gets divided into equal parts.",
      },
    }
  );

  const timeline = {
    open: [openingSlide],
    core: [coreLectureTransformed, corePaperTear, coreQuiz],
    close: [closeReading],
  };

  const totalCount = 5;
  const embodiedCount = 2;

  return {
    id: EXAMPLE_LESSON_ID,
    authorId: EXAMPLE_AUTHOR_ID,
    authorName: "Example",
    name: "Example: Fractions Lesson",
    subject: "Fractions",
    grade: "Grade 4",
    goal: "Students understand that fractions represent equal parts of a whole.",
    timeline,
    originalPieces,
    embodiedCount,
    totalCount,
    comments: [
      {
        id: "ex-c1",
        authorId: "example-author",
        authorName: "Workshop facilitator",
        text: "This is an example lesson — open it to see the full process: AI pool, transformations, and student-facing content. Try playing it with the ▶ button. Then build your own.",
        createdAt: Date.now() - 60_000,
      },
    ],
    stars: [],
    createdAt: Date.now() - 120_000,
    isExample: true,
  };
}

// Seed the example lesson into shared storage if it isn't already there.
// Idempotent — safe to call on every load.
async function seedExampleLessonIfMissing() {
  try {
    const existing = await loadLessonById(EXAMPLE_LESSON_ID);
    if (existing) return false;
    const example = buildExampleLesson();
    await upsertLesson(example);
    return true;
  } catch (e) {
    console.warn("Could not seed example lesson:", e);
    return false;
  }
}

// ============================================================
// Visualizer — 3-slide deck + scenario card generator
// ============================================================

function VisualizerView({ lessons }) {
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [selectedPieceUid, setSelectedPieceUid] = useState("");
  const [outputType, setOutputType] = useState("slides"); // "slides" | "card"
  const [generating, setGenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [slides, setSlides] = useState(null);
  const [card, setCard] = useState(null);
  const [cardImage, setCardImage] = useState(null);
  const [slideImages, setSlideImages] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [error, setError] = useState("");

  const selectedLesson = lessons.find((l) => l.id === selectedLessonId);

  // Flatten all timeline activities from the selected lesson.
  const allPieces = selectedLesson
    ? [
        ...(selectedLesson.timeline?.open || []),
        ...(selectedLesson.timeline?.core || []),
        ...(selectedLesson.timeline?.close || []),
      ]
    : [];

  const selectedPiece = allPieces.find((p) => p.uid === selectedPieceUid);

  const buildUserPrompt = () => {
    if (!selectedLesson || !selectedPiece) return "";
    const isEmb = !!selectedPiece.transformedTo;
    const origTitle = selectedPiece.title || "activity";
    const embTitle = selectedPiece.transformedTo?.title || origTitle;
    const why = selectedPiece.transformedTo?.why || "";
    return [
      `Subject: ${selectedLesson.subject || "General"}`,
      `Grade: ${selectedLesson.grade || "K-12"}`,
      `Learning goal: ${selectedLesson.goal || "(not specified)"}`,
      `Original non-embodied activity: "${origTitle}" (type: ${selectedPiece.type || "activity"})`,
      isEmb
        ? `Embodied transformation: "${embTitle}"${why ? `\nRationale: ${why}` : ""}`
        : `Note: this activity has not been transformed yet — propose an embodied version.`,
    ].join("\n");
  };

  const buildGeminiPrompt = (slideIndex) => {
    if (!selectedLesson || !selectedPiece) return "";
    const isEmb = !!selectedPiece.transformedTo;
    const embTitle = isEmb
      ? selectedPiece.transformedTo?.title
      : selectedPiece.title;
    if (slideIndex === 1 || slideIndex === "card") {
      // After/card slide: show student performing the embodied activity.
      return (
        `Flat illustration, educational style, warm muted colors, simple clean lines. ` +
        `A single student performing an embodied learning activity: "${embTitle}" ` +
        `for ${selectedLesson.subject || "school"}, grade ${selectedLesson.grade || "K-12"}. ` +
        `The student's body posture and gesture are clearly visible. No text. No background clutter. ` +
        `Suitable for an academic conference slide.`
      );
    }
    if (slideIndex === 2) {
      // Why slide: abstract brain/body concept diagram.
      return (
        `Minimal flat illustration for a research presentation. ` +
        `Abstract concept: connection between body movement and cognitive learning. ` +
        `Show a stylized brain and body interacting. Warm muted palette. No text. Clean lines.`
      );
    }
    // Slide 0 (Before): traditional classroom passive activity.
    return (
      `Flat illustration, educational style, warm muted colors. ` +
      `A student sitting at a desk doing a passive activity: "${selectedPiece.title}". ` +
      `Traditional classroom setting. Clean simple lines. No text.`
    );
  };

  const generate = async () => {
    if (!selectedLesson || !selectedPiece) return;
    setError("");
    setGenerating(true);
    setSlides(null);
    setCard(null);
    setCardImage(null);
    setSlideImages([]);
    setCurrentSlide(0);

    const userPrompt = buildUserPrompt();

    if (outputType === "slides") {
      const raw = await callClaudeModel(
        vizSlideSystem,
        userPrompt,
        1200,
        "claude-haiku-4-5-20251001"
      );
      const parsed = safeJSON(raw);
      if (!parsed?.slides || !Array.isArray(parsed.slides)) {
        setError("Could not generate slides — try again.");
        setGenerating(false);
        return;
      }
      setSlides(parsed.slides);
      setGenerating(false);

      // Generate Gemini images for each slide in the background.
      setGeneratingImage(true);
      const imgs = await Promise.all(
        parsed.slides.map((_, i) => callGemini(buildGeminiPrompt(i)))
      );
      setSlideImages(imgs);
      setGeneratingImage(false);
    } else {
      // Scenario card
      const raw = await callClaudeModel(
        vizCardSystem,
        userPrompt,
        800,
        "claude-haiku-4-5-20251001"
      );
      const parsed = safeJSON(raw);
      if (!parsed) {
        setError("Could not generate card — try again.");
        setGenerating(false);
        return;
      }
      setCard(parsed);
      setGenerating(false);

      // Generate Gemini illustration.
      setGeneratingImage(true);
      const img = await callGemini(buildGeminiPrompt("card"));
      setCardImage(img);
      setGeneratingImage(false);
    }
  };

  return (
    <div style={{ paddingTop: 32 }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h2
          style={{
            fontFamily: FD,
            fontSize: 28,
            fontWeight: 700,
            margin: "0 0 6px",
            letterSpacing: -0.5,
          }}
        >
          🎨 Visualize Embodied Learning
        </h2>
        <p style={{ color: C.muted, fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          Pick a lesson activity and generate a{" "}
          <strong>3-slide deck</strong> or a{" "}
          <strong>scenario card</strong> — ready to drop into any presentation
          to show where and how embodied learning fits.
        </p>
      </div>

      {/* Controls panel */}
      <div
        style={{
          background: C.cream,
          border: `1.5px solid ${C.ink}`,
          borderRadius: 16,
          padding: "24px",
          marginBottom: 28,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* Step 1: lesson */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontFamily: FM,
              fontSize: 10,
              letterSpacing: 1,
              color: C.muted,
              textTransform: "uppercase",
            }}
          >
            1 · Pick a Lesson
          </label>
          <select
            value={selectedLessonId}
            onChange={(e) => {
              setSelectedLessonId(e.target.value);
              setSelectedPieceUid("");
              setSlides(null);
              setCard(null);
            }}
            style={{
              padding: "10px 14px",
              fontSize: 14,
              fontFamily: FB,
              border: `1.5px solid ${C.ink}`,
              borderRadius: 10,
              background: C.paper,
              outline: "none",
              cursor: "pointer",
              maxWidth: 480,
            }}
          >
            <option value="">— select a lesson —</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name || `${l.subject || "Lesson"} · ${l.authorName || "unknown"}`}
              </option>
            ))}
          </select>
        </div>

        {/* Step 2: activity */}
        {selectedLesson && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                fontFamily: FM,
                fontSize: 10,
                letterSpacing: 1,
                color: C.muted,
                textTransform: "uppercase",
              }}
            >
              2 · Pick an Activity
            </label>
            <select
              value={selectedPieceUid}
              onChange={(e) => {
                setSelectedPieceUid(e.target.value);
                setSlides(null);
                setCard(null);
              }}
              style={{
                padding: "10px 14px",
                fontSize: 14,
                fontFamily: FB,
                border: `1.5px solid ${C.ink}`,
                borderRadius: 10,
                background: C.paper,
                outline: "none",
                cursor: "pointer",
                maxWidth: 480,
              }}
            >
              <option value="">— select an activity —</option>
              {allPieces.map((p) => (
                <option key={p.uid} value={p.uid}>
                  {p.transformedTo ? "🤸 " : "💺 "}
                  {p.title}
                  {p.transformedTo ? ` → ${p.transformedTo.title}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Step 3: output format */}
        {selectedPiece && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                fontFamily: FM,
                fontSize: 10,
                letterSpacing: 1,
                color: C.muted,
                textTransform: "uppercase",
              }}
            >
              3 · Output Format
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                {
                  id: "slides",
                  label: "🖼️  3-Slide Deck",
                  desc: "Claude (Haiku) · structured slides",
                },
                {
                  id: "card",
                  label: "🃏  Scenario Card",
                  desc: "Claude + Gemini illustration",
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setOutputType(opt.id)}
                  style={{
                    flex: "1 1 180px",
                    padding: "12px 16px",
                    textAlign: "left",
                    background: outputType === opt.id ? C.ink : C.paper,
                    color: outputType === opt.id ? C.paper : C.ink,
                    border: `1.5px solid ${C.ink}`,
                    borderRadius: 10,
                    cursor: "pointer",
                    fontFamily: FB,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {opt.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      opacity: 0.65,
                      marginTop: 3,
                      fontFamily: FM,
                      letterSpacing: 0.5,
                    }}
                  >
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedPiece && (
          <button
            onClick={generate}
            disabled={generating}
            style={{
              padding: "13px 28px",
              background: generating ? C.muted : C.coral,
              color: "white",
              border: "none",
              borderRadius: 10,
              fontFamily: FD,
              fontSize: 16,
              fontWeight: 600,
              cursor: generating ? "not-allowed" : "pointer",
              alignSelf: "flex-start",
            }}
          >
            {generating
              ? "Generating…"
              : `Generate ${outputType === "slides" ? "Slide Deck" : "Scenario Card"} →`}
          </button>
        )}

        {error && (
          <div
            style={{ color: C.coral, fontFamily: FM, fontSize: 12, letterSpacing: 0.3 }}
          >
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Output */}
      {slides && outputType === "slides" && (
        <VizSlideDeckView
          slides={slides}
          images={slideImages}
          generatingImages={generatingImage}
          currentSlide={currentSlide}
          setCurrentSlide={setCurrentSlide}
          lesson={selectedLesson}
        />
      )}

      {card && outputType === "card" && (
        <ScenarioCardView
          card={card}
          image={cardImage}
          generatingImage={generatingImage}
          lesson={selectedLesson}
          piece={selectedPiece}
        />
      )}
    </div>
  );
}

// ---- 3-Slide Deck (Visualizer) ----
function VizSlideDeckView({
  slides,
  images,
  generatingImages,
  currentSlide,
  setCurrentSlide,
  lesson,
}) {
  const s = slides[currentSlide] || slides[0];
  const img = images[currentSlide] || null;

  // Per-slide color palette
  const palette = [
    { bg: "#eef2ff", accent: "#4a6cf7", ring: "#c7d2fe" },
    { bg: "#ecfdf5", accent: "#059669", ring: "#a7f3d0" },
    { bg: "#fffbeb", accent: "#d97706", ring: "#fde68a" },
  ];
  const col = palette[currentSlide] || palette[0];

  return (
    <div>
      {/* Context bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          fontFamily: FM,
          fontSize: 10,
          color: C.muted,
          letterSpacing: 0.8,
        }}
      >
        <span>
          {(lesson?.subject || "").toUpperCase()}
          {lesson?.grade ? ` · ${lesson.grade.toUpperCase()}` : ""}
        </span>
        <span>
          {currentSlide + 1} / {slides.length}
        </span>
      </div>

      {/* Slide */}
      <div
        style={{
          background: col.bg,
          border: `2px solid ${col.accent}`,
          borderRadius: 20,
          padding: "36px 40px",
          minHeight: 340,
          position: "relative",
          boxShadow: `0 8px 32px -8px ${col.accent}55`,
        }}
      >
        {/* Badge */}
        <div
          style={{
            position: "absolute",
            top: 18,
            right: 22,
            background: col.accent,
            color: "white",
            padding: "4px 14px",
            borderRadius: 20,
            fontFamily: FM,
            fontSize: 10,
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
        >
          {s.badge || s.label}
        </div>

        <div
          style={{ display: "flex", gap: 32, alignItems: "flex-start" }}
        >
          {/* Text column */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: FM,
                fontSize: 9,
                color: col.accent,
                letterSpacing: 2,
                marginBottom: 6,
                textTransform: "uppercase",
              }}
            >
              Slide {s.num || currentSlide + 1} of {slides.length}
            </div>
            <h3
              style={{
                fontFamily: FD,
                fontSize: 26,
                fontWeight: 700,
                margin: "0 0 6px",
                letterSpacing: -0.5,
                color: C.ink,
                lineHeight: 1.15,
              }}
            >
              {s.title}
            </h3>
            <div
              style={{
                fontFamily: FB,
                fontSize: 13,
                color: C.muted,
                margin: "0 0 20px",
              }}
            >
              {s.subtitle}
            </div>
            <ul
              style={{
                margin: 0,
                padding: "0 0 0 18px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {(s.bullets || []).map((b, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: FB,
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: C.ink,
                  }}
                >
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Image panel */}
          <div
            style={{
              width: 196,
              flexShrink: 0,
              background: col.ring + "66",
              border: `1.5px dashed ${col.accent}88`,
              borderRadius: 14,
              minHeight: 160,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {img ? (
              <img
                src={`data:${img.mimeType};base64,${img.imageBase64}`}
                alt="AI illustration"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: 12,
                }}
              />
            ) : (
              <div
                style={{
                  padding: 16,
                  textAlign: "center",
                  fontFamily: FM,
                  fontSize: 10,
                  color: col.accent + "bb",
                  letterSpacing: 0.5,
                  lineHeight: 1.6,
                }}
              >
                {generatingImages ? (
                  <span>✦ Gemini is drawing…</span>
                ) : (
                  <span style={{ fontStyle: "italic", opacity: 0.7 }}>
                    {s.visualDesc}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 16,
        }}
      >
        <button
          onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
          disabled={currentSlide === 0}
          style={{
            padding: "10px 22px",
            fontFamily: FB,
            fontSize: 14,
            background: currentSlide === 0 ? C.paperDeep : C.ink,
            color: currentSlide === 0 ? C.muted : C.paper,
            border: "none",
            borderRadius: 10,
            cursor: currentSlide === 0 ? "default" : "pointer",
          }}
        >
          ← Previous
        </button>

        <div style={{ display: "flex", gap: 8 }}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: "none",
                background: i === currentSlide ? C.coral : C.paperDeep,
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>

        <button
          onClick={() =>
            setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))
          }
          disabled={currentSlide === slides.length - 1}
          style={{
            padding: "10px 22px",
            fontFamily: FB,
            fontSize: 14,
            background:
              currentSlide === slides.length - 1 ? C.paperDeep : C.coral,
            color:
              currentSlide === slides.length - 1 ? C.muted : "white",
            border: "none",
            borderRadius: 10,
            cursor:
              currentSlide === slides.length - 1 ? "default" : "pointer",
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ---- Scenario Card ----
function ScenarioCardView({ card, image, generatingImage, lesson, piece }) {
  return (
    <div
      style={{
        maxWidth: 560,
        border: `2px solid ${C.ink}`,
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: `0 12px 40px -12px ${C.ink}44`,
      }}
    >
      {/* Illustration area */}
      <div
        style={{
          height: 240,
          background: C.paperDeep,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {image ? (
          <img
            src={`data:${image.mimeType};base64,${image.imageBase64}`}
            alt="Embodied scenario illustration"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              textAlign: "center",
              color: C.muted,
              fontFamily: FM,
              fontSize: 11,
              letterSpacing: 0.5,
            }}
          >
            {generatingImage
              ? "✦ Gemini is illustrating…"
              : "🎨 Illustration unavailable — check /api/test-gemini"}
          </div>
        )}

        {/* Overlaid badges */}
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            background: C.coral,
            color: "white",
            padding: "4px 14px",
            borderRadius: 20,
            fontFamily: FM,
            fontSize: 10,
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
        >
          🤸 Embodied Learning
        </div>
        {(lesson?.subject || lesson?.grade) && (
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: C.ink + "cc",
              color: C.paper,
              padding: "4px 12px",
              borderRadius: 20,
              fontFamily: FM,
              fontSize: 10,
              letterSpacing: 0.4,
            }}
          >
            {[lesson?.subject, lesson?.grade].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: "24px 28px", background: C.cream }}>
        <h3
          style={{
            fontFamily: FD,
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 6px",
            letterSpacing: -0.3,
          }}
        >
          {card.cardTitle}
        </h3>
        <p
          style={{
            fontFamily: FB,
            fontSize: 13,
            color: C.muted,
            margin: "0 0 18px",
            lineHeight: 1.6,
          }}
        >
          {card.scenario}
        </p>

        {/* Steps */}
        {(card.steps || []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontFamily: FM,
                fontSize: 9,
                letterSpacing: 1.5,
                color: C.coral,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Activity Steps
            </div>
            {(card.steps || []).map((step, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "7px 0",
                  borderBottom: `1px solid ${C.paperDeep}`,
                }}
              >
                <span
                  style={{
                    background: C.coral,
                    color: "white",
                    borderRadius: "50%",
                    width: 20,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: FM,
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    fontFamily: FB,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: C.ink,
                  }}
                >
                  {step}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Body connection */}
        {card.bodyConnection && (
          <div
            style={{
              background: C.sage + "22",
              border: `1px solid ${C.sage}`,
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontFamily: FM,
                fontSize: 9,
                letterSpacing: 1,
                color: C.sage,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Body Connection
            </div>
            <div
              style={{
                fontFamily: FB,
                fontSize: 13,
                color: C.ink,
                lineHeight: 1.55,
              }}
            >
              {card.bodyConnection}
            </div>
          </div>
        )}

        {/* Cognitive rationale */}
        {card.cognitiveRationale && (
          <div
            style={{
              background: C.mustard + "22",
              border: `1px solid ${C.mustard}`,
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontFamily: FM,
                fontSize: 9,
                letterSpacing: 1,
                color: C.mustard,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Cognitive Science
            </div>
            <div
              style={{
                fontFamily: FB,
                fontSize: 13,
                color: C.ink,
                lineHeight: 1.55,
              }}
            >
              {card.cognitiveRationale}
            </div>
          </div>
        )}

        {/* Research tag */}
        {card.researchTag && (
          <div
            style={{
              fontFamily: FM,
              fontSize: 10,
              color: C.muted,
              letterSpacing: 0.4,
              marginTop: 4,
            }}
          >
            📚 {card.researchTag}
          </div>
        )}
      </div>
    </div>
  );
}

