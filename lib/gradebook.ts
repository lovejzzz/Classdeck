// The grades: per student over the whole course (used by the Students tab's student view, and its CSV export).
import { download, toCsv } from "./download";
import { isFinished, isLate, quizSet } from "./grading";
import { visibleModules } from "./profile";
import type { CourseState, Module } from "./types";
import { groupScore, leavesOf, treeView } from "./branching";
import { awaitingFeedback, reviewableCard } from "./kinds";

/** Per student over the whole course: cards done, late, quiz and card-group scores, reviews given, work waiting, skill levels. */
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
    const done = cards.filter(({ m }) => isFinished(m, mine[m.id])).length;
    const late = cards.filter(({ m }) => isLate(m, mine[m.id], now)).length;
    // A quiz counts once it's been handed in, by its best try, even while the student is on another try.
    const quizzes = cards.filter(({ m }) => m.type === "quiz" && m.questions?.length && isFinished(m, mine[m.id]));
    // A card group of questions counts too, once all its questions are answered, by its first answers.
    const shown = new Set(cards.map(({ m }) => m.id));
    const groups = all.flatMap(({ w, l }) => l.modules.filter((g) => g.type === "group" && leavesOf(g, l.modules).some((c) => shown.has(c.id))).map((g) => ({ g, week: w.title, s: groupScore(g, l.modules, mine) })).filter((x) => x.s.done));
    // Each score, to list under the student: the quiz or card group, its week, right of total, and tries used.
    const scored = [
      ...quizzes.map(({ m, week }) => ({ id: m.id, title: m.title, week, right: mine[m.id].best ?? mine[m.id].score ?? 0, total: Math.max(1, quizSet(m, st.id, mine[m.id].attempt ?? 1).length), tries: mine[m.id].attempt ?? 1 })),
      ...groups.map(({ g, week, s: x }) => ({ id: g.id, title: g.title, week, right: x.right, total: x.total, tries: undefined as number | undefined })),
    ];
    const scores = scored.map((x) => x.right / x.total);
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
    return { st, total: cards.length, done, late, quizPct, scored, reviews, waiting, toReview, teacher, self };
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

