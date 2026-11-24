// Shared Text cards (Who writes: Each group, or Whole class): which document a student writes in, and who writes in
// a document. Plain functions, used on the server (lib/collab.ts) and in the browser.
import type { Course, Group, Grouping, Module } from "./types";

/** The course's groups, as the grouping every card uses unless it picks another. */
export const DEFAULT_GROUPING = "default";

/** Every grouping of the course: its Discussion groups (if any), then the ones made from cards. */
export function groupingsOf(course: Pick<Course, "groups" | "groupings">): Grouping[] {
  const own = course.groups?.length ? [{ id: DEFAULT_GROUPING, name: "Discussion groups", groups: course.groups }] : [];
  return [...own, ...(course.groupings ?? [])];
}

/** The grouping a card uses. */
export function groupingOf(course: Pick<Course, "groups" | "groupings">, m?: Pick<Module, "grouping">): Grouping | undefined {
  const all = groupingsOf(course);
  return (m?.grouping && all.find((g) => g.id === m.grouping)) || all.find((g) => g.id === DEFAULT_GROUPING);
}

/** A student's group on a card. With no groups made at all, the whole class is one group. */
export function groupFor(course: Pick<Course, "groups" | "groupings" | "students">, m: Pick<Module, "grouping"> | undefined, studentId: string): Group | undefined {
  const gs = groupingOf(course, m);
  if (!gs) return { id: "all", name: "Everyone", studentIds: course.students.map((s) => s.id) };
  return gs.groups.find((g) => g.studentIds.includes(studentId));
}

/** Who a shared card's document belongs to: the student's group (in the card's grouping), or the whole class. */
export function docKey(course: Course, m: Module, studentId: string): string | null {
  if (m.writers === "class") return `${m.id}:class`;
  if (m.writers === "group") {
    const gs = groupingOf(course, m);
    // No groups made at all: the whole class writes in one copy.
    if (!gs) return `${m.id}:g:all`;
    const g = gs.groups.find((x) => x.studentIds.includes(studentId));
    // A student left out of the groups writes on their own.
    if (!g) return `${m.id}:g:solo-${studentId}`;
    return gs.id === DEFAULT_GROUPING ? `${m.id}:g:${g.id}` : `${m.id}:g:${gs.id}~${g.id}`;
  }
  return null;
}

/** The students who write in a document. */
export function writersOf(course: Course, key: string): string[] {
  const [, kind, who] = key.split(":");
  if (kind === "class") return course.students.map((s) => s.id);
  if (who?.startsWith("solo-")) return [who.slice(5)];
  if (who === "all") return groupingsOf(course).length ? [] : course.students.map((s) => s.id);
  const [gs, g] = who?.includes("~") ? who.split("~") : [DEFAULT_GROUPING, who];
  const group = groupingsOf(course).find((x) => x.id === gs)?.groups.find((x) => x.id === g);
  return group?.studentIds.filter((id) => course.students.some((s) => s.id === id)) ?? [];
}

export const cardOf = (key: string) => key.split(":")[0];

/** The grouping a sign-up poll makes: one group per option, named after it. */
export const signupGroupingId = (moduleId: string) => `gs-${moduleId}`;
export const signupGroupId = (moduleId: string, option: number) => `${moduleId}-o${option}`;

/**
 * Demo students: made-up students on the class list, for the teacher to try the course as (their work is kept, like a
 * real student's). A teacher adds as many as they like and names them; "Add demo students" adds the first two, Demo
 * Student A and B. Their ids all start with "s-demo-".
 */
export const DEMO_PREFIX = "s-demo-";
export const DEMO_STUDENTS = [
  { id: "s-demo-a", name: "Demo Student A", was: "s-demo-odessa" },
  { id: "s-demo-b", name: "Demo Student B", was: "s-demo-caspian" },
] as const;
/** One of the first two demo students, by their id (or the id they had in 0.1.71, when they had made-up names). */
export const demoStudent = (id: string) => DEMO_STUDENTS.find((d) => d.id === id || d.was === id);
export const isDemoStudent = (id: string) => id.startsWith(DEMO_PREFIX);
/** A name for the next demo student: Demo Student A, B, … (the first letter no one has). */
export function nextDemoName(taken: string[]) {
  const have = new Set(taken.map((x) => x.toLowerCase()));
  for (let i = 0; i < 26; i++) { const n = `Demo Student ${String.fromCharCode(65 + i)}`; if (!have.has(n.toLowerCase())) return n; }
  for (let i = 27; ; i++) if (!have.has(`demo student ${i}`)) return `Demo Student ${i}`;
}

/**
 * A sign-up poll's grouping, kept in step with the card: its name is the card's title and there's a group for each
 * option (named after it). Who's in each group is kept as it is (votes, and the teacher's changes).
 */
export function syncSignup(course: Course, m: Module) {
  const q = m.questions?.[0];
  if (!m.signup || !m.poll || !q) return;
  const id = signupGroupingId(m.id);
  const list = (course.groupings ??= []);
  const was = list.find((g) => g.id === id);
  const groups = q.options.map((o, i) => {
    const gid = signupGroupId(m.id, i);
    const name = (o.trim() || `Option ${i + 1}`).slice(0, 40);
    // Members follow their option by its name (an option removed or moved), else by its place (an option renamed).
    const before = was?.groups.find((g) => g.name === name) ?? was?.groups.find((g) => g.id === gid && !q.options.some((x) => x.trim() === g.name));
    return { id: gid, name, studentIds: before?.studentIds ?? [] };
  });
  if (was) { was.name = m.title.slice(0, 60) || "Groups"; was.groups = groups; } else list.push({ id, name: m.title.slice(0, 60) || "Groups", groups });
}

/**
 * How many classmates a student must reply to on a discussion that asks for replies: what the card asks, but never more
 * than there are others to reply to (in their group, when it's discussed in groups), so a small group can still finish.
 */
export function repliesNeeded(course: Pick<Course, "groups" | "groupings" | "students">, m: Module, studentId: string): number {
  const asked = m.wall?.replies ?? 0;
  if (!asked) return 0;
  const pool = m.wall?.byGroup ? groupFor(course, m, studentId)?.studentIds ?? [] : course.students.map((s) => s.id);
  const others = pool.filter((id) => id !== studentId && course.students.some((s) => s.id === id)).length;
  return Math.min(asked, others);
}
