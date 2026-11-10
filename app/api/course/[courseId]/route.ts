import { cloneLesson, cloneWeek } from "@/lib/clone";
import { findLesson, uid, visibleModules, wallOf } from "@/lib/profile";
import { db, logEvent, reset, save } from "@/lib/store";
import { safeUrl } from "@/lib/uploads";
import { isCorrect } from "@/lib/grading";
import type { Attachment, Course, CourseState, Lesson, Module, Post, Progress, ProgressMap, Question, Week } from "@/lib/types";

/** A question as students receive it: no answer key, no accepted answers, no explanation. */
const publicQuestion = (q: Question): Question => ({ id: q.id, kind: q.kind, text: q.text, options: q.kind === "short" ? [] : q.options });

type Ctx = { params: Promise<{ courseId: string }> };

/** Each student gives feedback to at least this many peers per studio card. */
const FEEDBACK_GOAL = 2;

function findModule(course: Course, moduleId: string): { lesson: Lesson; mod: Module } | undefined {
  for (const w of course.weeks) for (const lesson of w.lessons) {
    const mod = lesson.modules.find((m) => m.id === moduleId);
    if (mod) return { lesson, mod };
  }
}

const groupOf = (course: Course, studentId: string) => course.groups?.find((g) => g.studentIds.includes(studentId));

/** What a student receives: only their cards, no answer keys, no version labels, only their group's studio. */
function forStudent(course: Course, studentId: string, chosen: Record<string, string>): Course {
  return {
    ...course,
    weeks: course.weeks.map((w) => ({
      ...w,
      lessons: w.lessons.map((l) => ({
        ...l,
        branches: {},
        modules: visibleModules(l, studentId, chosen).map((m) => ({
          ...m,
          audience: { kind: "all" as const },
          personal: m.audience.kind !== "all" && !m.choice && !m.picked,
          questions: m.questions?.map(publicQuestion),
        })),
      })),
    })),
  };
}

export async function GET(request: Request, { params }: Ctx) {
  const { courseId } = await params;
  const d = db();
  const course = d.courses[courseId];
  if (!course) return Response.json({ error: "No such course" }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const as = query.get("as");
  // Read-only guest view: course content only, no students, no work.
  const guest = query.get("guest");
  if (guest !== null) {
    if (!course.access?.guestToken || guest !== course.access.guestToken) return Response.json({ error: "This guest link has been turned off" }, { status: 403 });
    const view: CourseState = {
      course: {
        ...course, students: [], groups: [], joinCode: "", access: undefined,
        weeks: course.weeks.map((w) => ({ ...w, lessons: w.lessons.map((l) => ({ ...l, branches: {}, modules: l.modules.map((m) => ({ ...m, questions: m.questions?.map(publicQuestion) })) })) })),
      },
      progress: {}, posts: [], toolUse: {}, events: [], choices: {}, studio: { posts: [], feedback: [] }, marks: [],
    };
    return Response.json(view);
  }
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
        for (const q of mod.questions) {
          const earned = isQuiz ? p.status === "done" : p.results?.[q.id] === true;
          if (!earned) continue;
          reveal[q.id] = { explain: q.explain || undefined, ...(isQuiz ? { answer: q.kind === "short" ? undefined : q.answer, accept: q.kind === "short" ? q.accept?.[0] : undefined } : {}) };
        }
        view.reveal = reveal;
      }
      own[mid] = view;
    }
    progress = { [as]: own };
    const group = groupOf(course, as);
    const posts = studio.posts.filter((p) => p.studentId === as || (group && p.groupId === group.id));
    const ids = new Set(posts.map((p) => p.id));
    studioView = { posts, feedback: studio.feedback.filter((f) => ids.has(f.postId)) };
  }
  const allPosts = d.posts[courseId] ?? [];
  // Students don't see others' posts that await approval, or who wrote an anonymous post.
  const posts: Post[] = as
    ? allPosts
        .filter((p) => p.approved !== false || p.studentId === as)
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
  };
  return Response.json(state);
}

/** Recordings a student may see and comment on: their own work, and posts in their studio group. */
function visibleWork(course: Course, studentId: string): Set<string> {
  const d = db();
  const ids = new Set<string>();
  for (const p of Object.values(d.progress[course.id]?.[studentId] ?? {})) for (const w of p.work ?? []) ids.add(w.id);
  const group = groupOf(course, studentId);
  for (const p of d.studio[course.id]?.posts ?? []) if (p.studentId === studentId || (group && p.groupId === group.id)) for (const w of p.work) ids.add(w.id);
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
  };
}

export async function POST(request: Request, { params }: Ctx) {
  const { courseId } = await params;
  const body = await request.json();
  if (body.op === "reset") {
    if (courseId !== "demo") return Response.json({ ok: false, error: "Only the demo course can be restored" }, { status: 400 });
    reset();
    return Response.json({ ok: true });
  }
  const d = db();
  const course = d.courses[courseId];
  if (!course) return Response.json({ error: "No such course" }, { status: 404 });
  const prog = (d.progress[courseId] ??= {});
  const studio = (d.studio[courseId] ??= { posts: [], feedback: [] });
  const mine = (sid: string, mid: string): Progress => ((prog[sid] ??= {})[mid] ??= { status: "todo", updatedAt: Date.now() });
  const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });
  let extra: Record<string, unknown> = {};

  /** A studio card is done once you've posted and given feedback to enough peers. */
  function studioStatus(studentId: string, moduleId: string) {
    const posted = studio.posts.some((p) => p.studentId === studentId && p.moduleId === moduleId);
    const peers = (groupOf(course, studentId)?.studentIds.length ?? 1) - 1;
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

  switch (body.op) {
    // —— teacher ——
    case "setProfile":
      course.profile = body.profile;
      break;
    case "setCurrentLesson":
      if (findLesson(course, body.lessonId)) course.currentLessonId = body.lessonId;
      break;
    case "setEnabledConnectors":
      course.enabledConnectors = body.ids;
      break;
    case "addStudents": {
      // One name per line (or comma-separated). Duplicates of existing names are skipped.
      const names: string[] = String(body.names ?? "").split(/[\n,]/).map((x: string) => x.trim()).filter(Boolean).slice(0, 200);
      const have = new Set(course.students.map((x) => x.name.toLowerCase()));
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
    case "renameStudent": {
      const st = course.students.find((x) => x.id === body.studentId);
      if (st && String(body.name ?? "").trim()) st.name = String(body.name).trim().slice(0, 60);
      break;
    }
    case "removeStudent": {
      course.students = course.students.filter((x) => x.id !== body.studentId);
      course.groups = course.groups?.map((g) => ({ ...g, studentIds: g.studentIds.filter((x) => x !== body.studentId) }));
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
    case "setCourseInfo": {
      if (String(body.title ?? "").trim()) course.title = String(body.title).trim().slice(0, 80);
      if (typeof body.subtitle === "string") course.subtitle = body.subtitle.trim().slice(0, 120) || undefined;
      break;
    }
    case "setGroups":
      course.groups = (body.groups ?? []).map((g: { id: string; name: string; studentIds: string[] }) => ({
        id: g.id, name: String(g.name).slice(0, 40), studentIds: g.studentIds.filter((id) => course.students.some((s) => s.id === id)),
      }));
      break;
    case "saveLesson": {
      const next = body.lesson as Lesson;
      for (const m of next.modules) {
        m.attachments = (m.attachments ?? []).map(cleanAttachment).filter((a): a is Attachment => !!a).slice(0, 12);
      }
      for (const w of course.weeks) {
        const i = w.lessons.findIndex((l) => l.id === next.id);
        if (i >= 0) w.lessons[i] = next;
      }
      break;
    }
    case "addLesson": {
      const week = course.weeks.find((w) => w.id === body.weekId);
      const lesson: Lesson = { id: uid("l-"), title: body.title || "New lesson", modules: [], branches: {} };
      week?.lessons.push(lesson);
      extra = { lessonId: lesson.id };
      break;
    }
    case "addWeek":
      course.weeks.push({ id: uid("w-"), title: body.title || `Week ${course.weeks.length}`, lessons: [] });
      break;

    // —— student ——
    case "setProgress": {
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
      if (Array.isArray(body.responses)) p.responses = body.responses.slice(0, 12).map((x: unknown) => String(x ?? "").slice(0, 4000));
      if (body.status === "done" && steps.length && (p.checks?.length ?? 0) < steps.length) return fail("Tick every step on the checklist first");
      if (body.status) p.status = body.status;
      if (typeof body.output === "string") p.output = body.output.slice(0, 8000);
      if (p.status === "todo") p.status = "doing";
      p.updatedAt = Date.now();
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
      const given: number | string = q.kind === "short" ? String(body.text ?? "").slice(0, 200) : Number(body.choice);
      const right = isCorrect(q, given);
      (p.answers ??= {})[q.id] = given;
      (p.results ??= {})[q.id] = right;
      if (p.status === "todo") p.status = "doing";
      p.updatedAt = Date.now();
      const total = found.mod.questions!.length;
      const answered = Object.keys(p.answers).length;
      if (found.mod.type === "practice" && !right) {
        logEvent(courseId, {
          kind: "wrong", studentId: body.studentId, moduleId: body.moduleId,
          text: q.kind === "short"
            ? `Q${found.mod.questions!.indexOf(q) + 1}: wrote “${given}”; accepted: “${q.accept?.[0] ?? ""}”`
            : `Q${found.mod.questions!.indexOf(q) + 1}: chose “${q.options[given as number]}”; answer is “${q.options[q.answer ?? 0]}”`,
        });
      }
      if (found.mod.type === "practice" && answered === total && p.status !== "done") {
        logEvent(courseId, { kind: "done", studentId: body.studentId, moduleId: body.moduleId, text: `Finished “${found.mod.title}”` });
      }
      if (found.mod.type === "practice") {
        p.score = Object.values(p.results).filter(Boolean).length;
        if (answered === total) p.status = "done";
        extra = { correct: right, explain: right ? q.explain : undefined };
      }
      break;
    }
    case "submitQuiz": {
      const p = mine(body.studentId, body.moduleId);
      p.score = Object.values(p.results ?? {}).filter(Boolean).length;
      const quiz = findModule(course, body.moduleId)?.mod;
      if (p.status !== "done") {
        logEvent(courseId, { kind: "quiz", studentId: body.studentId, moduleId: body.moduleId, text: `Submitted “${quiz?.title ?? ""}”: ${p.score}/${quiz?.questions?.length ?? 0}` });
      }
      p.status = "done";
      p.attempt ??= 1;
      p.best = Math.max(p.best ?? 0, p.score);
      p.updatedAt = Date.now();
      extra = { score: p.score };
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
      if (!findModule(course, body.moduleId)) return fail("No such card");
      if (!course.students.some((st) => st.id === body.studentId)) return fail("No such student");
      const p = mine(body.studentId, body.moduleId);
      if (body.clear) {
        p.review = undefined;
        break;
      }
      const verdict = body.verdict === "revise" ? "revise" : "good";
      const levels: Record<string, number> = {};
      for (const sk of course.skills ?? []) {
        const v = Number(body.levels?.[sk.id]);
        if (v >= 1 && v <= 4) levels[sk.id] = v;
      }
      p.review = { verdict, text: String(body.text ?? "").slice(0, 2000), at: Date.now(), levels: Object.keys(levels).length ? levels : undefined };
      // Asking for a revision puts the card back in the student's hand.
      if (verdict === "revise" && p.status === "done") p.status = "doing";
      break;
    }
    case "addPost": {
      const found = findModule(course, body.moduleId);
      if (!found || found.mod.type !== "wall") return fail("No such wall");
      const w = wallOf(found.mod);
      const teacher = body.studentId === "teacher";
      if (!teacher && w.posting === "teacher") return fail("Only your teacher can post on this wall");
      const text = String(body.text ?? "").trim().slice(0, 1000);
      const work = (Array.isArray(body.work) ? body.work : []).map(cleanAttachment).filter((a: Attachment | null): a is Attachment => !!a).slice(0, 4);
      if (!text && !work.length) return fail("Write something or attach something first");
      const post: Post = {
        id: uid("p-"), moduleId: body.moduleId, studentId: teacher ? "teacher" : body.studentId, text, work, createdAt: Date.now(),
        anonymous: !teacher && w.anonymous ? true : undefined,
        approved: !teacher && w.approval ? false : undefined,
      };
      (d.posts[courseId] ??= []).push(post);
      if (!teacher) {
        logEvent(courseId, { kind: "post", studentId: body.studentId, moduleId: body.moduleId, text: w.approval ? `Waiting for approval: ${text.slice(0, 80)}` : text.slice(0, 80) || "Posted an attachment" });
        const p = mine(body.studentId, body.moduleId);
        p.status = "done";
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
      if (!w.comments && who !== "teacher") return fail("Comments are off on this wall");
      const text = String(body.text ?? "").trim().slice(0, 600);
      if (!text) return fail("Write a comment first");
      (post.comments ??= []).push({ id: uid("c-"), from: who, text, at: Date.now() });
      break;
    }
    case "moderatePost": {
      const list = d.posts[courseId] ?? [];
      const post = list.find((p) => p.id === body.postId);
      if (!post) return fail("That post is gone");
      if (body.remove) d.posts[courseId] = list.filter((p) => p.id !== body.postId);
      if (typeof body.approved === "boolean") post.approved = body.approved ? undefined : false;
      if (typeof body.pinned === "boolean") post.pinned = body.pinned || undefined;
      break;
    }
    case "setAccess": {
      const a = body.access ?? {};
      course.access = {
        joinOpen: a.joinOpen !== false,
        passcode: a.passcode ? String(a.passcode).slice(0, 40) : undefined,
        guestToken: a.guestToken === true ? Math.random().toString(36).slice(2, 12) : a.guestToken === null ? undefined : course.access?.guestToken,
      };
      if (body.newCode) course.joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();
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
      copy.modules.forEach((m) => { m.attachments = (m.attachments ?? []).map(cleanAttachment).filter((a): a is Attachment => !!a); });
      w.lessons.push(copy);
      extra = { lessonId: copy.id };
      break;
    }
    case "studioPost": {
      const group = groupOf(course, body.studentId);
      if (!group) return fail("You aren’t in a Collab Studio group yet. Ask your teacher.");
      const f = body.post ?? {};
      const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
      const work = (Array.isArray(f.work) ? f.work : []).map(cleanAttachment).filter((a: Attachment | null): a is Attachment => !!a).slice(0, 6);
      if (!str(f.text, 4000) && work.length === 0) return fail("Add your work: a recording, file, link, or some text");
      const existing = studio.posts.find((p) => p.studentId === body.studentId && p.moduleId === body.moduleId);
      const fields = {
        title: str(f.title, 140), audience: str(f.audience, 200), purpose: str(f.purpose, 300),
        skill: str(f.skill, 40), question: str(f.question, 300), text: str(f.text, 4000), work,
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
      if (groupOf(course, body.studentId)?.id !== post.groupId) return fail("You can only give feedback in your own group");
      const str = (v: unknown) => String(v ?? "").trim().slice(0, 1000);
      const fb = { observed: str(body.observed), effect: str(body.effect), next: str(body.next) };
      if (!fb.observed || !fb.next) return fail("Describe what you observed and one thing to try next");
      const level = Number(body.level);
      studio.feedback.push({ id: uid("fb-"), postId: post.id, fromId: body.studentId, ...fb, level: level >= 1 && level <= 4 ? level : undefined, createdAt: Date.now() });
      const to = course.students.find((s) => s.id === post.studentId)?.name ?? "a peer";
      logEvent(courseId, { kind: "feedback", studentId: body.studentId, moduleId: post.moduleId, text: `Gave feedback to ${to}: “${fb.next.slice(0, 60)}”` });
      studioStatus(body.studentId, post.moduleId);
      break;
    }
    default:
      return fail("Unknown operation");
  }
  save();
  return Response.json({ ok: true, ...extra });
}
