import type { Course } from "./types";

// Toastmasters-style roles for a group session. Everyone gets a job, even when they aren't
// speaking, and the jobs rotate week to week so each person tries each one.

export const ROLES = [
  { id: "host", name: "Host", job: "Open the session, introduce each speaker, and keep the tone friendly." },
  { id: "timer", name: "Timer", job: "Time every talk and signal when a speaker reaches the limit." },
  { id: "ah", name: "Ah-counter", job: "Count filler words (um, like, so) for each speaker and share the totals." },
  { id: "evaluator", name: "Evaluator", job: "Give the first feedback after each talk: one thing that worked, one thing to try." },
] as const;

export type Role = (typeof ROLES)[number];

/** Which session this lesson's is, counting only lessons that have a session (0-based). */
export function sessionIndex(course: Course, lessonId: string) {
  return course.weeks.flatMap((w) => w.lessons).filter((l) => l.session).findIndex((l) => l.id === lessonId);
}

/** Role per member for one session: role k goes to member (k + week) mod n. */
export function rolesFor(memberIds: string[], week: number): Record<string, Role> {
  const n = memberIds.length;
  const out: Record<string, Role> = {};
  ROLES.slice(0, n).forEach((r, k) => {
    out[memberIds[(k + Math.max(0, week)) % n]] = r;
  });
  return out;
}
