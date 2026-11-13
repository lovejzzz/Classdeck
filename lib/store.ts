import fs from "fs";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import { publish } from "./bus";
import { seedChoices, seedCourse, seedEvents, seedMarks, seedNudges, seedPlans, seedPosts, seedProgress, seedStudio, seedUptake } from "./seed";
import type { ClassEvent, Course, Feedback, Live, Mark, Nudge, Plan, Post, ProgressMap, StudioPost, ToolLogEntry } from "./types";
import type { Manifest } from "./connectors/types";


export interface User {
  id: string;
  email: string;
  name: string;
  /** scrypt hash and salt, hex. Empty for accounts that only sign in with Google. */
  hash: string;
  salt: string;
  /** Google account id, once they've signed in with Google. */
  google?: string;
  createdAt: number;
}

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
const PER_COURSE = ["courses", "progress", "posts", "toolLog", "events", "choices", "studio", "marks", "live", "pins", "uptake", "nudges", "plans"] as const;
const GLOBAL = ["users", "sessions", "customConnectors", "uploads"] as const;

const g = globalThis as unknown as { __lmsdb?: DB; __lmssql?: DatabaseSync; __lmswritten?: Map<string, string> };

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

export function db(): DB {
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
  return fill(g.__lmsdb);
}

/** Older saved data may predate newer fields; fill them in so reads never crash. */
function fill(d: DB): DB {
  for (const k of [...PER_COURSE, "users", "sessions", "uploads"] as const) (d as unknown as Record<string, unknown>)[k] ??= {};
  d.customConnectors ??= [];
  return d;
}

export function save() {
  const d = g.__lmsdb;
  if (!d) return;
  const next = new Map<string, string>();
  for (const k of PER_COURSE) for (const [id, v] of Object.entries(d[k] ?? {})) if (v !== undefined) next.set(`${k}:${id}`, JSON.stringify(v));
  for (const k of GLOBAL) next.set(k, JSON.stringify(d[k]));
  const written = (g.__lmswritten ??= new Map());
  const conn = sql();
  const put = conn.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v");
  const del = conn.prepare("DELETE FROM kv WHERE k = ?");
  conn.exec("BEGIN");
  try {
    for (const [k, v] of next) if (written.get(k) !== v) put.run(k, v);
    for (const k of written.keys()) if (!next.has(k)) del.run(k);
    conn.exec("COMMIT");
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
  g.__lmswritten = next;
  // Data that was loaded from the old JSON file now lives in SQLite.
  if (fs.existsSync(LEGACY)) fs.renameSync(LEGACY, `${LEGACY}.migrated`);
  publish();
}

/** 恢复示例数据，保留已添加的自定义连接器。 */
/** Restore the demo course's sample data. Other courses are left alone. */
export function reset() {
  const d = db();
  const f = fresh();
  for (const k of ["courses", "progress", "posts", "toolLog", "events", "choices", "studio", "marks", "live", "uptake", "nudges", "plans"] as const) {
    (d[k] as Record<string, unknown>).demo = (f[k] as Record<string, unknown>).demo;
  }
  save();
}

/** Every course, newest first, with a little summary for the course list. */
export function listCourses() {
  const d = db();
  return Object.values(d.courses).map((c) => ({
    id: c.id,
    ownerId: c.ownerId,
    title: c.title,
    subtitle: c.subtitle,
    students: c.students.length,
    weeks: c.weeks.length,
    cards: c.weeks.reduce((n, w) => n + w.lessons.reduce((m, l) => m + l.modules.length, 0), 0),
    createdAt: c.createdAt ?? 0,
  })).sort((a, b) => b.createdAt - a.createdAt);
}

/** 记一条课堂动态，最多保留 300 条。 */
export function logEvent(courseId: string, e: Omit<ClassEvent, "id" | "at">) {
  const list = (db().events[courseId] ??= []);
  list.push({ ...e, id: Math.random().toString(36).slice(2, 10), at: Date.now() });
  if (list.length > 300) list.splice(0, list.length - 300);
}
