// End-to-end API checks against a running Questhand (default http://localhost:3000).
//   node tests/api.test.mjs [baseUrl]
// Creates throwaway teachers with @example.test emails. Remove them afterwards, with the server stopped:
//   node tests/cleanup.mjs
import { randomBytes } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3000";
const run = randomBytes(3).toString("hex");
let passed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) passed++;
  else failures.push(`${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300)}` : ""}`);
}

/** A browser-like client with its own cookie. */
function client() {
  let cookie = "";
  async function call(method, path, body, raw) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let payload;
    if (raw !== undefined) { payload = raw; headers["content-type"] = "application/json"; }
    else if (body instanceof FormData) payload = body;
    else if (body !== undefined) { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      if (k === "cd_s") cookie = v ? `cd_s=${v}` : "";
    }
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _text: text.slice(0, 200) }; }
    return { status: res.status, ...json };
  }
  return {
    get: (p) => call("GET", p),
    post: (p, b) => call("POST", p, b),
    raw: (p, s) => call("POST", p, undefined, s),
    del: (p, b) => call("DELETE", p, b),
    op: (cid, b) => call("POST", `/api/course/${cid}`, b),
    state: (cid) => call("GET", `/api/course/${cid}`),
    get cookie() { return cookie; },
  };
}

async function teacher(tag) {
  const c = client();
  const email = `t-${tag}-${run}@example.test`, password = randomBytes(12).toString("hex");
  const r = await c.post("/api/auth", { action: "signup", email, name: `Teacher ${tag}`, password });
  check(`signup ${tag}`, r.ok === true, r);
  c.creds = { email, password };
  return c;
}

// A student is an account too: it signs up, then opens its invitation (or joins with the class code).
let studentN = 0;
async function student(name = `Student ${++studentN}`) {
  const c = client();
  await c.post("/api/auth", { action: "signup", email: `t-s${++studentN}-${run}@example.test`, name, password: randomBytes(12).toString("hex"), as: "student" });
  return c;
}
async function invited(courseId, link, name) {
  const c = await student(name);
  const r = await c.post("/api/auth", { action: "invite", courseId, token: link.includes("#") ? link.split("#")[1] : link });
  return { c, r, id: r.studentId };
}

const courseOf = (s) => s.course ?? s;
const modulesOf = (c) => c.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules));


// Card groups with tries, at the edges: teachers changing tries mid-way, feedback inside a group, groups inside groups,
// a group with no questions, two tabs, copies.
async function main() {
  const A = await teacher("tries");
  const tc = await A.post("/api/courses", { title: `Tries ${run}`, start: "blank" });
  const tid = tc.id;
  const wk = courseOf(await A.state(tid)).weeks[0];
  await A.op(tid, { op: "addLesson", weekId: wk.id });
  await A.op(tid, { op: "addStudents", names: "Ann\nBen" });
  const roster = courseOf(await A.state(tid)).students;
  const sid = (n) => roster.find((s) => s.name === n).id;
  const links = (await A.op(tid, { op: "setupLinks" })).links;
  const as = async (name) => (await invited(tid, links.find((x) => x.name === name).link, name)).c;
  const S = { Ann: await as("Ann"), Ben: await as("Ben") };
  const [L1] = courseOf(await A.state(tid)).weeks[0].lessons;
  const card = (id, type, title, extra = {}) => ({ id, type, title, body: "", audience: { kind: "all" }, tools: [], attachments: [], ...extra });
  const qc = (id, n) => card(id, "practice", `Q ${id}`, { questions: [{ id: `${id}a`, text: `Q${n}`, options: ["right", "wrong"], answer: 0, explain: "because" }] });
  const modules = [
    card("g1", "group", "Check", { members: ["q1", "q2", "w1"], attempts: 3, bands: [{ min: 0, next: "r-low" }, { min: 100, next: "r-top" }] }),
    qc("q1", 1), qc("q2", 2), card("w1", "submit", "Write a line"),
    card("r-low", "read", "Low"), card("r-top", "read", "Top"),
    card("outer", "group", "Outer", { members: ["inner", "q5"], attempts: 2 }),
    card("inner", "group", "Inner", { members: ["q3", "q4"] }),
    qc("q3", 3), qc("q4", 4), qc("q5", 5),
    card("notes", "group", "Notes", { members: ["n1", "n2"], attempts: 2 }),
    card("n1", "read", "Read this"), card("n2", "submit", "Hand this in"),
  ];
  const r0 = await A.op(tid, { op: "saveLesson", lesson: { ...L1, modules } });
  check("lesson saved", r0.ok !== false, r0);
  const look = async (who) => { const id = sid(who); const s = await S[who].state(`${tid}?as=${id}`); return { s, p: s.progress[id] ?? {}, c: courseOf(s) }; };
  const deck = (c, id) => c.weeks[0].lessons[0].decks?.find((d) => d.id === id);
  const ans = (who, card, choice) => S[who].op(tid, { op: "answer", studentId: sid(who), moduleId: card, qid: `${card}a`, choice });
  const retake = (who, g) => S[who].op(tid, { op: "retakeGroup", studentId: sid(who), moduleId: g });
  const setTries = async (id, n) => {
    const l = courseOf(await A.state(tid)).weeks[0].lessons[0];
    const r = await A.op(tid, { op: "saveLesson", lesson: { ...l, modules: l.modules.map((m) => (m.id === id ? { ...m, attempts: n > 1 ? n : undefined } : m)) } });
    check(`set ${id} to ${n} tries`, r.ok !== false, r);
  };

  // A group with no questions has no score, so no tries.
  {
    const { c } = await look("Ann");
    const d = deck(c, "notes");
    check("a group with no questions offers no tries", d && d.attempts === undefined, d);
  }

  // Try 1: one wrong, one right, and the written card handed in.
  await ans("Ann", "q1", 1);
  const last = await ans("Ann", "q2", 0);
  check("the group scores once its questions are answered", last.groupDealt?.some((x) => x.id === "r-low"), last);
  await S.Ann.op(tid, { op: "setProgress", studentId: sid("Ann"), moduleId: "w1", output: "My line", status: "done" });

  // Feedback: none on a question card; on the written card, a request to revise doesn't stop another try.
  const fq = await A.op(tid, { op: "review", studentId: sid("Ann"), moduleId: "q1", verdict: "revise", text: "redo" });
  check("no feedback on a question card", fq.ok === false, fq);
  const fw = await A.op(tid, { op: "review", studentId: sid("Ann"), moduleId: "w1", verdict: "revise", text: "Say more" });
  check("feedback on the written card in the group", fw.ok !== false, fw);

  // Two tabs press Try again at once: one try starts.
  const both = await Promise.all([retake("Ann", "g1"), retake("Ann", "g1")]);
  check("two Try again presses start one try", both.filter((r) => r.ok !== false).length === 1, both);
  {
    const { p, c } = await look("Ann");
    check("the new try clears question answers", !p.q1?.answers?.q1a && !p.q2?.answers?.q2a, [p.q1, p.q2]);
    check("written work in the group is kept, with its feedback", p.w1?.output === "My line" && p.w1?.review?.text === "Say more", p.w1);
    check("the written card is still waiting on the revision", p.w1?.status === "doing" && p.w1?.reopened === true, p.w1);
    check("the earlier try's card stays", modulesOf(c).some((m) => m.id === "r-low"));
    const d = deck(c, "g1");
    check("try 2 of 3, best 50%", d?.attempt === 2 && d?.attempts === 3 && d?.best === 50 && d?.score === undefined, d);
  }

  // Others can't press it for her; inner groups have no Try again of their own.
  const other = await S.Ben.op(tid, { op: "retakeGroup", studentId: sid("Ann"), moduleId: "g1" });
  check("a student can't start a try for someone else", other.ok === false, other);

  // A student marking the group done by hand doesn't get the answers early, or another try.
  await S.Ann.op(tid, { op: "setProgress", studentId: sid("Ann"), moduleId: "g1", status: "done" });
  await ans("Ann", "q1", 1);
  {
    const { p } = await look("Ann");
    check("no answer key before the last try, whatever the group's status", p.q1?.reveal?.q1a?.answer === undefined, p.q1);
  }
  const early = await retake("Ann", "g1");
  check("no new try until this one is finished", early.ok === false, early);
  await S.Ann.op(tid, { op: "setProgress", studentId: sid("Ann"), moduleId: "g1", status: "doing" });
  await ans("Ann", "q2", 0);
  // Teacher lowers the tries to 2 while she's used 2: she's done.
  await setTries("g1", 2);
  {
    const { p, c } = await look("Ann");
    const d = deck(c, "g1");
    check("after the teacher lowers the tries to 2, try 2 of 2", d?.attempt === 2 && d?.attempts === 2, d);
    check("…and the answers show", p.q1?.reveal?.q1a?.answer === 0, p.q1);
    check("…and no more tries", (await retake("Ann", "g1")).ok === false);
  }
  // Raised to 3 again: another try, and the key is put away again.
  await setTries("g1", 3);
  const t3 = await retake("Ann", "g1");
  check("raised to 3, another try", t3.ok !== false && t3.attempt === 3, t3);
  await ans("Ann", "q1", 0); await ans("Ann", "q2", 0);
  {
    const { c } = await look("Ann");
    check("a 100% try deals its card and keeps the earlier one", ["r-low", "r-top"].every((x) => modulesOf(c).some((m) => m.id === x)));
    check("best is 100", deck(c, "g1")?.best === 100, deck(c, "g1"));
  }
  // Lowered below the try she's on: shown as her last try.
  await setTries("g1", 2);
  {
    const d = deck((await look("Ann")).c, "g1");
    check("tries lowered below the one she's on: shown as the last", d?.attempt === 2 && d?.attempts === 2, d);
  }

  // Ben: try 1, try 2 started, then the teacher turns tries off.
  await ans("Ben", "q1", 1); await ans("Ben", "q2", 1);
  await retake("Ben", "g1");
  await setTries("g1", 1);
  {
    const r1 = await ans("Ben", "q1", 1);
    const r2 = await ans("Ben", "q1", 0);
    check("with tries off, answering goes back to until right", r1.ok !== false && r2.ok !== false && r2.correct === true, [r1, r2]);
    await ans("Ben", "q2", 0);
    const { c, p } = await look("Ben");
    const d = deck(c, "g1");
    check("with tries off, no try count shows", d?.attempts === undefined, d);
    check("…and the try's score is kept with the earlier one", p.g1?.tries?.length === 1 && p.g1?.dealt?.["#score"] === 50, p.g1);
    check("…and no Try again", (await retake("Ben", "g1")).ok === false);
  }

  // Groups inside a group: tries are on the outer one.
  await ans("Ann", "q3", 1); await ans("Ann", "q4", 0); await ans("Ann", "q5", 0);
  check("no Try again on an inner group", (await retake("Ann", "inner")).ok === false);
  const ro = await retake("Ann", "outer");
  check("Try again on the outer group starts at its first card", ro.ok !== false && ro.first === "q3", ro);
  {
    const { p } = await look("Ann");
    check("the inner group's score is kept as a try too", p.inner?.tries?.[0] === 50 && p.inner?.dealt?.["#score"] === undefined && p.outer?.tries?.[0] === 67, [p.inner, p.outer]);
    const again = await ans("Ann", "q3", 0);
    const twice = await ans("Ann", "q3", 1);
    check("inside the inner group, once a try too", again.ok !== false && twice.ok === false, [again, twice]);
  }

  // A copy of the lesson keeps the tries, on the copied cards.
  await A.op(tid, { op: "duplicateLesson", lessonId: L1.id });
  {
    const ls = courseOf(await A.state(tid)).weeks[0].lessons;
    const copy = ls.find((l) => l.id !== L1.id && l.modules.some((m) => m.title === "Outer"));
    const o = copy?.modules.find((m) => m.title === "Outer");
    check("a copied lesson keeps the group's tries", o && o.id !== "outer" && o.attempts === 2 && o.members.every((id) => copy.modules.some((m) => m.id === id) && !["inner", "q5"].includes(id)), o);
  }

  await A.del("/api/courses", { id: tid, confirm: `Tries ${run}` });
  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
