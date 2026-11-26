import type { Module, Progress } from "./types";
import { SCORE, scoresIn } from "./branching";
import { asked } from "./grading";

/**
 * Quiz cards became card groups (0.2.87). A quiz was several questions with a Submit button, tries, a timer and score
 * ranges; a card group already had questions and score ranges, and now has tries too, so a quiz is one less thing to
 * learn. Each quiz turns into a card group with the quiz's id (so the cards it deals, the cards that deal it, and its
 * score ranges stay as they were) and one Choice card per question, right after it. A student's answers move with their
 * question; a handed-in quiz is a finished group with the same score, and the scores of earlier tries are kept as tries.
 * The timer is gone (a due date is how an async course sets time). Idempotent: there's nothing left to turn the second time.
 */
export function quizzesToGroups(modules: Module[], progress?: Record<string, Record<string, Progress> | undefined>): Module[] {
  if (!modules.some((m) => (m.type as string) === "quiz")) return modules;
  const inGroup = new Set(modules.filter((g) => g.type === "group").flatMap((g) => g.members ?? []));
  const out: Module[] = [];
  for (const quiz of modules) {
    if ((quiz.type as string) !== "quiz") { out.push(quiz); continue; }
    const qs = asked(quiz);
    const { attempts, timeLimit: _t, shuffle: _s, pick: _p, ...rest } = quiz as Module & { timeLimit?: number; shuffle?: boolean; pick?: number };
    // One already in a card group (older courses), or with a single question: one Choice card with its questions.
    if (inGroup.has(quiz.id) || qs.length < 2) {
      out.push({ ...rest, type: "practice", kind: "choice", bands: undefined } as Module);
      for (const byCard of Object.values(progress ?? {})) {
        const p = byCard?.[quiz.id];
        if (!p) continue;
        if (p.status === "done") p.first = { ...p.results };
        delete (p as { startedAt?: number }).startedAt;
      }
      continue;
    }
    const memberId = (i: number) => `${quiz.id}-q${i + 1}`;
    const taken = new Set(modules.map((m) => m.id));
    const ids = qs.map((_, i) => { let id = memberId(i); while (taken.has(id)) id += "x"; taken.add(id); return id; });
    const group: Module = {
      ...rest, type: "group", kind: "group", suit: "question", questions: undefined, members: ids,
      attempts: (attempts ?? 1) > 1 ? attempts : undefined,
    } as Module;
    const cards: Module[] = qs.map((q, i) => ({
      id: ids[i], type: "practice", kind: "choice", suit: "question",
      title: `Question ${i + 1}`, body: "", questions: [q],
      audience: quiz.audience, tools: [], attachments: [], ...(quiz.due ? { due: quiz.due } : {}),
    }) as Module);
    out.push(group, ...cards);
    for (const byCard of Object.values(progress ?? {})) {
      const p = byCard?.[quiz.id];
      if (!byCard || !p) continue;
      qs.forEach((q, i) => {
        const a = p.answers?.[q.id];
        if (a === undefined) return;
        const right = !!p.results?.[q.id];
        byCard[ids[i]] = {
          status: "done", answers: { [q.id]: a }, results: { [q.id]: right }, first: { [q.id]: right }, score: right ? 1 : 0,
          ...(p.dealt?.[q.id] !== undefined ? { dealt: { [q.id]: p.dealt[q.id] } } : {}),
          updatedAt: p.updatedAt,
        } as Progress;
      });
      // The score of this try (handed in), and the scores of earlier ones.
      const all = scoresIn(p.dealt?.[SCORE]);
      const pct = p.status === "done" && qs.length ? Math.round(((p.score ?? 0) * 100) / qs.length) : undefined;
      const earlier = pct === undefined ? all : all.slice(0, Math.max(0, all.lastIndexOf(pct)));
      const bestPct = p.best !== undefined && qs.length ? Math.round((p.best * 100) / qs.length) : undefined;
      if ((p.attempt ?? 1) > 1 && !earlier.length && bestPct !== undefined && bestPct !== pct) earlier.push(bestPct);
      const gp: Progress = { status: p.status === "done" ? "done" : "doing", updatedAt: p.updatedAt } as Progress;
      if ((p.attempt ?? 1) > 1) gp.attempt = p.attempt;
      if (earlier.length) gp.tries = earlier;
      if (pct !== undefined) { gp.dealt = { [SCORE]: pct }; gp.score = p.score; }
      if (p.review) gp.review = p.review;
      byCard[quiz.id] = gp;
    }
  }
  return out;
}

/** Every lesson in these weeks with its quizzes turned into card groups (see quizzesToGroups). */
export function quizWeeks(weeks: { lessons: { modules: Module[] }[] }[], progress?: Record<string, Record<string, Progress> | undefined>) {
  for (const w of weeks) for (const l of w.lessons) l.modules = quizzesToGroups(l.modules, progress);
}
