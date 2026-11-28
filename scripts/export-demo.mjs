// Writes the open demo course (/teach/demo, the "How to use Questhand" link) from a course in the local database:
// the course and everything its class did, with the course's id as "demo".
//   node scripts/export-demo.mjs <courseId>
// Build the course and play it as its demo students first (in the browser: tests/play-student.mjs plays them through
// the real pages). Demo students become ordinary students here (s-<first name>), so the demo's class numbers count
// them. Each lesson's work is timed on that lesson's day (before now); lib/seed.ts keeps it recent from there.
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const cid = process.argv[2];
if (!cid) throw new Error("Which course? node scripts/export-demo.mjs <courseId>");
const DAY = 86400000;
const db = new DatabaseSync(new URL("../.data/questhand.db", import.meta.url).pathname, { readOnly: true });
const get = (k) => { const r = db.prepare("SELECT v FROM kv WHERE k = ?").get(`${k}:${cid}`); return r ? JSON.parse(r.v) : undefined; };
const seed = { exportedAt: Date.now() };
const empty = { progress: {}, posts: [], toolLog: [], events: [], choices: {}, studio: { posts: [], feedback: [] }, marks: [], live: { hands: {} }, uptake: {}, nudges: [], plans: {} };
for (const k of ["courses", "progress", "posts", "toolLog", "events", "choices", "studio", "marks", "live", "uptake", "nudges", "plans"]) seed[k] = get(k) ?? empty[k];
const dc = seed.courses;
if (!dc) throw new Error(`No course ${cid} in .data/questhand.db`);
// The demo belongs to no one (anyone can open it); its students are names only.
delete dc.ownerId; delete dc.people; delete dc.guest;
const rename = new Map(dc.students.map((s) => [s.id, `s-${s.name.split(" ")[0].toLowerCase()}`]));
dc.students = dc.students.map(({ id, name }) => ({ id, name }));
dc.waiting = [];

// Each card's lesson day; work on a card happened that day in the afternoon (never later than now).
const now = seed.exportedAt;
const dayOf = new Map();
for (const l of dc.weeks.flatMap((w) => w.lessons)) for (const m of l.modules) dayOf.set(m.id, l.date);
let jitter = 0;
const nextJ = () => (jitter = (jitter + 2_437_000) % (4 * 3600_000));
const when = (mid) => {
  const d = dayOf.get(mid);
  const t = d ? Date.parse(`${d}T13:00:00`) + nextJ() : now - 2 * DAY + nextJ();
  return Math.min(t, now - 20 * 60_000 - nextJ() / 8);
};
for (const per of Object.values(seed.progress ?? {})) for (const [mid, p] of Object.entries(per)) {
  const t = when(mid);
  if (p.updatedAt) p.updatedAt = t;
  if (p.startedAt) p.startedAt = t - 6 * 60_000;
  if (p.ai?.at) p.ai.at = t + 60_000;
  if (p.review) p.review.at = Math.min(now - 3600_000, t + 5 * 3600_000);
}
for (const e of seed.events ?? []) if (e.moduleId) e.at = when(e.moduleId);
for (const p of seed.posts ?? []) { p.createdAt = when(p.moduleId); for (const cm of p.comments ?? []) cm.at = p.createdAt + 40 * 60_000; }
for (const n of seed.nudges ?? []) n.at = now - 2 * 3600_000;

let out = JSON.stringify(seed, null, 1).split(cid).join("demo");
for (const [from, to] of rename) out = out.split(from).join(to);
writeFileSync(new URL("../lib/demo-seed.json", import.meta.url), out + "\n");
console.log(`Wrote lib/demo-seed.json from ${cid}: ${dc.students.length} students, ${Object.keys(seed.progress ?? {}).length} with work, ${(seed.posts ?? []).length} posts.`);
