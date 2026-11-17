// Lesson dates. A teacher dates the first week's lessons; every later lesson falls a week after the lesson in the
// same place the week before, unless it has its own date. "Today's lesson" follows the dates, in the viewer's own
// calendar day; a course with no dates keeps the lesson the teacher marked.
import type { Course } from "./types";

export type LessonDate = { date: string; own: boolean };

/** The viewer's own calendar day, YYYY-MM-DD. */
export function localDay(now = Date.now()): string {
  return new Date(now).toLocaleDateString("en-CA");
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

/** Every lesson's date: its own, or worked out from the lesson in the same place a week earlier. */
export function lessonDates(course: Pick<Course, "weeks">): Map<string, LessonDate> {
  const out = new Map<string, LessonDate>();
  let prev: (LessonDate | undefined)[] = [];
  for (const w of course.weeks) {
    const row = w.lessons.map((l, i) => {
      if (l.date) return { date: l.date, own: true };
      const above = prev.length ? prev[Math.min(i, prev.length - 1)] : undefined;
      return above ? { date: addDays(above.date, 7), own: false } : undefined;
    });
    w.lessons.forEach((l, i) => row[i] && out.set(l.id, row[i]!));
    // A week with no lessons passes the dates above it on, a week later.
    prev = row.length ? row : prev.map((x) => (x ? { date: addDays(x.date, 7), own: false } : x));
  }
  return out;
}

/** Today's lesson: the latest one dated today or earlier (else the first dated one); without dates, the marked one. */
export function todayLessonId(course: Pick<Course, "weeks" | "currentLessonId">, day = localDay()): string {
  const dates = lessonDates(course);
  if (!dates.size) return course.currentLessonId;
  const lessons = course.weeks.flatMap((w) => w.lessons).filter((l) => dates.has(l.id));
  let best: string | undefined;
  let bestDay = "";
  for (const l of lessons) {
    const d = dates.get(l.id)!.date;
    if (d <= day && d >= bestDay) { best = l.id; bestDay = d; }
  }
  return best ?? lessons[0]?.id ?? course.currentLessonId;
}

/** "Tue, Nov 18" */
export function shortDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
