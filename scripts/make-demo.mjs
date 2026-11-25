// Builds the open demo course (/teach/demo) by running a real class through a local Questhand:
//   node scripts/make-demo.mjs [baseUrl]        (a dev server running on this computer, with its data in .data/)
// It imports scripts/demo-course.json as a new course, invites six students who work through it on different paths
// (answers that deal follow-ups, a card group's score, a group of groups, a sign-up poll, electives, hand-ins, a
// discussion), gives feedback as the teacher, then writes the course and everything that happened in it to
// lib/demo-seed.json, with the course's id as "demo". lib/seed.ts moves its times forward to look recent.
// Uses throwaway @example.test accounts; remove them afterwards with the server stopped: node tests/cleanup.mjs
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const B = process.argv[2] ?? "http://localhost:3000";
const run = randomBytes(3).toString("hex");
const DAY = 86400000;
function jar() {
  let cookie = "";
  return {
    async post(p, b) {
      const r = await fetch(B + p, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(b) });
      for (const c of r.headers.getSetCookie()) if (c.startsWith("cd_s=")) cookie = c.split(";")[0];
      const j = await r.json();
      if (j.ok === false) throw new Error(`${p} ${JSON.stringify(b).slice(0, 120)} → ${j.error}`);
      return j;
    },
    async get(p) { return (await fetch(B + p, { headers: cookie ? { cookie } : {} })).json(); },
  };
}

// —— The teacher and the course ——
const T = jar();
await T.post("/api/auth", { action: "signup", email: `t-demo-${run}@example.test`, name: "Ms Rivera", password: randomBytes(12).toString("hex") });
const file = JSON.parse(readFileSync(new URL("./demo-course.json", import.meta.url), "utf8"));
const { id: cid } = await T.post("/api/courses", { file });
const course = async () => (await T.get(`/api/course/${cid}`)).course;
const op = (b) => T.post(`/api/course/${cid}`, b);
let c = await course();
const lessons = c.weeks.flatMap((w) => w.lessons);
const byTitle = (t) => lessons.flatMap((l) => l.modules).find((m) => m.title === t);
const lessonOf = (t) => lessons.find((l) => l.title === t);
// Lesson days: the first two last week, today's lesson is Build the base, the debrief next week. The greenhouse is due in two days.
const day = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const dates = { "Welcome aboard, cadet": -7, "Pack the rocket": -5, "Build the base": 0, "Elective: Rover driving school": 2, "Elective: Space kitchen": 2, "Mission debrief": 7 };
await op({ op: "saveLessons", lessons: lessons.map((l) => ({ ...l, date: day(dates[l.title]), modules: l.modules.map((m) => (m.title === "Design a Mars greenhouse" ? { ...m, due: day(2) } : m)) })) });

// —— The class: six invited students, and one waiting to be let in ——
const names = ["Ava Chen", "Leo Park", "Mia Rossi", "Noah Kim", "Zara Ali", "Sam Okafor"];
await op({ op: "addStudents", names: names.join("\n") });
const links = (await op({ op: "setupLinks" })).links;
const kids = {};
for (const name of names) {
  const S = jar();
  await S.post("/api/auth", { action: "signup", email: `t-demo-${name.split(" ")[0].toLowerCase()}-${run}@example.test`, name, password: randomBytes(12).toString("hex"), as: "student" });
  const { studentId } = await S.post("/api/auth", { action: "invite", courseId: cid, token: links.find((x) => x.name === name).link.split("#")[1] });
  kids[name.split(" ")[0]] = { S, id: studentId };
}
c = await course();
{
  const W = jar();
  await W.post("/api/auth", { action: "signup", email: `t-demo-ivy-${run}@example.test`, name: "Ivy Moreno", password: randomBytes(12).toString("hex"), as: "student" });
  await W.post("/api/auth", { action: "joinCode", code: c.joinCode });
}

// —— What each student does ——
const act = (k) => {
  const { S, id } = kids[k];
  const o = (b) => S.post(`/api/course/${cid}`, { studentId: id, ...b });
  const m = (t) => byTitle(t);
  return {
    read: (t) => o({ op: "setProgress", moduleId: m(t).id, status: "done" }),
    start: (t) => o({ op: "setProgress", moduleId: m(t).id, status: "doing" }),
    pick: (t, choice) => o({ op: "answer", moduleId: m(t).id, qid: m(t).questions[0].id, choice }),
    multi: (t, multi) => o({ op: "answer", moduleId: m(t).id, qid: m(t).questions[0].id, multi }),
    order: (t, order) => o({ op: "answer", moduleId: m(t).id, qid: m(t).questions[0].id, order }),
    word: (t, text) => o({ op: "answer", moduleId: m(t).id, qid: m(t).questions[0].id, text }),
    handIn: (t, output) => o({ op: "setProgress", moduleId: m(t).id, output, status: "done" }),
    elective: (t) => o({ op: "chooseElective", lessonId: lessonOf(t).id, on: true }),
    post: (t, text) => o({ op: "addPost", moduleId: m(t).id, text }),
    reply: (postId, text) => S.post(`/api/course/${cid}`, { op: "comment", postId, who: id, text }),
  };
};
const order = ["Close the hatch", "Check the fuel", "Start the engines", "Lift off!"];
const week1 = async (k, { job, trip = 0, pack = [0, 1, 2, 4], count = order, gas = "oxygen", fuel = [0, 0, 0] }) => {
  const a = act(k);
  await a.read("Your mission briefing");
  await a.pick("Pick your crew job", job);
  await a.pick("How far is Mars?", trip);
  if (trip !== 0) await a.read("Space is BIG");
  await a.multi("What goes on board?", pack);
  await a.order("Countdown", count);
  await a.word("One word", gas);
  for (const [i, t] of ["Closest to the Sun", "The red planet", "Moons"].entries()) await a.pick(t, fuel[i]);
};
const inspection = async (k, [a1, a2, w1, w2]) => {
  const a = act(k);
  await a.read("Three things to stay alive");
  await a.pick("Mars air", a1); await a.pick("A walk outside", a2); await a.pick("Where's the water?", w1); await a.pick("A drink, please", w2);
};

// Ava: top of the class. Pilot; every answer right, so the fuel check deals the bonus card; greenhouse in; Rover driving.
await week1("Ava", { job: 0 });
await act("Ava").read("Bonus: the tallest volcano");
await inspection("Ava", [0, 0, 0, 0]);
await act("Ava").handIn("Design a Mars greenhouse", "My greenhouse is a dome made of thick clear plastic, half buried so it stays warm.\n1. Light: sunlight through the dome, plus LED lamps for dust storms.\n2. Water: ice from under the base, melted and cleaned in the tank by the door.\n3. Plants: potatoes (lots of food, grow in poor soil), lettuce (fast), and strawberries (for morale!).");
const avaPost = (await act("Ava").post("What would you miss from Earth?", "The sea. Swimming on a hot day, and the sound of waves. 🌊")).post?.id;
await act("Ava").elective("Elective: Rover driving school");
await act("Ava").read("Meet the rover");
await act("Ava").pick("Rock ahead!", 0);
// Leo: thinks Mars is 3 days away (so he's dealt Space is BIG), then 1 of 3 in the fuel check (Refuel), now on today's lesson.
await week1("Leo", { job: 1, trip: 1, fuel: [1, 0, 1] });
await act("Leo").start("Refuel: planet facts");
await act("Leo").read("Three things to stay alive");
// Mia: Botanist. 2 of 3 in the fuel check; a greenhouse with no water, so she's asked to revise; replies to Ava.
await week1("Mia", { job: 2, fuel: [0, 0, 2] });
await inspection("Mia", [0, 0, 0, 1]);
await act("Mia").handIn("Design a Mars greenhouse", "A long glass tunnel with shelves of tomatoes, beans and basil, and big windows for sunlight.");
const miaPost = (await act("Mia").post("What would you miss from Earth?", "My dog Biscuit. Can dogs go to Mars?")).post?.id;
if (avaPost) await act("Mia").reply(avaPost, "Same! Maybe the base can have a pool?");
await act("Mia").elective("Elective: Space kitchen");
// Noah: Engineer. Packed his bicycle and got the countdown in the wrong order; still in the fuel check.
await week1("Noah", { job: 1, pack: [0, 1, 3], count: ["Start the engines", "Close the hatch", "Check the fuel", "Lift off!"], fuel: [0, 0, 0] });
// (Noah's fuel check is done; he hasn't opened the bonus card yet.)
// Zara: Medic. 2 of 4 in the base inspection, so she's dealt the Fix-it list; greenhouse in, waiting for feedback.
await week1("Zara", { job: 3, fuel: [0, 1, 0] });
await inspection("Zara", [1, 0, 0, 1]);
await act("Zara").read("Fix-it list");
await act("Zara").handIn("Design a Mars greenhouse", "Greenhouse made of ice blocks (ice lets light through and keeps the cold out).\n1. Light: the sun shining through the ice.\n2. Water: we melt a little of the wall when we need it!\n3. Plants: wheat for bread, peas, and sunflowers.");
if (miaPost) await act("Zara").reply(miaPost, "Dogs can't fit in a spacesuit… yet 🐶");
await act("Zara").post("What would you miss from Earth?", "Rain! I never thought I'd say that.");
// Sam: just started: read the briefing, picked Pilot, and stopped. The teacher sends a reminder.
await act("Sam").read("Your mission briefing");
await act("Sam").pick("Pick your crew job", 0);

// —— The teacher ——
const g = byTitle("Design a Mars greenhouse").id;
await op({ op: "review", moduleId: g, studentId: kids.Ava.id, verdict: "good", text: "Brilliant, Ava. Half-burying it is exactly what real designs do. Strawberries for morale: approved. 🍓" });
await op({ op: "review", moduleId: g, studentId: kids.Mia.id, verdict: "revise", text: "Lovely plants, Mia! Where does the water come from? Add it to your drawing and hand it in again." });
await op({ op: "nudge", studentIds: [kids.Sam.id], moduleId: byTitle("How far is Mars?").id, text: "Hi Sam! Your crew needs you: try “How far is Mars?” next. 🚀" });
await op({ op: "addPost", moduleId: byTitle("What would you miss from Earth?").id, studentId: "teacher", text: "Mine: fresh bread from the bakery on my street. What a list, crew!" });

// —— Write it out as the demo ——
c = await course();
const db = new DatabaseSync(new URL("../.data/questhand.db", import.meta.url).pathname, { readOnly: true });
const get = (k) => { const r = db.prepare("SELECT v FROM kv WHERE k = ?").get(`${k}:${cid}`); return r ? JSON.parse(r.v) : undefined; };
const seed = { exportedAt: Date.now() };
// Every part is written, empty or not (lib/seed.ts reads each one).
const empty = { progress: {}, posts: [], toolLog: [], events: [], choices: {}, studio: { posts: [], feedback: [] }, marks: [], live: { hands: {} }, uptake: {}, nudges: [], plans: {} };
for (const k of ["courses", "progress", "posts", "toolLog", "events", "choices", "studio", "marks", "live", "uptake", "nudges", "plans"]) seed[k] = get(k) ?? empty[k];
// The demo belongs to no one (anyone can open it); its students are names only.
const dc = seed.courses;
delete dc.ownerId; delete dc.people;
dc.students = dc.students.map(({ id, name }) => ({ id, name }));
dc.waiting = (dc.waiting ?? []).map(({ id, name, joinedAt }) => ({ id, name, email: "ivy@example.test", joinedAt }));
// Times as they'd be in a class that ran over the last week: each lesson's work on its own day.
const lessonDay = new Map();
for (const l of dc.weeks.flatMap((w) => w.lessons)) for (const m of l.modules) lessonDay.set(m.id, dates[l.title] ?? 0);
const now = seed.exportedAt;
const when = (mid, extraMs = 0) => now + Math.min(0, lessonDay.get(mid) ?? 0) * DAY + extraMs;
let jitter = 0;
const nextJ = () => (jitter = (jitter + 2_437_000) % (5 * 3600_000)) - 6 * 3600_000;
for (const per of Object.values(seed.progress ?? {})) for (const [mid, p] of Object.entries(per)) {
  const t = when(mid, nextJ());
  if (p.updatedAt) p.updatedAt = t;
  if (p.review) p.review.at = now - 3 * 3600_000;
}
for (const e of seed.events ?? []) if (e.moduleId) e.at = when(e.moduleId, nextJ());
for (const p of seed.posts ?? []) { p.createdAt = when(p.moduleId, nextJ()); for (const cm of p.comments ?? []) cm.at = p.createdAt + 40 * 60_000; }
for (const n of seed.nudges ?? []) n.at = now - 2 * 3600_000;
let out = JSON.stringify(seed, null, 1).split(cid).join("demo");
writeFileSync(new URL("../lib/demo-seed.json", import.meta.url), out + "\n");
console.log(`Wrote lib/demo-seed.json from ${cid}: ${dc.students.length} students, ${Object.keys(seed.progress ?? {}).length} with work, ${(seed.posts ?? []).length} posts.`);
