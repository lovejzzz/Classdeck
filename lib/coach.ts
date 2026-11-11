import { dueInfo, isLate } from "./grading";
import type { Course, CourseState, Lesson, Module, Progress } from "./types";

// Rule-based coaching: what a student should do next, what's on their list, and every piece of
// feedback they've received. No AI service involved; the rules read the same data a teacher would.

export interface Rec {
  id: string;
  kind: "revise" | "overdue" | "soon" | "path" | "focus" | "mismatch" | "feedback" | "reflect";
  title: string;
  text: string;
  moduleId?: string;
  lessonId?: string;
  /** Scroll to this element instead of opening a card. */
  anchor?: string;
}

export interface Todo { m: Module; lesson: Lesson; week: string; due?: ReturnType<typeof dueInfo>; revise: boolean; status: Progress["status"] }

export interface FeedbackItem {
  key: string;
  from: string;
  kind: "teacher" | "peer" | "note" | "comment";
  text: string;
  next?: string;
  where: string;
  moduleId?: string;
  at: number;
}

/** The student's latest self-rating per skill, and the teacher's latest rubric level per skill. */
export function skillPicture(mine: Record<string, Progress>) {
  const self: Record<string, number> = {};
  const teacher: Record<string, number> = {};
  const evidence: Record<string, string> = {};
  for (const [, p] of Object.entries(mine).sort((a, b) => a[1].updatedAt - b[1].updatedAt)) if (p.ratings) Object.assign(self, p.ratings);
  for (const [id, p] of Object.entries(mine).filter(([, p]) => p.review?.levels).sort((a, b) => a[1].review!.at - b[1].review!.at)) {
    for (const [k, v] of Object.entries(p.review!.levels!)) {
      teacher[k] = v;
      evidence[k] = id;
    }
  }
  return { self, teacher, evidence };
}

const allCards = (course: Course) => course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules.map((m) => ({ w, l, m }))));

/** Everything still to do, in the weeks up to one past today's, most urgent first. */
export function todoList(course: Course, mine: Record<string, Progress>, now: number): Todo[] {
  const lessons = course.weeks.flatMap((w) => w.lessons.map((l) => ({ w, l })));
  const cur = Math.max(0, lessons.findIndex((x) => x.l.id === course.currentLessonId));
  const out: Todo[] = [];
  // Up to one lesson past today's, plus any electives the student chose (they set their own pace).
  lessons.filter(({ l }, i) => i < cur + 2 || (l.elective && l.chosen)).forEach(({ w, l }) => {
    const seen = new Set<string>();
    for (const m of l.modules) {
      if (m.choice) {
        // Unpicked paths count once.
        if (seen.has(m.choice.slot)) continue;
        seen.add(m.choice.slot);
      }
      const p = mine[m.id];
      if (p?.status === "done") continue;
      out.push({ m, lesson: l, week: w.title, due: dueInfo(m.due, now), revise: p?.review?.verdict === "revise", status: p?.status ?? "todo" });
    }
  });
  const rank = (t: Todo) => (t.revise ? 0 : t.due?.tone === "late" ? 1 : t.due?.tone === "soon" ? 2 : t.status === "doing" ? 3 : t.due ? 4 : 5);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** All feedback a student has received, newest first. Keys are stable so "tried it" can be tracked. */
export function feedbackFor(state: CourseState, studentId: string): FeedbackItem[] {
  const { course } = state;
  const mine = state.progress[studentId] ?? {};
  const name = (id: string) => (id === "teacher" ? "Teacher" : course.students.find((s) => s.id === id)?.name ?? "A classmate");
  const title = (mid?: string) => allCards(course).find((x) => x.m.id === mid)?.m.title ?? "";
  const items: FeedbackItem[] = [];
  for (const [mid, p] of Object.entries(mine)) {
    if (p.review) items.push({ key: `r:${mid}:${p.review.at}`, from: "Teacher", kind: "teacher", text: p.review.text || (p.review.verdict === "good" ? "Looks good." : "Please revise."), where: title(mid), moduleId: mid, at: p.review.at });
  }
  const myPosts = state.studio.posts.filter((p) => p.studentId === studentId);
  for (const f of state.studio.feedback) {
    const post = myPosts.find((p) => p.id === f.postId);
    if (post) items.push({ key: `f:${f.id}`, from: name(f.fromId), kind: "peer", text: f.observed + (f.effect ? ` ${f.effect}` : ""), next: f.next, where: title(post.moduleId), moduleId: post.moduleId, at: f.createdAt });
  }
  const myWork = new Map<string, string>();
  for (const [mid, p] of Object.entries(mine)) for (const w of p.work ?? []) myWork.set(w.id, mid);
  for (const p of myPosts) for (const w of p.work) myWork.set(w.id, p.moduleId);
  for (const mk of state.marks ?? []) {
    if (mk.from === studentId || !myWork.has(mk.attachmentId)) continue;
    const t = `${Math.floor(mk.sec / 60)}:${String(Math.floor(mk.sec % 60)).padStart(2, "0")}`;
    items.push({ key: `m:${mk.id}`, from: name(mk.from), kind: "note", text: `At ${t}: ${mk.text}`, where: title(myWork.get(mk.attachmentId)), moduleId: myWork.get(mk.attachmentId), at: mk.at });
  }
  for (const post of state.posts.filter((p) => p.mine || p.studentId === studentId)) {
    for (const c of post.comments ?? []) if (c.from !== studentId) items.push({ key: `c:${c.id}`, from: name(c.from), kind: "comment", text: c.text, where: title(post.moduleId), moduleId: post.moduleId, at: c.at });
  }
  return items.sort((a, b) => b.at - a.at);
}

/** What to do next, from the student's own data. Most useful first, at most five. */
export function recommend(state: CourseState, studentId: string, now: number): Rec[] {
  const { course } = state;
  const mine = state.progress[studentId] ?? {};
  const levels = course.levels ?? [];
  const skills = course.skills ?? [];
  const lv = (n?: number) => levels.find((l) => l.n === n)?.name ?? String(n);
  const sk = (id: string) => skills.find((s) => s.id === id)?.name ?? id;
  const recs: Rec[] = [];
  const todos = todoList(course, mine, now);
  const lessonOf = (mid: string) => course.weeks.flatMap((w) => w.lessons).find((l) => l.modules.some((m) => m.id === mid));

  for (const t of todos.filter((t) => t.revise).slice(0, 2)) {
    recs.push({ id: `rev:${t.m.id}`, kind: "revise", title: `Revise “${t.m.title}”`, text: mine[t.m.id]?.review?.text || "Your teacher asked for another go.", moduleId: t.m.id, lessonId: t.lesson.id });
  }
  const late = todos.filter((t) => !t.revise && isLate(t.m, mine[t.m.id], now));
  if (late.length) recs.push({ id: "late", kind: "overdue", title: late.length === 1 ? `“${late[0].m.title}” is overdue` : `${late.length} cards are overdue`, text: late.length === 1 ? `It was ${late[0].due?.label.toLowerCase()}. Finish it first.` : `Start with “${late[0].m.title}”.`, moduleId: late[0].m.id, lessonId: late[0].lesson.id });

  // Onboarding first: without a plan, nothing else can be tailored.
  const plan = state.plans?.[studentId];
  const ob = course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules.filter((m) => m.onboarding).map((m) => ({ l, m }))))[0];
  if (ob && !plan) recs.unshift({ id: "plan", kind: "focus", title: "Set your starting point", text: "A 10-minute questionnaire: your goal, objectives, and confidence. Your drills and suggestions follow from it.", moduleId: ob.m.id, lessonId: ob.l.id });
  else if (plan && !plan.focus?.subskills.length) recs.push({ id: "focus", kind: "focus", title: "Choose this week’s focus", text: "Pick one or two sub-skills on My progress → My plan. Your daily drill will follow them." });
  const behind = plan?.objectives.find((o) => o.status !== "achieved");
  if (behind && plan && now - plan.updatedAt > 7 * 86400_000) recs.push({ id: "obj", kind: "reflect", title: "Check in on your objectives", text: `How is “${behind.lo}” going? Update its status on My plan.` });

  const { self, teacher, evidence } = skillPicture(mine);
  // When the student's sense of a skill and the teacher's evidence disagree by two levels or more.
  for (const s of skills) {
    const a = self[s.id];
    const b = teacher[s.id];
    if (!a || !b || Math.abs(a - b) < 2) continue;
    recs.push({
      id: `mis:${s.id}`, kind: "mismatch",
      title: a > b ? `${s.name}: you may be ahead of yourself` : `${s.name}: you’re doing better than you think`,
      text: a > b
        ? `You rated yourself “${lv(a)}”, but your teacher’s review put it at “${lv(b)}”. Re-read that feedback before your next try.`
        : `You rated yourself “${lv(a)}”; your teacher’s review says “${lv(b)}”. Try the Stretch path next time.`,
      moduleId: evidence[s.id], lessonId: evidence[s.id] ? lessonOf(evidence[s.id])?.id : undefined,
    });
  }

  // Path suggestions for paths not yet picked, from the skill the card practices.
  const seenSlots = new Set<string>();
  for (const t of todos) {
    const c = t.m.choice;
    if (!c || seenSlots.has(c.slot)) continue;
    seenSlots.add(c.slot);
    const paths = t.lesson.modules.filter((x) => x.choice?.slot === c.slot);
    const teacherPick = paths.find((x) => x.choice?.recommended)?.choice?.variant;
    const skill = t.m.skills?.[0];
    const level = skill ? teacher[skill] ?? self[skill] : undefined;
    const suggested = level ? (level <= 2 ? "Guided" : "Stretch") : undefined;
    const pick = teacherPick ?? suggested;
    if (!pick) continue;
    recs.push({
      id: `path:${c.slot}`, kind: "path",
      title: `Try the ${pick} path for “${t.m.title.replace(/\s*\((guided|stretch[^)]*)\)/i, "")}”`,
      text: teacherPick
        ? `Your teacher recommends it${suggested && suggested !== teacherPick ? `, though your ${skill ? sk(skill).toLowerCase() : ""} level suggests ${suggested}. Talk it over if you’re unsure.` : "."}`
        : `Your ${teacher[skill!] ? "teacher’s latest review" : "self-check"} puts ${sk(skill!).toLowerCase()} at “${lv(level)}”.`,
      moduleId: t.m.id, lessonId: t.lesson.id,
    });
    if (recs.filter((r) => r.kind === "path").length >= 1) break;
  }

  // Focus: the weakest skill, and an open card that practices it.
  const scored = skills.map((s) => ({ s, n: teacher[s.id] ?? self[s.id] })).filter((x) => x.n);
  scored.sort((a, b) => a.n! - b.n!);
  const weakest = scored[0];
  if (weakest && weakest.n! <= 2) {
    const card = todos.find((t) => t.m.skills?.includes(weakest.s.id) && !t.m.choice);
    if (card) recs.push({ id: `focus:${weakest.s.id}`, kind: "focus", title: `Focus on ${weakest.s.name.toLowerCase()}`, text: `It’s your lowest skill right now (“${lv(weakest.n)}”). “${card.m.title}” practices it.`, moduleId: card.m.id, lessonId: card.lesson.id });
  }

  const electives = course.weeks.flatMap((w) => w.lessons).filter((l) => l.elective);
  const picked = electives.filter((l) => l.chosen).length;
  const need = (course.electiveMin ?? 2) - picked;
  if (electives.length && need > 0) {
    const weak = scored[0]?.s.id;
    const fit = electives.find((l) => !l.chosen && weak && l.catalog?.skills.includes(weak));
    recs.push({
      id: "electives", kind: "path", anchor: "electives",
      title: `Choose ${need} more elective${need === 1 ? "" : "s"}`,
      text: fit ? `“${fit.title}” works on ${sk(weak!).toLowerCase()}, your lowest skill right now.` : "Pick the ones that match what you want to get better at.",
    });
  }

  const untried = feedbackFor(state, studentId).filter((f) => !state.uptake?.[studentId]?.[f.key] && (f.kind !== "teacher" || f.text));
  if (untried.length >= 2) recs.push({ id: "fb", kind: "feedback", title: `${untried.length} pieces of feedback to try`, text: `Latest from ${untried[0].from}: “${(untried[0].next ?? untried[0].text).slice(0, 90)}”` });

  const soon = todos.filter((t) => t.due?.tone === "soon" && !t.revise);
  if (soon.length) recs.push({ id: "soon", kind: "soon", title: `“${soon[0].m.title}” is ${soon[0].due!.label.toLowerCase()}`, text: soon.length > 1 ? `And ${soon.length - 1} more due in the next two days.` : "Plan time for it today.", moduleId: soon[0].m.id, lessonId: soon[0].lesson.id });

  return recs.slice(0, 5);
}
