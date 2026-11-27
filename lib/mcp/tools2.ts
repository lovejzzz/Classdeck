// More of what a teacher's AI can do in Questhand: move and copy weeks, lessons and cards; make narration (with the
// teacher's own AI key); find and make videos; set up and test the tools on cards; and test a course with demo
// students (acting as them, seeing what they see, a check of the whole course). Nothing here deletes, touches the
// class list or groups, messages students, or sets keys.
import { aiOf, openKey } from "../aifeedback";
import { actAs } from "../auth";
import { allConnectors, describe, getConnector } from "../connectors/registry";
import { kindOf, reviewableCard } from "../kinds";
import { meetingOf } from "../media";
import { baseOf } from "../merge";
import { db } from "../store";
import type { Course, Module, Progress } from "../types";
import { keepBytes } from "./files";
import {
  add, cap, cardFor, cardOut, change, clip, COURSE_ID, courseFor, lessonsOf, link, obj, op, ro, saveLesson, str, studentName, ToolError,
  type Ctx, type Tool,
} from "./tools";
import { GET as courseGET } from "@/app/api/course/[courseId]/route";
import { POST as invokePOST } from "@/app/api/connectors/invoke/route";

const lessonOf = (c: Course, id: unknown) => {
  const x = lessonsOf(c).find((y) => y.l.id === id);
  if (!x) throw new ToolError("No lesson with that id. Use get_course.");
  return x;
};
const weekOf = (c: Course, id: unknown) => {
  const w = c.weeks.find((x) => x.id === id);
  if (!w) throw new ToolError("No week with that id. Use get_course.");
  return w;
};
/** A demo student of this course (a test student the teacher made): never a real one. */
function demoOf(c: Course, id: unknown) {
  const st = c.students.find((s) => s.id === id);
  if (!st) throw new ToolError("No student with that id. demo_students lists the demo students.");
  if (!st.demo) throw new ToolError("Only demo students can be acted as. demo_students makes them.");
  return st;
}
const plain = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/[#*_>|`]+/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
// ——— Voice ———

/** 16-bit PCM (what Gemini's speech models return) as a WAV file. */
function wav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function speak(ctx: Ctx, text: string, voice?: string): Promise<{ bytes: Buffer; mime: string; by: string }> {
  const ai = aiOf(ctx.user);
  if (!ai) throw new ToolError("Narration uses your own AI key, and none is connected. Connect Gemini or ChatGPT in Questhand → Settings → Tools for cards.");
  if (ai.provider === "anthropic") {
    const other = (["gemini", "openai"] as const).find((p) => ctx.user.ai?.saved?.[p]);
    if (!other) throw new ToolError("Claude can't make speech. Add a Gemini or ChatGPT key in Settings → Tools for cards (you can keep Claude for feedback).");
  }
  const saved = ctx.user.ai?.saved ?? {};
  const pick = ai.provider !== "anthropic" ? ai : (() => { const p = saved.gemini ? "gemini" : "openai"; return { provider: p, key: openKey(saved[p]!.key)!, model: "" }; })();
  if (pick.provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST", headers: { Authorization: `Bearer ${pick.key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: voice || "nova", input: text, response_format: "mp3" }),
    }).catch(() => null);
    if (!r?.ok) throw new ToolError(`OpenAI couldn't make the narration${r ? ` (${r.status})` : ""}.`);
    return { bytes: Buffer.from(await r.arrayBuffer()), mime: "audio/mpeg", by: "OpenAI" };
  }
  // Gemini: the newest speech model this key has.
  for (const model of ["gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts"]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": pick.key, "Content-Type": "application/json" }, signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || "Kore" } } } } }),
    }).catch(() => null);
    if (r?.status === 404) continue;
    if (!r?.ok) throw new ToolError(`Google couldn't make the narration${r ? ` (${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)})` : ""}.`);
    const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!part?.data) throw new ToolError("Google sent no audio back.");
    const rate = Number(part.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
    return { bytes: wav(Buffer.from(part.data, "base64"), rate), mime: "audio/wav", by: `Google (${model})` };
  }
  throw new ToolError("Your Google key has no speech model.");
}

// ——— Video (Veo, with the teacher's Google key): started, then checked, since it takes a minute or two ———

const jobs = new Map<string, { user: string; course: string; card: string; op: string; key: string; at: number; title: string }>();
async function veoModel(key: string): Promise<string | null> {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } }).catch(() => null);
  const j = r?.ok ? ((await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }) : {};
  const veo = (j.models ?? []).filter((m) => /veo/.test(m.name) && m.supportedGenerationMethods?.some((x) => /predictLongRunning/i.test(x)));
  return veo.sort((a, b) => b.name.localeCompare(a.name))[0]?.name ?? null;
}

// ——— Seeing a course as a student ———

type StudentState = { course: Course; progress: Record<string, Record<string, Progress>> };
async function asStudent(ctx: Ctx, c: Course, sid: string): Promise<StudentState> {
  const req = actAs(new Request(`${ctx.origin}/api/course/${c.id}?as=${sid}`), ctx.user.id);
  const res = await courseGET(req, { params: Promise.resolve({ courseId: c.id }) });
  if (!res.ok) throw new ToolError(`Couldn't open the course as that student (${res.status})`);
  return (await res.json()) as StudentState;
}
const studentOp = (ctx: Ctx, c: Course, sid: string, body: Record<string, unknown>) => op(ctx, c.id, { ...body, studentId: sid });

/** What a demo student does on one card, as a real student would (through the same routes). */
async function doCard(ctx: Ctx, c: Course, sid: string, shown: Module, how: { pick?: number; text?: string; ai?: boolean; wrong?: boolean }): Promise<string> {
  // The student's copy of a card has its right answers taken out: answer from the teacher's copy (same ids).
  const m = lessonsOf(db().courses[c.id] ?? c).flatMap((x) => x.l.modules).find((x) => x.id === shown.id) ?? shown;
  const k = kindOf(m);
  const text = how.text ?? "(Course check: a test answer from a demo student.)";
  if (k === "group") return "a group (its cards are done one by one)";
  if (k === "choice") {
    for (const q of m.questions ?? []) {
      const body: Record<string, unknown> = { op: "answer", moduleId: m.id, qid: q.id };
      if (m.poll) { const i = Math.min(q.options.length - 1, how.pick ?? 0); if (q.kind === "multi") body.multi = [i]; else body.choice = i; }
      // Right answers, or (to try a low score's path) wrong ones.
      else if (q.kind === "short") body.text = how.wrong ? "not the answer" : q.accept?.[0] ?? "answer";
      else if (q.kind === "multi") body.multi = how.wrong ? q.options.map((_, i) => i).filter((i) => !(q.answerSet ?? []).includes(i)).slice(0, 1) : q.answerSet ?? [];
      else if (q.kind === "order") body.order = how.wrong ? [...q.options].reverse() : q.options;
      else body.choice = how.wrong ? q.options.findIndex((_, i) => i !== q.answer) : q.answer ?? 0;
      await studentOp(ctx, c, sid, body);
    }
    return m.poll ? `voted “${m.questions?.[0]?.options[Math.min((m.questions?.[0]?.options.length ?? 1) - 1, how.pick ?? 0)]}”` : how.wrong ? "answered every question wrong (on purpose)" : "answered every question right";
  }
  if (k === "discussion") { await studentOp(ctx, c, sid, { op: "addPost", moduleId: m.id, text }); return "posted"; }
  if (m.aiFeedback && !how.ai && reviewableCard(m)) return "skipped (AI feedback is on: handing in would use your AI key; pass include_ai_cards to include it)";
  if (m.writers === "group" || m.writers === "class") return "skipped (a shared document)";
  await studentOp(ctx, c, sid, {
    op: "setProgress", moduleId: m.id, status: "done",
    ...(m.checklist?.length ? { checks: m.checklist.map((_, i) => i) } : {}),
    ...(m.playlist?.length ? { watched: m.playlist.map((v) => v.id) } : {}),
    ...(m.prompts?.length ? { responses: m.prompts.map(() => text) } : k === "answer" || k === "worksheet" ? { output: text } : {}),
  });
  return k === "answer" || k === "worksheet" ? "handed in" : "done";
}

// ——— A check of the whole course ———

const PLACEHOLDER = /\((?:add|insert|paste)\b[^)]*\)|\badd the (?:zoom|meet|teams|meeting) link\b|\badd the time here\b|\b(?:TODO|TBD|lorem ipsum)\b/i;
async function linkOk(u: string): Promise<string | null> {
  try {
    if (/youtu\.?be/.test(u)) {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`, { signal: AbortSignal.timeout(8000) });
      return r.ok ? null : "the YouTube video isn't available (removed, private, or a wrong link)";
    }
    if (meetingOf(u)) return null;
    const r = await fetch(u, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0 (Questhand course check)" } });
    return r.status >= 400 && r.status !== 403 && r.status !== 405 ? `answers ${r.status}` : null;
  } catch { return "couldn't be reached"; }
}

// ——— Quality: what makes a course weaker even when nothing is broken ———

const STOP = new Set("a an the of to in on for and or is are be it its this that what which who how why do does should would your you we our with as at by from into than then when where".split(" "));
const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
/** Two questions asking the same thing (most of their words shared). */
function sameQuestion(a: string, b: string): boolean {
  const x = words(a), y = words(b);
  if (x.size < 3 || y.size < 3) return false;
  const both = [...x].filter((w) => y.has(w)).length;
  return both / Math.min(x.size, y.size) >= 0.7;
}
/** Titles that say nothing about the card (students see them on every week). */
const GENERIC = /^(pick the answer|short answer|answer|quiz|question|questions|reading|read|video|watch|discussion|practice|activity|task|exercise|card|check|review)( \d+)?$/i;
/** The last stretch of a course: a project, a wrap-up, a celebration. It belongs at the end. */
const CAPSTONE = /\b(final project|capstone|wrap-?up|final presentation|course review|celebrat\w*|next steps)\b/i;
/** Accepted answers so short or so common that wrong answers would count as right. */
const LOOSE = new Set(["point", "thing", "things", "stuff", "yes", "no", "it", "answer", "good", "bad", "data", "story", "the", "a"]);
/** A question that only asks for a term (“What do we call…”, “the big ___”). */
const TERM_ONLY = /(what do (we|you) call|what is the (word|term|name)|which (word|term)|_{3,}|\(one word\)|\(two words)/i;
/** A YouTube video's length in seconds, from its page (null when it can't be read). */
async function youtubeSeconds(u: string): Promise<number | null> {
  const id = u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1];
  if (!id) return null;
  const r = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: { "user-agent": "Mozilla/5.0", "accept-language": "en" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  const html = r?.ok ? await r.text() : "";
  const n = Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const MORE_TOOLS: Tool[] = [
  // ——— Moving and copying ———
  {
    name: "move_card", title: "Move a card", annotations: { ...change, title: "Move a card" },
    description: "Move a card to another place in its lesson, or to another lesson (after a given card, or at the end). A card group moves with its cards. Cards wired in a card tree stay in their lesson.",
    inputSchema: obj({ ...COURSE_ID, card_id: { type: "string" }, to_lesson_id: { type: "string" }, after_card_id: { type: "string", description: "Leave out to put it at the start; or the id of the card to put it after" }, at_end: { type: "boolean" } }, ["course_id", "card_id", "to_lesson_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id, true);
      const { l: from, m } = cardFor(c, a.card_id);
      const to = lessonOf(c, a.to_lesson_id).l;
      const moving = new Set([m.id, ...(m.members ?? [])]);
      const inGroup = from.modules.find((g) => g.members?.includes(m.id));
      const wired = (x: Module) => (x.questions ?? []).some((q) => q.next?.some(Boolean)) || x.bands?.some((b) => b.next) || from.modules.some((o) => o.questions?.some((q) => q.next?.flat().includes(x.id)) || o.bands?.some((b) => b.next === x.id));
      if (from.id !== to.id && (inGroup || [...moving].some((id) => wired(from.modules.find((x) => x.id === id)!)))) throw new ToolError("That card is in a card group or a card tree, which stay in their lesson. Move it within the lesson, or rebuild the tree in the other lesson.");
      const cards = from.modules.filter((x) => moving.has(x.id));
      const place = (list: Module[]) => {
        const rest = list.filter((x) => !moving.has(x.id));
        const at = a.at_end ? rest.length : a.after_card_id ? rest.findIndex((x) => x.id === a.after_card_id) + 1 : 0;
        if (a.after_card_id && at === 0) throw new ToolError("after_card_id isn't a card in the lesson it's moving to");
        rest.splice(at, 0, ...cards);
        return rest;
      };
      if (from.id === to.id) await saveLesson(ctx, c, { ...from, modules: place(from.modules) }, from);
      else {
        // Both lessons in one save, so the card is never in two places.
        await op(ctx, c.id, { op: "saveLessons", lessons: [{ ...to, modules: place(to.modules) }, { ...from, modules: from.modules.filter((x) => !moving.has(x.id)) }], bases: { [to.id]: baseOf(to), [from.id]: baseOf(from) } });
      }
      return `Moved “${m.title}”${cards.length > 1 ? ` (with its ${cards.length - 1} cards)` : ""} to “${to.title}”. ${link(ctx, c, to.id)}`;
    },
  },
  {
    name: "move_lesson", title: "Move a lesson", annotations: { ...change, title: "Move a lesson" },
    description: "Move a lesson to another week, or to another place in its week (before a given lesson, or at the end).",
    inputSchema: obj({ ...COURSE_ID, lesson_id: { type: "string" }, to_week_id: { type: "string" }, before_lesson_id: { type: "string" } }, ["course_id", "lesson_id", "to_week_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id, true);
      const { l } = lessonOf(c, a.lesson_id);
      const w = weekOf(c, a.to_week_id);
      await op(ctx, c.id, { op: "moveLesson", lessonId: l.id, weekId: w.id, beforeLessonId: a.before_lesson_id });
      return `Moved “${l.title}” to ${w.title}. ${link(ctx, c, l.id)}`;
    },
  },
  {
    name: "move_week", title: "Move a week", annotations: { ...change, title: "Move a week" },
    description: "Move a week before another week, or to the end. Rename weeks after (update_week) if their numbers no longer follow.",
    inputSchema: obj({ ...COURSE_ID, week_id: { type: "string" }, before_week_id: { type: "string", description: "Leave out to move it to the end" } }, ["course_id", "week_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id, true);
      const w = weekOf(c, a.week_id);
      if (a.before_week_id) weekOf(c, a.before_week_id);
      await op(ctx, c.id, { op: "moveWeek", weekId: w.id, beforeWeekId: a.before_week_id });
      const order = db().courses[c.id]!.weeks.map((x) => x.title).join(" → ");
      return `Moved “${w.title}”. The weeks now: ${order}`;
    },
  },
  {
    name: "copy_lesson", title: "Copy a lesson", annotations: { ...add, title: "Copy a lesson" },
    description: "Copy a lesson (all its cards, card trees wired) right after itself. Then change the copy with update_lesson and update_card.",
    inputSchema: obj({ ...COURSE_ID, lesson_id: { type: "string" } }, ["course_id", "lesson_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id, true);
      const { l } = lessonOf(c, a.lesson_id);
      const r = await op(ctx, c.id, { op: "duplicateLesson", lessonId: l.id });
      return `Copied “${l.title}” (the copy is lesson ${r.lessonId}). ${link(ctx, c, String(r.lessonId))}`;
    },
  },
  {
    name: "copy_week", title: "Copy a week", annotations: { ...add, title: "Copy a week" },
    description: "Copy a week (all its lessons and cards, card trees wired) right after itself. Then rename it and change the copy.",
    inputSchema: obj({ ...COURSE_ID, week_id: { type: "string" } }, ["course_id", "week_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id, true);
      const w = weekOf(c, a.week_id);
      const before = new Set(c.weeks.map((x) => x.id));
      await op(ctx, c.id, { op: "duplicateWeek", weekId: w.id });
      const copy = db().courses[c.id]!.weeks.find((x) => !before.has(x.id));
      return `Copied “${w.title}”${copy ? ` (the copy is “${copy.title}”, week id ${copy.id})` : ""}.`;
    },
  },
  {
    name: "update_course", title: "Rename a course", annotations: { ...change, title: "Rename a course" },
    description: "Change a course's title or subtitle.",
    inputSchema: obj({ ...COURSE_ID, title: { type: "string" }, subtitle: { type: "string" } }, ["course_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id, true);
      await op(ctx, c.id, { op: "setCourseInfo", title: typeof a.title === "string" ? a.title : "", subtitle: typeof a.subtitle === "string" ? a.subtitle : c.subtitle ?? "" });
      const n = db().courses[c.id]!;
      return `Now “${n.title}”${n.subtitle ? ` — ${n.subtitle}` : ""}.`;
    },
  },

  // ——— Voice and video ———
  {
    name: "make_narration", title: "Make narration", annotations: { ...add, openWorldHint: true, title: "Make narration" },
    description: "Read text aloud with a natural voice and put the recording on a card (students play it there). Uses the teacher's own AI key: Gemini or ChatGPT (Claude can't make speech). Leave text out to read the card's own text. Costs a little on the teacher's key.",
    inputSchema: obj({ ...COURSE_ID, card_id: { type: "string" }, text: { type: "string", description: "What to say (up to about 4,000 characters)" }, voice: { type: "string", description: "Gemini: Kore, Puck, Charon, Aoede, Fenrir… ChatGPT: nova, alloy, shimmer, echo, onyx…" }, name: { type: "string", description: "The recording's name on the card" } }, ["course_id", "card_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id, true);
      const { l, m } = cardFor(c, a.card_id);
      const text = (typeof a.text === "string" && a.text.trim() ? a.text : plain(`${m.title}. ${m.body ?? ""}`)).slice(0, 4000);
      if (text.length < 3) throw new ToolError("Nothing to read: give text, or put text on the card first");
      const sound = await speak(ctx, text, typeof a.voice === "string" ? a.voice : undefined);
      const att = await keepBytes(sound.bytes, sound.mime, typeof a.name === "string" && a.name.trim() ? a.name.trim() : "Narration", ctx);
      const now = lessonOf(db().courses[c.id]!, l.id).l;
      await saveLesson(ctx, c, { ...now, modules: now.modules.map((x) => (x.id === m.id ? { ...x, attachments: [...(x.attachments ?? []), { ...att, transcript: text }] } : x)) }, now);
      return `Put “${att.name}” (${Math.round(sound.bytes.length / 1024)} KB, by ${sound.by}) on “${m.title}”. ${link(ctx, c, l.id)}`;
    },
  },
  {
    name: "find_videos", title: "Find videos", annotations: { ...ro, openWorldHint: true, title: "Find videos" },
    description: "Search YouTube for videos (Safe Search on): title, channel, link. Then put one on a card with update_card (link, and clip for just a part) or a list with videos.",
    inputSchema: obj({ query: { type: "string" } }, ["query"]),
    async run(a) {
      const yt = getConnector("youtube");
      if (!yt?.configured()) throw new ToolError("Video search isn't set up on this Questhand (it needs a YouTube key on the server). You can still put any video link on a card with update_card or add_cards.");
      const r = await yt.invoke("search", { q: str(a.query, "query", 200) }, {});
      return cap(JSON.stringify(r).slice(0, 6000));
    },
  },
  {
    name: "make_video", title: "Make a video", annotations: { ...add, openWorldHint: true, title: "Make a video" },
    description: "Generate a short video clip from a description (Google Veo, with the teacher's own Gemini key) and put it on a card. It costs real money on the teacher's key (Google charges per second of video), so first call without confirm to see what will happen, tell the teacher, and only call with confirm: true once they agree. It takes a minute or two: check with check_video.",
    inputSchema: obj({ ...COURSE_ID, card_id: { type: "string" }, prompt: { type: "string", description: "What the clip shows, in detail" }, confirm: { type: "boolean" } }, ["course_id", "card_id", "prompt"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id, true);
      const { m } = cardFor(c, a.card_id);
      const ai = aiOf(ctx.user);
      const g = ctx.user.ai?.saved?.gemini;
      const key = ai?.provider === "gemini" ? ai.key : g ? openKey(g.key) : null;
      if (!key) throw new ToolError("Making video needs a Gemini key (Google Veo). Connect one in Settings → Tools for cards.");
      const model = await veoModel(key);
      if (!model) throw new ToolError("Your Google key doesn't offer a video model (Veo). Check your Google AI Studio plan; until then, put an existing video on the card with a link.");
      const prompt = str(a.prompt, "prompt", 2000);
      if (a.confirm !== true) return `Ready to make an ~8-second clip with ${model.replace("models/", "")} for “${m.title}”. Google charges your key per second of video (often a few dollars a clip). Ask the teacher; call again with confirm: true to start.`;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:predictLongRunning`, {
        method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio: "16:9" } }),
      }).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { name?: string }) : null;
      if (!j?.name) throw new ToolError(`Google didn't start the video${r ? ` (${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)})` : ""}.`);
      const id = `v${Date.now().toString(36)}`;
      jobs.set(id, { user: ctx.user.id, course: c.id, card: m.id, op: j.name, key, at: Date.now(), title: m.title });
      return `Started (job ${id}). It takes a minute or two: call check_video with job_id ${id}.`;
    },
  },
  {
    name: "check_video", title: "Check a video", annotations: { ...add, openWorldHint: true, title: "Check a video" },
    description: "See whether a video from make_video is ready; when it is, it's saved and put on its card.",
    inputSchema: obj({ job_id: { type: "string" } }, ["job_id"]),
    async run(a, ctx) {
      const job = jobs.get(String(a.job_id));
      if (!job || job.user !== ctx.user.id) throw new ToolError("No video job with that id (they're kept until the server restarts).");
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${job.op}`, { headers: { "x-goog-api-key": job.key }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { done?: boolean; error?: { message?: string }; response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[] } } }) : null;
      if (!j) throw new ToolError("Couldn't ask Google about the video. Try again in a moment.");
      if (j.error) { jobs.delete(String(a.job_id)); throw new ToolError(`Google couldn't make it: ${j.error.message ?? "unknown error"}`); }
      if (!j.done) return `Still being made (${Math.round((Date.now() - job.at) / 1000)}s so far). Check again in half a minute.`;
      const uri = j.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!uri) throw new ToolError("Google finished but sent no video (it may have been blocked by its safety rules).");
      const v = await fetch(uri, { headers: { "x-goog-api-key": job.key }, redirect: "follow", signal: AbortSignal.timeout(120_000) }).catch(() => null);
      if (!v?.ok) throw new ToolError("The video couldn't be downloaded from Google.");
      const att = await keepBytes(Buffer.from(await v.arrayBuffer()), "video/mp4", "Video", ctx);
      const c = courseFor(ctx, job.course, true);
      const { l } = cardFor(c, job.card);
      await saveLesson(ctx, c, { ...l, modules: l.modules.map((x) => (x.id === job.card ? { ...x, attachments: [...(x.attachments ?? []), att] } : x)) }, l);
      jobs.delete(String(a.job_id));
      return `The video is on “${job.title}”. ${link(ctx, c, l.id)}`;
    },
  },

  // ——— Tools on cards ———
  {
    name: "list_tools", title: "List card tools", annotations: { ...ro, title: "List card tools" },
    description: "The tools that can go on cards (the AI tutor, dictionary, Wikipedia, image search…): each one's id, actions, whether it's ready or needs setting up, and who uses it. Put them on cards with add_cards or update_card (tools: [{tool, action}]).",
    inputSchema: obj({}),
    async run(_a, ctx) {
      const aiReady = !!aiOf(ctx.user);
      return allConnectors().map((c) => {
        const d = describe(c, aiReady);
        return `- ${d.name} (tool ${c.id})${d.configured ? "" : " · needs setting up"}: ${clip(d.description, 120)}\n  actions: ${c.actions.map((x) => `${x.id} (“${x.title}”${x.teacherOnly ? ", teacher only" : ""})`).join(", ")}`;
      }).join("\n");
    },
  },
  {
    name: "test_tool", title: "Try a card tool", annotations: { ...ro, openWorldHint: true, title: "Try a card tool" },
    description: "Run a tool on a card the way it will run for students (or as a demo student, to see exactly what they get), and show the result or the error. The AI tutor's actions use the teacher's AI key.",
    inputSchema: obj({ ...COURSE_ID, card_id: { type: "string" }, tool: { type: "string" }, action: { type: "string" }, input: { type: "object", description: "The action's inputs, e.g. {\"question\": \"…\"}" }, as_demo_student: { type: "string", description: "A demo student's id" } }, ["course_id", "card_id", "tool", "action"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id);
      const { l, m } = cardFor(c, a.card_id);
      if (a.as_demo_student) demoOf(c, a.as_demo_student);
      const req = actAs(new Request(`${ctx.origin}/api/connectors/invoke`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId: c.id, lessonId: l.id, moduleId: m.id, connector: a.tool, action: a.action, input: a.input ?? {}, ...(a.as_demo_student ? { studentId: a.as_demo_student } : {}) }) }), ctx.user.id);
      const res = await invokePOST(req);
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || j.ok === false) return `It didn’t work${a.as_demo_student ? " for the demo student" : ""} (${res.status}): ${String(j.error ?? JSON.stringify(j)).slice(0, 400)}`;
      return cap(`It works. The result:\n${JSON.stringify(j.result ?? j, null, 1).slice(0, 6000)}`);
    },
  },
  {
    name: "ai_status", title: "AI status", annotations: { ...ro, title: "AI status" },
    description: "Whether the teacher's own AI key is connected (for AI feedback, the AI tutor and narration): which service, which model, and whether it has credit. The key itself is never shown.",
    inputSchema: obj({}),
    async run(_a, ctx) {
      const ai = ctx.user.ai;
      if (!ai) return "No AI key connected. AI feedback, the AI tutor and narration need one: the teacher adds it in Settings → Tools for cards.";
      const saved = Object.entries(ai.saved ?? {}).map(([p, v]) => `${p}${v?.model ? ` (${v.model})` : ""}: ${v?.status?.state ?? "saved"}${v?.status?.message ? ` — ${v.status.message}` : ""}`);
      return `In use: ${ai.provider}, ${ai.model}.\nSaved keys: ${saved.join("; ") || "—"}`;
    },
  },

  // ——— Testing with demo students ———
  {
    name: "demo_students", title: "Demo students", annotations: { ...add, title: "Demo students" },
    description: "The course's demo students (test students, never real ones): turn them on (Demo Student A and B) or add one with a name. Then act_as_demo, student_view and demo_walkthrough use them.",
    inputSchema: obj({ ...COURSE_ID, add: { type: "string", description: "Add a demo student with this name" } }, ["course_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id, true);
      if (typeof a.add === "string" && a.add.trim()) await op(ctx, c.id, { op: "addDemoStudent", name: a.add.trim() });
      else if (!c.students.some((s) => s.demo)) await op(ctx, c.id, { op: "setDemoStudents", on: true });
      const demos = db().courses[c.id]!.students.filter((s) => s.demo);
      return demos.map((s) => `- ${s.name} (student ${s.id})`).join("\n");
    },
  },
  {
    name: "act_as_demo", title: "Act as a demo student", annotations: { ...add, title: "Act as a demo student" },
    description: "Do a card as a demo student, the way a student would: answer a quiz or poll (pick: the option's index), hand in (text), post to a discussion (text), or finish a card. Shows what happened, including cards their answer dealt.",
    inputSchema: obj({ ...COURSE_ID, student_id: { type: "string" }, card_id: { type: "string" }, pick: { type: "integer", description: "Poll: which option (from 0)" }, wrong: { type: "boolean", description: "Quiz: answer wrong on purpose (to try a low score's path)" }, text: { type: "string", description: "What to hand in or post" }, include_ai: { type: "boolean", description: "Allow handing in a card with AI feedback (uses the teacher's AI key)" } }, ["course_id", "student_id", "card_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id, true);
      const st = demoOf(c, a.student_id);
      const { m } = cardFor(c, a.card_id);
      const before = await asStudent(ctx, c, st.id);
      const seen = new Set(before.course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules.map((x) => x.id))));
      if (!seen.has(m.id)) return `${st.name} doesn't have “${m.title}” on their board (it's dealt by an answer they haven't given, or it's only for some students).`;
      const did = await doCard(ctx, c, st.id, m, { pick: Number.isInteger(a.pick) ? Number(a.pick) : undefined, text: typeof a.text === "string" ? a.text : undefined, ai: a.include_ai === true, wrong: a.wrong === true });
      const after = await asStudent(ctx, c, st.id);
      const fresh = after.course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules)).filter((x) => !seen.has(x.id));
      const p = after.progress?.[st.id]?.[m.id];
      return `${st.name} on “${m.title}”: ${did}. Now: ${p?.status ?? "todo"}${p?.score !== undefined ? `, score ${p.score}` : ""}.${fresh.length ? `\nNew cards dealt to them: ${fresh.map((x) => x.title).join(", ")}` : ""}`;
    },
  },
  {
    name: "student_view", title: "See what a student sees", annotations: { ...ro, title: "See what a student sees" },
    description: "A student's board as they see it: the lessons and cards they have now (dealt cards included only once dealt), and where they are on each.",
    inputSchema: obj({ ...COURSE_ID, student_id: { type: "string" } }, ["course_id", "student_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id);
      if (!c.students.some((s) => s.id === a.student_id)) throw new ToolError("No student with that id.");
      const s = await asStudent(ctx, c, String(a.student_id));
      const prog = s.progress?.[String(a.student_id)] ?? {};
      const out = [`What ${studentName(c, String(a.student_id))} sees:`];
      for (const w of s.course.weeks) {
        out.push(`## ${w.title}`);
        for (const l of w.lessons) {
          out.push(`### ${l.title}${l.date ? ` · ${l.date}` : ""}`);
          for (const m of l.modules) out.push(`- [${cardOut(m).kind}] ${m.title} · ${prog[m.id]?.status ?? "todo"}${m.optional ? " · optional" : ""}${(m as Module & { dealtFor?: boolean }).dealtFor ? " · dealt to them" : ""}`);
        }
      }
      return cap(out.join("\n"));
    },
  },
  {
    name: "check_course", title: "Check a course", annotations: { ...ro, openWorldHint: true, title: "Check a course" },
    description: "Look over a whole course for problems before students meet them. Broken: placeholders left in (“add the link”), video cards with no video, quiz questions without right answers, card trees that point nowhere, meetings without a time or link, AI feedback with no AI key, tools not set up, empty lessons, dates out of order, and (check_links) links and videos that don't open. Weaker: a final project or wrap-up that isn't last, the same question asked twice, titles that say nothing (“Short answer”) or repeat, short answers that accept too much, quizzes that only check terms, and (check_links) videos over 12 minutes with no clip. Run it after every round of changes, and again after moving weeks or lessons.",
    inputSchema: obj({ ...COURSE_ID, check_links: { type: "boolean", description: "Also open every link (slower)" } }, ["course_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id);
      const owner = c.ownerId ? db().users[c.ownerId] : undefined;
      const all = lessonsOf(c);
      const ids = new Set(all.flatMap((x) => x.l.modules.map((m) => m.id)));
      const enabled = new Set(c.enabledConnectors ?? []);
      const found: string[] = [];
      const at = (w: { title: string }, l: { title: string }, m?: Module) => `${w.title} › ${l.title}${m ? ` › “${m.title}” (${m.id})` : ""}`;
      let lastDate = "";
      const links: { where: string; url: string }[] = [];
      for (const { w, l } of all) {
        if (!l.modules.length) found.push(`${at(w, l)}: the lesson has no cards`);
        if (l.date) { if (lastDate && l.date < lastDate) found.push(`${at(w, l)}: its date (${l.date}) comes before the lesson before it (${lastDate})`); lastDate = l.date; }
        for (const m of l.modules) {
          const where = at(w, l, m);
          const k = kindOf(m);
          if (PLACEHOLDER.test(`${m.body ?? ""}`)) found.push(`${where}: placeholder text left in (“${(m.body ?? "").match(PLACEHOLDER)?.[0]}”)`);
          const hasVideo = (m.attachments ?? []).some((x) => x.kind === "video" || (x.kind === "link" && /youtu|vimeo|loom|\.mp4/.test(x.url))) || !!m.playlist?.length;
          if (/^video\b/i.test(m.title) && !hasVideo) found.push(`${where}: a video card with no video on it`);
          for (const q of m.questions ?? []) {
            if (k === "choice" && !m.poll && q.kind !== "order" && (q.kind === "short" ? !q.accept?.length : q.kind === "multi" ? !q.answerSet?.length : q.answer === undefined)) found.push(`${where}: the question “${clip(q.text, 60)}” has no right answer`);
            for (const n of (q.next ?? []).flat()) if (n && !ids.has(n)) found.push(`${where}: an option deals a card that no longer exists`);
          }
          for (const b of m.bands ?? []) if (b.next && !ids.has(b.next)) found.push(`${where}: a score band deals a card that no longer exists`);
          const meet = (m.attachments ?? []).find((x) => x.kind === "link" && meetingOf(x.url));
          if (meet && !m.dueTime) found.push(`${where}: a meeting link with no time set`);
          if (/session|meeting|zoom/i.test(m.title) && !meet && !(m.attachments ?? []).length) found.push(`${where}: looks like a meeting, but has no meeting link`);
          if (m.aiFeedback && !owner?.ai) found.push(`${where}: AI feedback is on, but no AI key is connected (students won't get it)`);
          for (const t of m.tools ?? []) {
            const con = getConnector(t.connector);
            if (!con) found.push(`${where}: a tool that no longer exists (${t.connector})`);
            else if (!describe(con, !!owner?.ai).configured) found.push(`${where}: the ${con.name} tool needs setting up before it works`);
            else if (!enabled.has(t.connector)) found.push(`${where}: the ${con.name} tool isn't turned on for the course (adding it with add_cards or update_card turns it on)`);
          }
          if (k === "content" && !m.body?.trim() && !(m.attachments ?? []).length && !m.playlist?.length) found.push(`${where}: an empty card (no text, link or file)`);
          if (m.wall?.replies && c.students.filter((s) => !s.demo).length && m.wall.replies > c.students.filter((s) => !s.demo).length - 1) found.push(`${where}: asks for ${m.wall.replies} replies, but the class is too small for that`);
          for (const x of m.attachments ?? []) if (x.kind === "link") links.push({ where, url: x.url });
          for (const v of m.playlist ?? []) links.push({ where: `${where} (video “${v.title}”)`, url: v.url });
        }
      }
      // ——— Quality, not just breakage ———
      const lastWeek = c.weeks[c.weeks.length - 1];
      for (const { w, l } of all) {
        if (w === lastWeek) continue;
        const later = c.weeks.slice(c.weeks.indexOf(w) + 1).filter((x) => x.lessons.some((y) => y.modules.length));
        if (!later.length || later.some((x) => CAPSTONE.test(x.title) || x.lessons.some((y) => CAPSTONE.test(y.title) || y.modules.some((z) => CAPSTONE.test(z.title))))) continue;
        const after = `${later.map((x) => x.title).join(", ")} still come${later.length === 1 ? "s" : ""} after it (move it, or the weeks, so it's last)`;
        // A whole wrap-up lesson is one finding; otherwise each final card.
        if (CAPSTONE.test(l.title) || CAPSTONE.test(w.title)) found.push(`${at(w, l)}: the course's last stretch, but ${after}`);
        else for (const m of l.modules) if (CAPSTONE.test(m.title)) found.push(`${at(w, l, m)}: a final piece of the course, but ${after}`);
      }
      const titles = new Map<string, string[]>();
      for (const { w, l } of all) {
        const seenHere = new Map<string, number>();
        for (const m of l.modules) {
          if (GENERIC.test(m.title.trim())) (titles.get(m.title.trim()) ?? titles.set(m.title.trim(), []).get(m.title.trim())!).push(`${w.title}`);
          seenHere.set(m.title.trim().toLowerCase(), (seenHere.get(m.title.trim().toLowerCase()) ?? 0) + 1);
        }
        for (const [t, n] of seenHere) if (n > 1) found.push(`${at(w, l)}: ${n} cards are called “${t}” in this one lesson`);
        // The same question asked twice in a lesson (often after adding one later).
        const qs = l.modules.flatMap((m) => (m.poll ? [] : (m.questions ?? []).map((q) => ({ m, q }))));
        for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) if (sameQuestion(qs[i].q.text, qs[j].q.text)) found.push(`${at(w, l)}: “${clip(qs[i].q.text, 60)}” (in “${qs[i].m.title}”) and “${clip(qs[j].q.text, 60)}” (in “${qs[j].m.title}”) ask the same thing`);
        for (const { m, q } of qs) if (q.kind === "short") {
          const loose = (q.accept ?? []).filter((x) => LOOSE.has(x.trim().toLowerCase()) || (x.trim().length <= 2 && !/^\d+$/.test(x.trim())));
          if (loose.length) found.push(`${at(w, l, m)}: the short answer accepts “${loose.join("”, “")}”, which would count many wrong answers as right`);
        }
        // A quiz (or card group of quiz cards) whose questions all ask for a term: it checks words, not understanding.
        for (const g of l.modules.filter((m) => m.type === "group" || (m.type === "practice" && !m.poll && (m.questions?.length ?? 0) > 1))) {
          const inner = g.type === "group" ? l.modules.filter((x) => g.members?.includes(x.id)) : [g];
          const asked = inner.flatMap((x) => (x.poll ? [] : x.questions ?? []));
          if (asked.length >= 2 && asked.filter((q) => TERM_ONLY.test(q.text) || q.kind === "short").length === asked.length) found.push(`${at(w, l, g)}: every question asks for a term or a fact; add one that has students apply the idea (judge an example, spot the problem, choose what to do)`);
        }
      }
      for (const [t, where] of titles) if (where.length > 1) found.push(`Several cards are called “${t}” (${where.join(", ")}): give each a title that says what it checks or asks`);
      else found.push(`${where[0]}: a card called just “${t}”: a title that says what it's about helps students`);
      if (a.check_links) {
        const results = await Promise.all(links.slice(0, 60).map(async (x) => ({ ...x, bad: await linkOk(x.url) })));
        for (const r of results) if (r.bad) found.push(`${r.where}: the link ${r.url} ${r.bad}`);
        // A long video with no clip: most of a self-paced lesson spent watching.
        const vids = all.flatMap(({ w, l }) => l.modules.flatMap((m) => (m.attachments ?? []).filter((x) => x.kind === "link" && /youtu/.test(x.url) && x.start === undefined && x.end === undefined).map((x) => ({ where: at(w, l, m), url: x.url }))));
        const lens = await Promise.all(vids.slice(0, 30).map(async (v) => ({ ...v, secs: await youtubeSeconds(v.url) })));
        for (const v of lens) if (v.secs && v.secs > 12 * 60) found.push(`${v.where}: the video is ${Math.round(v.secs / 60)} minutes long; clip the part that matters (update_card clip: {start, end}) or say which minutes to watch`);
        if (links.length > 60) found.push(`(Only the first 60 of ${links.length} links were opened.)`);
      }
      if (!found.length) return `No problems found in ${all.length} lessons${a.check_links ? ` (${links.length} links opened)` : ""}.`;
      // The same problem on many cards (a template's placeholders, say) reads as one line with examples.
      const byWhat = new Map<string, string[]>();
      const loose: string[] = [];
      for (const f of found) {
        const m = f.match(/^(.+?\(m-[\w]+\)): (.+)$/);
        if (m) (byWhat.get(m[2]) ?? byWhat.set(m[2], []).get(m[2])!).push(m[1]); else loose.push(f);
      }
      const lines = [...loose];
      for (const [what, where] of byWhat) {
        if (where.length <= 3) lines.push(...where.map((x) => `${x}: ${what}`));
        else lines.push(`${where.length} cards: ${what}. For example ${where.slice(0, 4).map((x) => x.replace(/^.* › /, "")).join("; ")}${where.length > 4 ? "; …" : ""}`);
      }
      return cap(`${found.length} thing${found.length === 1 ? "" : "s"} to look at:\n${lines.map((x) => `- ${x}`).join("\n")}`);
    },
  },
  {
    name: "demo_walkthrough", title: "Walk through as a demo student", annotations: { ...add, title: "Walk through as a demo student" },
    description: "A demo student goes through the course (or some lessons) card by card, as a student would: reads, answers quizzes right, votes in polls (option pick), hands in, posts. It reports what worked, what failed, and which cards their answers dealt. Cards with AI feedback are skipped unless include_ai_cards (they'd use the teacher's AI key). Run it with different picks to try each path of a card tree, and with quiz_answers wrong (another demo student) to try what a low score deals.",
    inputSchema: obj({ ...COURSE_ID, student_id: { type: "string", description: "A demo student (demo_students makes them)" }, lesson_ids: { type: "array", items: { type: "string" } }, pick: { type: "integer", description: "Which option to vote for in polls (from 0; default 0)" }, quiz_answers: { type: "string", enum: ["right", "wrong"], description: "Answer quizzes right (default) or wrong, to try what a low score deals" }, include_ai_cards: { type: "boolean" } }, ["course_id", "student_id"]),
    async run(a, ctx) {
      const c = courseFor(ctx, a.course_id, true);
      const st = demoOf(c, a.student_id);
      const want = Array.isArray(a.lesson_ids) && a.lesson_ids.length ? new Set(a.lesson_ids.map(String)) : null;
      const out: string[] = [];
      let fails = 0, done = 0, already = 0;
      const tried = new Set<string>();
      // A few passes: answers deal new cards, which the next pass picks up.
      for (let pass = 0; pass < 4; pass++) {
        const view = await asStudent(ctx, c, st.id);
        const prog = view.progress?.[st.id] ?? {};
        let any = false;
        for (const w of view.course.weeks) for (const l of w.lessons) {
          if (want && !want.has(l.id)) continue;
          for (const m of l.modules) {
            if (tried.has(m.id)) continue;
            // Done before this walk: on their board, nothing to do.
            if (prog[m.id]?.status === "done") { tried.add(m.id); already++; continue; }
            tried.add(m.id);
            any = true;
            try {
              const did = await doCard(ctx, c, st.id, m, { pick: Number(a.pick) || 0, ai: a.include_ai_cards === true, wrong: a.quiz_answers === "wrong" });
              if (!did.startsWith("skipped") && !did.startsWith("a group")) done++;
              out.push(`✓ ${w.title} › ${m.title}: ${did}${pass ? " (dealt by an earlier answer)" : ""}`);
            } catch (e) {
              fails++;
              out.push(`✗ ${w.title} › ${m.title}: ${e instanceof ToolError ? e.message : "failed"}`);
            }
          }
        }
        if (!any) break;
      }
      const seen = new Set(tried);
      const never = lessonsOf(c).filter((x) => !want || want.has(x.l.id)).flatMap((x) => x.l.modules.filter((m) => !seen.has(m.id) && m.type !== "group").map((m) => m.title));
      return cap(`${st.name} went through ${done} cards${fails ? `, ${fails} failed` : ", none failed"}${already ? ` (${already} they’d already done; use a new demo student for a fresh run)` : ""}.\n${out.join("\n")}${never.length ? `\n\nNot on their board (dealt by other answers, or only for some students): ${never.slice(0, 40).join(", ")}${never.length > 40 ? "…" : ""}` : ""}`);
    },
  },
];
