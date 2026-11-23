// Shared Text cards (Who writes: Each group, or Whole class): which document a student writes in, and who writes in
// a document. Plain functions, used on the server (lib/collab.ts) and in the browser.
import type { Course, Module } from "./types";

/** Who a shared card's document belongs to: the student's group, or the whole class. */
export function docKey(course: Course, m: Module, studentId: string): string | null {
  if (m.writers === "class") return `${m.id}:class`;
  if (m.writers === "group") {
    const g = course.groups?.find((x) => x.studentIds.includes(studentId));
    // A student in no group writes on their own.
    return `${m.id}:g:${g ? g.id : `solo-${studentId}`}`;
  }
  return null;
}

/** The students who write in a document. */
export function writersOf(course: Course, key: string): string[] {
  const [, kind, who] = key.split(":");
  if (kind === "class") return course.students.map((s) => s.id);
  if (who?.startsWith("solo-")) return [who.slice(5)];
  return course.groups?.find((g) => g.id === who)?.studentIds.filter((id) => course.students.some((s) => s.id === id)) ?? [];
}

export const cardOf = (key: string) => key.split(":")[0];
