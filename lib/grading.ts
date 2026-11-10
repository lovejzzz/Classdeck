import type { Module, Progress, Question } from "./types";

/** Compare short answers loosely: case, spacing, and punctuation don't matter. */
export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function isCorrect(q: Question, given: number | string): boolean {
  if (q.kind === "short") {
    const g = norm(String(given));
    return !!g && (q.accept ?? []).some((a) => norm(a) === g);
  }
  return given === q.answer;
}

const DAY = 86400000;

/** Midnight at the end of the due date, local time. */
export function dueAt(due: string): number {
  const [y, m, d] = due.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59).getTime();
}

/** How a due date reads on a card: "Due today", "Due Thu", "2 days late". */
export function dueInfo(due: string | undefined, now: number): { label: string; tone: "late" | "soon" | "later" } | undefined {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return undefined;
  const end = dueAt(due);
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const days = Math.floor((end - startOfToday) / DAY);
  if (end < now) {
    const late = Math.max(1, Math.ceil((now - end) / DAY));
    return { label: late === 1 ? "1 day late" : `${late} days late`, tone: "late" };
  }
  if (days === 0) return { label: "Due today", tone: "soon" };
  if (days === 1) return { label: "Due tomorrow", tone: "soon" };
  const date = new Date(end);
  const label = days < 7 ? `Due ${date.toLocaleDateString("en-US", { weekday: "short" })}` : `Due ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return { label, tone: days <= 2 ? "soon" : "later" };
}

/** A late card is one with a due date in the past that isn't done. */
export const isLate = (m: Module, p: Progress | undefined, now: number) => !!m.due && p?.status !== "done" && dueAt(m.due) < now;

/** A date `n` days from now as YYYY-MM-DD (local). */
export function isoDay(n: number, from = Date.now()): string {
  const d = new Date(from + n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
