import { hash } from "./cards";
import type { AnswerValue, Module, Progress, Question } from "./types";

/** Compare short answers loosely: case, spacing, and punctuation don't matter. */
/** For comparing short answers: case, accents, apostrophes and thousands separators don't matter. */
export const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/\p{M}+/gu, "").replace(/['’`]/g, "").replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function isCorrect(q: Question, given: AnswerValue): boolean {
  if (q.kind === "short") {
    const g = norm(String(given));
    return !!g && (q.accept ?? []).some((a) => norm(a) === g);
  }
  if (q.kind === "multi") {
    const want = [...(q.answerSet ?? [])].sort().join(",");
    return Array.isArray(given) && [...(given as number[])].map(Number).sort().join(",") === want;
  }
  if (q.kind === "order") {
    return Array.isArray(given) && given.length === q.options.length && given.every((x, i) => x === q.options[i]);
  }
  return given === q.answer;
}

/** A small seeded random generator, so every student gets the same draw on every device. */
function rng(seedText: string) {
  let seed = Math.floor(hash(seedText) * 2147483646) + 1;
  return () => (seed = (seed * 48271) % 2147483647) / 2147483647;
}
export function seededShuffle<T>(list: T[], seedText: string): T[] {
  const out = [...list];
  const r = rng(seedText);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Whether a question is really asked: it has words, or options. A card's only question may leave its words empty, and
 * then the card's title asks it.
 */
export const isAsked = (q: Pick<Question, "text" | "options">) => !!(q.text?.trim() || (q.options ?? []).some((o) => o?.trim()));
/** The questions students actually get: a question the teacher left blank isn't asked. */
export function asked(m: Pick<Module, "questions">): Question[] {
  return (m.questions ?? []).filter(isAsked);
}


/** Display order of a question's options for one student. Indexes still refer to the original order. */
export function optionOrder(q: Question, studentId: string, shuffle: boolean): number[] {
  const idx = q.options.map((_, i) => i);
  // "order" questions are always shown mixed up; that's the task.
  if (q.kind === "order") {
    // Sent to a student already mixed by the server, which alone knows the right order: show it as it came.
    if (q.mixed) return idx;
    const mixed = seededShuffle(idx, `opts:${studentId}:${q.id}`);
    return mixed.every((v, i) => v === i) && idx.length > 1 ? [...idx.slice(1), idx[0]] : mixed;
  }
  return shuffle ? seededShuffle(idx, `opts:${studentId}:${q.id}`) : idx;
}

/** A readable version of an answer, for the teacher. */
export function answerText(q: Question, a: AnswerValue | undefined): string {
  if (a === undefined) return "";
  if (q.kind === "short") return `“${a}”`;
  if (q.kind === "order") return (a as string[]).join(" → ");
  if (q.kind === "multi") return (a as number[]).map((i) => q.options[i]).join(", ") || "(none)";
  return q.options[a as number] ?? "";
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
/** Finished, for counting and lateness. A card group finished once stays finished while the student tries it again. */
export const isFinished = (m: Module, p: Progress | undefined) => p?.status === "done" || (m.type === "group" && !!p?.tries?.length);

export const isLate = (m: Module, p: Progress | undefined, now: number) => !!m.due && !isFinished(m, p) && dueAt(m.due) < now;

/** A date `n` days from now as YYYY-MM-DD (local). */
export function isoDay(n: number, from = Date.now()): string {
  const d = new Date(from + n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** An "order" question's options as students get them: mixed, and never already in the right order. */
export function mixedOrder(options: string[], seed: string): string[] {
  const idx = options.map((_, i) => i);
  const m = seededShuffle(idx, `mix:${seed}`);
  const out = m.every((v, i) => v === i) && idx.length > 1 ? [...idx.slice(1), idx[0]] : m;
  return out.map((i) => options[i]);
}

/**
 * A discussion card's progress for one student: whether they posted, and how many classmates' posts they replied to.
 * With replies required, the card is done once they have posted and replied to that many different classmates.
 */
export function wallProgress(posts: { id: string; moduleId: string; studentId: string; mine?: boolean; comments?: { from: string }[] }[], moduleId: string, studentId: string, needed = 0) {
  const here = posts.filter((p) => p.moduleId === moduleId);
  const own = (p: { studentId: string; mine?: boolean }) => p.mine || p.studentId === studentId;
  const posted = here.some(own);
  const replied = here.filter((p) => !own(p) && p.studentId !== "teacher" && (p.comments ?? []).some((c) => c.from === studentId)).length;
  return { posted, replied, needed, done: posted && replied >= needed };
}
