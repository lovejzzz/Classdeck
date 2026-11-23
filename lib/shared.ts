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
