// End-to-end API checks against a running Questhand (default http://localhost:3000).
//   node tests/caps.test.mjs [baseUrl]
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


// The CaPS V4 course templates: both build, keep their links (Week 0's picks deal Week 1's videos, across weeks), and a
// student who ticks two focus areas gets exactly those two videos.
async function main() {
  const A = await teacher("caps");
  for (const start of ["caps1", "caps2"]) {
    const r = await A.post("/api/courses", { title: `${start} ${run}`, start });
    check(`${start}: makes a course`, r.ok === true && r.cards > 40, r);
    const c = courseOf(await A.state(r.id));
    check(`${start}: weeks 0 to 7`, c.weeks.length === 8 && c.weeks[0].title.startsWith("Week 0") && c.weeks[7].title.startsWith("Week 7"), c.weeks.map((w) => w.title));
    const ms = modulesOf(c);
    const ids = new Set(ms.map((m) => m.id));
    const targets = ms.flatMap((m) => (m.questions ?? []).flatMap((q) => (q.next ?? []).flat().filter(Boolean)));
    check(`${start}: every link points at a card in the course`, targets.length > 0 && targets.every((t) => ids.has(t)), targets.filter((t) => !ids.has(t)));
    check(`${start}: no leftover template ids`, ms.every((m) => !/^f[12]w/.test(m.id)), ms.map((m) => m.id).filter((x) => /^f[12]w/.test(x)));
    check(`${start}: discussions give structured feedback`, ms.filter((m) => m.kind === "discussion").every((m) => m.wall?.structured), null);
  }
  // A student in Flow 2 picks two Week 1 focus areas in Week 0.
  const r = await A.post("/api/courses", { title: `Flow two ${run}`, start: "caps2" });
  const cid = r.id;
  await A.op(cid, { op: "addStudents", names: "Ann" });
  const links = (await A.op(cid, { op: "setupLinks" })).links;
  const { c: S, id: sid } = await invited(cid, links.find((x) => x.name === "Ann").link, "Ann");
  const c = courseOf(await A.state(cid));
  const focus = c.weeks[0].lessons[0].modules.find((m) => m.questions?.[0]?.kind === "multi" && m.questions[0].next);
  check("Week 0 has the Week 1 focus picker", !!focus, c.weeks[0].lessons[0].modules.map((m) => m.title));
  const want = [focus.questions[0].next[1], focus.questions[0].next[4]].flat();
  const a = await S.op(cid, { op: "answer", studentId: sid, moduleId: focus.id, qid: focus.questions[0].id, multi: [1, 4] });
  check("the picks are saved", a.ok !== false, a);
  const seen = new Set(modulesOf(courseOf(await S.state(`${cid}?as=${sid}`))).map((m) => m.id));
  const videos = c.weeks[1].lessons[0].modules.filter((m) => m.title.startsWith("Video:"));
  check("Week 1 has seven videos", videos.length === 7, videos.length);
  check("the student gets the two videos they picked", want.every((id) => seen.has(id)), { want, seen: [...seen].filter((x) => videos.some((v) => v.id === x)) });
  check("and not the five they didn't", videos.filter((v) => !want.includes(v.id)).every((v) => !seen.has(v.id)), videos.filter((v) => seen.has(v.id)).map((v) => v.title));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
