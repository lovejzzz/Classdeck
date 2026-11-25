import data from "./demo-seed.json";
import type { ClassEvent, Course, Feedback, Mark, Nudge, Plan, Post, ProgressMap, StudioPost } from "./types";

// The demo course: Mission to Mars, a three-week Year 6 science course that shows what Questhand does (answers that
// deal follow-up cards, a card group that deals by score, a group of groups, a sign-up poll that makes crew groups,
// electives, open answers with feedback, a discussion), with a class of six part-way through it. Its data is a real
// class run through the site by scripts/make-demo.mjs from scripts/demo-course.json (lib/demo-seed.json): students on
// different paths, one waiting to be let in, hand-ins with and without feedback, a revision asked for, a reminder,
// a discussion. Anyone can
// open it at /teach/demo and change anything; it goes back to this every night.
//
// Times in the file are from when it was made. Each one is moved forward by the same amount, so the class always looks
// like it happened over the last few days, and dates (due dates, lesson dates) move by whole days.

type Seed = typeof data;
const DAY = 86400000;
const TIME_KEY = /^(at|createdAt|updatedAt|startedAt|joinedAt|invitedAt|exp)$/;

function shifted<T>(value: T): T {
  const ms = Date.now() - data.exportedAt;
  const days = Math.round(ms / DAY);
  const moveDay = (s: string) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  const walk = (v: unknown, key = ""): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    if (typeof v === "number" && TIME_KEY.test(key) && v > 1e12) return v + ms;
    if (typeof v === "string" && (key === "due" || key === "date") && /^\d{4}-\d{2}-\d{2}$/.test(v)) return moveDay(v);
    return v;
  };
  return walk(structuredClone(value)) as T;
}
const part = <K extends keyof Seed>(k: K, empty: unknown) => shifted(data[k] ?? empty);

export const seedCourse = (): Course => part("courses", {}) as unknown as Course;
export const seedProgress = (): ProgressMap => part("progress", {}) as unknown as ProgressMap;
export const seedPosts = (): Post[] => part("posts", []) as unknown as Post[];
export const seedEvents = (): ClassEvent[] => part("events", []) as unknown as ClassEvent[];
export const seedChoices = (): Record<string, Record<string, string>> => part("choices", {}) as unknown as Record<string, Record<string, string>>;
export const seedStudio = (): { posts: StudioPost[]; feedback: Feedback[] } => part("studio", { posts: [], feedback: [] }) as unknown as { posts: StudioPost[]; feedback: Feedback[] };
export const seedMarks = (): Mark[] => part("marks", []) as unknown as Mark[];
export const seedUptake = (): Record<string, Record<string, number>> => part("uptake", {}) as unknown as Record<string, Record<string, number>>;
export const seedNudges = (): Nudge[] => part("nudges", []) as unknown as Nudge[];
export const seedPlans = (): Record<string, Plan> => part("plans", {}) as unknown as Record<string, Plan>;
