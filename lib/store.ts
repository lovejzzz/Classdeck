import fs from "fs";
import path from "path";
import { publish } from "./bus";
import { seedChoices, seedCourse, seedEvents, seedPosts, seedProgress, seedStudio } from "./seed";
import type { ClassEvent, Course, Feedback, Post, ProgressMap, StudioPost, ToolLogEntry } from "./types";
import type { Manifest } from "./connectors/types";

// 原型用的存储：一个 JSON 文件。换成真数据库时只需要替换这个文件。

export interface DB {
  courses: Record<string, Course>;
  progress: Record<string, ProgressMap>;
  posts: Record<string, Post[]>;
  toolLog: Record<string, ToolLogEntry[]>;
  events: Record<string, ClassEvent[]>;
  choices: Record<string, Record<string, Record<string, string>>>;
  studio: Record<string, { posts: StudioPost[]; feedback: Feedback[] }>;
  customConnectors: Manifest[];
}

const FILE = path.join(process.cwd(), ".data", "db.json");
const g = globalThis as unknown as { __lmsdb?: DB };

function fresh(custom: Manifest[] = []): DB {
  const course = seedCourse();
  return {
    courses: { [course.id]: course },
    progress: { [course.id]: seedProgress() },
    posts: { [course.id]: seedPosts() },
    toolLog: { [course.id]: [] },
    events: { [course.id]: seedEvents() },
    choices: { [course.id]: seedChoices() },
    studio: { [course.id]: seedStudio() },
    customConnectors: custom,
  };
}

export function db(): DB {
  if (!g.__lmsdb) {
    try {
      g.__lmsdb = JSON.parse(fs.readFileSync(FILE, "utf8")) as DB;
    } catch {
      g.__lmsdb = fresh();
      save();
    }
  }
  // Older saved data may predate newer fields; fill them in so reads never crash.
  const d = g.__lmsdb;
  d.events ??= {};
  d.choices ??= {};
  d.studio ??= {};
  d.toolLog ??= {};
  d.posts ??= {};
  d.customConnectors ??= [];
  return d;
}

export function save() {
  if (!g.__lmsdb) return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(g.__lmsdb, null, 2));
  publish();
}

/** 恢复示例数据，保留已添加的自定义连接器。 */
export function reset() {
  g.__lmsdb = fresh(g.__lmsdb?.customConnectors ?? []);
  save();
}

/** 记一条课堂动态，最多保留 300 条。 */
export function logEvent(courseId: string, e: Omit<ClassEvent, "id" | "at">) {
  const list = (db().events[courseId] ??= []);
  list.push({ ...e, id: Math.random().toString(36).slice(2, 10), at: Date.now() });
  if (list.length > 300) list.splice(0, list.length - 300);
}
