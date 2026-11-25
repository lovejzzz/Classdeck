// Settings older cards may still carry, and folding them into what cards are now.
import type { Attachment, Module } from "./types";

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
