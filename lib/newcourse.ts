import { cloneWeek } from "./clone";
import { fromPreset } from "./profile";
import { db } from "./store";
import { randomCode } from "./uploads";
import { DEFAULT_LEVELS } from "./skillsets";
import { kindWeeks } from "./kinds";
import { quizWeeks } from "./quizgroups";
import { syncSignup } from "./shared";
import type { Course, Lesson, Module, Week } from "./types";
import starter from "./questhand101.json";

/**
 * Make a course for a teacher from its weeks, with a fresh id and class code, and put it in the store (the caller
 * saves). Shared by New course and by the starter course every new teacher gets.
 */
export function makeCourse(ownerId: string, title: string, weeks: Week[], extra: Partial<Course> = {}): Course {
  const d = db();
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "course";
  let id = slug;
  while (d.courses[id]) id = `${slug}-${randomCode(4).toLowerCase()}`;
  const codes = new Set(Object.values(d.courses).map((c) => c.joinCode));
  let code = "";
  do code = randomCode(6); while (codes.has(code));
  quizWeeks(weeks);
  kindWeeks(weeks);
  const course: Course = {
    id,
    ownerId,
    title,
    createdAt: Date.now(),
    joinCode: code,
    // A new class list is empty, so students who scan the code add themselves and the teacher lets them in.
    access: { joinOpen: true, selfJoin: "approve" },
    profile: { ...fromPreset("secondary"), preset: "custom", horizon: "term" },
    students: [],
    skills: [],
    levels: DEFAULT_LEVELS,
    // No groups to start: groups are made on the cards that need them.
    groups: [],
    currentLessonId: weeks[0].lessons[0].id,
    enabledConnectors: ["wikipedia", "dictionary", "ai"],
    weeks,
    ...extra,
  };
  d.courses[id] = course;
  d.progress[id] = {};
  d.posts[id] = [];
  d.toolLog[id] = [];
  d.events[id] = [];
  d.choices[id] = {};
  return course;
}

type StarterLesson = { title: string; modules: Module[]; elective?: boolean };
type Starter = { title: string; subtitle?: string; electiveMin?: number; weeks: { title: string; lessons: StarterLesson[] }[] };

/**
 * Questhand 101, the short course on Questhand made in Questhand, as a new course for a teacher: every new teacher
 * account starts with one, to take as a student (Student View) and to look at as an example. Fresh ids throughout.
 */
export function giveStarterCourse(ownerId: string): Course {
  const s = starter as unknown as Starter;
  const weeks = s.weeks.map((w) => cloneWeek({
    id: "",
    title: w.title,
    lessons: w.lessons.map((l): Lesson => ({ id: "", title: l.title, modules: l.modules, branches: {}, elective: l.elective })),
  }, w.title));
  const course = makeCourse(ownerId, s.title, weeks, { subtitle: s.subtitle, electiveMin: s.electiveMin });
  // A sign-up poll's groups exist from the start, so cards that use them (or go to one of them) find them.
  for (const w of course.weeks) for (const l of w.lessons) for (const m of l.modules) syncSignup(course, m);
  return course;
}
