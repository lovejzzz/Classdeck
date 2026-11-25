import type { Lesson, Module } from "./types";

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
