import data from "./demo-seed.json";
import type { ClassEvent, Course, Feedback, Mark, Nudge, Plan, Post, ProgressMap, StudioPost } from "./types";

// The demo course, behind "How to use Questhand" on the sign-in page: Questhand 101, the course on Questhand made in
// Questhand (the same course every new teacher starts with), with a class of six part-way through it: answers that
// dealt different cards, a card group that dealt by score, a card that waited in a later lesson, open answers with AI
// feedback, one marked Looks good and one asked to revise. It was built and played through the real pages and written
// here by scripts/export-demo.mjs (lib/demo-seed.json). Anyone can open it at /teach/demo and change anything; it goes
// back to this every night.
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
