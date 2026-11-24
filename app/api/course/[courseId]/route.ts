import { publicOrigin } from "@/lib/origin";
import { canBeStudent, canTeach, DEMO, getSession, startSession, unauthorized, canSeeTeacher, roleOf, teacherAccessHint } from "@/lib/auth";
import { cloneLesson, cloneWeek } from "@/lib/clone";
import { findLesson, groupByRef, uid, visibleModules, wallOf } from "@/lib/profile";
import { db, endPreview, inPreview, logEvent, reset, runPreview, save } from "@/lib/store";
import { mentionsIn, plainText } from "@/lib/markdown";
import { randomCode, safeUrl } from "@/lib/uploads";
import { isCorrect, quizSet, asked, mixedOrder, wallProgress } from "@/lib/grading";
import { fold, foldWeeks } from "@/lib/cardmodel";
import { kindOf, kindWeeks, reviewableCard, unfinished, withKind } from "@/lib/kinds";
import { cardsOf, cleanCourseWiring, deals, dealsByScore, groupScore, orphansOf, pathsFor, SCORE, scoresIn, treeView } from "@/lib/branching";
import { mailReady, sendInvite, takeAllowance } from "@/lib/mail";
import { prcaScore } from "@/lib/onboarding";
import { inviteUrl, issueInvite, postUpdate, revokeInvites } from "@/lib/hooks";
import { docKey, entryOf, setText, writersOf } from "@/lib/collab";
import { DEFAULT_GROUPING, DEMO_PREFIX, DEMO_STUDENTS, demoStudent, groupFor, isDemoStudent, nextDemoName, repliesNeeded, signupGroupId, signupGroupingId, syncSignup } from "@/lib/shared";

import type { ActivityForm, AnswerValue, Attachment, Course, ExternalUpdate, FormPart, Live, Plan, CourseState, Lesson, Module, Post, Progress, ProgressMap, Question, Student, Week } from "@/lib/types";

/** A question as students receive it: no answer key, no accepted answers, no explanation. */
// "order" questions go out alphabetised, so the correct order never reaches the browser.
const publicQuestion = (q: Question): Question => ({ id: q.id, kind: q.kind, text: q.text, options: q.kind === "short" ? [] : q.kind === "order" ? mixedOrder(q.options, q.id) : q.options, mixed: q.kind === "order" || undefined });

type Ctx = { params: Promise<{ courseId: string }> };

/** Operations a student performs on their own behalf (body.studentId). */
const STUDENT_OPS = new Set([
  "savePlan", "drill", "feel", "saveFlow", "chooseElective", "setProgress", "uptake", "saveSpeech", "chooseBranch", "addWork", "renameWork", "removeWork", "rate", "star", "answer", "submitQuiz", "startQuiz",
  "retakeQuiz", "rehearse", "fillForm", "studioPost", "feedback", "feedbackHelpful", "vote", "hand", "editPost",
  "messageTeacher", "readMyMessages", "docReply", "handInShared",
]);

const AUTO_LESSON = /^Lesson \d+$/;
const STRUCTURAL = new Set(["addLesson", "addWeek", "duplicateLesson", "duplicateWeek", "insertWeek", "insertLesson", "deleteLesson", "deleteWeek"]);

/** Lessons still named "Lesson N" take their place in the course as their number; named lessons keep their names. */
function renumberLessons(course: Course) {
  let i = 0;
  for (const w of course.weeks) for (const l of w.lessons) {
    i++;
    if (AUTO_LESSON.test(l.title)) l.title = `Lesson ${i}`;
  }
}

/** Each student gives feedback to at least this many peers per studio card. */
const FEEDBACK_GOAL = 2;

/** The cards just dealt to a student, for the "new card" message, with the lesson each is in. */
const titles = (course: Course, ids: string[]) => ids.map((id) => findModule(course, id)).filter((x): x is { lesson: Lesson; mod: Module } => !!x).map((x) => ({ id: x.mod.id, title: x.mod.title, lessonId: x.lesson.id, lesson: x.lesson.title }));
/** A poll's votes: how many students picked each choice of its question (their first vote, as it stands). */
const tallyOf = (course: Course, m: Module): number[] | undefined => {
  const q = m.questions?.[0];
  if (!q) return undefined;
  const counts = q.options.map(() => 0);
  for (const st of course.students) {
    const v = db().progress[course.id]?.[st.id]?.[m.id]?.answers?.[q.id];
    for (const i of Array.isArray(v) ? (v as number[]) : typeof v === "number" ? [v] : []) if (i >= 0 && i < counts.length) counts[i]++;
  }
  return counts;
};
/** The course's tree as one student sees it. */
const treeOf = (course: Course, studentId: string) => treeView(course.weeks, db().progress[course.id]?.[studentId]);

function findModule(course: Course, moduleId: string): { lesson: Lesson; mod: Module } | undefined {
  for (const w of course.weeks) for (const lesson of w.lessons) {
    const mod = lesson.modules.find((m) => m.id === moduleId);
    if (mod) return { lesson, mod };
  }
}


/** What a student receives: only their cards, no answer keys, no version labels, only their group's studio. */
function forStudent(course: Course, studentId: string, chosen: Record<string, string>): Course {
  const all = db().choices[course.id] ?? {};
  const taken = (lessonId: string) => Object.entries(all).filter(([sid, c]) => sid !== studentId && c[`elective:${lessonId}`]).length;
  const tree = treeOf(course, studentId);
  const visible = new Set(course.weeks.flatMap((w) => w.lessons.flatMap((l) => (l.elective && !chosen[`elective:${l.id}`] ? [] : visibleModules(l, studentId, chosen, tree, course)).map((m) => m.id))));
  // A card group is on the board when its cards are (it has paths out by score, like a card).
  for (const w of course.weeks) for (const l of w.lessons) for (const g of l.modules) if (g.type === "group" && g.members?.some((id) => visible.has(id))) visible.add(g.id);
  const prog = db().progress[course.id]?.[studentId] ?? {};
  const paths = pathsFor(course.weeks, prog, tree, visible);
  return {
    ...course,
    // Students never receive the class passcode, the tools key, classmates' emails, or the co-teachers.
    access: undefined,
    people: undefined,
    ownerId: undefined,
    trash: undefined,
    waiting: undefined,
    students: course.students.map(({ id, name }) => ({ id, name })),
    // A sign-up poll that hides who's in each group: a student learns only their own place in those groups.
    groupings: (() => {
      const hidden = new Set(course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules.filter((m) => m.signup && m.signup.names === false).map((m) => signupGroupingId(m.id)))));
      return course.groupings?.map((gs) => (hidden.has(gs.id) ? { ...gs, groups: gs.groups.map((g) => ({ ...g, studentIds: g.studentIds.filter((x) => x === studentId) })) } : gs));
    })(),
    weeks: course.weeks.map((w) => ({
      ...w,
      lessons: w.lessons.map((l) => ({
        ...l,
        // An elective a student hasn't chosen arrives as a catalog entry: its cards stay hidden until they pick it.
        ...(l.elective ? { chosen: !!chosen[`elective:${l.id}`], takenBy: taken(l.id), catalog: { cards: l.modules.filter((m) => m.audience.kind === "all").length, skills: [...new Set(l.modules.flatMap((m) => m.skills ?? []))] } } : {}),
        branches: {},
        decks: l.modules.filter((g) => g.type === "group" && visible.has(g.id)).map((g) => ({
          id: g.id, title: g.title, members: (g.members ?? []).filter((id) => visible.has(id)),
          done: prog[g.id]?.status === "done" || undefined, score: typeof prog[g.id]?.dealt?.[SCORE] === "number" ? (prog[g.id]!.dealt![SCORE] as number) : undefined,
          paths: paths.get(g.id),
        })),
        modules: (l.elective && !chosen[`elective:${l.id}`] ? [] : visibleModules(l, studentId, chosen, tree, course)).map((m) => ({
          ...m,
          bands: undefined,
          dealtFor: tree.dealt.has(m.id) || undefined,
          tally: m.poll ? tallyOf(course, m) : undefined,
          // A discussion that asks for replies: how many this student needs (fewer in a small group).
          repliesNeeded: m.type === "wall" && m.wall?.replies ? repliesNeeded(course, m, studentId) : undefined,
          signupView: m.signup && m.poll ? (() => {
            const gs = course.groupings?.find((g) => g.id === signupGroupingId(m.id));
            const groups = (m.questions?.[0]?.options ?? []).map((_, i) => gs?.groups.find((g) => g.id === signupGroupId(m.id, i))?.studentIds ?? []);
            // In Student View the course's groups aren't changed (it's a test), so the test student's pick shows from their answer.
            const picked = prog[m.id]?.answers?.[m.questions?.[0]?.id ?? ""];
            if (inPreview() && typeof picked === "number" && groups[picked] && !groups.some((ids) => ids.includes(studentId))) groups[picked] = [...groups[picked], studentId];
            const nameOf = (id: string) => course.students.find((x) => x.id === id)?.name ?? "";
            const mine = groups.findIndex((ids) => ids.includes(studentId));
            return { counts: groups.map((ids) => ids.length), names: m.signup.names === false ? undefined : groups.map((ids) => ids.map(nameOf)), max: m.signup.max, mine: mine >= 0 ? mine : undefined, locked: m.signup.locked };
          })() : undefined,
          paths: paths.get(m.id),
          audience: { kind: "all" as const },
          personal: m.audience.kind !== "all" && !m.choice && !m.picked,
          questions: asked(m).length ? asked(m).map(publicQuestion) : undefined,
        })),
      })),
    })),
  };
}

/** Student View: the key of a teacher's test as one student (their sign-in, the course, the student). */
const previewKey = (session: { key: string }, courseId: string, studentId: string) => `${session.key}:${courseId}:${studentId}`;
/** What a teacher may do while testing as a student: what the student does. Nothing a teacher does alone. */
const PREVIEW_OPS = new Set([...STUDENT_OPS, "addPost", "comment", "react", "addMark", "removeMark"]);
/** Student View's blank student: in no class list, only in the test's sandbox. */
const TEST_STUDENT = { id: "s-test", name: "Test student" };
/** Student View's demo student: every course has one, in no class list or grades; their progress is kept between tests. */
const DEMO_STUDENT = { id: "s-demo", name: "Demo student" };
const testStudentFor = (sid: string) => (sid === TEST_STUDENT.id ? TEST_STUDENT : sid === DEMO_STUDENT.id ? DEMO_STUDENT : undefined);

export async function GET(request: Request, { params }: Ctx) {
  const { courseId } = await params;
  const query = new URL(request.url).searchParams;
  const as = query.get("as");
  // Student View: the teacher sees the course as this student, from the test's sandbox.
  if (as && query.get("preview") !== null) {
    const course = db().courses[courseId];
    const session = getSession(request);
    if (!course) return Response.json({ error: "No such course" }, { status: 404 });
    if (!session || !canTeach(session, course)) return unauthorized("teacher");
    if (!testStudentFor(as) && !course.students.some((s) => s.id === as)) return Response.json({ error: "That student isn’t in this class" }, { status: 404 });
    // A demo student on the class list is the teacher's own: what they do is real (kept, and in Students), not a sandbox.
    if (isDemoStudent(as)) return view(request, courseId);
    return runPreview(previewKey(session, courseId, as), courseId, () => view(request, courseId), testStudentFor(as), as === DEMO_STUDENT.id);
  }
  return view(request, courseId);
}

/** The course as the person asking may see it (the whole course for its teachers, one student's board for them). */
function view(request: Request, courseId: string): Response {
  const d = db();
  const course = d.courses[courseId];
  if (!course) return Response.json({ error: "No such course" }, { status: 404 });
  // Demo students added in 0.1.71 had made-up names: they're Demo Student A and B now.
  for (const st of course.students) { const ds = st.demo ? demoStudent(st.id) : undefined; if (ds && st.id === ds.was && st.name !== ds.name) st.name = ds.name; }
  const query = new URL(request.url).searchParams;
  const as = query.get("as");
  // Read-only guest view: course content only, no students, no work.
  const guest = query.get("guest");
  if (guest !== null) {
    if (!course.access?.guestToken || guest !== course.access.guestToken) return Response.json({ error: "This guest link has been turned off" }, { status: 403 });
    const view: CourseState = {
      course: {
        ...course, students: [], groups: [], groupings: undefined, joinCode: "", access: undefined, waiting: undefined, people: undefined, ownerId: undefined, trash: undefined,
        // Cards made for one student stay private; shared and path cards are shown without who they're for.
        weeks: course.weeks.map((w) => ({ ...w, lessons: w.lessons.map((l) => ({ ...l, branches: {}, modules: l.modules.filter((m) => m.audience.kind !== "student" && !unfinished(m)).map((m) => ({ ...m, bands: undefined, audience: m.audience.kind === "branch" ? m.audience : { kind: "all" as const }, questions: asked(m).length ? asked(m).map(publicQuestion) : undefined })) })) })),
      },
      progress: {}, posts: [], toolUse: {}, events: [], choices: {}, studio: { posts: [], feedback: [] }, marks: [], live: { hands: {} }, uptake: {}, nudges: [], plans: {},
    };
    return Response.json(view);
  }
  const session = getSession(request);
  // Someone who added themselves and is waiting to be let in sees only that.
  const waiting = as ? course.waiting?.find((s) => s.id === as) : undefined;
  if (waiting && canBeStudent(session, course, as!)) {
    return Response.json({ error: `Thanks, ${waiting.name}. Your teacher needs to let you into ${course.title}. This page opens your board as soon as they do.`, waiting: true }, { status: 403 });
  }
  if (as ? !canBeStudent(session, course, as) : !canSeeTeacher(session, course)) return as ? unauthorized("student") : unauthorized("teacher", undefined, teacherAccessHint(session, course));
  if (as && !course.students.some((s) => s.id === as)) return Response.json({ error: "You’re not on this class list. Ask your teacher to add you." }, { status: 404 });
  if (finishExpiredQuizzes(course)) save();
  const all = d.progress[courseId] ?? {};
  const choices = d.choices[courseId] ?? {};
  const studio = d.studio[courseId] ?? { posts: [], feedback: [] };
  const toolUse: CourseState["toolUse"] = {};
  for (const e of d.toolLog[courseId] ?? []) {
    if (as && e.studentId !== as) continue;
    const row = (toolUse[e.studentId] ??= {});
    row[e.moduleId] = (row[e.moduleId] ?? 0) + 1;
  }
  let progress: ProgressMap = all;
  let studioView = studio;
  if (as) {
    const own: Record<string, Progress> = {};
    for (const [mid, p] of Object.entries(all[as] ?? {})) {
      const mod = findModule(course, mid)?.mod;
      const isQuiz = mod?.type === "quiz";
      const view: Progress = isQuiz && p.status !== "done" ? { ...p, results: undefined, score: undefined } : { ...p };
      // Explanations (and, after a quiz, the key) once they've been earned.
      if (mod?.questions?.length) {
        const reveal: NonNullable<Progress["reveal"]> = {};
        const inSet = new Set(quizSet(mod, as, p.attempt ?? 1).map((q) => q.id));
        // While a quiz still has a try left, a missed question's answer (and its explanation) stays hidden, or the
        // next try is just copying. Questions they got right can show their explanation.
        const triesLeft = isQuiz && (mod.attempts ?? 1) > (p.attempt ?? 1);
        for (const q of mod.questions) {
          const earned = isQuiz ? p.status === "done" && inSet.has(q.id) && (!triesLeft || p.results?.[q.id] === true) : p.results?.[q.id] === true;
          if (!earned) continue;
          reveal[q.id] = {
            explain: q.explain || undefined,
            ...(isQuiz ? {
              answer: !q.kind || q.kind === "choice" ? q.answer : undefined,
              answerSet: q.kind === "multi" ? q.answerSet : undefined,
              order: q.kind === "order" ? q.options : undefined,
              accept: q.kind === "short" ? q.accept?.[0] : undefined,
            } : {}),
          };
        }
        view.reveal = reveal;
      }
      own[mid] = view;
    }
    progress = { [as]: own };
    // Posts from whoever is in your group on that card now (each card can use its own grouping), so regrouping moves who you see.
    const posts = studio.posts.filter((p) => p.studentId === as || !!groupFor(course, findModule(course, p.moduleId)?.mod, as)?.studentIds.includes(p.studentId));
    const ids = new Set(posts.map((p) => p.id));
    studioView = { posts, feedback: studio.feedback.filter((f) => ids.has(f.postId)) };
  }
  const allPosts = d.posts[courseId] ?? [];
  // Students don't see others' posts that await approval, or who wrote an anonymous post.
  // In a discussion by groups, a student sees their own group's posts (and the teacher's posts for everyone).
  const inMyFeed = (p: Post) => {
    if (!p.groupId || p.studentId === as) return true;
    const mod = findModule(course, p.moduleId)?.mod;
    return groupFor(course, mod, as!)?.id === p.groupId;
  };
  const posts: Post[] = as
    ? allPosts
        .filter((p) => (p.approved !== false || p.studentId === as) && inMyFeed(p))
        .map((p) => ({ ...p, mine: p.studentId === as, studentId: p.anonymous && p.studentId !== as && p.studentId !== "teacher" ? "" : p.studentId }))
    : allPosts;
  const state: CourseState = {
    course: as ? forStudent(course, as, choices[as] ?? {}) : course,
    progress,
    posts,
    toolUse,
    events: as ? [] : (d.events[courseId] ?? []).slice(-80),
    choices: as ? { [as]: choices[as] ?? {} } : choices,
    studio: studioView,
    marks: as ? (d.marks[courseId] ?? []).filter((mk) => visibleWork(course, as).has(mk.attachmentId)) : (d.marks[courseId] ?? []),
    live: liveView(d.live[courseId] ?? { hands: {} }, as),
    uptake: as ? { [as]: d.uptake[courseId]?.[as] ?? {} } : (d.uptake[courseId] ?? {}),
    nudges: (d.nudges[courseId] ?? []).filter((n) => !as || n.studentId === as),
    plans: as ? (d.plans[courseId]?.[as] ? { [as]: d.plans[courseId][as] } : {}) : (d.plans[courseId] ?? {}),
  };
  if (!as) {
    const owner = course.ownerId ? d.users[course.ownerId] : undefined;
    state.me = { role: roleOf(session, course) ?? (course.id === DEMO ? "owner" : "viewer"), owner: owner ? { name: owner.name, email: owner.email, picture: owner.picture } : undefined, mail: mailReady() };
  }
  // Visitors to the open demo get a light session so they can upload recordings there.
  const headers: Record<string, string> = !session && course.id === DEMO ? { "Set-Cookie": startSession({ kind: "demo" }, 7) } : {};
  return Response.json(state, { headers });
}

/** Students see poll counts (not who voted what) once they've voted or the poll is closed, and only their own hand. */
function liveView(live: Live, as: string | null): CourseState["live"] {
  if (!as) return live;
  const poll = live.poll;
  const myVote = poll?.votes[as];
  const counts = poll && (myVote !== undefined || !poll.open) ? poll.options.map((_, i) => Object.values(poll.votes).filter((v) => v === i).length) : undefined;
  return {
    poll: poll ? { ...poll, votes: {} } : undefined,
    hands: live.hands[as] ? { [as]: live.hands[as] } : {},
    myVote, counts,
  };
}

/** Recordings a student may see and comment on: their own work, and posts in their studio group. */
function visibleWork(course: Course, studentId: string): Set<string> {
  const d = db();
  const ids = new Set<string>();
  for (const p of Object.values(d.progress[course.id]?.[studentId] ?? {})) for (const w of p.work ?? []) ids.add(w.id);
  for (const p of d.studio[course.id]?.posts ?? []) if (p.studentId === studentId || groupFor(course, findModule(course, p.moduleId)?.mod, studentId)?.studentIds.includes(p.studentId)) for (const w of p.work) ids.add(w.id);
  return ids;
}

function cleanAttachment(a: Attachment): Attachment | null {
  if (!a || typeof a.url !== "string" || !safeUrl(a.url)) return null;
  const kinds = ["image", "video", "audio", "file", "link"];
  if (!kinds.includes(a.kind)) return null;
  const sec = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : undefined);
  return {
    id: a.id || uid("w-"), kind: a.kind, url: a.url, name: String(a.name ?? "").slice(0, 120) || undefined, size: Number(a.size) || undefined,
    start: sec(a.start), end: sec(a.end), credit: a.credit ? String(a.credit).slice(0, 200) : undefined,
    transcript: a.transcript && (a.kind === "audio" || a.kind === "video") ? String(a.transcript).slice(0, 20000) : undefined,
    duration: Number(a.duration) > 0 && Number(a.duration) < 36000 ? Math.round(Number(a.duration)) : undefined,
  };
}

const FORM_PARTS: FormPart[] = ["feedback", "next", "levels", "score", "links", "status"];

function cleanForm(f: ActivityForm | undefined): ActivityForm | undefined {
  if (!f || typeof f !== "object") return undefined;
  // Blank questions are kept while the teacher is still typing; filling in skips them.
  const questions = (Array.isArray(f.questions) ? f.questions : []).slice(0, 12).map((q) => {
    const options = Array.isArray(q?.options) ? q.options.map((o) => String(o).slice(0, 80)).slice(0, 8) : [];
    return { id: String(q?.id || uid("fq-")).slice(0, 40), text: String(q?.text ?? "").slice(0, 200), ...(options.length ? { options } : {}) };
  });
  const student = f.by === "student";
  // A student form can ask them to rate themselves and add links; the rest are the teacher's to give.
  const parts = FORM_PARTS.filter((x) => Array.isArray(f.parts) && f.parts.includes(x) && (!student || x === "levels" || x === "links"));
  const max = Number(f.max);
  return {
    title: String(f.title ?? "").slice(0, 80), ...(student ? { by: "student" as const, finish: !!f.finish || undefined } : {}),
    parts, max: !student && max > 0 ? Math.min(1000, max) : undefined, questions: questions.length ? questions : undefined,
  };
}

/** Keys that would reach an object's prototype; dropped from every request body. */
const UNSAFE_KEY = /^(__proto__|constructor|prototype)$/;

export async function POST(request: Request, { params }: Ctx) {
  const { courseId } = await params;
  let body: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    body = JSON.parse(await request.text(), (k, v) => (UNSAFE_KEY.test(k) ? undefined : v));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return Response.json({ ok: false, error: "That request didn’t make sense" }, { status: 400 });
  }
  if (body.op === "reset") {
    if (courseId !== "demo") return Response.json({ ok: false, error: "Only the demo course can be restored" }, { status: 400 });
    reset();
    return Response.json({ ok: true });
  }
  // Student View: a teacher trying the course as a student. Only the student's own actions, run in the test's
  // sandbox, so no grade, post or notification is real. "endPreview" starts the test over.
  if (body.preview === true || body.op === "endPreview") {
    const course = db().courses[courseId];
    const session = getSession(request);
    if (!course) return Response.json({ error: "No such course" }, { status: 404 });
    if (!session || !canTeach(session, course)) return unauthorized("teacher");
    const sid = typeof body.studentId === "string" ? body.studentId : typeof body.as === "string" ? body.as : "";
    if (!testStudentFor(sid) && !course.students.some((s) => s.id === sid)) return Response.json({ ok: false, error: "That student isn’t in this class" }, { status: 400 });
    if (body.op === "endPreview") {
      // Starting over as a demo student clears their real work.
      if (isDemoStudent(sid)) {
        const d = db();
        delete d.progress[courseId]?.[sid];
        delete d.choices[courseId]?.[sid];
        save();
        return Response.json({ ok: true });
      }
      endPreview(previewKey(session, courseId, sid), courseId, sid === DEMO_STUDENT.id);
      return Response.json({ ok: true });
    }
    if (!PREVIEW_OPS.has(body.op)) return Response.json({ ok: false, error: "That isn’t something a student does, so it can’t be tried in Student View" }, { status: 400 });
    // react and comment name the student in `who`; the rest in `studentId`.
    if ((body.op === "react" || body.op === "comment") && body.who !== sid) return Response.json({ ok: false, error: "In Student View you act as the student you picked" }, { status: 400 });
    if (isDemoStudent(sid)) return change(request, courseId, body);
    return runPreview(previewKey(session, courseId, sid), courseId, () => change(request, courseId, body), testStudentFor(sid), sid === DEMO_STUDENT.id);
  }
  return change(request, courseId, body);
}

/** One change to the course, from the teacher or a student (checked here). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function change(request: Request, courseId: string, body: Record<string, any>): Promise<Response> {
  const d = db();
  const course = d.courses[courseId];
  if (!course) return Response.json({ error: "No such course" }, { status: 404 });
  // Who may do this? Student actions need that student's session (or the course's teacher);
  // everything else is the teacher's.
  const session = getSession(request);
  const actor: string | undefined =
    body.op === "react" || body.op === "comment" ? body.who
    : STUDENT_OPS.has(body.op) || body.op === "addPost" || body.op === "addMark" || body.op === "removeMark" ? body.studentId
    : undefined;
  if (actor && actor !== "teacher") {
    if (!course.students.some((st) => st.id === actor)) return Response.json({ ok: false, error: "No such student" }, { status: 400 });
    if (!canBeStudent(session, course, actor)) return unauthorized("student");
  } else if (!canTeach(session, course)) return unauthorized("teacher");
  const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });
  // Ids in the request must be real: a card in this course, a student in this class.
  const isStudent = (sid: unknown) => typeof sid === "string" && course.students.some((st) => st.id === sid);
  // (A teacher posts in a discussion as "teacher".)
  const teacherPost = body.op === "addPost" && body.studentId === "teacher";
  if (body.studentId !== undefined && body.studentId !== null && !teacherPost && !isStudent(body.studentId)) return fail("No such student");
  if (body.moduleId !== undefined && body.moduleId !== null && body.moduleId !== "" && !(typeof body.moduleId === "string" && findModule(course, body.moduleId))) return fail("No such card");
  // A student only acts on cards that are on their own board.
  if (actor && actor !== "teacher" && typeof body.moduleId === "string" && body.moduleId && !canTeach(session, course) && !onBoard(course, actor, body.moduleId)) return fail("That card isn’t on your board");
  const prog = (d.progress[courseId] ??= {});
  const studio = (d.studio[courseId] ??= { posts: [], feedback: [] });
  const mine = (sid: string, mid: string): Progress => {
    if (!isStudent(sid) || !findModule(course, mid)) throw new Error("Unknown student or card");
    const row = Object.hasOwn(prog, sid) ? prog[sid] : (prog[sid] = {});
    return Object.hasOwn(row, mid) ? row[mid] : (row[mid] = { status: "todo", updatedAt: Date.now() });
  };
  let extra: Record<string, unknown> = {};
  /** Take a student off the class list, and out of every group: the course's, the ones made on cards and by sign-up polls, and a raised hand. */
  function dropStudent(gone: string) {
    course!.students = course!.students.filter((x) => x.id !== gone);
    course!.groups = course!.groups?.map((g) => ({ ...g, studentIds: g.studentIds.filter((x) => x !== gone) }));
    for (const gs of course!.groupings ?? []) for (const g of gs.groups) g.studentIds = g.studentIds.filter((x) => x !== gone);
    if (d.live[courseId]?.hands) delete d.live[courseId].hands[gone];
  }
  /** Whose progress shares one piece of work with this student's: everyone who wrote a group's worksheet, or just them. */
  function sharers(mod: Module, sid: string): string[] {
    const key = mod.writers === "group" && kindOf(mod) === "worksheet" ? docKey(course!, mod, sid) : null;
    const who = key ? writersOf(course!, key).filter((x) => course!.students.some((st) => st.id === x)) : [];
    return who.includes(sid) ? who : [sid];
  }
  /** Everything a (demo) student did: their progress, choices and posts. */
  function clearWork(sid: string) {
    delete d.progress[courseId]?.[sid];
    delete d.choices[courseId]?.[sid];
    if (d.posts[courseId]) d.posts[courseId] = d.posts[courseId].filter((x) => x.studentId !== sid);
    const st = d.studio[courseId];
    if (st) { st.posts = st.posts.filter((x) => x.studentId !== sid); st.feedback = st.feedback.filter((x) => x.fromId !== sid); }
  }

  /** A studio card is done once you've posted and given feedback to enough peers. */
  function studioStatus(studentId: string, moduleId: string) {
    const posted = studio.posts.some((p) => p.studentId === studentId && p.moduleId === moduleId);
    const peers = (groupFor(course, findModule(course, moduleId)?.mod, studentId)?.studentIds.length ?? 1) - 1;
    const postIds = new Set(studio.posts.filter((p) => p.moduleId === moduleId && p.studentId !== studentId).map((p) => p.id));
    const given = new Set(studio.feedback.filter((f) => f.fromId === studentId && postIds.has(f.postId)).map((f) => f.postId)).size;
    const p = mine(studentId, moduleId);
    const was = p.status;
    p.status = posted && given >= Math.min(FEEDBACK_GOAL, Math.max(peers, 0)) ? "done" : posted || given ? "doing" : p.status;
    p.updatedAt = Date.now();
    if (was !== "done" && p.status === "done") {
      logEvent(courseId, { kind: "done", studentId, moduleId, text: `Finished “${findModule(course, moduleId)?.mod.title ?? ""}”` });
    }
  }

  try {
  // Managing who else can see or edit the course is for its owner alone.
  if (body.op === "setPeople" && roleOf(session, course) !== "owner") return Response.json({ ok: false, error: "Only the course’s owner can change who has access" }, { status: 403 });
  switch (body.op) {
    case "setPeople": {
      const raw = Array.isArray(body.people) ? body.people : [];
      const seen = new Set<string>();
      const ownerEmail = course.ownerId ? d.users[course.ownerId]?.email.toLowerCase() : undefined;
      course.people = raw.flatMap((x: { email?: unknown; role?: unknown; at?: unknown }) => {
        const email = String(x?.email ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120 || seen.has(email) || email === ownerEmail) return [];
        seen.add(email);
        return [{ email, role: x?.role === "viewer" ? "viewer" : "editor", at: typeof x?.at === "number" ? x.at : Date.now() } as const];
      }).slice(0, 50);
      if (!course.people?.length) course.people = undefined;
      break;
    }
    // —— teacher ——
    case "setProfile":
      course.profile = body.profile;
      break;
    case "formResponse": {
      // The teacher fills in a card's form for one student. Filling it again replaces their earlier answers.
      const found = findModule(course, body.moduleId);
      const st = course.students.find((x) => x.id === body.studentId);
      const form = found?.mod.form;
      if (!found || !form) return fail("This card has no form");
      if (form.by === "student") return fail("Students fill in this card’s form themselves");
      if (!st) return fail("No such student");
      const a = (body.answers ?? {}) as Record<string, unknown>;
      const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
      const has = (x: FormPart) => form.parts.includes(x);
      const levels: Record<string, number> = {};
      if (has("levels")) for (const sk of course.skills ?? []) {
        const v = Number((a.levels as Record<string, unknown> | undefined)?.[sk.id]);
        if (v >= 1 && v <= 4) levels[sk.id] = v;
      }
      const sv = Number(a.score);
      const links = has("links") ? str(a.links, 4000).split(/\s+/).filter((u) => safeUrl(u) && /^https:\/\//i.test(u)).slice(0, 8).map((url) => ({ url: url.slice(0, 1000) })) : [];
      const answers = (form.questions ?? []).filter((q) => q.text.trim()).map((q) => {
        const v = str((a.questions as Record<string, unknown> | undefined)?.[q.id], 2000);
        const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
        return { q: q.text.trim(), a: opts.length ? (opts.includes(v) ? v : "") : v };
      }).filter((x) => x.a);
      const up: ExternalUpdate = {
        id: `form:${found.mod.id}`, source: form.title.trim() || `${found.mod.title} feedback`, at: Date.now(),
        text: has("feedback") ? str(a.feedback, 3000) || undefined : undefined,
        next: has("next") ? str(a.next, 1000) || undefined : undefined,
        levels: Object.keys(levels).length ? levels : undefined,
        score: has("score") && a.score !== "" && a.score !== undefined && a.score !== null && Number.isFinite(sv) ? { value: sv, max: form.max } : undefined,
        links: links.length ? links : undefined,
        answers: answers.length ? answers : undefined,
      };
      const status = has("status") && (a.status === "done" || a.status === "revise") ? a.status : "";
      const r = postUpdate(courseId, st, found.mod, up, status);
      if (r.error) return fail(r.error);
      break;
    }
    case "letIn": {
      // Students who added themselves: let them in (into the smallest group) or turn them away.
      const ids = new Set((Array.isArray(body.studentIds) ? body.studentIds : [body.studentId]).map(String));
      const picked = (course.waiting ?? []).filter((s) => ids.has(s.id));
      course.waiting = (course.waiting ?? []).filter((s) => !ids.has(s.id));
      if (!course.waiting.length) course.waiting = undefined;
      if (body.allow) {
        for (const st of picked) {
          // Names are unique in a class; should one have been taken meanwhile, a number tells them apart.
          const taken = (n: string) => course.students.some((x) => x.name.trim().toLowerCase() === n.trim().toLowerCase());
          if (taken(st.name)) { let k = 2; while (taken(`${st.name} ${k}`)) k++; st.name = `${st.name} ${k}`; }
          course.students.push(st);
          const g = course.groups?.length ? [...course.groups].sort((x, y) => x.studentIds.length - y.studentIds.length)[0] : undefined;
          g?.studentIds.push(st.id);
        }
      } else for (const st of picked) if (d.pins[courseId]) delete d.pins[courseId][st.id];
      extra = { count: picked.length };
      break;
    }
    case "emailInvites": {
      // Email students on this course's list their own sign-in link, in Questhand's name. Fixed wording only.
      const me = session?.kind === "teacher" && session.userId ? d.users[session.userId] : undefined;
      if (!me || course.id === DEMO) return fail("Sign in as a teacher to send invitations", 403);
      if (!mailReady()) return fail("Sending email isn’t set up on this site yet");
      const want = new Set((Array.isArray(body.studentIds) ? body.studentIds : []).map(String));
      const to = course.students.filter((st) => want.has(st.id) && st.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(st.email));
      const allowed = takeAllowance(me.id, to.length);
      const origin = publicOrigin(request);
      let sent = 0;
      for (const st of to.slice(0, allowed)) {
        if (await sendInvite(st.email!, { course: course.title, teacher: me.name, link: inviteUrl(origin, courseId, issueInvite(st)) })) {
          st.invitedAt = Date.now();
          sent++;
        }
      }
      extra = { sent, failed: Math.min(to.length, allowed) - sent, overLimit: to.length - allowed };
      break;
    }
    case "setupLinks": {
      // Invitation links for students on the list not yet linked to an account (or the ones asked for). Opening one
      // signed in links that account to the student. Earlier links keep working (up to a few per student).
      const want = Array.isArray(body.studentIds) ? new Set(body.studentIds.map(String)) : null;
      const origin = publicOrigin(request);
      extra = {
        links: course.students.filter((st) => (want ? want.has(st.id) : !st.userId)).map((st) => ({ id: st.id, name: st.name, email: st.email, link: inviteUrl(origin, courseId, issueInvite(st)) })),
      };
      break;
    }
    case "setCurrentLesson":
      if (findLesson(course, body.lessonId)) course.currentLessonId = body.lessonId;
      break;
    case "setEnabledConnectors":
      course.enabledConnectors = body.ids;
      break;
    case "addStudents": {
      // One name per line (or comma-separated). Duplicates of existing names are skipped.
      const names: string[] = String(body.names ?? "").split(/[\n,]/).map((x: string) => x.trim()).filter(Boolean).slice(0, 200);
      // Someone waiting to be let in has their name already.
      const have = new Set([...course.students, ...(course.waiting ?? [])].map((x) => x.name.toLowerCase()));
      const added = names.filter((n) => !have.has(n.toLowerCase()) && (have.add(n.toLowerCase()), true)).map((n) => ({ id: uid("s-"), name: n.slice(0, 60) }));
      course.students.push(...added);
      // Put each new student in the smallest group so they can use Collab Studio right away.
      if (course.groups?.length) {
        for (const st of added) {
          const g = [...course.groups].sort((a, b) => a.studentIds.length - b.studentIds.length)[0];
          g.studentIds.push(st.id);
        }
      }
      extra = { added: added.length };
      break;
    }
    case "addStudentEmails": {
      // Students invited by email: each gets a place on the class list, named from their address until they change it.
      // Nothing is emailed; the teacher shares the class link themselves.
      const emails: string[] = (Array.isArray(body.emails) ? body.emails : String(body.emails ?? "").split(/[\s,;]+/))
        .map((x: unknown) => String(x ?? "").trim().toLowerCase()).filter((x: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) && x.length <= 120).slice(0, 200);
      const haveEmail = new Set(course.students.map((x) => x.email?.toLowerCase()).filter(Boolean));
      const haveName = new Set([...course.students, ...(course.waiting ?? [])].map((x) => x.name.toLowerCase()));
      const added: Student[] = [];
      for (const email of emails) {
        if (haveEmail.has(email)) continue;
        haveEmail.add(email);
        let name = email.split("@")[0].split(/[._\-+]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ").slice(0, 60) || email;
        // Two people with the same name: tell them apart by their address.
        if (haveName.has(name.toLowerCase())) name = email.slice(0, 60);
        haveName.add(name.toLowerCase());
        added.push({ id: uid("s-"), name, email });
      }
      course.students.push(...added);
      if (course.groups?.length) {
        for (const st of added) {
          const g = [...course.groups].sort((a, b) => a.studentIds.length - b.studentIds.length)[0];
          g.studentIds.push(st.id);
        }
      }
      extra = { added: added.length };
      break;
    }
    case "renameStudent": {
      const st = course.students.find((x) => x.id === body.studentId);
      const name = String(body.name ?? "").trim().slice(0, 60);
      // Names are unique in a class (classmates find each other by name).
      if (st && name && [...course.students, ...(course.waiting ?? [])].some((x) => x.id !== st.id && x.name.trim().toLowerCase() === name.toLowerCase())) return fail(`Another student is already called ${name}`);
      if (st && name) st.name = name;
      break;
    }
    case "removeStudent": {
      const sid = String(body.studentId ?? "");
      // A demo student's work goes with them (a real student's stays saved).
      const demo = course.students.some((x) => x.id === sid && x.demo);
      dropStudent(sid);
      if (demo) clearWork(sid);
      break;
    }
    case "setDemoStudents": {
      // On: Demo Student A and B, if the class has no demo students yet. Off: every demo student, with their work.
      if (body.on) {
        if (course.students.some((x) => x.demo)) break;
        for (const ds of DEMO_STUDENTS) {
          if ([...course.students, ...(course.waiting ?? [])].some((x) => x.name.toLowerCase() === ds.name.toLowerCase())) return fail(`A student in this class is already called ${ds.name}`);
          // Not put in the class's own groups: a test student shouldn't change a real group's work or goals.
          course.students.push({ id: ds.id, name: ds.name, demo: true });
        }
      } else {
        for (const st of course.students.filter((x) => x.demo)) { dropStudent(st.id); clearWork(st.id); }
      }
      break;
    }
    case "addDemoStudent": {
      // One more demo student, named by the teacher (or Demo Student C, D, …).
      const names = [...course.students, ...(course.waiting ?? [])].map((x) => x.name);
      const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60) || nextDemoName(names);
      if (names.some((x) => x.toLowerCase() === name.toLowerCase())) return fail(`A student in this class is already called ${name}`);
      if (course.students.filter((x) => x.demo).length >= 30) return fail("A class can have up to 30 demo students");
      const id = uid(DEMO_PREFIX);
      course.students.push({ id, name, demo: true });
      extra = { studentId: id };
      break;
    }
    case "renameWeek": {
      const w = course.weeks.find((x) => x.id === body.weekId);
      if (w && String(body.title ?? "").trim()) w.title = String(body.title).trim().slice(0, 80);
      break;
    }
    case "autoGroup": {
      // Split the class into balanced groups of at most `size` (default 6), keeping existing group ids where possible.
      const size = Math.max(2, Math.min(10, Number(body.size) || 6));
      if (body.by === "elective") {
        // Group students who share an elective, so early peer feedback comes from people using the same rubric.
        const electives = course.weeks.flatMap((w) => w.lessons).filter((l) => l.elective);
        const pick = (sid: string) => electives.find((l) => d.choices[courseId]?.[sid]?.[`elective:${l.id}`])?.id ?? "none";
        const buckets = new Map<string, string[]>();
        for (const st of course.students) buckets.set(pick(st.id), [...(buckets.get(pick(st.id)) ?? []), st.id]);
        const groups: { id: string; name: string; studentIds: string[] }[] = [];
        for (const [lid, ids] of buckets) {
          const parts = Math.max(1, Math.ceil(ids.length / size));
          const title = electives.find((l) => l.id === lid)?.title ?? "Open";
          for (let i = 0; i < parts; i++) groups.push({ id: uid("g-"), name: parts > 1 ? `${title} ${i + 1}` : title, studentIds: ids.filter((_, k) => k % parts === i) });
        }
        course.groups = groups;
        break;
      }
      const ids = course.students.map((x) => x.id);
      const n = Math.max(1, Math.ceil(ids.length / size));
      const old = course.groups ?? [];
      course.groups = Array.from({ length: n }, (_, i) => ({
        id: old[i]?.id ?? uid("g-"),
        name: old[i]?.name ?? `Studio ${String.fromCharCode(65 + i)}`,
        studentIds: ids.filter((_, k) => k % n === i),
      }));
      break;
    }
    case "sessionNotes": {
      // Notes the teacher typed while running a Collab Studio session, sent to each student's studio card.
      // Sending again the same day replaces that day's notes rather than adding more.
      const found = findModule(course, String(body.moduleId ?? ""));
      if (!found || found.mod.type !== "studio") return fail("This lesson has no Collab Studio card to send notes to");
      const notes = (body.notes && typeof body.notes === "object" ? body.notes : {}) as Record<string, unknown>;
      // The class's own calendar day (sent by the teacher's browser), so a late class isn't split at midnight UTC.
      const day = typeof body.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day) && Math.abs(Date.parse(body.day) - Date.now()) < 2 * 86400_000 ? body.day : new Date().toISOString().slice(0, 10);
      let sent = 0;
      for (const [sid, v] of Object.entries(notes)) {
        const st = course.students.find((x) => x.id === sid);
        const text = typeof v === "string" ? v.trim().slice(0, 2000) : "";
        if (!st || !text) continue;
        const r = postUpdate(courseId, st, found.mod, { id: `session:${found.mod.id}:${day}`, source: "Your teacher’s notes from Collab Studio", at: Date.now(), text }, "");
        if (!r.error) sent++;
      }
      extra = { sent };
      break;
    }
    case "setSkills": {
      // The skills students practise and are rated on, and the four level names. Existing skills keep their ids,
      // so ratings and reviews already given still line up; a removed skill is also taken off every card.
      const raw = Array.isArray(body.skills) ? body.skills : [];
      const seen = new Set<string>();
      const skills = raw.slice(0, 10).map((x: { id?: unknown; name?: unknown }) => {
        const name = String(x?.name ?? "").trim().slice(0, 40);
        let id = typeof x?.id === "string" && /^[\w-]{1,40}$/.test(x.id) && !UNSAFE_KEY.test(x.id) ? x.id : uid("sk-");
        if (seen.has(id)) id = uid("sk-");
        seen.add(id);
        return { id, name };
      }).filter((x: { name: string }) => x.name);
      if (!skills.length) return fail("Keep at least one skill");
      if (Array.isArray(body.levels)) {
        if (body.levels.length !== 4) return fail("There are always four levels");
        course.levels = body.levels.map((l: { name?: unknown; description?: unknown; use?: unknown }, i: number) => ({
          n: i + 1,
          name: String(l?.name ?? "").trim().slice(0, 30) || `Level ${i + 1}`,
          description: String(l?.description ?? "").trim().slice(0, 200),
          use: String(l?.use ?? course.levels?.[i]?.use ?? "").trim().slice(0, 200),
        }));
      }
      const keep = new Set(skills.map((x: { id: string }) => x.id));
      course.skills = skills;
      for (const w of course.weeks) for (const l of w.lessons) for (const m of l.modules) if (m.skills) {
        m.skills = m.skills.filter((id) => keep.has(id));
        if (!m.skills.length) m.skills = undefined;
      }
      break;
    }
    // The map's trash bin: cards deleted together, kept to put back.
    case "trashPut": {
      const e = body.entry;
      if (!e || typeof e.id !== "string" || !Array.isArray(e.lessons) || !Array.isArray(e.inbound)) return fail("Nothing to keep");
      if (JSON.stringify(e).length > 300_000) return fail("Too much to keep in the trash");
      const entry = { id: e.id.slice(0, 40), at: Date.now(), title: String(e.title ?? "").slice(0, 120), lessons: e.lessons, inbound: e.inbound };
      course.trash = [...(course.trash ?? []).filter((x) => x.id !== entry.id), entry].slice(-30);
      break;
    }
    case "trashDrop": {
      course.trash = (course.trash ?? []).filter((x) => x.id !== body.id);
      if (!course.trash.length) course.trash = undefined;
      break;
    }
    case "setCourseInfo": {
      if (String(body.title ?? "").trim()) course.title = String(body.title).trim().slice(0, 80);
      if (typeof body.subtitle === "string") course.subtitle = body.subtitle.trim().slice(0, 120) || undefined;
      break;
    }
    case "saveGrouping": {
      // —— teacher —— A grouping (a new one, or a change to one): its name, and its named groups of students.
      const g = body.grouping ?? {};
      const groups = (Array.isArray(g.groups) ? g.groups : []).slice(0, 40).map((x: { id?: string; name?: string; studentIds?: string[] }, i: number) => ({
        id: typeof x.id === "string" && x.id ? x.id.slice(0, 40) : uid("g-"),
        name: String(x.name ?? "").trim().slice(0, 40) || `Group ${i + 1}`,
        studentIds: [...new Set((Array.isArray(x.studentIds) ? x.studentIds : []).filter((id) => course.students.some((st) => st.id === id)))],
      }));
      // A student is in one group of a grouping.
      const seen = new Set<string>();
      for (const x of groups) x.studentIds = x.studentIds.filter((id: string) => (seen.has(id) ? false : (seen.add(id), true)));
      if (!groups.length) return fail("Make at least one group");
      if (g.id === DEFAULT_GROUPING) {
        course.groups = groups;
        extra = { id: DEFAULT_GROUPING };
        break;
      }
      const name = String(g.name ?? "").trim().slice(0, 60) || "Groups";
      const list = (course.groupings ??= []);
      const at = list.findIndex((x) => x.id === g.id);
      if (at >= 0) list[at] = { id: list[at].id, name, groups };
      else {
        if (list.length >= 50) return fail("This course has 50 groupings; remove one first");
        list.push({ id: uid("gs-"), name, groups });
      }
      extra = { id: at >= 0 ? list[at].id : list[list.length - 1].id };
      break;
    }
    case "deleteGrouping": {
      // —— teacher —— Cards that used it go back to the course's Discussion groups.
      const id = String(body.id ?? "");
      course.groupings = (course.groupings ?? []).filter((x) => x.id !== id);
      if (!course.groupings.length) course.groupings = undefined;
      for (const w of course.weeks) for (const l of w.lessons) for (const m of l.modules) {
        if (m.grouping === id) m.grouping = undefined;
        // A sign-up poll's groups removed: it's a plain poll again (or saving it would make them anew, empty).
        if (m.signup && signupGroupingId(m.id) === id) m.signup = undefined;
      }
      break;
    }
    case "setGroups":
      course.groups = (body.groups ?? []).map((g: { id: string; name: string; studentIds: string[] }) => ({
        id: g.id, name: String(g.name).slice(0, 40), studentIds: g.studentIds.filter((id) => course.students.some((s) => s.id === id)),
      }));
      break;
    case "saveLesson":
    case "saveLessons": {
      // One lesson, or several at once (an edit that spans lessons, like deleting a card along with its follow-ups in
      // a later lesson, or undoing that). Several go together so the wiring between them is checked only once
      // they're all in place.
      const list = (body.op === "saveLessons" ? (Array.isArray(body.lessons) ? body.lessons : []) : [body.lesson]) as Lesson[];
      if (!list.length || list.length > 80 || list.some((l) => !l || !Array.isArray(l.modules))) return fail("Nothing to save");
      const cardsBefore = cardsOf(course.weeks).map((c) => c.m);
      for (const next of list) {
        next.modules = next.modules.map((m) => withKind(fold(m)));
        for (const m of next.modules) {
          if (m.playlist) m.playlist = m.playlist.filter((x) => typeof x.url === "string" && /^https:\/\//.test(x.url)).slice(0, 60);
          m.attachments = (m.attachments ?? []).map(cleanAttachment).filter((a): a is Attachment => !!a).slice(0, 12);
          m.form = cleanForm(m.form);
          if (m.suit !== undefined && !["learn", "do", "share"].includes(m.suit)) m.suit = undefined;
        }
        if (next.date !== undefined && !(typeof next.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(next.date))) next.date = undefined;
        for (const w of course.weeks) {
          const i = w.lessons.findIndex((l) => l.id === next.id);
          if (i < 0) continue;
          // "Lesson N" names belong to the server (they follow position); a stale copy can't put an old number back.
          if (AUTO_LESSON.test(next.title ?? "") && AUTO_LESSON.test(w.lessons[i].title)) next.title = w.lessons[i].title;
          w.lessons[i] = next;
        }
      }
      // A follow-up whose source cards were all deleted here would go to everyone: it goes with them (the website
      // sends those deletions itself; this covers anything that saves lessons another way).
      const orphans = orphansOf(cardsBefore, cardsOf(course.weeks).map((c) => c.m));
      if (orphans.size) for (const w of course.weeks) for (const l of w.lessons) l.modules = l.modules.filter((m) => !orphans.has(m.id));
      // Card trees can reach into later lessons, so the wiring is checked across the whole course.
      cleanCourseWiring(course.weeks);
      for (const l of list) for (const m of l.modules) syncSignup(course, m);
      if (orphans.size) extra = { removedFollowUps: [...orphans] };
      break;
    }
    case "addLesson": {
      const week = course.weeks.find((w) => w.id === body.weekId);
      const lesson: Lesson = { id: uid("l-"), title: typeof body.title === "string" && body.title.trim() && !AUTO_LESSON.test(body.title) ? body.title.trim().slice(0, 80) : "Lesson 0", modules: [], branches: {} };
      week?.lessons.push(lesson);
      extra = { lessonId: lesson.id };
      break;
    }
    case "addWeek":
      // A new week comes with its first lesson (named by its place after renumbering), ready for cards.
      course.weeks.push({ id: uid("w-"), title: body.title || `Week ${course.weeks.length}`, lessons: [{ id: uid("l-"), title: "Lesson 0", modules: [], branches: {} }] });
      break;

    // —— student ——
    case "setProgress": {
      if (body.status !== undefined && !["todo", "doing", "done"].includes(body.status)) return fail("Unknown status");
      // A quiz is finished only by submitting it, so its answers can't be revealed early or the try reset.
      if (body.status !== undefined && findModule(course, body.moduleId)?.mod.type === "quiz") delete body.status;
      const p = mine(body.studentId, body.moduleId);
      if (body.status === "done" && p.status !== "done") {
        logEvent(courseId, { kind: "done", studentId: body.studentId, moduleId: body.moduleId, text: `Finished “${findModule(course, body.moduleId)?.mod.title ?? ""}”` });
      }
      const mod = findModule(course, body.moduleId)?.mod;
      const steps = mod?.checklist?.filter((x) => x.trim()) ?? [];
      if (Array.isArray(body.checks)) {
        const n = steps.length;
        p.checks = [...new Set(body.checks.map(Number).filter((i: number) => Number.isInteger(i) && i >= 0 && i < n))] as number[];
      }
      if (Array.isArray(body.highlights)) {
        const len = mod?.body.length ?? 0;
        p.highlights = body.highlights
          .map((h: { start: unknown; end: unknown; note?: unknown }) => ({ start: Math.round(Number(h.start)), end: Math.round(Number(h.end)), note: h.note ? String(h.note).slice(0, 500) : undefined }))
          .filter((h: { start: number; end: number }) => h.start >= 0 && h.end > h.start && h.end <= len)
          .slice(0, 50);
      }
      if (Array.isArray(body.watched)) {
        const ids = new Set((mod?.playlist ?? []).map((x) => x.id));
        p.watched = [...new Set(body.watched.map(String).filter((x: string) => ids.has(x)))] as string[];
      }
      const mustWatch = (mod?.playlist ?? []).filter((x) => !x.optional);
      if (body.status === "done" && mustWatch.some((x) => !(p.watched ?? []).includes(x.id))) return fail("Watch the required videos first");
      if (Array.isArray(body.responses)) p.responses = body.responses.slice(0, 12).map((x: unknown) => String(x ?? "").slice(0, 4000));
      if (body.status === "done" && steps.length && (p.checks?.length ?? 0) < steps.length) return fail("Tick every step on the checklist first");
      if (body.status) p.status = body.status;
      if (typeof body.output === "string") p.output = body.output.slice(0, 8000);
      if (p.status === "todo") p.status = "doing";
      p.updatedAt = Date.now();
      break;
    }
    case "fillForm": {
      // A student answers the form on one of their cards. Sending again replaces their answers.
      const found = findModule(course, body.moduleId);
      const form = found?.mod.form;
      if (!found || form?.by !== "student") return fail("This card has no form for you to fill in");
      const chosen = d.choices[courseId]?.[body.studentId] ?? {};
      const theirs = !(found.lesson.elective && !chosen[`elective:${found.lesson.id}`]) && visibleModules(found.lesson, body.studentId, chosen, treeOf(course, body.studentId), course).some((x) => x.id === found.mod.id);
      if (!theirs) return fail("This card isn’t on your board");
      const a = (body.answers ?? {}) as Record<string, unknown>;
      const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
      const answers: Record<string, string> = {};
      for (const q of (form.questions ?? []).filter((x) => x.text.trim())) {
        const v = str(a[q.id], 4000);
        const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (v && (!opts.length || opts.includes(v))) answers[q.id] = v;
      }
      const ratings: Record<string, number> = {};
      if (form.parts.includes("levels")) for (const sk of course.skills ?? []) {
        const v = Number((body.levels as Record<string, unknown> | undefined)?.[sk.id]);
        if (v >= 1 && v <= 4) ratings[sk.id] = v;
      }
      const links = form.parts.includes("links") ? str(body.links, 4000).split(/\s+/).filter((u) => safeUrl(u) && /^https:\/\//i.test(u)).slice(0, 8) : [];
      if (!Object.keys(answers).length && !Object.keys(ratings).length && !links.length) return fail("Answer at least one question first");
      const p = mine(body.studentId, found.mod.id);
      p.form = { answers, at: Date.now() };
      if (form.parts.includes("levels")) p.ratings = Object.keys(ratings).length ? ratings : undefined;
      const have = new Set((p.work ?? []).map((w) => w.url));
      const added = links.filter((u) => !have.has(u)).map((url): Attachment => ({ id: uid("w-"), kind: "link", name: new URL(url).hostname.replace(/^www\./, ""), url: url.slice(0, 1000) }));
      if (added.length) p.work = [...(p.work ?? []), ...added].slice(-12);
      if (form.finish && p.status !== "done") {
        p.status = "done";
        logEvent(courseId, { kind: "done", studentId: body.studentId, moduleId: found.mod.id, text: `Finished “${found.mod.title}”` });
      } else if (p.status === "todo") p.status = "doing";
      p.updatedAt = Date.now();
      break;
    }
    case "chooseElective": {
      const lesson = findLesson(course, body.lessonId);
      if (!lesson?.elective) return fail("That isn’t an elective");
      const mineC = ((d.choices[courseId] ??= {})[body.studentId] ??= {});
      if (body.on) mineC[`elective:${lesson.id}`] = "yes";
      else {
        // Dropping it would hide work already started (drafts, posts, tries): only before any of it.
        const started = lesson.modules.some((m) => { const st = d.progress[courseId]?.[body.studentId]?.[m.id]?.status; return st && st !== "todo"; });
        if (started && !canTeach(session, course)) return fail("You’ve started this elective, so it stays on your board");
        delete mineC[`elective:${lesson.id}`];
      }
      break;
    }
    case "setElectiveMin": {
      course.electiveMin = Math.max(0, Math.min(10, Math.round(Number(body.min) || 0)));
      break;
    }
    case "setElective": {
      // —— teacher ——
      const lesson = findLesson(course, body.lessonId);
      if (!lesson) return fail("No such lesson");
      lesson.elective = !!body.on || undefined;
      if (typeof body.min === "number") course.electiveMin = Math.max(0, Math.min(10, Math.round(body.min)));
      break;
    }
    case "chooseBranch": {
      const lesson = findLesson(course, body.lessonId);
      if (!lesson?.choiceSlots?.includes(body.slot)) return fail("That isn’t a path you can choose");
      const exists = lesson.modules.some((m) => m.audience.kind === "branch" && m.audience.slot === body.slot && m.audience.variant === body.variant);
      if (!exists) return fail("No such path");
      ((d.choices[courseId] ??= {})[body.studentId] ??= {})[body.slot] = body.variant;
      break;
    }
    case "addWork": {
      const a = cleanAttachment(body.attachment);
      if (!a) return fail("That file or link can’t be added");
      const p = mine(body.studentId, body.moduleId);
      p.work = [...(p.work ?? []), a].slice(-12);
      if (p.status === "todo") p.status = "doing";
      p.updatedAt = Date.now();
      extra = { work: a };
      break;
    }
    case "renameWork": {
      const p = mine(body.studentId, body.moduleId);
      p.work = (p.work ?? []).map((w) => (w.id === body.workId ? { ...w, name: String(body.name).slice(0, 120) } : w));
      break;
    }
    case "removeWork": {
      const p = mine(body.studentId, body.moduleId);
      p.work = (p.work ?? []).filter((w) => w.id !== body.workId);
      break;
    }
    case "rate": {
      const p = mine(body.studentId, body.moduleId);
      const ratings: Record<string, number> = {};
      for (const sk of course.skills ?? []) {
        const v = Number(body.ratings?.[sk.id]);
        if (v >= 1 && v <= 4) ratings[sk.id] = v;
      }
      p.ratings = ratings;
      if (p.status === "todo") p.status = "doing";
      p.updatedAt = Date.now();
      break;
    }
    case "star": {
      const p = mine(body.studentId, body.moduleId);
      if (body.starred) {
        const count = Object.values(prog[body.studentId] ?? {}).filter((x) => x.starred).length;
        if (!p.starred && count >= 3) return fail("You can keep three selected works. Unstar one first.");
      }
      p.starred = !!body.starred;
      break;
    }
    case "answer": {
      const found = findModule(course, body.moduleId);
      const q = found?.mod.questions?.find((x) => x.id === body.qid);
      if (!found || !q) break;
      const p = mine(body.studentId, body.moduleId);
      if (p.status === "done" && found.mod.type === "quiz") break;
      const set = quizSet(found.mod, body.studentId, p.attempt ?? 1);
      if (!set.some((x) => x.id === q.id)) return fail("That question isn’t in your set");
      if (found.mod.type === "quiz" && found.mod.timeLimit) {
        if (!p.startedAt) return fail("Start the quiz first");
        if (Date.now() > p.startedAt + found.mod.timeLimit * 60_000 + 15_000) return fail("Time’s up for this try");
      }
      const given: AnswerValue =
        q.kind === "short" ? String(body.text ?? "").slice(0, 200)
        : q.kind === "multi" ? [...new Set((Array.isArray(body.multi) ? body.multi : []).map(Number).filter((i: number) => Number.isInteger(i) && i >= 0 && i < q.options.length))] as number[]
        : q.kind === "order" ? (Array.isArray(body.order) ? body.order : []).map(String).filter((x: string) => q.options.includes(x)).slice(0, q.options.length)
        : Number(body.choice);
      // A poll has no right answer: every vote counts.
      // A vote is final once it's in; on a sign-up poll, it can change until the teacher locks the groups.
      const signup = found.mod.poll && found.mod.signup ? found.mod.signup : null;
      if (found.mod.poll && !signup && p.answers?.[q.id] !== undefined) return fail("Your vote is already in");
      if (signup) {
        if (signup.locked) return fail("The groups are set. Ask your teacher to move you.");
        const choice = Number(body.choice);
        if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return fail("Pick a group");
        syncSignup(course, found.mod);
        const gs = course.groupings!.find((g) => g.id === signupGroupingId(found.mod.id))!;
        const target = gs.groups[choice];
        if (signup.max && !target.studentIds.includes(body.studentId) && target.studentIds.length >= signup.max) return fail(`${target.name} is full. Pick another group.`);
        for (const g of gs.groups) g.studentIds = g.studentIds.filter((x) => x !== body.studentId);
        target.studentIds.push(body.studentId);
      }
      const right = found.mod.poll ? true : isCorrect(q, given);
      (p.answers ??= {})[q.id] = given;
      // Card tree: the first answer decides which follow-up cards this student gets; later answers don't change it.
      let dealtNow: string[] = [];
      const answeredNow = q.kind === "multi" ? (given as number[]).length > 0 : q.kind === "short" || q.kind === "order" ? true : Number.isInteger(given);
      const firstTime = answeredNow && (p.first ??= {})[q.id] === undefined;
      // A quiz deals when it's submitted, not halfway through.
      if (found.mod.type !== "quiz" && answeredNow && (firstTime || (deals(q) && p.dealt?.[q.id] === undefined))) {
        const before = treeOf(course, body.studentId).dealt;
        if (firstTime) p.first![q.id] = right;
        if (deals(q) && (p.dealt ??= {})[q.id] === undefined) p.dealt[q.id] = given;
        // A card group scores once every Multiple choice card in it has a first answer.
        const group = found.lesson.modules.find((g) => g.type === "group" && g.members?.includes(found.mod.id));
        if (group) {
          const gp = mine(body.studentId, group.id);
          const sc = groupScore(group, found.lesson.modules, d.progress[courseId]?.[body.studentId] ?? {});
          if (sc.done && gp.dealt?.[SCORE] === undefined) {
            (gp.dealt ??= {})[SCORE] = sc.pct!;
            gp.score = sc.right;
            gp.status = "done";
            gp.updatedAt = Date.now();
          }
        }
        dealtNow = [...treeOf(course, body.studentId).dealt].filter((id) => !before.has(id));
      }
      (p.results ??= {})[q.id] = right;
      if (p.status === "todo") p.status = "doing";
      p.updatedAt = Date.now();
      const total = set.length;
      const answered = set.filter((x) => p.answers![x.id] !== undefined).length;
      const instant = found.mod.type !== "quiz";
      if (instant && !right && !found.mod.poll) {
        logEvent(courseId, {
          kind: "wrong", studentId: body.studentId, moduleId: body.moduleId,
          text: q.kind === "short"
            ? `Q${found.mod.questions!.indexOf(q) + 1}: wrote “${given}”; accepted: “${q.accept?.[0] ?? ""}”`
            : q.kind === "multi" || q.kind === "order" ? `Q${found.mod.questions!.indexOf(q) + 1}: not quite (${q.kind === "multi" ? "choose all that apply" : "order"})`
            : `Q${found.mod.questions!.indexOf(q) + 1}: chose “${q.options[given as number]}”; answer is “${q.options[q.answer ?? 0]}”`,
        });
      }
      if (instant && answered === total && p.status !== "done") {
        logEvent(courseId, { kind: "done", studentId: body.studentId, moduleId: body.moduleId, text: `Finished “${found.mod.title}”` });
      }
      if (instant) {
        p.score = set.filter((x) => p.results![x.id]).length;
        if (answered === total) p.status = "done";
        extra = { correct: right, explain: right ? q.explain : undefined, dealt: titles(course, dealtNow) };
      }
      break;
    }
    case "submitQuiz": {
      const p = mine(body.studentId, body.moduleId);
      const quiz = findModule(course, body.moduleId)?.mod;
      const set = quiz ? quizSet(quiz, body.studentId, p.attempt ?? 1) : [];
      p.score = set.filter((x) => p.results?.[x.id]).length;
      // Card tree: the first submitted answers decide which follow-ups this student gets. Every submitted score is kept, so a
      // better retake also deals the card for its band (what was dealt before stays).
      let dealtNow: string[] = [];
      if (quiz) {
        const before = treeOf(course, body.studentId).dealt;
        for (const q of set) {
          const a = p.answers?.[q.id];
          if (deals(q) && (p.dealt ??= {})[q.id] === undefined && (Array.isArray(a) ? a.length > 0 : Number.isInteger(a))) p.dealt[q.id] = a!;
        }
        // The score is a percent of the questions this student was given (so a random draw from a bank works too).
        if (dealsByScore(quiz) && set.length) {
          const pct = Math.round((p.score * 100) / set.length), had = scoresIn((p.dealt ??= {})[SCORE]);
          if (!had.includes(pct)) p.dealt[SCORE] = [...had, pct];
        }
        dealtNow = [...treeOf(course, body.studentId).dealt].filter((id) => !before.has(id));
      }
      if (p.status !== "done") {
        logEvent(courseId, { kind: "quiz", studentId: body.studentId, moduleId: body.moduleId, text: `Submitted “${quiz?.title ?? ""}”: ${p.score}/${set.length}` });
      }
      p.status = "done";
      p.attempt ??= 1;
      p.best = Math.max(p.best ?? 0, p.score);
      p.updatedAt = Date.now();
      extra = { score: p.score, dealt: titles(course, dealtNow) };
      break;
    }
    case "startQuiz": {
      const quiz = findModule(course, body.moduleId)?.mod;
      if (!quiz || quiz.type !== "quiz") return fail("No such quiz");
      const p = mine(body.studentId, body.moduleId);
      if (p.status !== "done" && !p.startedAt) {
        p.startedAt = Date.now();
        p.status = "doing";
      }
      extra = { startedAt: p.startedAt };
      break;
    }
    case "retakeQuiz": {
      const quiz = findModule(course, body.moduleId)?.mod;
      const p = mine(body.studentId, body.moduleId);
      if (!quiz || quiz.type !== "quiz" || p.status !== "done") return fail("Nothing to retake");
      if ((p.attempt ?? 1) >= (quiz.attempts ?? 1)) return fail("You’ve used all your tries on this quiz");
      p.attempt = (p.attempt ?? 1) + 1;
      p.answers = {};
      p.results = {};
      p.score = undefined;
      p.startedAt = undefined;
      p.status = "doing";
      p.updatedAt = Date.now();
      break;
    }
    case "rehearse": {
      const sec = Math.round(Number(body.seconds));
      if (!(sec >= 1 && sec <= 3600)) return fail("That rehearsal time doesn’t look right");
      const p = mine(body.studentId, body.moduleId);
      p.rehearsals = [...(p.rehearsals ?? []), sec].slice(-20);
      if (p.status === "todo") p.status = "doing";
      p.updatedAt = Date.now();
      break;
    }
    case "uptake": {
      const key = String(body.key ?? "").slice(0, 80);
      if (!key) return fail("Which feedback?");
      const mineUp = ((d.uptake[courseId] ??= {})[body.studentId] ??= {});
      if (body.on) mineUp[key] = Date.now();
      else delete mineUp[key];
      break;
    }
    case "savePlan": {
      const plans = (d.plans[courseId] ??= {});
      const prev = plans[body.studentId];
      const b = body.plan ?? {};
      const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
      const conf: Record<string, number> = {};
      for (const [k, v] of Object.entries(b.confidence ?? {})) if (/^[a-z]{2,12}$/.test(k) && Number(v) >= 1 && Number(v) <= 5) conf[k] = Math.round(Number(v));
      const plan: Plan = {
        purposes: (Array.isArray(b.purposes) ? b.purposes : []).map((x: unknown) => str(x, 60)).filter(Boolean).slice(0, 8),
        purposeNote: str(b.purposeNote, 400) || undefined,
        goal: str(b.goal, 400) || undefined,
        objectives: (Array.isArray(b.objectives) ? b.objectives : []).slice(0, 5).map((o: { id?: unknown; lo?: unknown; lm?: unknown; status?: unknown }) => ({
          id: str(o.id, 20) || uid("lo-"), lo: str(o.lo, 300), lm: str(o.lm, 300),
          status: o.status === "getting" || o.status === "achieved" || o.status === "notyet" ? o.status : undefined,
        })).filter((o: { lo: string }) => o.lo),
        confidence: conf,
        confidenceStart: prev?.confidenceStart ?? (Object.keys(conf).length ? conf : undefined),
        prca: prev?.prca,
        focus: prev?.focus,
        drills: prev?.drills,
        updatedAt: Date.now(),
      };
      if (Array.isArray(b.prca) && b.prca.length === 6 && b.prca.every((x: unknown) => Number(x) >= 1 && Number(x) <= 5)) {
        const answers = b.prca.map(Number);
        plan.prca = [...(prev?.prca ?? []), { answers, score: prcaScore(answers).score, at: Date.now() }].slice(-6);
      }
      if (Array.isArray(b.focus)) plan.focus = { subskills: b.focus.map((x: unknown) => str(x, 60)).filter(Boolean).slice(0, 2), at: Date.now() };
      plans[body.studentId] = plan;
      break;
    }
    case "drill": {
      const plans = (d.plans[courseId] ??= {});
      const plan = (plans[body.studentId] ??= { purposes: [], objectives: [], confidence: {}, updatedAt: Date.now() });
      const day = String(body.day ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail("Which day?");
      const feel = Number(body.feel) >= 1 && Number(body.feel) <= 4 ? Number(body.feel) : undefined;
      plan.drills = [...(plan.drills ?? []).filter((x) => !(x.day === day && x.id === body.id)), { day, id: String(body.id).slice(0, 20), feel }].slice(-200);
      break;
    }
    case "feel": {
      const p = mine(body.studentId, body.moduleId);
      const n = (p.rehearsals ?? []).length;
      const v = Number(body.v);
      if (!n || !(v >= 1 && v <= 4)) return fail("Nothing to rate");
      const feel = [...(p.feel ?? [])];
      feel[n - 1] = v;
      p.feel = feel;
      break;
    }
    case "saveFlow": {
      const mod = findModule(course, body.moduleId)?.mod;
      if (mod?.type !== "builder") return fail("That isn’t a speech card");
      const f = body.flow ?? {};
      const answers: Record<string, string> = {};
      for (const [k, v] of Object.entries(f.answers ?? {})) if (/^[a-z]{2,12}$/.test(k)) answers[k] = String(v ?? "").slice(0, 800);
      const p = mine(body.studentId, body.moduleId);
      p.flow = {
        path: f.path === "idea" || f.path === "story" ? f.path : undefined,
        step: Number.isInteger(f.step) ? Math.max(0, Math.min(20, f.step)) : undefined,
        answers,
        tiles: Array.isArray(f.tiles) ? f.tiles.slice(0, 24).map((t: { id?: unknown; kind?: unknown; text?: unknown }) => ({ id: String(t.id ?? uid("t-")).slice(0, 20), kind: String(t.kind ?? "note").slice(0, 12), text: String(t.text ?? "").slice(0, 1200) })) : undefined,
      };
      if (p.status === "todo") p.status = "doing";
      p.updatedAt = Date.now();
      break;
    }
    case "saveSpeech": {
      const mod = findModule(course, body.moduleId)?.mod;
      if (mod?.type !== "builder") return fail("That isn’t a builder card");
      const s = (v: unknown, n = 600) => String(v ?? "").slice(0, n);
      const f = body.fields ?? {};
      const fields = {
        audience: s(f.audience, 200), purpose: s(f.purpose, 300), hook: s(f.hook), core: s(f.core, 300),
        points: (Array.isArray(f.points) ? f.points : []).slice(0, 5).map((x: { point?: unknown; example?: unknown }) => ({ point: s(x?.point, 300), example: s(x?.example) })),
        close: s(f.close),
        structure: f.structure ? s(f.structure, 20) : undefined,
        hookType: f.hookType ? s(f.hookType, 20) : undefined,
        closeType: f.closeType ? s(f.closeType, 20) : undefined,
      };
      const p = mine(body.studentId, body.moduleId);
      const prev = p.speech ?? { fields, versions: [] };
      p.speech = { fields, versions: prev.versions };
      if (body.version) p.speech.versions = [...prev.versions, { at: Date.now(), label: body.label ? s(body.label, 60) : undefined, fields }].slice(-20);
      if (p.status === "todo") p.status = "doing";
      p.updatedAt = Date.now();
      break;
    }
    case "nudge": {
      // —— teacher ——
      const ids: string[] = (Array.isArray(body.studentIds) ? body.studentIds : [body.studentId]).filter((x: unknown) => course.students.some((st) => st.id === x));
      const text = String(body.text ?? "").trim().slice(0, 300);
      if (!ids.length || !text) return fail("Choose who to remind and write a message");
      const list = (d.nudges[courseId] ??= []);
      for (const sid of ids) list.push({ id: uid("n-"), studentId: sid, text, moduleId: body.moduleId ? String(body.moduleId) : undefined, at: Date.now() });
      if (list.length > 1000) list.splice(0, list.length - 1000);
      extra = { sent: ids.length };
      break;
    }
    case "message":
    case "messageTeacher": {
      // A message in the conversation between the teacher and one student ("message": the teacher writes;
      // "messageTeacher": the student does).
      const text = String(body.text ?? "").trim().slice(0, 2000);
      if (!text || !isStudent(body.studentId)) return fail("Write a message");
      const list = (d.nudges[courseId] ??= []);
      const msg = { id: uid("n-"), studentId: body.studentId, text, at: Date.now(), ...(body.op === "messageTeacher" ? { from: "student" as const } : {}) };
      list.push(msg);
      if (list.length > 3000) list.splice(0, list.length - 3000);
      extra = { message: msg };
      break;
    }
    case "setPeerMessages":
      // —— teacher —— Students may message each other (the default) or only the teacher.
      course.peerMessages = body.on === false ? false : undefined;
      break;
    case "readMessages":
    case "readMyMessages": {
      // The teacher has read a student's messages ("readMessages"), or the student has read the teacher's.
      const fromStudent = body.op === "readMessages";
      for (const n of d.nudges[courseId] ?? []) if (n.studentId === body.studentId && !!n.from === fromStudent) n.read = true;
      break;
    }
    case "resetPin": {
      // Resetting a student's sign-in unlinks the account that was them, turns off their links (a link that went to
      // the wrong person) and clears an old PIN. A new invitation then links whoever opens it.
      if (d.pins[courseId]) delete d.pins[courseId][body.studentId];
      const st = course.students.find((s) => s.id === body.studentId);
      if (st) { revokeInvites(st); st.userId = undefined; }
      // And whoever is signed in as them now is signed out, so the wrong person doesn't stay in.
      for (const [k, v] of Object.entries(d.sessions)) if (v.kind === "student" && v.courseId === courseId && v.studentId === body.studentId) delete d.sessions[k];
      break;
    }
    // —— live class ——
    case "startPoll": {
      const options = (Array.isArray(body.options) ? body.options : []).map((x: unknown) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 6);
      const question = String(body.question ?? "").trim().slice(0, 200);
      if (!question || options.length < 2) return fail("Write a question and at least two options");
      (d.live[courseId] ??= { hands: {} }).poll = { id: uid("poll-"), question, options, votes: {}, open: true, at: Date.now() };
      break;
    }
    case "closePoll": {
      const poll = d.live[courseId]?.poll;
      if (poll) {
        if (body.clear) d.live[courseId].poll = undefined;
        else poll.open = false;
      }
      break;
    }
    case "vote": {
      const poll = d.live[courseId]?.poll;
      if (!poll || poll.id !== body.pollId) return fail("That poll has ended");
      if (!poll.open) return fail("Voting is closed");
      const c = Number(body.choice);
      if (!(c >= 0 && c < poll.options.length)) return fail("Pick an option");
      poll.votes[body.studentId] = c;
      break;
    }
    case "hand": {
      const live = (d.live[courseId] ??= { hands: {} });
      if (body.down) delete live.hands[body.studentId];
      else {
        live.hands[body.studentId] = { kind: body.kind === "stuck" ? "stuck" : "question", note: body.note ? String(body.note).slice(0, 200) : undefined, at: Date.now() };
        logEvent(courseId, { kind: "post", studentId: body.studentId, moduleId: "", text: body.kind === "stuck" ? `Is stuck${body.note ? `: ${String(body.note).slice(0, 80)}` : ""}` : `Raised a hand${body.note ? `: ${String(body.note).slice(0, 80)}` : ""}` });
      }
      break;
    }
    case "clearHand": {
      const live = d.live[courseId];
      if (live) {
        if (body.all) live.hands = {};
        else delete live.hands[body.studentId];
      }
      break;
    }
    case "addMark": {
      const from = body.studentId ? String(body.studentId) : "teacher";
      const marks = (d.marks[courseId] ??= []);
      if (body.studentId && !visibleWork(course, from).has(body.attachmentId)) return fail("You can’t comment on that recording");
      const sec = Number(body.sec);
      const text = String(body.text ?? "").trim().slice(0, 500);
      if (!(sec >= 0 && sec < 36000) || !text) return fail("Write a note first");
      const mark = { id: uid("mk-"), attachmentId: String(body.attachmentId), from, sec: Math.round(sec * 10) / 10, text, at: Date.now() };
      marks.push(mark);
      if (marks.length > 5000) marks.splice(0, marks.length - 5000);
      extra = { mark };
      break;
    }
    case "removeMark": {
      const from = body.studentId ? String(body.studentId) : "teacher";
      const marks = d.marks[courseId] ?? [];
      const i = marks.findIndex((mk) => mk.id === body.id && (mk.from === from || from === "teacher"));
      if (i < 0) return fail("That note is already gone");
      marks.splice(i, 1);
      break;
    }
    case "review": {
      // —— teacher ——
      const rf = findModule(course, body.moduleId);
      if (!rf) return fail("No such card");
      if (!course.students.some((st) => st.id === body.studentId)) return fail("No such student");
      const p = mine(body.studentId, body.moduleId);
      // A group's worksheet is one piece of work: the review goes to everyone who wrote it. For work each student did on
      // their own, "toGroup" sends the same feedback to everyone in the student's group (on this card) who handed it in.
      let ids = sharers(rf.mod, body.studentId);
      if (body.toGroup && ids.length === 1) {
        const g = groupFor(course, rf.mod, body.studentId);
        if (g && g.id !== "all") ids = g.studentIds.filter((sid) => course.students.some((st) => st.id === sid) && (sid === body.studentId || d.progress[courseId]?.[sid]?.[body.moduleId]?.status === "done"));
      }
      const reviewed = ids.map((sid) => mine(sid, body.moduleId));
      extra = { reviewed: ids.length };
      if (body.clear) {
        for (const x of reviewed) x.review = undefined;
        break;
      }
      // Feedback is for work handed in (an open answer, a worksheet); a card that's only read, a quiz or a discussion has none.
      if (!reviewableCard(rf.mod)) return fail("There’s nothing handed in on this card to give feedback on");
      const verdict = body.verdict === "revise" ? "revise" : "good";
      const levels: Record<string, number> = {};
      for (const sk of course.skills ?? []) {
        const v = Number(body.levels?.[sk.id]);
        if (v >= 1 && v <= 4) levels[sk.id] = v;
      }
      const attachments = (Array.isArray(body.attachments) ? body.attachments : []).map(cleanAttachment).filter((a: Attachment | null): a is Attachment => !!a).slice(0, 3);
      const review: NonNullable<Progress["review"]> = { verdict, text: String(body.text ?? "").slice(0, 2000), at: Date.now(), levels: Object.keys(levels).length ? levels : undefined, attachments: attachments.length ? attachments : undefined };
      for (const x of reviewed) {
        x.review = { ...review };
        // Asking for a revision puts the card back in the student's hand.
        if (verdict === "revise" && x.status === "done") x.status = "doing";
      }
      break;
    }
    case "docNote":
    case "docReply": {
      // A comment on a student's own copy of a Text card: the teacher's on a passage ("docNote", with `quote`), or a
      // reply to one, from the teacher ("docNote" with `replyTo`) or the student ("docReply").
      if (!findModule(course, body.moduleId)) return fail("No such card");
      const p = mine(body.studentId, body.moduleId);
      const text = String(body.text ?? "").trim().slice(0, 2000);
      if (!text) return fail("Write a comment");
      const notes = (p.notes ??= []);
      const replyTo = body.replyTo ? String(body.replyTo) : undefined;
      if (replyTo && !notes.some((n) => n.id === replyTo)) return fail("That comment is gone");
      if (body.op === "docReply" && !replyTo) return fail("Reply to one of your teacher’s comments");
      const quote = body.op === "docNote" && !replyTo && body.quote ? String(body.quote).slice(0, 400) : undefined;
      const note = { id: uid("dn-"), by: body.op === "docNote" ? "teacher" as const : "student" as const, text, at: Date.now(), quote, replyTo, ...(body.op === "docReply" ? { from: body.studentId } : {}) };
      // On a group's worksheet, comments and replies are on the group's copy: everyone in the group sees them.
      const found = findModule(course, body.moduleId)!;
      for (const sid of sharers(found.mod, body.studentId)) {
        const list = (mine(sid, body.moduleId).notes ??= []);
        if (sid !== body.studentId && list.some((n) => n.id === note.id)) continue;
        list.push(sid === body.studentId ? note : { ...note });
        if (list.length > 300) list.splice(0, list.length - 300);
      }
      void notes;
      extra = { note };
      break;
    }
    case "handInShared": {
      // A shared Text card is handed in: a group's copy for everyone in the group (each gets the same text), the
      // class's copy for the student who pressed it. The text is also kept as a version.
      const found = findModule(course, body.moduleId);
      const key = found && docKey(course, found.mod, body.studentId);
      if (!found || !key) return fail("This card isn’t shared");
      const md = entryOf(courseId, key)?.md ?? "";
      if (!md.trim()) return fail("Write something first");
      setText(courseId, key, md, true);
      const who = found.mod.writers === "group" ? writersOf(course, key) : [body.studentId];
      for (const sid of who) {
        const p = mine(sid, body.moduleId);
        p.output = md;
        p.status = "done";
        p.updatedAt = Date.now();
      }
      extra = { handedIn: who.length };
      break;
    }
    case "docNoteDelete": {
      // —— teacher —— Remove a comment (and the replies to it).
      const id = String(body.noteId ?? "");
      const dm = findModule(course, body.moduleId);
      for (const sid of dm ? sharers(dm.mod, body.studentId) : [body.studentId]) {
        const p = mine(sid, body.moduleId);
        p.notes = (p.notes ?? []).filter((n) => n.id !== id && n.replyTo !== id);
        if (!p.notes.length) p.notes = undefined;
      }
      break;
    }
    case "addPost": {
      const found = findModule(course, body.moduleId);
      if (!found || found.mod.type !== "wall") return fail("No such wall");
      const w = wallOf(found.mod);
      const teacher = body.studentId === "teacher";
      if (!teacher && w.posting === "teacher") return fail("Only your teacher can post on this wall");
      // A post is written like a card (formatting, tables, math) and can carry media.
      const text = String(body.text ?? "").trim().slice(0, 8000);
      const work = (Array.isArray(body.work) ? body.work : []).map(cleanAttachment).filter((a: Attachment | null): a is Attachment => !!a).slice(0, 6);
      if (!text && !work.length) return fail("Write something or attach something first");
      // A discussion by groups: a student's post goes to their group's feed; a teacher's to the group they chose, or to all.
      const groupId = w.byGroup ? (teacher ? (typeof body.groupId === "string" && body.groupId ? body.groupId : undefined) : groupFor(course, found.mod, body.studentId)?.id) : undefined;
      const sections = w.sections?.filter((x) => x.trim()) ?? [];
      const section = sections.includes(body.section) ? String(body.section) : sections[0];
      const post: Post = {
        id: uid("p-"), moduleId: body.moduleId, studentId: teacher ? "teacher" : body.studentId, text, work, createdAt: Date.now(), section,
        anonymous: !teacher && w.anonymous ? true : undefined,
        approved: !teacher && w.approval ? false : undefined,
        groupId,
      };
      (d.posts[courseId] ??= []).push(post);
      if (!teacher) {
        const said = plainText(text).replace(/\s+/g, " ").trim().slice(0, 80);
        const toYou = mentionsIn(text).includes("teacher") ? "Mentioned you: " : "";
        logEvent(courseId, { kind: "post", studentId: body.studentId, moduleId: body.moduleId, text: w.approval ? `Waiting for approval: ${said}` : said ? `${toYou}${said}` : "Posted an attachment" });
        const p = mine(body.studentId, body.moduleId);
        // With peer replies required, posting starts the card; replying to enough classmates finishes it.
        p.status = wallProgress(d.posts[courseId], body.moduleId, body.studentId, repliesNeeded(course, found.mod, body.studentId)).done ? "done" : "doing";
        p.updatedAt = Date.now();
      }
      extra = { post: { ...post, mine: true } };
      break;
    }
    case "react": {
      const kind = body.kind === "vote" ? "votes" : "likes";
      const who = String(body.who ?? "");
      if (!who) return fail("Who is reacting?");
      if (body.target === "studio") {
        const sp = studio.posts.find((p) => p.id === body.id);
        if (!sp) return fail("That post is gone");
        const list = (sp.likes ??= []);
        sp.likes = list.includes(who) ? list.filter((x) => x !== who) : [...list, who];
        break;
      }
      const post = (d.posts[courseId] ?? []).find((p) => p.id === body.id);
      if (!post) return fail("That post is gone");
      const w = wallOf(findModule(course, post.moduleId)?.mod ?? {});
      const allowed = w.reactions === "both" || (w.reactions === "votes" && kind === "votes") || (w.reactions === "likes" && kind === "likes");
      if (!allowed) return fail("Reactions are off on this wall");
      const list = post[kind] ?? [];
      post[kind] = list.includes(who) ? list.filter((x) => x !== who) : [...list, who];
      break;
    }
    case "comment": {
      const post = (d.posts[courseId] ?? []).find((p) => p.id === body.postId);
      if (!post) return fail("That post is gone");
      const w = wallOf(findModule(course, post.moduleId)?.mod ?? {});
      const who = String(body.who ?? "");
      if (typeof body.remove === "string") {
        // Take a reply back: its writer can, and the teacher can remove anyone's.
        const c = (post.comments ?? []).find((x) => x.id === body.remove);
        if (!c) return fail("That reply is gone");
        if (c.from !== who && who !== "teacher") return fail("You can only delete your own replies");
        // The replies under it go with it.
        const gone = new Set([c.id]);
        for (let more = true; more;) { more = false; for (const x of post.comments ?? []) if (x.replyTo && gone.has(x.replyTo) && !gone.has(x.id)) { gone.add(x.id); more = true; } }
        post.comments = (post.comments ?? []).filter((x) => !gone.has(x.id));
        // Without that reply, a peer-review card may not be finished any more.
        if (c.from !== "teacher" && (w.replies ?? 0) > 0 && course.students.some((st) => st.id === c.from)) {
          const p = mine(c.from, post.moduleId);
          if (p.status === "done" && !wallProgress(d.posts[courseId], post.moduleId, c.from, repliesNeeded(course, findModule(course, post.moduleId)!.mod, c.from)).done) { p.status = "doing"; p.updatedAt = Date.now(); }
        }
        break;
      }
      if (typeof body.helpful === "string") {
        // Structured feedback: the post's author marks a reply to their post helpful (or takes it back).
        const c = (post.comments ?? []).find((x) => x.id === body.helpful);
        if (!c) return fail("That reply is gone");
        if (post.studentId !== who) return fail("Only the person who posted can mark feedback helpful");
        c.helpful = !c.helpful || undefined;
        break;
      }
      if (!w.comments && who !== "teacher") return fail("Comments are off on this wall");
      // In a discussion by groups, students reply only within their group (and to the teacher's posts).
      if (who !== "teacher" && post.groupId && post.studentId !== who && groupFor(course, findModule(course, post.moduleId)?.mod, who)?.id !== post.groupId) return fail("You can only reply in your own group");
      const text = String(body.text ?? "").trim().slice(0, 4000);
      const work = (Array.isArray(body.work) ? body.work : []).map(cleanAttachment).filter((a: Attachment | null): a is Attachment => !!a).slice(0, 4);
      if (!text && !work.length) return fail("Write a reply or record one first");
      // A reply to a reply makes a thread.
      const replyTo = typeof body.replyTo === "string" && body.replyTo ? body.replyTo : undefined;
      if (replyTo && !(post.comments ?? []).some((x) => x.id === replyTo)) return fail("That reply is gone");
      (post.comments ??= []).push({ id: uid("c-"), from: who, text, at: Date.now(), work: work.length ? work : undefined, replyTo });
      // A student @mentioning the teacher in a reply: the teacher hears about it.
      if (who !== "teacher" && mentionsIn(text).includes("teacher")) logEvent(courseId, { kind: "post", studentId: who, moduleId: post.moduleId, text: `Mentioned you: ${plainText(text).replace(/\s+/g, " ").trim().slice(0, 80)}` });
      // A reply can be what finishes a peer-review card.
      if (who !== "teacher" && (w.replies ?? 0) > 0 && course.students.some((st) => st.id === who)) {
        const prog = wallProgress(d.posts[courseId], post.moduleId, who, repliesNeeded(course, findModule(course, post.moduleId)!.mod, who));
        const p = mine(who, post.moduleId);
        if (prog.done && p.status !== "done") { p.status = "done"; p.updatedAt = Date.now(); }
      }
      break;
    }
    case "moderatePost": {
      const list = d.posts[courseId] ?? [];
      const post = list.find((p) => p.id === body.postId);
      if (!post) return fail("That post is gone");
      if (body.remove) d.posts[courseId] = list.filter((p) => p.id !== body.postId);
      if (typeof body.approved === "boolean") post.approved = body.approved ? undefined : false;
      if (typeof body.pinned === "boolean") post.pinned = body.pinned || undefined;
      if (typeof body.section === "string") post.section = body.section;
      break;
    }
    case "editPost": {
      const list = d.posts[courseId] ?? [];
      const post = list.find((p) => p.id === body.postId);
      if (!post) return fail("That post is gone");
      if (post.studentId !== body.studentId) return fail("You can only change your own posts");
      if (body.remove) {
        d.posts[courseId] = list.filter((p) => p.id !== post.id);
        break;
      }
      const text = String(body.text ?? "").trim().slice(0, 8000);
      if (!text && !post.work?.length) return fail("A post can’t be empty");
      post.text = text;
      post.editedAt = Date.now();
      // On a wall that needs approval, a changed post goes back to the teacher.
      const wm = findModule(course, post.moduleId)?.mod;
      if (wm && wallOf(wm).approval) post.approved = false;
      break;
    }
    case "setAccess": {
      const a = body.access ?? {};
      course.access = {
        joinOpen: a.joinOpen !== false,
        passcode: a.passcode ? String(a.passcode).slice(0, 40) : undefined,
        guestToken: a.guestToken === true ? randomCode(16).toLowerCase() : a.guestToken === null ? undefined : course.access?.guestToken,
        selfJoin: a.selfJoin === "open" || a.selfJoin === "approve" ? a.selfJoin : undefined,
      };
      if (body.newCode) {
        const codes = new Set(Object.values(d.courses).map((c) => c.joinCode));
        do course.joinCode = randomCode(6); while (codes.has(course.joinCode));
      }
      break;
    }
    case "deleteLesson": {
      // —— teacher —— A lesson and its cards, gone (students' work on them stays saved). A week left empty goes too.
      const w = course.weeks.find((x) => x.lessons.some((l) => l.id === body.lessonId));
      if (!w) return fail("No such lesson");
      if (course.weeks.reduce((n, x) => n + x.lessons.length, 0) <= 1) return fail("A course needs at least one lesson");
      w.lessons = w.lessons.filter((l) => l.id !== body.lessonId);
      if (!w.lessons.length) course.weeks = course.weeks.filter((x) => x !== w);
      if (course.currentLessonId === body.lessonId) course.currentLessonId = course.weeks[0].lessons[0].id;
      break;
    }
    case "deleteWeek": {
      // —— teacher —— A week with all its lessons.
      if (!course.weeks.some((x) => x.id === body.weekId)) return fail("No such week");
      if (course.weeks.length <= 1) return fail("A course needs at least one week");
      const gone = new Set(course.weeks.find((x) => x.id === body.weekId)!.lessons.map((l) => l.id));
      course.weeks = course.weeks.filter((x) => x.id !== body.weekId);
      if (gone.has(course.currentLessonId)) course.currentLessonId = course.weeks[0].lessons[0].id;
      break;
    }
    case "duplicateWeek": {
      const i = course.weeks.findIndex((w) => w.id === body.weekId);
      if (i < 0) return fail("No such week");
      const copy = cloneWeek(course.weeks[i]);
      course.weeks.splice(i + 1, 0, copy);
      extra = { weekId: copy.id };
      break;
    }
    case "duplicateLesson": {
      for (const w of course.weeks) {
        const i = w.lessons.findIndex((l) => l.id === body.lessonId);
        if (i < 0) continue;
        const copy = cloneLesson(w.lessons[i], `${w.lessons[i].title} (copy)`);
        w.lessons.splice(i + 1, 0, copy);
        extra = { lessonId: copy.id };
      }
      break;
    }
    case "insertWeek": {
      // A week built from a template or an imported file; every id is replaced.
      const src = body.week as Week;
      if (!src?.lessons?.length) return fail("That week has no lessons");
      const copy = cloneWeek(src, String(src.title ?? `Week ${course.weeks.length}`).slice(0, 80));
      foldWeeks([copy]);
      kindWeeks([copy]);
      copy.lessons.forEach((l) => l.modules.forEach((m) => { m.attachments = (m.attachments ?? []).map(cleanAttachment).filter((a): a is Attachment => !!a); }));
      const at = typeof body.index === "number" ? body.index : course.weeks.length;
      course.weeks.splice(at, 0, copy);
      extra = { weekId: copy.id };
      break;
    }
    case "insertLesson": {
      const w = course.weeks.find((x) => x.id === body.weekId);
      if (!w || !body.lesson) return fail("No such week");
      const copy = cloneLesson(body.lesson as Lesson);
      foldWeeks([{ lessons: [copy] }]);
      kindWeeks([{ lessons: [copy] }]);
      copy.modules.forEach((m) => { m.attachments = (m.attachments ?? []).map(cleanAttachment).filter((a): a is Attachment => !!a); });
      w.lessons.push(copy);
      extra = { lessonId: copy.id };
      break;
    }
    case "studioPost": {
      const group = groupFor(course, findModule(course, body.moduleId)?.mod, body.studentId);
      if (!group) return fail("You aren’t in a group for this card yet. Ask your teacher.");
      const f = body.post ?? {};
      const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
      const work = (Array.isArray(f.work) ? f.work : []).map(cleanAttachment).filter((a: Attachment | null): a is Attachment => !!a).slice(0, 6);
      if (!str(f.text, 4000) && work.length === 0) return fail("Add your work: a recording, file, link, or some text");
      const existing = studio.posts.find((p) => p.studentId === body.studentId && p.moduleId === body.moduleId);
      const fields = {
        title: str(f.title, 140), audience: str(f.audience, 200), purpose: str(f.purpose, 300),
        skill: str(f.skill, 40), question: str(f.question, 300), text: str(f.text, 4000), work,
        rubric: Array.isArray(f.rubric) ? f.rubric.map((x: unknown) => str(x, 60)).filter(Boolean).slice(0, 3) : undefined,
      };
      if (existing) Object.assign(existing, fields, { updatedAt: Date.now(), groupId: group.id });
      else {
        studio.posts.push({ id: uid("sp-"), moduleId: body.moduleId, studentId: body.studentId, groupId: group.id, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
        logEvent(courseId, { kind: "studio", studentId: body.studentId, moduleId: body.moduleId, text: `Posted “${fields.title}” to ${group.name}` });
      }
      studioStatus(body.studentId, body.moduleId);
      break;
    }
    case "feedback": {
      const post = studio.posts.find((p) => p.id === body.postId);
      if (!post) return fail("That post is gone");
      if (post.studentId === body.studentId) return fail("Give feedback to your peers, not yourself");
      if (!groupFor(course, findModule(course, post.moduleId)?.mod, body.studentId)?.studentIds.includes(post.studentId)) return fail("You can only give feedback in your own group");
      const str = (v: unknown) => String(v ?? "").trim().slice(0, 1000);
      const fb = { observed: str(body.observed), effect: str(body.effect), next: str(body.next) };
      if (!fb.observed || !fb.next) return fail("Describe what you observed and one thing to try next");
      const level = Number(body.level);
      const rubric: Record<string, { level?: number; note?: string }> = {};
      for (const c of post.rubric ?? []) {
        const r = body.rubric?.[c];
        if (!r) continue;
        const lv = Number(r.level);
        rubric[c] = { level: lv >= 1 && lv <= 4 ? lv : undefined, note: String(r.note ?? "").trim().slice(0, 400) || undefined };
        if (!rubric[c].level && !rubric[c].note) delete rubric[c];
      }
      studio.feedback.push({ id: uid("fb-"), postId: post.id, fromId: body.studentId, ...fb, level: level >= 1 && level <= 4 ? level : undefined, rubric: Object.keys(rubric).length ? rubric : undefined, createdAt: Date.now() });
      const to = course.students.find((s) => s.id === post.studentId)?.name ?? "a peer";
      logEvent(courseId, { kind: "feedback", studentId: body.studentId, moduleId: post.moduleId, text: `Gave feedback to ${to}: “${fb.next.slice(0, 60)}”` });
      studioStatus(body.studentId, post.moduleId);
      break;
    }
    case "feedbackHelpful": {
      const fb = studio.feedback.find((f) => f.id === body.id);
      const post = fb && studio.posts.find((p) => p.id === fb.postId);
      if (!fb || !post) return fail("That feedback is gone");
      if (post.studentId !== body.studentId) return fail("Only the person who got this feedback can mark it");
      fb.helpful = !fb.helpful || undefined;
      break;
    }
    default:
      return fail("Unknown operation");
  }
    // Groups changed: a card for some groups forgets the ones that are gone.
    if (["saveGrouping", "deleteGrouping", "setGroups", "autoGroup", "deleteGroup"].includes(body.op)) {
      for (const w of course.weeks) for (const l of w.lessons) for (const m of l.modules) {
        const a = m.audience;
        if (a.kind === "student" && a.groups?.length) { const keep = a.groups.filter((ref) => groupByRef(course, ref)); a.groups = keep.length ? keep : undefined; }
      }
    }
    // After anything that adds or moves lessons, placeholder names follow position: Lesson 1, 2, 3 across the course.
    if (STRUCTURAL.has(body.op)) {
      renumberLessons(course);
      // Card trees span lessons: after lessons are added or copied, check every wire still points forward.
      cleanCourseWiring(course.weeks);
    }
  } catch (e) {
    // Malformed input (a null where an object belongs, and so on) is the sender's mistake, not a server crash.
    console.error("op failed", body.op, e instanceof Error ? e.message : e);
    return fail("Something in that request wasn’t right");
  }
  save();
  return Response.json({ ok: true, ...extra });
}

/**
 * Hands in timed quizzes whose time ran out while the student was away (tab closed, phone locked),
 * scoring what they answered, the same way the browser does when it's open. Returns whether anything changed.
 */
function finishExpiredQuizzes(course: Course): boolean {
  const prog = db().progress[course.id] ?? {};
  const now = Date.now();
  let changed = false;
  for (const lesson of course.weeks.flatMap((w) => w.lessons)) for (const quiz of lesson.modules) {
    if (quiz.type !== "quiz" || !quiz.timeLimit) continue;
    for (const [sid, row] of Object.entries(prog)) {
      const p = row[quiz.id];
      if (!p || p.status === "done" || !p.startedAt || now <= p.startedAt + quiz.timeLimit * 60_000 + 30_000) continue;
      const set = quizSet(quiz, sid, p.attempt ?? 1);
      p.score = set.filter((x) => p.results?.[x.id]).length;
      p.status = "done";
      p.attempt ??= 1;
      p.best = Math.max(p.best ?? 0, p.score);
      p.updatedAt = now;
      logEvent(course.id, { kind: "quiz", studentId: sid, moduleId: quiz.id, text: `Time ran out on “${quiz.title}”: ${p.score}/${set.length}` });
      changed = true;
    }
  }
  return changed;
}

/** Whether a card is on this student's board: visible to them, and not in an elective they haven't chosen. */
function onBoard(course: Course, studentId: string, moduleId: string): boolean {
  const found = findModule(course, moduleId);
  if (!found) return false;
  const chosen = db().choices[course.id]?.[studentId] ?? {};
  if (found.lesson.elective && !chosen[`elective:${found.lesson.id}`]) return false;
  return visibleModules(found.lesson, studentId, chosen, treeOf(course, studentId), course).some((m) => m.id === moduleId);
}
