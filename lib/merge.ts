import type { AnswerValue, Lesson, Module, Progress } from "./types";
import { groupScore, groupsAbove, parentOf, SCORE } from "./branching";
import { isCorrect } from "./grading";

/**
 * Two tabs (or two teachers) editing the same lesson. A lesson is saved whole, so a page showing an older copy used
 * to put that older copy back over changes made elsewhere. Now the page also sends what each card looked like when it
 * started editing (a short fingerprint of each), and only what it changed is taken: a card it didn't touch keeps the
 * newer version, a card added elsewhere stays, a card it deleted goes.
 */

/** A short fingerprint of a value (FNV-1a over its JSON). The same on the page and on the server. */
export function fingerprint(v: unknown): string {
  const s = JSON.stringify(v) ?? "";
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** What a page started from: the lesson's own settings and each card, as fingerprints. */
export type LessonBase = { fields: string; cards: Record<string, string> };

const fieldsOf = (l: Lesson) => { const { modules: _m, ...rest } = l; return rest; };

export function baseOf(l: Lesson): LessonBase {
  return { fields: fingerprint(fieldsOf(l)), cards: Object.fromEntries(l.modules.map((m) => [m.id, fingerprint(m)])) };
}

/** The lesson to keep: `mine` (from the page) laid over `now` (the server's), given what the page started from. */
export function mergeLesson(now: Lesson, mine: Lesson, base: LessonBase | undefined): Lesson {
  if (!base || typeof base !== "object" || !base.cards || typeof base.cards !== "object") return mine;
  const nowById = new Map(now.modules.map((m) => [m.id, m]));
  const mineIds = new Set(mine.modules.map((m) => m.id));
  const modules: Module[] = [];
  for (const m of mine.modules) {
    const was = base.cards[m.id];
    const theirs = nowById.get(m.id);
    // Unchanged here and changed elsewhere: the newer one. Deleted elsewhere and untouched here: stays deleted.
    if (was !== undefined && fingerprint(m) === was) {
      if (theirs) modules.push(theirs);
      continue;
    }
    modules.push(m);
  }
  // Cards added elsewhere since this page started (not in its base): kept, after the card they followed.
  now.modules.forEach((m, i) => {
    if (mineIds.has(m.id) || base.cards[m.id] !== undefined) return;
    const prev = now.modules.slice(0, i).reverse().find((x) => modules.some((y) => y.id === x.id));
    const at = prev ? modules.findIndex((y) => y.id === prev.id) + 1 : 0;
    modules.splice(at, 0, m);
  });
  const fields = fingerprint(fieldsOf(mine)) === base.fields ? fieldsOf(now) : fieldsOf(mine);
  return { ...fields, id: mine.id, modules } as Lesson;
}

/**
 * Where each old option went when a teacher changed a question's options: by its words if they're still there, else by
 * its place (an option reworded in place), else -1 (removed). null when nothing moved. The same rule sign-up groups use.
 */
export function optionMap(before: string[], after: string[]): number[] | null {
  const key = (s: string) => s.trim();
  const taken = new Set<number>();
  const map = before.map((o) => {
    const j = after.findIndex((x, k) => !taken.has(k) && key(x) === key(o));
    if (j >= 0) taken.add(j);
    return j;
  });
  map.forEach((j, i) => {
    if (j >= 0) return;
    // Reworded where it stood: its place is free and its new words weren't an old option.
    if (i < after.length && !taken.has(i) && !before.some((o) => key(o) === key(after[i]))) { map[i] = i; taken.add(i); }
  });
  return map.every((j, i) => j === i) && before.length === after.length ? null : map;
}

type Prog = Progress;

/**
 * A student's answers are kept by the option's place. When a teacher removes or rewords options after students have
 * answered, each kept answer (and the answer that deals their follow-ups) moves with its option, so a student who
 * chose "The clergy" still has "The clergy", and keeps the cards it dealt. An answer whose option was removed is
 * dropped: they can answer again. When the right answer itself changes (a mistake in the key fixed), each student's
 * first answer is marked again, and the score of a card group it's in follows.
 */
export function moveAnswers(before: Module[], after: Module[], progress: Record<string, Record<string, Prog>> | undefined) {
  if (!progress) return;
  const was = new Map(before.map((m) => [m.id, m]));
  for (const m of after) {
    const old = was.get(m.id);
    if (!old?.questions || !m.questions) continue;
    for (const q of m.questions) {
      const oq = old.questions.find((x) => x.id === q.id);
      if (!oq || (q.kind && q.kind !== "choice" && q.kind !== "multi")) continue;
      const map = optionMap(oq.options ?? [], q.options ?? []);
      if (!map) continue;
      const move = (v: unknown): unknown =>
        Array.isArray(v) ? v.map((x) => (typeof x === "number" ? map[x] ?? -1 : -1)).filter((x) => x >= 0)
        : typeof v === "number" ? map[v] ?? -1 : v;
      for (const byCard of Object.values(progress)) {
        const p = byCard?.[m.id];
        if (!p) continue;
        for (const k of ["answers", "dealt"] as const) {
          const box = p[k] as Record<string, unknown> | undefined;
          if (!box || !(q.id in box)) continue;
          const v = move(box[q.id]);
          if (v === -1 || (Array.isArray(v) && Array.isArray(box[q.id]) && (box[q.id] as unknown[]).length > 0 && v.length === 0)) delete box[q.id];
          else box[q.id] = v;
        }
      }
    }
  }
  // The right answer changed: mark each student's first answer again (kept under dealt), and redo group scores.
  const keyOf = (q: NonNullable<Module["questions"]>[number]) => JSON.stringify([q.options, q.answer, q.answerSet, q.kind]);
  const marked = after.filter((m) => {
    const old = was.get(m.id);
    return !m.poll && !!m.questions?.some((q) => { const oq = old?.questions?.find((x) => x.id === q.id); return !!oq && keyOf(oq) !== keyOf(q); });
  });
  if (!marked.length) return;
  const parents = parentOf(after);
  for (const byCard of Object.values(progress)) {
    if (!byCard) continue;
    let touched = false;
    for (const m of marked) {
      const p = byCard[m.id];
      for (const q of m.questions ?? []) {
        const given = p?.dealt?.[q.id] as AnswerValue | undefined;
        if (!p?.first || p.first[q.id] === undefined || given === undefined) continue;
        const right = isCorrect(q, given);
        if (p.first[q.id] !== right) { p.first[q.id] = right; touched = true; }
      }
    }
    if (!touched) continue;
    for (const gid of new Set(marked.flatMap((m) => groupsAbove(m.id, parents)))) {
      const group = after.find((g) => g.id === gid);
      const gp = byCard[gid];
      if (!group || !gp?.dealt || typeof gp.dealt[SCORE] !== "number") continue;
      const sc = groupScore(group, after, byCard as Record<string, Progress>);
      if (sc.done && sc.pct !== undefined) gp.dealt[SCORE] = sc.pct;
    }
  }
}
