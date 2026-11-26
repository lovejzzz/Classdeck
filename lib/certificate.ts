// Certificates of completion: who has earned one (by finishing enough of their cards, or given by the teacher).
import { gradeRows } from "./gradebook";
import type { CourseState } from "./types";

export type CertStatus = { earned: boolean; done: number; total: number; given?: number };

/** Every student's standing for the course's certificate (none when the course gives no certificate). */
export function certificates(state: Pick<CourseState, "course" | "progress" | "choices">, now = Date.now()): Map<string, CertStatus> {
  const cert = state.course.certificate;
  const out = new Map<string, CertStatus>();
  if (!cert) return out;
  for (const r of gradeRows(state as CourseState, now)) {
    const given = cert.given?.[r.st.id];
    const byWork = r.total > 0 && (r.done * 100) / r.total >= cert.percent;
    out.set(r.st.id, { earned: !!given || byWork, done: r.done, total: r.total, given });
  }
  return out;
}
