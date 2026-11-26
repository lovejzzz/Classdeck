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

  // Roles in groups: kept for people in the group, dropped for others, and a student sees them.
  await A.op(cid, { op: "addStudents", names: "Ben\nCai" });
  const roster = courseOf(await A.state(cid)).students;
  const id = (n) => roster.find((x) => x.name === n).id;
  const sg = await A.op(cid, { op: "saveGrouping", grouping: { name: "Practice groups", groups: [{ name: "Red", studentIds: [id("Ann"), id("Ben")], roles: { [id("Ann")]: "Speaker", [id("Ben")]: "Timekeeper", [id("Cai")]: "Note-taker" } }, { name: "Blue", studentIds: [id("Cai")] }] } });
  check("a grouping with roles saves", !!sg.id, sg);
  const gs = courseOf(await A.state(cid)).groupings.find((g) => g.id === sg.id);
  check("roles stay with the people in the group", gs.groups[0].roles?.[id("Ann")] === "Speaker" && gs.groups[0].roles?.[id("Ben")] === "Timekeeper", gs.groups[0].roles);
  check("a role for someone not in the group is dropped", !gs.groups[0].roles?.[id("Cai")], gs.groups[0].roles);
  const sv = courseOf(await S.state(`${cid}?as=${sid}`)).groupings.find((g) => g.id === sg.id);
  check("the student sees the roles in their group", sv.groups[0].roles?.[id("Ann")] === "Speaker", sv.groups[0]);

  // Certificate of completion: off by default; on at a share of cards; earned by work or given by the teacher.
  const off = courseOf(await S.state(`${cid}?as=${sid}`));
  check("no certificate until it's turned on", !off.certificate, off.certificate);
  const bad = await S.op(cid, { op: "setCertificate", percent: 1 });
  check("a student can't turn it on", bad.ok === false || bad.status >= 400, bad);
  await A.op(cid, { op: "setCertificate", percent: 90 });
  let mine = courseOf(await S.state(`${cid}?as=${sid}`)).certificate;
  check("the student sees their standing, not earned yet", mine?.percent === 90 && mine.mine && mine.mine.earned === false && mine.mine.total > 0, mine);
  check("students don't receive who else was given one", mine && !("given" in mine && mine.given), mine);
  await A.op(cid, { op: "giveCertificate", studentId: sid });
  mine = courseOf(await S.state(`${cid}?as=${sid}`)).certificate;
  check("a certificate given by the teacher counts", mine?.mine?.earned === true && typeof mine.mine.at === "number", mine);
  await A.op(cid, { op: "giveCertificate", studentId: sid, on: false });
  mine = courseOf(await S.state(`${cid}?as=${sid}`)).certificate;
  check("and can be taken back", mine?.mine?.earned === false, mine);
  await A.op(cid, { op: "setCertificate", percent: 1 });
  mine = courseOf(await S.state(`${cid}?as=${sid}`)).certificate;
  check("finishing enough cards earns it", mine?.mine?.earned === true, mine);
  await A.op(cid, { op: "setCertificate", on: false });
  check("turning it off removes it", !courseOf(await S.state(`${cid}?as=${sid}`)).certificate, null);

  // AI feedback is per card, and needs the teacher's own AI; a meeting card keeps its time.
  const L = courseOf(await A.state(cid)).weeks[1].lessons[0];
  const sess = L.modules.find((m) => m.title.startsWith("Collab session"));
  const jour = L.modules.find((m) => m.title === "Learning Journal");
  const mods = L.modules.map((m) => m.id === jour.id ? { ...m, aiFeedback: true } : m.id === sess.id ? { ...m, due: "2026-12-01", dueTime: "15:30", attachments: [{ id: "a1", kind: "link", url: "https://us02web.zoom.us/j/123" }] } : m);
  await A.op(cid, { op: "saveLesson", lesson: { ...L, modules: mods } });
  const L2 = courseOf(await A.state(cid)).weeks[1].lessons[0];
  check("the card keeps Allow AI feedback", L2.modules.find((m) => m.id === jour.id).aiFeedback === true, null);
  check("a meeting card keeps its date and time", L2.modules.find((m) => m.id === sess.id).dueTime === "15:30", L2.modules.find((m) => m.id === sess.id));
  await A.op(cid, { op: "saveLesson", lesson: { ...L2, modules: L2.modules.map((m) => m.id === sess.id ? { ...m, dueTime: "25:99" } : m) } });
  check("a time that isn't one is dropped", !courseOf(await A.state(cid)).weeks[1].lessons[0].modules.find((m) => m.id === sess.id).dueTime, null);
  const sj = modulesOf(courseOf(await S.state(`${cid}?as=${sid}`))).find((m) => m.id === jour.id);
  check("students aren't told about AI the teacher hasn't connected", sj && !sj.aiFeedback && !sj.aiWatches, sj && { ai: sj.aiFeedback, w: sj.aiWatches });
  const noKey = await A.post("/api/ai", { provider: "openai" });
  check("saving AI with no key asks for one", noKey.ok === false && /key/i.test(noKey.error), noKey);
  const other = await S.get("/api/ai");
  check("another account sees only its own AI setup (none)", other.ai?.active === null || other.status === 401, other);
  check("the teacher has no AI set up yet", (await A.get("/api/ai")).ai?.active === null, null);

  // Your account: a new name is saved; an empty one isn't.
  const nm = await A.post("/api/auth", { action: "setName", name: "  Ms   Rivera " });
  check("a teacher changes their name", nm.ok && nm.name === "Ms Rivera" && (await A.get("/api/auth")).name === "Ms Rivera", nm);
  check("an empty name is refused", (await A.post("/api/auth", { action: "setName", name: "  " })).ok === false, null);
  const me = await A.get("/api/auth");
  check("the account says how it signs in", me.signIn?.password === true && typeof me.since === "number", me.signIn);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
