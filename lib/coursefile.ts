// A Questhand course file: a whole course (its weeks, lessons and cards, with their wiring and card groups) as one
// JSON file. Settings → Export course writes one; New course → From a course file makes a course from one. The cards
// are kept as the site keeps them, so nothing is lost on the way out and back in; ids in a file only have to be
// unique within it (they're replaced on import, and every wire, group and sign-up poll follows them).
// The format is written down in docs/course-file.md.
import { cloneLesson } from "./clone";
import { cleanCard } from "./cleancard";
import { isKind, typeOfKind } from "./kinds";
import { uid } from "./profile";
import type { Course, Lesson, Module, Week } from "./types";

export const COURSE_FILE = "questhand-course";
export const COURSE_FILE_VERSION = 1;

/** Limits on what one file can make (a big course is still well within them). */
const MAX = { weeks: 52, lessons: 40, cards: 200, total: 3000 };

export type CourseFileLesson = { title: string; goal?: string; elective?: boolean; session?: Lesson["session"]; modules: Module[] };
export type CourseFile = {
  format: typeof COURSE_FILE;
  version: number;
  title: string;
  subtitle?: string;
  electiveMin?: number;
  weeks: { title: string; lessons: CourseFileLesson[] }[];
};

/** A course as a file: its weeks, lessons and cards, without anything about its students. */
export function toCourseFile(course: Course): CourseFile {
  return {
    format: COURSE_FILE,
    version: COURSE_FILE_VERSION,
    title: course.title,
    ...(course.subtitle ? { subtitle: course.subtitle } : {}),
    ...(course.electiveMin ? { electiveMin: course.electiveMin } : {}),
    weeks: course.weeks.map((w) => ({
      title: w.title,
      lessons: w.lessons.map((l) => ({
        title: l.title,
        ...(l.goal ? { goal: l.goal } : {}),
        ...(l.elective ? { elective: true } : {}),
        ...(l.session ? { session: l.session } : {}),
        // A card's link to the teacher's own saved copy means nothing in someone else's course.
        modules: l.modules.map(({ collected: _c, ...m }) => m as Module),
      })),
    })),
  };
}

type Read = { ok: true; title: string; subtitle?: string; electiveMin?: number; weeks: Week[]; cards: number; notes: string[] } | { ok: false; error: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Read a course file into weeks ready to become a course: fresh ids everywhere (one map for the whole course, so a
 * wire into a later week lands on the copy), every card cleaned as a save would clean it, and what had to be changed
 * said in `notes`. Anything that isn't a course file is turned away with a reason a teacher can act on.
 */
export function readCourseFile(raw: unknown): Read {
  if (!isObj(raw)) return { ok: false, error: "That file isn’t a Questhand course file." };
  if (raw.format !== undefined && raw.format !== COURSE_FILE) return { ok: false, error: "That file isn’t a Questhand course file." };
  if (typeof raw.version === "number" && raw.version > COURSE_FILE_VERSION) return { ok: false, error: "That course file is from a newer Questhand. Reload the page and try again." };
  if (!Array.isArray(raw.weeks)) return { ok: false, error: "That file isn’t a Questhand course file." };
  const weeksIn = raw.weeks as unknown[];
  if (!weeksIn.length) return { ok: false, error: "That course file has no weeks in it." };
  if (weeksIn.length > MAX.weeks) return { ok: false, error: `A course file can have at most ${MAX.weeks} weeks.` };
  const notes: string[] = [];
  const ids = new Map<string, string>();
  let total = 0, forAll = 0, dropped = 0;
  const lessonsOf: { title: string; lessons: Lesson[] }[] = [];
  for (const [wi, w] of weeksIn.entries()) {
    if (!isObj(w) || !Array.isArray(w.lessons) || !w.lessons.length) return { ok: false, error: `Week ${wi + 1} has no lessons in it.` };
    if (w.lessons.length > MAX.lessons) return { ok: false, error: `Week ${wi + 1} has more than ${MAX.lessons} lessons.` };
    const lessons: Lesson[] = [];
    for (const [li, l] of w.lessons.entries()) {
      if (!isObj(l)) return { ok: false, error: `Lesson ${li + 1} in week ${wi + 1} isn’t readable.` };
      const mods = Array.isArray(l.modules) ? l.modules : Array.isArray(l.cards) ? l.cards : [];
      if (mods.length > MAX.cards) return { ok: false, error: `“${str(l.title, 60) || `Lesson ${li + 1}`}” has more than ${MAX.cards} cards.` };
      total += mods.length;
      if (total > MAX.total) return { ok: false, error: `A course file can have at most ${MAX.total} cards.` };
      const modules: Module[] = [];
      for (const m of mods) {
        if (!isObj(m)) { dropped++; continue; }
        const id = typeof m.id === "string" && m.id ? m.id.slice(0, 80) : uid("m-");
        if (ids.has(id)) return { ok: false, error: `Two cards in the file share the id “${id}”. Each card needs its own.` };
        ids.set(id, uid("m-"));
        // Who a card is for: everyone, or a path; a card for named students or groups (from another class) goes to
        // everyone here. Groups from a sign-up poll in the same file stay (they're made with the course).
        let audience = isObj(m.audience) ? (m.audience as Module["audience"]) : { kind: "all" as const };
        if (audience.kind === "student") {
          const groups = (audience.groups ?? []).filter((g) => typeof g === "string" && g.startsWith("gs-"));
          if (audience.studentId || audience.studentIds?.length || !groups.length) { audience = { kind: "all" }; forAll++; }
          else audience = { kind: "student", studentId: "", studentIds: [], groups };
        } else if (audience.kind !== "all" && audience.kind !== "branch") audience = { kind: "all" };
        // A card may give just its kind ("content", "choice", "answer", "worksheet", "discussion", "group"); its type
        // follows. Each question gets an id if it has none, and its options are words.
        const type = typeof m.type === "string" && m.type ? (m.type as Module["type"]) : isKind(m.kind) ? typeOfKind(m.kind) : "read";
        const questions = Array.isArray(m.questions) ? m.questions.filter(isObj).map((q) => ({
          ...(q as unknown as NonNullable<Module["questions"]>[number]),
          id: typeof q.id === "string" && q.id ? q.id.slice(0, 80) : uid("q-"),
          text: str(q.text, 2000),
          options: Array.isArray(q.options) ? q.options.map((o) => str(o, 500)).slice(0, 12) : [],
        })) : undefined;
        modules.push({
          ...(m as unknown as Module),
          id,
          type,
          ...(questions ? { questions } : {}),
          title: str(m.title, 200),
          body: str(m.body, 50000),
          audience,
          tools: Array.isArray(m.tools) ? (m.tools as Module["tools"]) : [],
          attachments: Array.isArray(m.attachments) ? (m.attachments as Module["attachments"]) : [],
          collected: undefined,
        });
      }
      const session = isObj(l.session) && typeof l.session.minutes === "number" && Array.isArray(l.session.agenda) ? (l.session as unknown as Lesson["session"]) : undefined;
      lessons.push({ id: "", title: str(l.title, 80) || "Lesson 0", modules, branches: {}, ...(typeof l.goal === "string" && l.goal ? { goal: l.goal.slice(0, 300) } : {}), ...(l.elective === true ? { elective: true } : {}), ...(session ? { session } : {}) });
    }
    lessonsOf.push({ title: str(w.title, 80) || `Week ${wi + 1}`, lessons });
  }
  // Grouping by a sign-up poll's groups names the poll's card: one that isn't in the file can't be kept.
  const weeks: Week[] = lessonsOf.map((w) => ({
    id: uid("w-"),
    title: w.title,
    lessons: w.lessons.map((l) => {
      const copy = cloneLesson(l, undefined, ids);
      copy.modules = copy.modules.map((m) => {
        const c = cleanCard(m);
        if (c.grouping && !(c.grouping.startsWith("gs-") && [...ids.values()].includes(c.grouping.slice(3)))) c.grouping = undefined;
        return c;
      });
      return copy;
    }),
  }));
  if (dropped) notes.push(`${dropped} unreadable card${dropped === 1 ? " was" : "s were"} left out.`);
  if (forAll) notes.push(`${forAll} card${forAll === 1 ? " was" : "s were"} for some students only; ${forAll === 1 ? "it’s" : "they’re"} for everyone now.`);
  const electiveMin = Number(raw.electiveMin);
  return {
    ok: true,
    title: str(raw.title, 80).trim(),
    subtitle: str(raw.subtitle, 120).trim() || undefined,
    electiveMin: Number.isInteger(electiveMin) && electiveMin > 0 ? Math.min(electiveMin, 20) : undefined,
    weeks,
    cards: weeks.reduce((n, w) => n + w.lessons.reduce((k, l) => k + l.modules.filter((m) => m.type !== "group").length, 0), 0),
    notes,
  };
}
