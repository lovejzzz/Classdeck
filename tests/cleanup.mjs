// Removes test teachers (emails ending in @example.test), their courses, sessions and uploads from the local
// database. Run with the dev server stopped:  node tests/cleanup.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const db = new DatabaseSync(path.join(process.cwd(), ".data", "questhand.db"));
const get = (k) => { const r = db.prepare("SELECT v FROM kv WHERE k = ?").get(k); return r ? JSON.parse(r.v) : undefined; };
const put = (k, v) => db.prepare("UPDATE kv SET v = ? WHERE k = ?").run(JSON.stringify(v), k);

const users = get("users") ?? {};
const ids = Object.keys(users).filter((k) => /@example\.test$/.test(users[k].email));
const courses = db.prepare("SELECT v FROM kv WHERE k LIKE 'courses:%'").all().map((r) => JSON.parse(r.v)).filter((c) => ids.includes(c.ownerId)).map((c) => c.id);
for (const k of ids) delete users[k];
put("users", users);

const sessions = get("sessions") ?? {};
for (const [k, s] of Object.entries(sessions)) if (ids.includes(s.userId) || courses.includes(s.courseId)) delete sessions[k];
put("sessions", sessions);

const uploads = get("uploads") ?? {};
const files = Object.keys(uploads).filter((f) => ids.some((i) => uploads[f].by === `u:${i}`) || courses.some((c) => uploads[f].by?.startsWith(`s:${c}:`)));
for (const f of files) {
  delete uploads[f];
  fs.rmSync(path.join(process.cwd(), ".data", "uploads", f), { force: true });
}
put("uploads", uploads);

let rows = 0;
for (const c of courses) rows += Number(db.prepare("DELETE FROM kv WHERE k LIKE ?").run(`%:${c}`).changes);
console.log(`Removed ${ids.length} test teachers, ${courses.length} courses (${rows} rows), ${files.length} uploads.`);
