// The card skeleton: what a card is (title), what to do (instructions and media), what comes back, and who sees it.
// The stored `type` stays the source of truth; these helpers read it as the two questions the teacher answers,
// and pick a type back from their answers.
import type { Attachment, Module, ModuleType } from "./types";

/** What the student hands back. */
export type Response = "none" | "answer" | "questions" | "rating";
/** Who sees what comes back. */
export type ShareWith = "teacher" | "group" | "class";

export const RESPONSES: { id: Response; name: string; hint: string; icon: string }[] = [
  { id: "none", name: "Nothing", hint: "Just read, watch or listen", icon: "read" },
  { id: "answer", name: "An answer", hint: "Students write, record or upload", icon: "practice" },
  { id: "questions", name: "Questions", hint: "Checked automatically, 3 tries", icon: "quiz" },
  { id: "rating", name: "A self-rating", hint: "On the course’s skills", icon: "selfcheck" },
];

export const SHARES: { id: ShareWith; name: string; hint: string; icon: string }[] = [
  { id: "teacher", name: "Teacher", hint: "The teacher gives feedback", icon: "user" },
  { id: "group", name: "Their group", hint: "Classmates give feedback", icon: "users" },
  { id: "class", name: "The class", hint: "A wall everyone sees", icon: "wall" },
];

export function responseOf(m: Pick<Module, "type" | "questions">): Response {
  switch (m.type) {
    case "read":
    case "explore":
      return m.questions?.some((q) => q.text?.trim() || q.options?.some((o) => o.trim())) ? "questions" : "none";
    case "quiz":
      return "questions";
    case "selfcheck":
      return "rating";
    default:
      return "answer";
  }
}

export function shareOf(m: Pick<Module, "type" | "submitTo">): ShareWith {
  if (m.type === "studio" || (m.type === "practice" && m.submitTo === "studio")) return "group";
  if (m.type === "wall") return "class";
  return "teacher";
}

/**
 * The stored type for a teacher's answers. If the card already reads that way, it keeps its type, so a Watch,
 * Hand in, Reflect or Builder card that is opened and closed stays exactly what it was.
 */
export function typeFor(response: Response, share: ShareWith, current: Module): ModuleType {
  if (responseOf(current) === response && shareOf(current) === (response === "answer" ? share : "teacher")) return current.type;
  if (response === "none") return current.type === "explore" ? "explore" : "read";
  if (response === "questions") return "quiz";
  if (response === "rating") return "selfcheck";
  return share === "group" ? "studio" : share === "class" ? "wall" : current.type === "submit" || current.type === "reflect" || current.type === "builder" ? current.type : "practice";
}

/** The rest of a card when the teacher changes what comes back or who sees it. */
export function withAnswers(m: Module, response: Response, share: ShareWith): Partial<Module> {
  const type = typeFor(response, share, m);
  const patch: Partial<Module> = { type };
  if (response === "none") patch.questions = undefined;
  if (response === "questions") {
    if (!m.questions?.length) patch.questions = [{ id: `q-${Math.random().toString(36).slice(2, 9)}`, text: "", options: ["", ""], answer: 0 }];
    if (type === "quiz" && m.type !== "quiz") patch.attempts = 3;
  }
  if (type !== "quiz" && m.type === "quiz") { patch.attempts = undefined; patch.timeLimit = undefined; patch.shuffle = undefined; patch.pick = undefined; }
  // A practice card handed in to the group keeps that; any other answer goes to the teacher.
  if (response === "answer" && share === "teacher" && m.submitTo === "studio") patch.submitTo = undefined;
  return patch;
}

/** Settings a card may still carry from before the simplification, which still apply to students. */
export function olderSettings(m: Module): string[] {
  const out: string[] = [];
  if (m.type === "quiz") {
    if (m.attempts && m.attempts !== 3) out.push(m.attempts === 1 ? "1 try" : `${m.attempts} tries`);
    if (m.timeLimit) out.push(`${m.timeLimit}-minute limit`);
    if (m.shuffle) out.push("shuffled");
    if (m.pick) out.push(`${m.pick} questions drawn at random`);
  }
  if (m.type === "wall" && m.wall) {
    if (m.wall.approval) out.push("posts approved first");
    if (m.wall.anonymous) out.push("names hidden");
    if (m.wall.posting === "teacher") out.push("only you post");
    if (m.wall.sections?.length) out.push(`${m.wall.sections.length} columns`);
  }
  return out;
}

/** Clear those older settings back to the defaults. */
export function clearOlder(m: Module): Partial<Module> {
  return m.type === "quiz" ? { attempts: 3, timeLimit: undefined, shuffle: undefined, pick: undefined } : m.type === "wall" ? { wall: undefined } : {};
}

/**
 * Fold settings that were merged away into the parts that remain: a video list becomes media, steps and guided
 * prompts become numbered lines in the instructions, and "Done when" becomes the instructions' last line.
 * Idempotent: a folded card comes back unchanged. Returns the same object when there is nothing to fold.
 */
export function fold<M extends Omit<Module, "id">>(m: M): M {
  const has = (x: unknown[] | undefined) => !!x && x.length > 0;
  if (!has(m.playlist) && !has(m.checklist) && !has(m.prompts) && !m.criteria?.trim() && m.playlist === undefined && m.checklist === undefined && m.prompts === undefined && m.criteria === undefined) return m;
  const parts = [m.body?.trim() ?? ""];
  const list = (items: string[] | undefined) => (items ?? []).map((x) => x.trim()).filter(Boolean).map((x, i) => `${i + 1}. ${x}`).join("\n");
  const steps = list(m.checklist);
  if (steps) parts.push(`Steps:\n${steps}`);
  const prompts = list(m.prompts);
  if (prompts) parts.push(`Answer these:\n${prompts}`);
  if (m.criteria?.trim()) parts.push(`Done when: ${m.criteria.trim()}`);
  const media: Attachment[] = [...(m.attachments ?? [])];
  for (const v of m.playlist ?? []) {
    if (!v.url || media.some((a) => a.url === v.url)) continue;
    media.push({ id: `a-${v.id}`, kind: "link", url: v.url, name: v.title });
  }
  const out = { ...m, body: parts.filter(Boolean).join("\n\n"), attachments: media };
  delete out.playlist;
  delete out.checklist;
  delete out.prompts;
  delete out.criteria;
  return out;
}

/** Fold every card in a list of weeks, in place. Returns how many cards changed. */
export function foldWeeks(weeks: { lessons: { modules: Module[] }[] }[]): number {
  let n = 0;
  for (const w of weeks) for (const l of w.lessons) l.modules = l.modules.map((m) => { const f = fold(m); if (f !== m) n++; return f; });
  return n;
}
