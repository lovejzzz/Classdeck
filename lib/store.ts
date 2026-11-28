import fs from "fs";
import { r2Ready, remove as removeBlob } from "./blob";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import { publish } from "./bus";
import { foldWeeks } from "./cardmodel";
import { kindWeeks, awaitingFeedback, reviewableCard } from "./kinds";
import { quizWeeks } from "./quizgroups";
import { nameGroups } from "./shared";
import { todayLessonId } from "./dates";
import { seedChoices, seedCourse, seedEvents, seedMarks, seedNudges, seedPlans, seedPosts, seedProgress, seedStudio, seedUptake } from "./seed";
import type { Module, ClassEvent, Course, DirectMessage, Feedback, Live, Mark, Nudge, Plan, Post, Progress, ProgressMap, StudioPost, ToolLogEntry } from "./types";
import type { Manifest } from "./connectors/types";


export interface User {
  id: string;
  email: string;
  /** Their whole name, as shown (first and last together). */
  name: string;
  /** Their first and last name, asked for once (at sign-up, from Google, or on their first visit after names came in). */
  firstName?: string;
  lastName?: string;
  /** scrypt hash and salt, hex. Empty for accounts that only sign in with Google. */
  hash: string;
  salt: string;
  /** Their email address is theirs: they typed the code sent to it (a Google sign-in counts too, see lib/verify). */
  emailVerified?: boolean;
  /** Made after sign-up started checking addresses: they're asked for the code before going on. */
  mustVerify?: boolean;
  /** The code sent to their address, hashed, while one is out; `claim` is a sign-up waiting to take over an address
   *  someone else signed up with but never confirmed (its password hash and name). */
  verify?: { hash: string; exp: number; sent: number; tries: number; day: string; n: number; claim?: { hash: string; salt: string; first: string; last: string } };
  /** Google account id, once they've signed in with Google. */
  google?: string;
  /** Their profile photo: Google's, refreshed at each Google sign-in, or one they uploaded (then kept). */
  picture?: string;
  /** The photo is one they chose: a Google sign-in leaves it alone. */
  pictureOwn?: boolean;
  /** Invitation emails sent today (a daily cap). */
  mail?: { day: string; n: number };
  /** Cards they saved to reuse in any of their courses (the "custom" choices in New card). */
  cards?: SavedCard[];
  /** How they first came to Questhand: to teach (made an account themselves) or to learn (from an invitation or a
   *  class code). Their course list puts that side first. */
  firstRole?: "teacher" | "student";
  /** The site owner's two CaPS flows were put into their templates (once; after that they're ordinary templates). */
  capsSeeded?: boolean;
  /** Their AI for feedback (Settings → AI): which service, which model, and the key, encrypted (lib/aifeedback). */
  /** The personal link for using Questhand from the teacher's own AI (MCP): its hash (to find it) and, sealed, the
   * link itself (so Settings can show it again). */
  mcp?: { hash: string; sealed: string; at: number; used?: number };
  ai?: {
    /** The service in use now, its model and key (encrypted): what cards with AI feedback use. */
    provider: import("./aimeta").AiProvider; model: string; key: string; tail: string;
    /** Every service they've saved a key for, so switching back and forth never loses one; and whether it has credit. */
    saved?: Partial<Record<import("./aimeta").AiProvider, { key: string; tail: string; model?: string; status?: import("./aimeta").AiStatus }>>;
  };
  createdAt: number;
}

export interface SavedCard {
  id: string;
  name: string;
  /** The card as saved, without its id, who it's for, or a due date. For a set, its first card. */
  module: Omit<Module, "id">;
  /** A set of cards saved together (a whole lesson, or a card group with its cards), in order, with the answers and
   *  scores that deal cards inside the set still wired. Their ids only tie the set together; copies get new ones. */
  set?: { kind: "lesson" | "group"; modules: Module[] };
  at: number;
}

/**
 * A teacher's template: a course as it was when they saved it (a course file: weeks, lessons, cards, no students),
 * to start new courses from. A copy: changing the course afterwards doesn't change the template.
 */
export interface Template {
  id: string;
  name: string;
  subtitle?: string;
  cover?: { image?: string; credit?: string; motif?: string; color?: string; seed?: number };
  /** The course file (lib/coursefile). */
  file: { title: string; subtitle?: string; electiveMin?: number; weeks: { title: string; lessons: { title: string; goal?: string; elective?: boolean; modules: Module[] }[] }[] } & Record<string, unknown>;
  at: number;
  /** The course it was saved from, if any. */
  from?: string;
}

/** A message from one account to another, outside any course (the inbox's own). `share` points at a shared template. */
export interface Letter {
  id: string;
  from: string;
  text: string;
  at: number;
  read?: boolean;
  share?: string;
  /** The template the reader made from the shared one (Add to my templates), so it isn't added twice. */
  added?: string;
}

/** A template as it was when someone shared it: kept once, however many people it went to. */
export interface Share { id: string; by: string; at: number; template: Template }

export interface Session {
  kind: "teacher" | "student" | "demo";
  userId?: string;
  courseId?: string;
  studentId?: string;
  exp: number;
}

export interface DB {
  courses: Record<string, Course>;
  progress: Record<string, ProgressMap>;
  posts: Record<string, Post[]>;
  toolLog: Record<string, ToolLogEntry[]>;
  events: Record<string, ClassEvent[]>;
  choices: Record<string, Record<string, Record<string, string>>>;
  studio: Record<string, { posts: StudioPost[]; feedback: Feedback[] }>;
  marks: Record<string, Mark[]>;
  live: Record<string, Live>;
  uptake: Record<string, Record<string, Record<string, number>>>;
  nudges: Record<string, Nudge[]>;
  plans: Record<string, Record<string, Plan>>;
  /** Student View's demo student: their progress in each course (module → progress), kept between tests. */
  demo: Record<string, Record<string, Progress>>;
  /** Messages between two students of a course (teacher ↔ student messages are in nudges). */
  dms: Record<string, DirectMessage[]>;
  /** Each teacher's templates, by user id (kept one row per teacher, the same way as a course's collections). */
  templates: Record<string, Template[]>;
  /** Messages between two accounts, by the pair of user ids ("u-a~u-b", sorted). */
  letters: Record<string, Letter[]>;
  /** Templates sent in messages, by share id. */
  shares: Record<string, Share>;
  /** Shared Text cards' documents (lib/collab.ts), by course, then by document. */
  collab: Record<string, Record<string, unknown>>;
  /** Student PIN hashes: course → student → "salt:hash". Never sent to a browser. */
  pins: Record<string, Record<string, string>>;
  users: Record<string, User>;
  /** Keyed by the SHA-256 of the session token, so a leaked database can't be used to log in. */
  sessions: Record<string, Session>;
  customConnectors: Manifest[];
  /** Uploaded files by stored name: who uploaded it and how big it is, for upload limits. */
  uploads: Record<string, { by: string; size: number; at: number }>;
}

// Storage: SQLite (built into Node), one row per course per collection, written only when it changes.
// The whole database stays in memory for reads; saves are incremental and atomic.
const DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
const FILE = path.join(DIR, "questhand.db");
/** The database's name before the product was renamed Questhand; moved to FILE on first start. */
const OLD_FILE = path.join(DIR, "classdeck.db");
const LEGACY = path.join(DIR, "db.json");
// One row per id. Mostly per course; "templates" is per teacher (by user id), "letters" per pair of accounts, "shares"
// per shared template (none of those ids can match a course id).
const PER_COURSE = ["courses", "progress", "posts", "toolLog", "events", "choices", "studio", "marks", "live", "pins", "uptake", "nudges", "plans", "demo", "dms", "collab", "templates", "letters", "shares"] as const;
const GLOBAL = ["users", "sessions", "customConnectors", "uploads"] as const;

const g = globalThis as unknown as { __lmsdb?: DB; __lmsfilled?: boolean; __lmssql?: DatabaseSync; __lmswritten?: Map<string, string>; __preview?: DB; __previews?: Map<string, { at: number; data: Record<string, unknown> }> };

function fresh(custom: Manifest[] = []): DB {
  // A deep copy, so edits to the demo course never change the seed data a later reset restores.
  const course = structuredClone(seedCourse());
  return {
    courses: { [course.id]: course },
    progress: { [course.id]: seedProgress() },
    posts: { [course.id]: seedPosts() },
    toolLog: { [course.id]: [] },
    events: { [course.id]: seedEvents() },
    choices: { [course.id]: seedChoices() },
    studio: { [course.id]: seedStudio() },
    marks: { [course.id]: seedMarks() },
    live: { [course.id]: { hands: {} } },
    uptake: { [course.id]: seedUptake() },
    nudges: { [course.id]: seedNudges() },
    plans: { [course.id]: seedPlans() },
    demo: {},
    dms: { [course.id]: [] },
    collab: { [course.id]: {} },
    templates: {},
    letters: {},
    shares: {},
    pins: {},
    users: {},
    sessions: {},
    customConnectors: custom,
    uploads: {},
  };
}

function sql(): DatabaseSync {
  if (!g.__lmssql) {
    fs.mkdirSync(DIR, { recursive: true });
    if (!fs.existsSync(FILE) && fs.existsSync(OLD_FILE)) {
      for (const ext of ["", "-wal", "-shm"]) if (fs.existsSync(OLD_FILE + ext)) fs.renameSync(OLD_FILE + ext, FILE + ext);
    }
    const conn = new DatabaseSync(FILE);
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
    g.__lmssql = conn;
  }
  return g.__lmssql;
}

function load(): DB | null {
  const rows = sql().prepare("SELECT k, v FROM kv").all() as { k: string; v: string }[];
  if (!rows.length) return null;
  const d = {} as Record<string, unknown>;
  const written = (g.__lmswritten = new Map());
  for (const { k, v } of rows) {
    written.set(k, v);
    const i = k.indexOf(":");
    if (i < 0) d[k] = JSON.parse(v);
    else ((d[k.slice(0, i)] ??= {}) as Record<string, unknown>)[k.slice(i + 1)] = JSON.parse(v);
  }
  return d as unknown as DB;
}

/** Online, the open demo course goes back to its starting state every night (after 4 a.m. New York time). */
function nightlyDemoReset() {
  if (process.env.NODE_ENV !== "production") return;
  // db() is called many times a request: the clock is looked at once a minute at most.
  const gt = g as { __demoChecked?: number };
  const now = Date.now();
  if (gt.__demoChecked && now - gt.__demoChecked < 60_000) return;
  gt.__demoChecked = now;
  const ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = ny.toDateString();
  const gg = g as { __demoDay?: string; __demoResetting?: boolean };
  if (!gg.__demoDay) { gg.__demoDay = day; return; }
  if (gg.__demoDay === day || ny.getHours() < 4 || gg.__demoResetting) return;
  gg.__demoDay = day;
  gg.__demoResetting = true;
  try { reset(); } finally { gg.__demoResetting = false; }
}

/** Whether this request is a Student View test (its changes to the course itself aren't kept). */
export const inPreview = () => !!g.__preview;

export function db(): DB {
  // Inside a Student View test (runPreview): the sandbox copy, never the real data.
  if (g.__preview) return g.__preview;
  if (g.__lmsdb) nightlyDemoReset();
  if (!g.__lmsdb) {
    let d = load();
    if (!d) {
      // First run on SQLite: bring over the old JSON file if there is one.
      try {
        d = JSON.parse(fs.readFileSync(LEGACY, "utf8")) as DB;
        fs.renameSync(LEGACY, `${LEGACY}.migrated`);
      } catch {
        d = fresh();
      }
      g.__lmsdb = d;
      fill(d);
      save();
    }
    g.__lmsdb = d;
  }
  // Older data is brought up to date once, when it's loaded (or replaced), not on every look: walking every card of
  // every course each time made each request slower the more courses the site had.
  if (!g.__lmsfilled) { fill(g.__lmsdb); g.__lmsfilled = true; }
  return g.__lmsdb;
}

/** Older saved data may predate newer fields; fill them in so reads never crash. */
function fill(d: DB): DB {
  // Cards saved before the simplification: fold merged settings into the instructions (once; idempotent).
  // Older cards: settings that were merged away fold into what remains, and every card gets its kind.
  // Quizzes became card groups (with tries): turned over once, their students' answers and scores with them.
  for (const c of Object.values(d.courses ?? {})) if (c?.weeks) { foldWeeks(c.weeks); quizWeeks(c.weeks, d.progress?.[c.id]); kindWeeks(c.weeks); nameGroups(c); }
  // Every card says who gets it (one saved without it made every student's page in its course fail to open).
  for (const c of Object.values(d.courses ?? {})) for (const w of c?.weeks ?? []) for (const l of w.lessons ?? []) for (const m of l.modules ?? []) if (!m.audience?.kind) m.audience = { kind: "all" };
  // Class sessions (an agenda run in class) were taken out: Questhand is for courses taken at each student's own pace.
  for (const c of Object.values(d.courses ?? {})) for (const w of c?.weeks ?? []) for (const l of w.lessons ?? []) delete (l as { session?: unknown }).session;
  for (const k of [...PER_COURSE, "users", "sessions", "uploads"] as const) (d as unknown as Record<string, unknown>)[k] ??= {};
  d.customConnectors ??= [];
  return d;
}

/**
 * Write what changed to SQLite. With a course id, only that course's data (and the site-wide lists) is looked at:
 * every answer, keystroke in a group doc or message used to turn every course on the site into JSON to find what
 * changed, so each write got slower the more courses the site had. Without one, everything is compared.
 */
export function save(courseId?: string) {
  // A Student View test is never saved: its changes stay in its sandbox.
  if (g.__preview) return;
  const d = g.__lmsdb;
  if (!d) return;
  const next = new Map<string, string>();
  if (courseId) {
    for (const k of PER_COURSE) { const v = (d[k] as Record<string, unknown> | undefined)?.[courseId]; if (v !== undefined) next.set(`${k}:${courseId}`, JSON.stringify(v)); }
  } else {
    for (const k of PER_COURSE) for (const [id, v] of Object.entries(d[k] ?? {})) if (v !== undefined) next.set(`${k}:${id}`, JSON.stringify(v));
  }
  for (const k of GLOBAL) next.set(k, JSON.stringify(d[k]));
  const written: Map<string, string> = (g.__lmswritten ??= new Map());
  const conn = sql();
  const put = conn.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v");
  const del = conn.prepare("DELETE FROM kv WHERE k = ?");
  // Which courses changed, so only pages showing those courses are told to refresh.
  const changed = new Set<string>();
  const note = (k: string) => { const i = k.indexOf(":"); if (i > 0) changed.add(k.slice(i + 1)); };
  // The keys this save is about: all of them, or the one course's (and the site-wide ones).
  const mine = (k: string) => !courseId || !k.includes(":") || k.slice(k.indexOf(":") + 1) === courseId;
  const gone = [...written.keys()].filter((k) => mine(k) && !next.has(k));
  conn.exec("BEGIN");
  try {
    for (const [k, v] of next) if (written.get(k) !== v) { put.run(k, v); note(k); }
    for (const k of gone) { del.run(k); note(k); }
    conn.exec("COMMIT");
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
  if (courseId) {
    for (const [k, v] of next) written.set(k, v);
    for (const k of gone) written.delete(k);
  } else g.__lmswritten = next;
  // Data that was loaded from the old JSON file now lives in SQLite.
  if (fs.existsSync(LEGACY)) fs.renameSync(LEGACY, `${LEGACY}.migrated`);
  publish(changed);
}

/** 恢复示例数据，保留已添加的自定义连接器。 */
/** Restore the demo course's sample data. Other courses are left alone. */
/** Removes a course and everything kept for it. Returns the uploaded file names it used, for the caller to delete. */
export function removeCourse(id: string): string[] {
  const d = db();
  const ownerId = d.courses[id]?.ownerId;
  const files = new Set<string>();
  for (const k of PER_COURSE) {
    const v = (d[k] as Record<string, unknown>)[id];
    if (v !== undefined) for (const m of JSON.stringify(v).matchAll(/\/api\/upload\/([a-z0-9]+\.[a-z0-9]{1,5})/g)) files.add(m[1]);
    delete (d[k] as Record<string, unknown>)[id];
  }
  // Sign out students of this course everywhere.
  for (const [k, s] of Object.entries(d.sessions)) if (s.courseId === id) delete d.sessions[k];
  // Only files that belong to this course go: uploaded by its students, or by its teacher and used nowhere else.
  // A link to someone else's file (pasted into a card) is left alone.
  // Still used by another course, or by a card a teacher saved to reuse.
  const saved = JSON.stringify(Object.values(d.users).map((u) => u.cards ?? []));
  const elsewhere = (f: string) => saved.includes(`/api/upload/${f}`) || PER_COURSE.some((k) => Object.values(d[k] as Record<string, unknown>).some((v) => JSON.stringify(v ?? null).includes(`/api/upload/${f}`)));
  const mine = [...files].filter((f) => {
    const by = d.uploads[f]?.by;
    return by?.startsWith(`s:${id}:`) || (!!ownerId && by === `u:${ownerId}` && !elsewhere(f));
  });
  for (const f of mine) delete d.uploads[f];
  save();
  return mine;
}

/** Files demo visitors uploaded; cleared with each reset so the demo's upload allowance starts fresh. */
export function demoUploads(): string[] {
  return Object.entries(db().uploads).filter(([, u]) => u.by === "demo").map(([k]) => k);
}

export function reset() {
  const d = db();
  const f = fresh();
  const gone = demoUploads();
  for (const k of gone) delete d.uploads[k];
  // Remove the files themselves in the background; a leftover file only takes up space.
  for (const k of gone) (r2Ready() ? removeBlob(k) : fs.promises.unlink(path.join(DIR, "uploads", k))).catch(() => {});
  for (const k of ["courses", "progress", "posts", "toolLog", "events", "choices", "studio", "marks", "live", "uptake", "nudges", "plans", "pins", "demo", "dms", "collab"] as const) {
    (d[k] as Record<string, unknown>).demo = (f[k] as Record<string, unknown>).demo;
  }
  // The fresh demo course is brought up to date on the next look.
  g.__lmsfilled = false;
  save();
}

/** Every course, newest first, with a little summary for the course list. */
/** What a teacher wants to know at a glance: today's lesson, work waiting for feedback, students waiting to join. */
function glance(c: Course, prog: ProgressMap) {
  const lessons = c.weeks.flatMap((w) => w.lessons);
  const todayId = todayLessonId(c);
  const today = lessons.find((l) => l.id === todayId) ?? lessons[0];
  const reviewable = new Set(lessons.flatMap((l) => l.modules).filter((m) => reviewableCard(m)).map((m) => m.id));
  let toReview = 0;
  for (const st of c.students) for (const [mid, p] of Object.entries(prog[st.id] ?? {})) if (reviewable.has(mid) && awaitingFeedback(p)) toReview++;
  return { today: today?.title ?? null, toReview, waiting: c.waiting?.length ?? 0 };
}

/** The courses, newest first, with a glance at each; `keep` picks which first (the glance is the costly part). */
export function listCourses(keep?: (c: Course) => boolean) {
  const d = db();
  return Object.values(d.courses).filter((c) => !keep || keep(c)).map((c) => ({
    id: c.id,
    ownerId: c.ownerId,
    sample: c.sample,
    title: c.title,
    subtitle: c.subtitle,
    cover: c.cover,
    students: c.students.length,
    weeks: c.weeks.length,
    cards: c.weeks.reduce((n, w) => n + w.lessons.reduce((m, l) => m + l.modules.length, 0), 0),
    createdAt: c.createdAt ?? 0,
    ...glance(c, d.progress[c.id] ?? {}),
  })).sort((a, b) => b.createdAt - a.createdAt);
}

/** 记一条课堂动态，最多保留 300 条。 */
export function logEvent(courseId: string, e: Omit<ClassEvent, "id" | "at">) {
  const list = (db().events[courseId] ??= []);
  list.push({ ...e, id: Math.random().toString(36).slice(2, 10), at: Date.now() });
  if (list.length > 300) list.splice(0, list.length - 300);
}

/**
 * Student View: a teacher tries the course as one of their students. `fn` runs against a sandbox: the course as it is
 * now, and the class's work, posts and choices as they were when the test began plus whatever the teacher has done in
 * this test. Nothing in it is saved, logged for real or pushed to other pages. `fn` must do its work synchronously
 * (an async function is fine as long as it doesn't await before it's done with the data).
 * The sandbox lasts until reset (`endPreview`) or two hours without use.
 */
/**
 * Run a request inside a Student View test. `testStudent` is a student who exists only in tests; with `keep`, their
 * progress is kept for next time (the demo student), while everything else they do stays in the test.
 */
export function runPreview<T>(key: string, courseId: string, fn: () => T, testStudent?: { id: string; name: string }, keep = false): T {
  const real = db();
  const all = (g.__previews ??= new Map());
  const now = Date.now();
  for (const [k, v] of all) if (now - v.at > 2 * 3600_000) all.delete(k);
  let entry = all.get(key);
  if (!entry) {
    const data: Record<string, unknown> = {};
    for (const k of PER_COURSE) if (k !== "courses") data[k] = structuredClone((real[k] as Record<string, unknown>)[courseId]);
    entry = { at: now, data };
    all.set(key, entry);
  }
  entry.at = now;
  const box = { ...real } as unknown as Record<string, Record<string, unknown>>;
  for (const k of PER_COURSE) {
    box[k] = { ...(real[k] as Record<string, unknown>) };
    box[k][courseId] = k === "courses" ? structuredClone(real.courses[courseId]) : entry.data[k];
  }
  // A blank student who exists only in this test (to try the course before anyone has joined).
  if (testStudent) (box.courses[courseId] as unknown as Course).students.push({ ...testStudent } as Course["students"][number]);
  // The demo student starts from where they left off.
  const progressBox = (box.progress[courseId] ??= {}) as ProgressMap;
  if (testStudent && keep) progressBox[testStudent.id] = structuredClone(real.demo?.[courseId] ?? {});
  g.__preview = box as unknown as DB;
  try {
    return fn();
  } finally {
    for (const k of PER_COURSE) if (k !== "courses") entry.data[k] = box[k][courseId];
    g.__preview = undefined;
    if (testStudent && keep) {
      const mine = (box.progress[courseId] as ProgressMap | undefined)?.[testStudent.id] ?? {};
      if (JSON.stringify(mine) !== JSON.stringify(real.demo?.[courseId] ?? {})) {
        (real.demo ??= {})[courseId] = structuredClone(mine);
        save();
      }
    }
  }
}

/** Start a Student View test over: the next request copies the class's real data again. */
export function endPreview(key: string, courseId?: string, demo = false) {
  g.__previews?.delete(key);
  // Starting over as the demo student clears what they had done.
  if (demo && courseId && db().demo?.[courseId]) { delete db().demo[courseId]; save(); }
}
