// Card trees: answers (and quiz scores) deal follow-up cards.
//
// Two kinds of wire, both stored on the card that deals:
//  - an answer: question.next[i] is the card dealt to a student who picks option i;
//  - a score band (quiz cards): module.bands[i] = { min, next }: a student whose score is at least `min` percent, and
//    below the next band's min, gets `next`.
// A card that some wire deals is a follow-up: it stays off every board until a student is dealt it. Targets can be in
// the same lesson or any later lesson of the course. What decides a student's path is fixed the first time: their first
// answer to a question, and their first submitted score on a quiz (progress.dealt), so retakes never take a card away.
import type { AnswerValue, Lesson, Module, Progress, Question, ScoreBand, Week } from "./types";

/** Question kinds that can deal cards: the ones with options a student picks. */
export const canBranch = (q: Question) => !q.kind || q.kind === "choice" || q.kind === "multi";

/** Card types that can't be dealt to some students only: they assume the whole class or group has them. */
export const SHARED_ONLY = new Set(["studio", "wall"]);

/** progress.dealt key that holds a quiz's first submitted score, in percent. */
export const SCORE = "#score";

/** One wire: from an answer or a score band on a card, to the card it deals. */
export interface Wire { from: string; q: string; option: number; to: string; score?: { min: number; max: number } }

type HasModules = { modules: Module[] };

/** Every card in the course, in order, with its lesson. */
export function cardsOf(weeks: { lessons: Lesson[] }[]): { m: Module; lesson: Lesson; at: number }[] {
  const out: { m: Module; lesson: Lesson; at: number }[] = [];
  let at = 0;
  for (const w of weeks) for (const l of w.lessons) { for (const m of l.modules) out.push({ m, lesson: l, at }); at++; }
  return out;
}

/** The bands of a quiz card, lowest first, each with the score range it covers. */
export function bandsOf(m: Module): (ScoreBand & { max: number })[] {
  const b = [...(m.bands ?? [])].sort((x, y) => x.min - y.min);
  return b.map((x, i) => ({ ...x, max: i + 1 < b.length ? b[i + 1].min : 101 }));
}

export function wiresOf(scope: HasModules | Module[]): Wire[] {
  const modules = Array.isArray(scope) ? scope : scope.modules;
  const out: Wire[] = [];
  for (const m of modules) {
    for (const q of m.questions ?? [])
      if (canBranch(q)) (q.next ?? []).forEach((to, option) => { if (to && option < q.options.length) out.push({ from: m.id, q: q.id, option, to }); });
    if (m.type === "quiz") bandsOf(m).forEach((b, option) => { if (b.next) out.push({ from: m.id, q: SCORE, option, to: b.next, score: { min: b.min, max: b.max } }); });
  }
  return out;
}

/** The cards that are dealt by an answer or a score (and so are hidden until then). */
export const followUps = (scope: HasModules | Module[]) => new Set(wiresOf(scope).map((w) => w.to));

const picked = (v: AnswerValue | undefined, w: Wire) =>
  w.score ? typeof v === "number" && v >= w.score.min && v < w.score.max : Array.isArray(v) ? (v as number[]).includes(w.option) : v === w.option;

/**
 * The follow-up cards this student has been dealt. A card counts only once the card that deals it is on their board,
 * so a chain deals one step at a time. Pass every card in the course so wires between lessons count.
 */
export function dealtTo(scope: HasModules | Module[], prog: Record<string, Progress> = {}): Set<string> {
  const modules = Array.isArray(scope) ? scope : scope.modules;
  const wires = wiresOf(modules);
  const hidden = new Set(wires.map((w) => w.to));
  const on = new Set(modules.filter((m) => !hidden.has(m.id)).map((m) => m.id));
  const dealt = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const w of wires) {
      if (dealt.has(w.to) || !on.has(w.from)) continue;
      if (picked(prog[w.from]?.dealt?.[w.q], w)) {
        dealt.add(w.to);
        on.add(w.to);
        grew = true;
      }
    }
  }
  return dealt;
}

/** What a student's board needs to know about the course's card trees: what's hidden, and what they've been dealt. */
export interface TreeView { hidden: Set<string>; dealt: Set<string> }
export function treeView(weeks: { lessons: Lesson[] }[], prog: Record<string, Progress> = {}): TreeView {
  const all = cardsOf(weeks).map((x) => x.m);
  const hidden = followUps(all);
  return { hidden, dealt: hidden.size ? dealtTo(all, prog) : new Set() };
}

/** Whether this question deals any card (so its first answer should be kept). */
export const deals = (q: Question) => canBranch(q) && (q.next ?? []).some(Boolean);
/** Whether this quiz deals cards by score. */
export const dealsByScore = (m: Module) => m.type === "quiz" && (m.bands ?? []).some((b) => b.next);

/**
 * Clean the wiring across a course: a target must be another card in the same or a later lesson, not a class-wide
 * activity, with no loops. Bands are kept in order, on quiz cards only. Anything else is dropped.
 */
export function cleanCourseWiring(weeks: Week[]): void {
  const cards = cardsOf(weeks);
  const where = new Map(cards.map((c) => [c.m.id, c]));
  const ok = (from: { m: Module; at: number }, to: unknown) => {
    const t = typeof to === "string" ? where.get(to) : undefined;
    return t && t.m.id !== from.m.id && !SHARED_ONLY.has(t.m.type) && t.at >= from.at ? t.m.id : null;
  };
  for (const c of cards) {
    const m = c.m;
    for (const q of m.questions ?? []) {
      if (!canBranch(q) || !Array.isArray(q.next)) { delete q.next; continue; }
      q.next = q.next.slice(0, q.options.length).map((to) => ok(c, to));
      if (!q.next.some(Boolean)) delete q.next;
    }
    if (m.type !== "quiz" || !Array.isArray(m.bands)) { delete m.bands; continue; }
    const seen = new Set<number>();
    const bands = m.bands
      .map((b) => ({ min: Math.max(0, Math.min(100, Math.round(Number(b?.min) || 0))), next: ok(c, b?.next) }))
      .sort((a, b) => a.min - b.min)
      .filter((b) => (seen.has(b.min) ? false : (seen.add(b.min), true)))
      .slice(0, 5);
    if (bands.length) bands[0].min = 0;
    if (bands.length < 2 && !bands.some((b) => b.next)) delete m.bands;
    else m.bands = bands;
  }
  // Break loops: walk the wires from each card; a wire that leads back to a card on the current path is cut.
  const all = cards.map((c) => c.m);
  const byId = new Map(all.map((m) => [m.id, m]));
  const state = new Map<string, 1 | 2>();
  const cut = (w: Wire) => {
    const m = byId.get(w.from)!;
    if (w.q === SCORE) { const b = [...(m.bands ?? [])].sort((x, y) => x.min - y.min)[w.option]; if (b) b.next = null; }
    else { const q = m.questions?.find((x) => x.id === w.q); if (q?.next) q.next[w.option] = null; }
  };
  const visit = (id: string) => {
    state.set(id, 1);
    for (const w of wiresOf(all).filter((x) => x.from === id)) {
      const s = state.get(w.to);
      if (s === 1) cut(w);
      else if (!s) visit(w.to);
    }
    state.set(id, 2);
  };
  for (const m of all) if (!state.has(m.id)) visit(m.id);
  for (const m of all) for (const q of m.questions ?? []) if (q.next && !q.next.some(Boolean)) delete q.next;
}

/** Remove a card from the wiring of a lesson (it was deleted). */
export function unwire(lesson: Lesson, ids: Set<string> | string): Lesson {
  const gone = typeof ids === "string" ? new Set([ids]) : ids;
  const touches = (m: Module) => m.questions?.some((q) => q.next?.some((x) => x && gone.has(x))) || m.bands?.some((b) => b.next && gone.has(b.next));
  if (!lesson.modules.some(touches)) return lesson;
  return {
    ...lesson,
    modules: lesson.modules.map((m) => !touches(m) ? m : {
      ...m,
      questions: m.questions?.map((q) => (q.next?.some((x) => x && gone.has(x)) ? { ...q, next: q.next.map((x) => (x && gone.has(x) ? null : x)) } : q)),
      bands: m.bands?.map((b) => (b.next && gone.has(b.next) ? { ...b, next: null } : b)),
    }),
  };
}

/** The follow-ups a card deals, and theirs, that nothing else deals: what goes with it if it's deleted. */
export function branchBelow(scope: HasModules | Module[], id: string): string[] {
  const wires = wiresOf(scope);
  const out = new Set<string>();
  const going = (x: string) => x === id || out.has(x);
  for (let grew = true; grew; ) {
    grew = false;
    for (const w of wires) {
      if (out.has(w.to) || w.to === id || !going(w.from)) continue;
      if (wires.filter((x) => x.to === w.to).every((x) => going(x.from))) { out.add(w.to); grew = true; }
    }
  }
  return [...out];
}

/** Default score bands for a quiz: below 60%, 60–89%, 90% and up. */
export const DEFAULT_BANDS: ScoreBand[] = [{ min: 0, next: null }, { min: 60, next: null }, { min: 90, next: null }];

/** "0–59%", "60–89%", "90–100%". */
export const bandLabel = (b: { min: number; max: number }) => (b.max > 100 ? `${b.min}–100%` : `${b.min}–${b.max - 1}%`);
