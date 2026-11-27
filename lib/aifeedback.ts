// AI feedback on handed-in work, with each teacher's own key (Settings → AI): Claude, ChatGPT or Gemini. Gemini also
// watches a video itself. Runs in the background after a student hands in; the student sees it on the card.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { presignGet, r2Ready } from "./blob";
import { db, save } from "./store";
import { UPLOAD_DIR, TYPES } from "./uploads";
import type { AiModel, AiProvider, AiStatus } from "./aimeta";
import type { Attachment, Course, Module, Progress } from "./types";

// ——— Keys at rest: encrypted with the server's own secret (AI_KEY_SECRET, or a file made once in .data). ———

function secret(): Buffer {
  if (process.env.AI_KEY_SECRET) return crypto.createHash("sha256").update(process.env.AI_KEY_SECRET).digest();
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "ai-secret");
  try { return Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex"); } catch { /* make one */ }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  return key;
}
export function sealKey(key: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", secret(), iv);
  const enc = Buffer.concat([c.update(key, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function openKey(sealed: string): string | null {
  try {
    const [iv, tag, enc] = sealed.split(".").map((x) => Buffer.from(x, "base64"));
    const d = crypto.createDecipheriv("aes-256-gcm", secret(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch { return null; }
}

export class AiError extends Error {
  /** The key is out of credit or over a limit: the teacher's Settings shows it. */
  constructor(message: string, readonly quota?: string) { super(message); }
}
const why = (status: number, provider: string) =>
  status === 401 || status === 403 ? `${provider} didn’t accept the key. Check it in Settings → AI.`
  : status === 429 ? `${provider} says the key is over its limit or out of credit.`
  : status === 404 ? `${provider} doesn’t have that model. Pick another in Settings → AI.`
  : `${provider} had an error (${status}).`;

/** How long to wait before trying again, when a service says it's busy (or asks for a short wait); null: don't. */
function retryAfter(status: number, body: string): number | null {
  if (status === 500 || status === 502 || status === 503 || status === 504) return 4000;
  // Over a per-minute limit, with the wait it asks for: worth one more try. A daily limit or no credit isn't.
  if (status !== 429 || /per ?day|PerDay|billing|credit|insufficient/i.test(body)) return null;
  const s = Number(body.match(/"retryDelay":\s*"(\d+)(?:\.\d+)?s"/)?.[1] ?? NaN);
  return s <= 40 ? s * 1000 + 500 : null;
}
/**
 * A request to an AI service that gives up after `ms`, and tries twice more when the service is busy. Free keys and
 * busy hours get "overloaded" (503) answers that work a few seconds later.
 */
async function send(url: string, init: RequestInit, ms = 180_000): Promise<Response | null> {
  for (let tries = 0; ; tries++) {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) }).catch(() => null);
    if (!r || r.ok || tries >= 2) return r;
    const wait = retryAfter(r.status, await r.clone().text().catch(() => ""));
    if (wait === null) return r;
    await new Promise((res) => setTimeout(res, wait * (tries + 1)));
  }
}
/** What Settings says about a free key over its limit. */
const FREE_DAILY = "This is a free key, and it has used today’s requests for this model. It starts again tomorrow; turn on billing for the key to lift the limit.";
const FREE_RATE = "This is a free key, over its limit for the moment. Turn on billing for the key to lift the limit.";
/** Why a service turned a request down, in words a teacher can act on (the body says more than the status). */
async function refusal(r: Response, provider: string): Promise<AiError> {
  const body = await r.text().catch(() => "");
  if (r.status === 429 && /free.?tier/i.test(body) && /per ?day|PerDay/i.test(body))
    return new AiError(`${provider}: this free key has used today’s requests for this model. AI feedback starts again tomorrow, or turn on billing for the key to lift the limit.`, "free_daily");
  if (r.status === 429 && /free.?tier/i.test(body))
    return new AiError(`${provider}: this free key is over its limit for now. Try again in a few minutes, or turn on billing for the key.`, "free_rate");
  if (r.status === 402 || (r.status === 429 && /billing|credit|insufficient|quota/i.test(body)))
    return new AiError(`${provider} says the key is out of credit or over its limit.`, "credit");
  return new AiError(why(r.status, provider));
}

// ——— The models each service offers this key, newest first. ———

export async function listModels(provider: AiProvider, key: string): Promise<AiModel[]> {
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: key });
    const out: AiModel[] = [];
    try {
      for await (const m of client.models.list({ limit: 100 })) out.push({ id: m.id, name: m.display_name || m.id, created: Date.parse(m.created_at) || undefined });
    } catch (e) {
      if (e instanceof Anthropic.APIError) throw new AiError(why(e.status ?? 0, "Anthropic"));
      throw new AiError("Couldn’t reach Anthropic.");
    }
    return out;
  }
  if (provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }).catch(() => null);
    if (!r) throw new AiError("Couldn’t reach OpenAI.");
    if (!r.ok) throw new AiError(why(r.status, "OpenAI"));
    const j = (await r.json()) as { data?: { id: string; created: number }[] };
    return (j.data ?? [])
      .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !/(audio|realtime|image|tts|transcribe|search|embedding|instruct|moderation)/.test(m.id))
      .sort((a, b) => b.created - a.created)
      .map((m) => ({ id: m.id, name: m.id, created: m.created * 1000 }));
  }
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } }).catch(() => null);
  if (!r) throw new AiError("Couldn’t reach Google.");
  if (!r.ok) throw new AiError(why(r.status, "Google"));
  const j = (await r.json()) as { models?: { name: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }[] };
  return (j.models ?? [])
    .filter((m) => m.name.includes("gemini") && m.supportedGenerationMethods?.includes("generateContent") && !/(embedding|tts|image|audio|live|transcribe|robotics|computer-use|gemma|aqa)/.test(m.name))
    .map((m) => ({ id: m.name.replace(/^models\//, ""), name: m.displayName || m.name, description: m.description?.slice(0, 400) }))
    .reverse();
}

/**
 * Does this key have credit? One tiny request (a single word back, a fraction of a cent): ready, out of credit, or
 * not accepted. Services don't tell anyone a key's balance, so this is the only way to know before students hand in.
 */
export async function probe(provider: AiProvider, key: string, model: string): Promise<AiStatus> {
  const at = Date.now();
  const credit = /credit|billing|quota|insufficient|exceeded|payment|balance/i;
  try {
    if (provider === "anthropic") {
      await new Anthropic({ apiKey: key }).messages.create({ model, max_tokens: 1, messages: [{ role: "user", content: "Hi" }] });
      return { state: "ready", at };
    }
    const r = provider === "openai"
      ? await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }], max_completion_tokens: 16 }) })
      : await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Hi" }] }], generationConfig: { maxOutputTokens: 1 } }) });
    if (r.ok) return { state: "ready", at };
    const text = await r.text().catch(() => "");
    if (r.status === 401 || r.status === 403) return { state: "bad_key", at };
    if (r.status === 429 && /free.?tier/i.test(text)) return { state: "no_credit", at, message: /per ?day|PerDay/i.test(text) ? FREE_DAILY : FREE_RATE };
    if (r.status === 429 || r.status === 402 || credit.test(text)) return { state: "no_credit", at };
    return { state: "error", at, message: `${r.status}` };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      if (e.status === 401 || e.status === 403) return { state: "bad_key", at };
      if (e.status === 429 || e.status === 402 || credit.test(e.message)) return { state: "no_credit", at };
      return { state: "error", at, message: `${e.status ?? ""}` };
    }
    return { state: "error", at, message: "unreachable" };
  }
}

// ——— One request: instructions, the student's words, and (Gemini) their video. ———

type Video = { bytes: Buffer; mime: string; fps: number };

export async function ask(provider: AiProvider, key: string, model: string, system: string, text: string, video?: Video): Promise<string> {
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: key, timeout: 180_000, maxRetries: 2 });
    try {
      const res = await client.messages.create({ model, max_tokens: 2000, system, messages: [{ role: "user", content: text }] });
      if (res.stop_reason === "refusal") throw new AiError("The AI declined to give feedback on this one.");
      return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    } catch (e) {
      if (e instanceof AiError) throw e;
      if (e instanceof Anthropic.APIError) throw e.status === 429 || e.status === 402 ? new AiError(`Anthropic says the key is out of credit or over its limit.`, "credit") : new AiError(why(e.status ?? 0, "Anthropic"));
      throw new AiError("Couldn’t reach Anthropic.");
    }
  }
  if (provider === "openai") {
    const r = await send("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: text }] }),
    }).catch(() => null);
    if (!r) throw new AiError("Couldn’t reach OpenAI.");
    if (!r.ok) throw await refusal(r, "OpenAI");
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content?.trim() ?? "";
  }
  const base = "https://generativelanguage.googleapis.com";
  const parts: unknown[] = [];
  let fileName: string | undefined;
  if (video) {
    // Files API: start a resumable upload, send the bytes, wait until the video is processed.
    const start = await send(`${base}/upload/v1beta/files`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(video.bytes.length), "X-Goog-Upload-Header-Content-Type": video.mime, "Content-Type": "application/json" },
      body: JSON.stringify({ file: { display_name: "student-video" } }),
    }, 60_000);
    if (!start) throw new AiError("Couldn’t reach Google.");
    if (!start.ok) throw await refusal(start, "Google");
    const url = start.headers.get("x-goog-upload-url");
    if (!url) throw new AiError("Google didn’t accept the video upload.");
    const up = await fetch(url, { method: "POST", headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" }, body: new Uint8Array(video.bytes), signal: AbortSignal.timeout(300_000) }).catch(() => null);
    if (!up?.ok) throw new AiError("The video didn’t upload to Google.");
    let file = ((await up.json()) as { file: { name: string; uri: string; state?: string; mimeType?: string } }).file;
    fileName = file.name;
    for (let i = 0; i < 60 && file.state === "PROCESSING"; i++) {
      await new Promise((res) => setTimeout(res, 2000));
      const g = await fetch(`${base}/v1beta/${file.name}`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (g?.ok) file = (await g.json()) as typeof file;
    }
    if (file.state && file.state !== "ACTIVE") throw new AiError("Google couldn’t process the video.");
    parts.push({ file_data: { mime_type: file.mimeType ?? video.mime, file_uri: file.uri }, video_metadata: { fps: video.fps } });
  }
  parts.push({ text });
  try {
    const r = await send(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }] }),
    });
    if (!r) throw new AiError("Google didn’t answer in time. Hand it in again to retry.");
    if (!r.ok) throw await refusal(r, "Google");
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  } finally {
    // The video isn't kept at Google longer than the feedback takes.
    if (fileName) void fetch(`${base}/v1beta/${fileName}`, { method: "DELETE", headers: { "x-goog-api-key": key } }).catch(() => {});
  }
}

const COACH = `You are a warm, specific coach giving a student feedback on work they just handed in for one card of their course. Write in plain English, in the second person.
Use these labelled parts, each one to three short sentences:
Works well: one concrete strength, quoting or pointing to something they did.
Try next: the two changes that would help most, tied to the card's goal.
Your next step: one small thing to practise before the next session.
Never rewrite the work for them. Under 170 words. If the work is empty or off-topic, say so kindly and what the card asks for.`;

const WATCHER = `${COACH}
You are also watching the student's video. Add a part, before "Your next step":
Delivery: what you saw and heard, with a time (m:ss) for each point: posture, gestures, eye contact with the camera, facial expression, pace, pauses and filler words. Name one thing to keep and one to change. Don't guess at feelings or personal traits; describe only what can be seen and heard.`;

const plain = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/[#*_>|]+/g, " ").replace(/\s+/g, " ").trim();

async function videoBytes(a: Attachment): Promise<Buffer | null> {
  const name = a.url.match(/^\/api\/upload\/([a-z0-9]+\.[a-z0-9]{1,5})$/)?.[1];
  if (!name) return null;
  try { return fs.readFileSync(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name)); } catch { /* maybe in R2 */ }
  if (!r2Ready()) return null;
  const r = await fetch(await presignGet(name)).catch(() => null);
  if (!r?.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length <= 300 * 1024 * 1024 ? buf : null;
}

/** Whether a card gives AI feedback right now: switched on for the card, and the course's owner has set up AI. */
export type AiUse = { provider: AiProvider; key: string; model: string };
/** The AI a person has in use (Settings → Tools for cards), with its key opened, or null. */
export function aiOf(user: { ai?: { provider: AiProvider; key: string; model: string } } | undefined): AiUse | null {
  const ai = user?.ai;
  const key = ai ? openKey(ai.key) : null;
  return ai && key ? { provider: ai.provider, key, model: ai.model } : null;
}
/** The AI a course uses: its owner's. */
export const courseAi = (course: Course): AiUse | null => aiOf(course.ownerId ? db().users[course.ownerId] : undefined);

export function aiFor(course: Course, m: Module): AiUse | null {
  return m.aiFeedback ? courseAi(course) : null;
}

/** The course owner's saved key for this service: out of credit (or over a free key's limit), or working again. */
function markOwner(course: Course, provider: AiProvider, message?: string, ok = false) {
  const owner = course.ownerId ? db().users[course.ownerId] : undefined;
  const saved = owner?.ai?.saved?.[provider];
  if (!saved || (ok && saved.status?.state !== "no_credit")) return;
  saved.status = ok ? { state: "ready", at: Date.now() } : { state: "no_credit", at: Date.now(), message };
  save();
}

/**
 * Start AI feedback on a student's handed-in card (if the course gives it and there's something to read or watch).
 * Marks the card "working" now; the feedback lands on the card when it's ready.
 */
export function startAiFeedback(course: Course, m: Module, studentId: string, p: Progress): void {
  const setup = aiFor(course, m);
  if (!setup) return;
  // Everything the student did on the card: what they wrote, recorded, answered, and posted.
  const posts = (db().posts[course.id] ?? []).filter((x) => x.moduleId === m.id && x.studentId === studentId);
  const work = [...(p.work ?? []), ...posts.flatMap((x) => x.work ?? [])];
  const answered = (m.questions ?? []).filter((q) => p.answers?.[q.id] !== undefined).map((q, i) => {
    const a = p.answers![q.id];
    const pick = (n: unknown) => (typeof n === "number" ? q.options[n] ?? "" : String(n));
    const given = Array.isArray(a) ? a.map(pick).join(", ") : pick(a);
    const mark = m.poll ? "" : p.results?.[q.id] === undefined ? "" : p.results[q.id] ? " (right)" : " (not right)";
    return `Q${i + 1}: ${q.text}\nTheir answer: ${given}${mark}`;
  });
  const words = [plain(p.output ?? ""), ...answered, ...posts.map((x) => `Their post: ${plain(x.text)}`)].filter(Boolean).join("\n\n");
  const said = work.filter((w) => w.transcript).map((w) => `${w.name ?? "Recording"}${w.duration ? ` (${w.duration}s)` : ""}: ${w.transcript}`);
  const film = setup.provider === "gemini" ? work.filter((w) => w.kind === "video" && /^\/api\/upload\//.test(w.url)).pop() : undefined;
  if (!words && !said.length && !film) return;
  // The same work handed in again (nothing changed) keeps the feedback it has: no second request.
  const input = crypto.createHash("sha256").update(JSON.stringify([setup.provider, setup.model, words, said, film?.url ?? "", film?.fps ?? 1])).digest("base64url").slice(0, 16);
  if (p.ai?.state === "done" && p.ai.input === input) return;
  const at = Date.now();
  p.ai = { state: "working", at, model: setup.model, watched: !!film, input };
  const courseId = course.id;
  void (async () => {
    let result: NonNullable<Progress["ai"]>;
    try {
      // A discussion card also asks for replies to classmates, which come later: feedback is on the student's post.
      const discussion = m.type === "wall" ? "\nThis is a class discussion. Give feedback on the student's own post only; replying to classmates is a separate step, so don't mention replies." : "";
      const card = `Card: “${m.title}”\n${plain(m.body ?? "").slice(0, 3000)}${m.criteria ? `\nDone when: ${m.criteria}` : ""}${discussion}`;
      const text = `${card}\n\n${words ? `The student's written work:\n${words.slice(0, 8000)}\n\n` : ""}${said.length ? `What the student said in their recordings (browser transcript, may have small errors):\n${said.join("\n").slice(0, 12000)}\n\n` : ""}${film ? "Their video is attached." : ""}`;
      let video: Video | undefined;
      if (film) {
        const bytes = await videoBytes(film);
        const ext = film.url.split(".").pop() ?? "webm";
        if (bytes) video = { bytes, mime: TYPES[ext] ?? "video/webm", fps: film.fps && film.fps > 1 ? film.fps : 1 };
      }
      const out = await ask(setup.provider, setup.key, setup.model, video ? WATCHER : COACH, text, video);
      result = out ? { state: "done", at, model: setup.model, text: out.slice(0, 6000), watched: !!video, input } : { state: "error", at, model: setup.model, error: "The AI gave no feedback. Hand it in again to retry." };
      if (out) markOwner(course, setup.provider, undefined, true);
    } catch (e) {
      result = { state: "error", at, model: setup.model, error: e instanceof AiError ? e.message : "The AI feedback didn’t work this time." };
      // Out of credit or over a limit: the teacher's Settings shows it, so they know before the next student hands in.
      if (e instanceof AiError && e.quota) markOwner(course, setup.provider, e.quota === "free_daily" ? FREE_DAILY : e.quota === "free_rate" ? FREE_RATE : undefined);
    }
    // Only if this is still the latest hand-in (a newer one starts its own feedback).
    const cur = db().progress[courseId]?.[studentId]?.[m.id];
    if (cur?.ai?.at !== at) return;
    cur.ai = result;
    save(courseId);
  })();
}
