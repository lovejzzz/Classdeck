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
import { isAsked } from "./grading";

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

/** Cards that can branch by score: a quiz, and a card group (its Multiple choice cards' score). */
export const scored = (m: Pick<Module, "type">) => m.type === "quiz" || m.type === "group";

export function wiresOf(scope: HasModules | Module[]): Wire[] {
  const modules = Array.isArray(scope) ? scope : scope.modules;
  const out: Wire[] = [];
  for (const m of modules) {
    for (const q of m.questions ?? [])
      if (canBranch(q)) (q.next ?? []).forEach((to, option) => { if (to && option < q.options.length) out.push({ from: m.id, q: q.id, option, to }); });
    if (scored(m)) bandsOf(m).forEach((b, option) => { if (b.next) out.push({ from: m.id, q: SCORE, option, to: b.next, score: { min: b.min, max: b.max } }); });
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
  // A card in a group is on the board when its group is.
  const groupOf = new Map<string, string>();
  for (const m of modules) if (m.type === "group") for (const id of m.members ?? []) groupOf.set(id, m.id);
  const onAtStart = (m: Module) => !hidden.has(m.id) && !(groupOf.has(m.id) && hidden.has(groupOf.get(m.id)!));
  const on = new Set(modules.filter(onAtStart).map((m) => m.id));
  const dealt = new Set<string>();
  const byId = new Map(modules.map((m) => [m.id, m]));
  for (let grew = true; grew; ) {
    grew = false;
    for (const w of wires) {
      if (dealt.has(w.to) || !on.has(w.from)) continue;
      if (picked(prog[w.from]?.dealt?.[w.q], w)) {
        dealt.add(w.to);
        on.add(w.to);
        for (const id of byId.get(w.to)?.members ?? []) on.add(id);
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
  if (!hidden.size) return { hidden, dealt: new Set() };
  const dealt = dealtTo(all, prog);
  // A card a student already started or finished stays on their board, even if the teacher later wires an answer to
  // it (it was for everyone when they opened it). Taking it away would lose their work from view.
  for (const id of hidden) if (prog[id] && prog[id].status !== "todo") dealt.add(id);
  return { hidden, dealt };
}

/** Whether this question deals any card (so its first answer should be kept). */
export const deals = (q: Question) => canBranch(q) && (q.next ?? []).some(Boolean);
/** Whether this quiz deals cards by score. */
export const dealsByScore = (m: Module) => scored(m) && (m.bands ?? []).some((b) => b.next);

/**
 * Clean the wiring across a course: a target must be another card in the same or a later lesson, not a class-wide
 * activity, with no loops. Bands are kept in order, on quiz cards only. Anything else is dropped.
 */
export function cleanCourseWiring(weeks: Week[]): void {
  cleanGroups(weeks);
  const cards = cardsOf(weeks);
  const inGroup = new Set(cards.flatMap((c) => (c.m.type === "group" ? c.m.members ?? [] : [])));
  const where = new Map(cards.map((c) => [c.m.id, c]));
  const ok = (from: { m: Module; at: number }, to: unknown) => {
    const t = typeof to === "string" ? where.get(to) : undefined;
    // Not a card inside a group (deal the group instead), not a class-wide activity, never backwards.
    return t && t.m.id !== from.m.id && !SHARED_ONLY.has(t.m.type) && !inGroup.has(t.m.id) && t.at >= from.at ? t.m.id : null;
  };
  for (const c of cards) {
    const m = c.m;
    for (const q of m.questions ?? []) {
      if (!canBranch(q) || !Array.isArray(q.next)) { delete q.next; continue; }
      q.next = q.next.slice(0, q.options.length).map((to) => ok(c, to));
      if (!q.next.some(Boolean)) delete q.next;
    }
    if (!scored(m) || !Array.isArray(m.bands)) { delete m.bands; continue; }
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
export const bandLabel = (b: { min: number; max: number }) => (b.max > 100 ? (b.min >= 100 ? "100%" : `${b.min}–100%`) : b.min === b.max - 1 ? `${b.min}%` : `${b.min}–${b.max - 1}%`);

/** How many questions count towards a score: a group's Choice cards with a right answer and words; a quiz's questions. */
export function scoreCount(m: Module, cards: Module[]): number {
  const asked = (c: Module) => (c.questions ?? []).filter(isAsked).length;
  if (m.type === "quiz") return m.pick && m.pick > 0 ? Math.min(m.pick, asked(m)) : asked(m);
  if (m.type !== "group") return 0;
  return (m.members ?? []).map((id) => cards.find((c) => c.id === id)).filter((c): c is Module => !!c && !c.poll && (c.type === "practice" || c.type === "quiz")).reduce((n, c) => n + asked(c), 0);
}

/** The scores a student can get with n questions, as a percent rounded the way scores are (2 of 3 is 67%). */
const reachable = (n: number) => Array.from({ length: n + 1 }, (_, k) => Math.round((k * 100) / n));

/** The questions right that a score range covers out of n: "3 of 4 right", "2–3 of 4 right", or null if no score lands in it. */
export function bandRight(b: { min: number; max: number }, n: number): string | null {
  if (n <= 0) return "";
  const ks = reachable(n).map((v, k) => [v, k] as const).filter(([v]) => v >= b.min && v < b.max).map(([, k]) => k);
  if (!ks.length) return null;
  const lo = ks[0], hi = ks[ks.length - 1];
  return `${lo === hi ? lo : `${lo}–${hi}`} of ${n} right`;
}

/**
 * Score ranges moved onto scores that can happen with n questions (each range starts at the lowest score a student can
 * really get in it), so a group that gains or loses a question keeps ranges that mean something. Ranges that end up
 * starting at the same score are merged, keeping the first card one of them deals.
 */
export function snapBands(bands: ScoreBand[], n: number): ScoreBand[] {
  if (n <= 0 || !bands.length) return bands;
  const out: ScoreBand[] = [];
  for (const b of [...bands].sort((x, y) => x.min - y.min)) {
    const min = b.min <= 0 ? 0 : (reachable(n).find((v) => v >= b.min) ?? 100);
    const same = out.find((x) => x.min === min);
    if (same) same.next ??= b.next;
    else out.push({ min, next: b.next });
  }
  return out;
}

/**
 * Delete a card from a course, with the follow-ups only it deals (wherever they are; left behind they'd go to
 * everyone), and unhook every wire that pointed at them. Returns just the lessons that change, as they were and as
 * they become, so the caller can save the new ones and keep the old ones for Undo.
 */
export function deleteCardIn(lessons: Lesson[], id: string): { before: Lesson[]; after: Lesson[]; gone: Set<string> } {
  const all = lessons.flatMap((l) => l.modules);
  const gone = new Set([id, ...branchBelow(all, id)]);
  // A card group goes with its cards (and theirs).
  for (const g of all.filter((m) => gone.has(m.id) && m.type === "group")) for (const x of g.members ?? []) { gone.add(x); branchBelow(all, x).forEach((y) => gone.add(y)); }
  const before: Lesson[] = [];
  const after: Lesson[] = [];
  for (const l of lessons) {
    if (!l.modules.some((m) => gone.has(m.id) || (m.type === "group" && m.members?.some((x) => gone.has(x)))) && !wiresOf(l).some((w) => gone.has(w.to))) continue;
    before.push(l);
    // Gone from any group that held it, too.
    const kept = l.modules.filter((m) => !gone.has(m.id)).map((m) => (m.type === "group" && m.members?.some((x) => gone.has(x)) ? { ...m, members: m.members.filter((x) => !gone.has(x)) } : m));
    after.push(unwire({ ...l, modules: kept }, gone));
  }
  return { before, after, gone };
}

/**
 * Follow-ups whose every source card was deleted in this save (not just unhooked): left alone they'd go to everyone.
 * `before` and `after` are the course's cards before and after the save. Returns the cards to remove, chains included.
 */
export function orphansOf(before: Module[], after: Module[]): Set<string> {
  const now = new Set(after.map((m) => m.id));
  const removed = new Set(before.map((m) => m.id).filter((id) => !now.has(id)));
  if (!removed.size) return new Set();
  const was = wiresOf(before);
  const is = wiresOf(after);
  const out = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of now) {
      if (out.has(id)) continue;
      // Still dealt by a card that stays → not an orphan.
      if (is.some((w) => w.to === id && !out.has(w.from))) continue;
      const sources = was.filter((w) => w.to === id).map((w) => w.from);
      if (sources.length && sources.every((s) => removed.has(s) || out.has(s))) { out.add(id); grew = true; }
    }
  }
  return out;
}

/**
 * The branches out of each card a student can see, for their map: where a dealt branch went and why, and a card back
 * for each one not dealt (with its title and condition only if the teacher opened that lesson's paths).
 */
export function pathsFor(weeks: { lessons: Lesson[] }[], prog: Record<string, Progress>, view: TreeView, visible: Set<string>):
  Map<string, { to?: string; title?: string; type?: Module["type"]; why?: string }[]> {
  const cards = cardsOf(weeks);
  const byId = new Map(cards.map((c) => [c.m.id, c]));
  const out = new Map<string, { to?: string; title?: string; type?: Module["type"]; why?: string }[]>();
  for (const w of wiresOf(cards.map((c) => c.m))) {
    if (!visible.has(w.from)) continue;
    const src = byId.get(w.from)!, dst = byId.get(w.to);
    if (!dst) continue;
    const cond = w.score ? `Score ${bandLabel(w.score)}` : `“${src.m.questions?.find((q) => q.id === w.q)?.options[w.option]?.trim() || String.fromCharCode(65 + w.option)}”`;
    const list = out.get(w.from) ?? out.set(w.from, []).get(w.from)!;
    const mine = picked(prog[w.from]?.dealt?.[w.q], w) && view.dealt.has(w.to) && visible.has(w.to);
    if (mine) { if (!list.some((x) => x.to === w.to)) list.push({ to: w.to, why: w.score ? cond : `You chose ${cond}` }); continue; }
    if (list.some((x) => x.to === w.to)) continue;
    list.push(src.lesson.openPaths ? { title: dst.m.title, type: dst.m.type, why: w.score ? cond : `If you choose ${cond}` } : {});
  }
  return out;
}

/**
 * Keep card groups sound: members are other cards of the same lesson, each in one group only, never a group; the
 * members sit right after their group, in its order; a group left with fewer than two cards is dissolved.
 */
export function cleanGroups(weeks: { lessons: Lesson[] }[]): void {
  for (const w of weeks)
    for (const l of w.lessons) {
      const byId = new Map(l.modules.map((m) => [m.id, m]));
      const taken = new Set<string>();
      for (const g of l.modules.filter((m) => m.type === "group")) {
        g.members = [...new Set(g.members ?? [])].filter((id) => { const m = byId.get(id); return m && m.type !== "group" && !taken.has(id); });
        g.members.forEach((id) => taken.add(id));
        // Its score ranges follow how many questions it now has.
        if (g.bands?.length) g.bands = snapBands(g.bands, scoreCount(g, l.modules));
      }
      const gone = new Set(l.modules.filter((m) => m.type === "group" && (m.members?.length ?? 0) < 2).map((m) => m.id));
      const mods = l.modules.filter((m) => !gone.has(m.id));
      const members = new Set(mods.flatMap((m) => (m.type === "group" ? m.members! : [])));
      const out: Module[] = [];
      for (const m of mods) {
        if (members.has(m.id)) continue;
        out.push(m);
        if (m.type === "group") for (const id of m.members!) out.push(byId.get(id)!);
      }
      l.modules = out;
    }
}

/** A card group's score so far, from the first answers to its Multiple choice cards: done once all are answered. */
export function groupScore(group: Module, cards: Module[], prog: Record<string, Progress>): { done: boolean; right: number; total: number; pct?: number } {
  let right = 0, total = 0, done = true;
  for (const id of group.members ?? []) {
    const m = cards.find((c) => c.id === id);
    if (!m || m.poll || !(m.type === "practice" || m.type === "quiz")) continue;
    for (const q of (m.questions ?? []).filter(isAsked)) {
      total++;
      const f = prog[m.id]?.first?.[q.id];
      if (f === undefined) done = false;
      else if (f) right++;
    }
  }
  return { done: done && total > 0, right, total, pct: done && total ? Math.round((right * 100) / total) : undefined };
}
