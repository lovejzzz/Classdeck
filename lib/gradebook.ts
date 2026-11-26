// The grades: per student over the whole course (used by the Students tab's student view, and its CSV export).
import { download, toCsv } from "./download";
import { isFinished, isLate } from "./grading";
import { visibleModules } from "./profile";
import type { CourseState, Module } from "./types";
import { averaged, countedOf, groupScore, leavesOf, parentOf, treeView, triesFor } from "./branching";
import { awaitingFeedback, reviewableCard } from "./kinds";

/** Per student over the whole course: cards done, late, card-group scores, reviews given, work waiting, skill levels. */
export function gradeRows(state: CourseState, now: number) {
  const { course, progress } = state;
  const all = course.weeks.flatMap((w) => w.lessons.map((l) => ({ w, l })));
  return course.students.map((st) => {
    const mine = progress[st.id] ?? {};
    const tree = treeView(course.weeks, mine);
    const cards: { m: Module; week: string; lessonId: string }[] = [];
    for (const { w, l } of all) {
      const seen = new Set<string>();
      for (const m of visibleModules(l, st.id, state.choices[st.id], tree, course)) {
        if (m.choice) {
          if (seen.has(m.choice.slot)) continue;
          seen.add(m.choice.slot);
        }
        cards.push({ m, week: w.title, lessonId: l.id });
      }
    }
    // Optional cards don't count toward finishing (or the certificate).
    const counted = cards.filter(({ m }) => !m.optional);
    const done = counted.filter(({ m }) => isFinished(m, mine[m.id])).length;
    const late = counted.filter(({ m }) => isLate(m, mine[m.id], now)).length;
    // A card group of questions counts once all its questions are answered, by its best try (a group with tries
    // counts while the student is on another try too).
    const shown = new Set(cards.map(({ m }) => m.id));
    // A group inside a group is listed under it, but only the outer group counts in the average: its score already holds those answers.
    const groups = all.flatMap(({ w, l }) => {
      const up = parentOf(l.modules);
      return l.modules.filter((g) => g.type === "group" && leavesOf(g, l.modules).some((c) => shown.has(c.id))).map((g) => ({ g, week: w.title, s: groupScore(g, l.modules, mine), inside: l.modules.find((x) => x.id === up.get(g.id))?.title }));
    }).filter((x) => x.s.done || !!mine[x.g.id]?.tries?.length);
    // Each score, to list under the student: the card group, its week, right of total (its best try), and tries used.
    const scored = groups.map(({ g, week, s: x, inside }) => {
      const c = countedOf(mine[g.id], g);
      const best = averaged(g) ? c ?? x.pct ?? 0 : Math.max(x.pct ?? 0, c ?? 0);
      return { id: g.id, title: g.title, week, right: Math.round((best * x.total) / 100), total: Math.max(1, x.total), tries: triesFor(g) > 1 ? Math.min(mine[g.id]?.attempt ?? 1, triesFor(g)) : undefined, inside };
    });
    const scores = scored.filter((x) => !("inside" in x && x.inside)).map((x) => x.right / x.total);
    const quizPct = scores.length ? scores.reduce((t, x) => t + x, 0) / scores.length : undefined;
    const reviews = cards.filter(({ m }) => mine[m.id]?.review).map(({ m, week }) => ({ m, week, r: mine[m.id].review! })).sort((a, b) => b.r.at - a.r.at);
    const toReview = cards.filter(({ m }) => reviewableCard(m) && awaitingFeedback(mine[m.id]));
    const waiting = toReview.length;
    // Latest teacher level per skill, and the student's latest self-rating.
    // Teacher levels come from reviews and from forms (the teacher's card forms), latest wins.
    const teacher: Record<string, number> = {};
    const given = cards.flatMap(({ m }) => [
      ...(mine[m.id]?.review?.levels ? [{ at: mine[m.id].review!.at, levels: mine[m.id].review!.levels! }] : []),
      ...(mine[m.id]?.updates ?? []).filter((u) => u.levels).map((u) => ({ at: u.at, levels: u.levels! })),
    ]).sort((a, b) => a.at - b.at);
    for (const g of given) Object.assign(teacher, g.levels);
    const self: Record<string, number> = {};
    // Self-ratings from any card (a rating poll, a form), latest wins: the same picture the student's own suggestions use.
    const rated = cards.filter(({ m }) => mine[m.id]?.ratings).sort((a, b) => mine[a.m.id].updatedAt - mine[b.m.id].updatedAt);
    for (const { m } of rated) Object.assign(self, mine[m.id].ratings);
    return { st, total: counted.length, done, late, quizPct, scored, reviews, waiting, toReview, teacher, self };
  });
}
export type GradeRow = ReturnType<typeof gradeRows>[number];

/** The grades as a CSV file (demo students left out). */
export function exportGrades(state: CourseState, rows: GradeRow[]) {
  const { course } = state;
  const skills = course.skills ?? [];
  const head = ["Student", "Group", "Cards done", "Cards total", "Late", "Quiz average %", ...skills.flatMap((s) => [`${s.name} (teacher)`, `${s.name} (self)`]), "Reviews given"];
  const group = (id: string) => course.groups?.find((g) => g.studentIds.includes(id))?.name ?? "";
  // The demo students are the teacher's own tests: not in the exported grades.
  const body = rows.filter((r) => !r.st.demo).map((r) => [
    r.st.name, group(r.st.id), r.done, r.total, r.late, r.quizPct === undefined ? "" : Math.round(r.quizPct * 100),
    ...skills.flatMap((s) => [r.teacher[s.id] ?? "", r.self[s.id] ?? ""]), r.reviews.length,
  ]);
  download(`${course.title} - gradebook.csv`, toCsv([head, ...body]), "text/csv");
}

