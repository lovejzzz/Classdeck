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
  const r = await c.post("/api/auth", { action: "signup", email: `t-${tag}-${run}@example.test`, name: `Teacher ${tag}`, password: randomBytes(12).toString("hex") });
  check(`signup ${tag}`, r.ok === true, r);
  return c;
}

const courseOf = (s) => s.course ?? s;
const modulesOf = (c) => c.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules));

async function main() {
  const A = await teacher("a");
  const B = await teacher("b");
  const anon = client();

  // ---- Courses: each way to start, each subject
  const made = {};
  for (const [start, skillSet] of [["blank", "music"], ["template", "writing"], ["caps", "music"], ["template", undefined]]) {
    const r = await A.post("/api/courses", { title: `C ${start} ${skillSet ?? "default"} ${run}`, start, skillSet });
    check(`create ${start}/${skillSet}`, r.ok && r.id, r);
    made[`${start}/${skillSet}`] = r.id;
  }
  const blank = courseOf(await A.state(made["blank/music"]));
  check("blank: music skills", blank.skills?.[0]?.id === "mu-pitch", blank.skills);
  check("blank: 4 levels", blank.levels?.length === 4, blank.levels?.length);
  check("blank: one week, one lesson, no cards", blank.weeks.length === 1 && blank.weeks[0].lessons.length === 1 && modulesOf(blank).length === 0);
  check("new course: students add themselves with the teacher's OK", blank.access?.selfJoin === "approve", blank.access);
  const tmpl = courseOf(await A.state(made["template/writing"]));
  check("template/writing: writing skills", tmpl.skills?.[0]?.id === "wr-ideas");
  check("template/writing: no speaking skill ids left on cards", !modulesOf(tmpl).some((m) => (m.skills ?? []).some((s) => !s.startsWith("wr-"))), modulesOf(tmpl).map((m) => m.skills));
  const caps = courseOf(await A.state(made["caps/music"]));
  check("caps copy keeps speaking skills", caps.skills?.[0]?.id === "audience");
  check("caps copy has cards", modulesOf(caps).length > 30, modulesOf(caps).length);
  const def = courseOf(await A.state(made["template/undefined"]));
  check("default skill set is speaking", def.skills?.[0]?.id === "audience");
  check("empty title refused", (await A.post("/api/courses", { title: "  ", start: "blank" })).ok === false);
  check("anonymous can't create", (await anon.post("/api/courses", { title: "x", start: "blank" })).status === 401);

  // ---- Listing: own courses + demo, nothing of B's
  const listA = await A.get("/api/courses");
  check("A lists own courses", Object.values(made).every((id) => listA.courses.some((c) => c.id === id)));
  const listB = await B.get("/api/courses");
  check("B doesn't see A's courses", !listB.courses.some((c) => Object.values(made).includes(c.id)));

  // ---- Isolation between teachers
  const cid = made["blank/music"];
  check("B can't read A's course", [401, 403].includes((await B.state(cid)).status), (await B.state(cid)).status);
  check("anonymous can't read A's course", [401, 403].includes((await anon.state(cid)).status));
  const lesson = blank.weeks[0].lessons[0];
  check("B can't save A's lesson", [401, 403].includes((await B.op(cid, { op: "saveLesson", lesson }).then((r) => r.status))));
  check("B can't delete A's course", (await B.del("/api/courses", { id: cid, confirm: blank.title })).ok === false);
  check("delete needs the exact title", (await A.del("/api/courses", { id: cid, confirm: "wrong" })).ok === false);

  // ---- Cards of every kind save and come back
  const types = ["read", "explore", "practice", "quiz", "builder", "submit", "selfcheck", "reflect", "studio", "wall"];
  const mods = types.map((type, i) => ({ id: `m-${type}-${run}`, type, title: `Card ${i}`, body: "", audience: { kind: "all" }, tools: [], attachments: [] }));
  const sv = await A.op(cid, { op: "saveLesson", lesson: { ...lesson, modules: mods } });
  check("save a lesson with all ten kinds", sv.ok !== false && sv.status === 200, sv);
  const after = courseOf(await A.state(cid));
  check("all ten kinds come back", modulesOf(after).map((m) => m.type).join() === types.join(), modulesOf(after).map((m) => m.type));
  const add = await A.op(cid, { op: "addLesson", weekId: after.weeks[0].id, title: "Lesson 2" });
  check("add a lesson", add.ok !== false, add);
  check("lesson added", courseOf(await A.state(cid)).weeks[0].lessons.length === 2);

  // ---- Settings merged away fold into the instructions on save
  {
    const l0 = courseOf(await A.state(cid)).weeks[0].lessons[0];
    const legacy = { id: `m-legacy-${run}`, type: "practice", title: "Old card", body: "Do it.", audience: { kind: "all" }, tools: [], attachments: [],
      checklist: ["Warm up", "Record"], prompts: ["What changed?"], criteria: "Two takes saved", playlist: [{ id: "v1", title: "Clip", url: "https://www.youtube.com/watch?v=abc" }] };
    await A.op(cid, { op: "saveLesson", lesson: { ...l0, modules: [...l0.modules, legacy] } });
    const got = modulesOf(courseOf(await A.state(cid))).find((m) => m.id === legacy.id);
    check("legacy settings removed", got && !got.checklist && !got.prompts && !got.criteria && !got.playlist, got);
    check("steps, prompts and done-when in the instructions", /1\. Warm up/.test(got?.body) && /What changed\?/.test(got?.body) && /Done when: Two takes saved/.test(got?.body), got?.body);
    check("video list became media", got?.attachments?.some((x) => x.url.includes("youtube.com")), got?.attachments);
  }
  const tw = courseOf(await A.state(made["template/writing"]));
  check("template weeks have no paths", !modulesOf(tw).some((m) => m.audience.kind === "branch"), modulesOf(tw).map((m) => m.audience.kind));
  check("template cards carry no merged settings", !modulesOf(tw).some((m) => m.checklist || m.prompts || m.criteria || m.playlist));
  check("CaPS copy carries no merged settings", !modulesOf(caps).some((m) => m.checklist || m.prompts || m.criteria || m.playlist));

  // ---- Skills
  const lv = after.levels;
  check("setSkills needs 4 levels", (await A.op(cid, { op: "setSkills", skills: after.skills, levels: lv.slice(0, 3) })).ok === false);
  check("setSkills needs a skill", (await A.op(cid, { op: "setSkills", skills: [], levels: lv })).ok === false);
  const withSkill = modulesOf(after)[0];
  await A.op(cid, { op: "saveLesson", lesson: { ...courseOf(await A.state(cid)).weeks[0].lessons[0], modules: modulesOf(after).map((m) => (m.id === withSkill.id ? { ...m, skills: ["mu-pitch", "mu-ear"] } : m)) } });
  const keep = after.skills.filter((s) => s.id !== "mu-ear");
  const ss = await A.op(cid, { op: "setSkills", skills: [...keep, { id: "__proto__", name: "Sneaky" }], levels: lv });
  check("setSkills with a removed skill", ss.ok !== false, ss);
  const s2 = courseOf(await A.state(cid));
  check("removed skill stripped from cards", !modulesOf(s2).some((m) => m.skills?.includes("mu-ear")), modulesOf(s2).find((m) => m.id === withSkill.id)?.skills);
  check("unsafe skill id replaced", !s2.skills.some((s) => s.id === "__proto__"), s2.skills.map((s) => s.id));
  check("new skill kept by name", s2.skills.some((s) => s.name === "Sneaky"));

  // ---- Library: saved cards
  check("anonymous library refused", (await anon.get("/api/library")).status === 401);
  check("anonymous save refused", (await anon.post("/api/library", { module: mods[0] })).status === 401);
  check("library starts empty", (await A.get("/api/library")).cards?.length === 0);
  check("bad type refused", (await A.post("/api/library", { module: { type: "boss", title: "x" } })).ok === false);
  check("no module refused", (await A.post("/api/library", { name: "x" })).ok === false);
  check("broken JSON refused", (await A.raw("/api/library", "{not json")).ok === false);
  const big = await A.post("/api/library", { module: { ...mods[0], checklist: Array.from({ length: 3000 }, () => "a long step of text here") } });
  check("oversized card refused", big.ok === false, big);
  const polluted = await A.raw("/api/library", JSON.stringify({ name: "P", module: { type: "read", title: "P", body: "", tools: [], attachments: [] } }).replace('"type":"read"', '"__proto__":{"polluted":true},"type":"read"'));
  check("__proto__ in a card is ignored", polluted.ok && !("polluted" in polluted.card.module) && {}.polluted === undefined, polluted);
  const saved = await A.post("/api/library", {
    name: "Warm-up",
    module: { ...mods[2], body: "Do scales", audience: { kind: "student", studentId: "s-x" }, due: "2030-01-01", personal: true, choice: { slot: "x" }, picked: true },
  });
  check("save a card", saved.ok, saved);
  const sm = saved.card?.module ?? {};
  check("saved card drops id/due/personal/choice/picked", !("id" in sm) && !sm.due && !sm.personal && !sm.choice && !sm.picked, sm);
  check("saved card is for the whole class", sm.audience?.kind === "all", sm.audience);
  check("saved card keeps content", sm.body === "Do scales" && sm.type === "practice");
  const noName = await A.post("/api/library", { module: { ...mods[0], title: "" } });
  check("unnamed card gets a name", noName.ok && noName.card.name.length > 0, noName.card?.name);
  check("B's library is separate", (await B.get("/api/library")).cards.length === 0);
  check("B can't remove A's card", (await B.del("/api/library", { id: saved.card.id })).ok === false);
  check("A still has it", (await A.get("/api/library")).cards.some((c) => c.id === saved.card.id));
  check("removing an unknown card fails", (await A.del("/api/library", { id: "my-nope" })).ok === false);
  check("remove a saved card", (await A.del("/api/library", { id: saved.card.id })).ok === true);
  let capHit = false;
  for (let i = 0; i < 70 && !capHit; i++) {
    const r = await A.post("/api/library", { module: { ...mods[0], title: `n${i}` } });
    if (!r.ok) capHit = /up to/.test(r.error ?? "");
  }
  check("saved cards are capped", capHit);
  check("teacher profile doesn't leak saved cards", !("cards" in (await A.get("/api/auth"))));

  // ---- Joining and students
  const fresh = courseOf(await A.state(made["template/writing"]));
  const code = fresh.joinCode;
  const S1 = client();
  const j1 = await S1.post("/api/auth", { action: "join", courseId: fresh.id, code, name: "Mia Chen", pin: "1234" });
  check("student joins (waits for OK)", j1.ok && j1.waiting === true, j1);
  check("wrong code refused", (await client().post("/api/auth", { action: "join", courseId: fresh.id, code: "ZZZZZZ", name: "Bo", pin: "1234" })).ok === false);
  check("same name refused", (await client().post("/api/auth", { action: "join", courseId: fresh.id, code, name: "mia chen", pin: "1234" })).ok === false);
  check("bad PIN refused", (await client().post("/api/auth", { action: "join", courseId: fresh.id, code, name: "Bo Li", pin: "12a4" })).ok === false);
  const w = courseOf(await A.state(fresh.id)).waiting ?? [];
  check("teacher sees the waiting student", w.some((s) => s.name === "Mia Chen"), w);
  const li = await A.op(fresh.id, { op: "letIn", studentIds: w.map((s) => s.id), allow: true });
  check("let in", li.ok !== false, li);
  const inClass = courseOf(await A.state(fresh.id));
  const mia = inClass.students.find((s) => s.name === "Mia Chen");
  check("student is on the list", !!mia, inClass.students);
  const asStudent = await S1.state(`${fresh.id}?as=${mia?.id}`);
  check("student reads the class", asStudent.status === 200, asStudent.status);
  const firstCard = modulesOf(inClass)[0];
  check("student marks own progress", (await S1.op(fresh.id, { op: "setProgress", studentId: mia?.id, moduleId: firstCard.id, status: "doing" })).ok !== false);
  const add2 = await A.op(fresh.id, { op: "addStudents", names: "Leo Park" });
  check("teacher adds a name", add2.ok !== false && add2.added === 1, add2);
  const leo = courseOf(await A.state(fresh.id)).students.find((s) => s.name === "Leo Park");
  check("student can't act as another student", [401, 403].includes((await S1.op(fresh.id, { op: "setProgress", studentId: leo.id, moduleId: firstCard.id, status: "done" })).status));
  check("student can't do teacher ops", [401, 403].includes((await S1.op(fresh.id, { op: "addStudents", names: "Hacker" })).status));
  check("student can't send session notes", [401, 403].includes((await S1.op(fresh.id, { op: "sessionNotes", moduleId: firstCard.id, notes: {} })).status));
  check("student can't use the library", (await S1.get("/api/library")).status === 401);
  check("student can't read another course", [401, 403, 404].includes((await S1.state(`${cid}?as=${mia.id}`)).status));
  check("student can't read as a classmate", [401, 403].includes((await S1.state(`${fresh.id}?as=${leo.id}`)).status));
  check("student can't read the teacher view", [401, 403].includes((await S1.state(fresh.id)).status));
  const studio = modulesOf(inClass).find((m) => m.type === "studio");
  if (studio) {
    const sn = await A.op(fresh.id, { op: "sessionNotes", moduleId: studio.id, notes: { [mia.id]: "Nice pacing" } });
    check("session notes sent", sn.ok !== false && sn.sent === 1, sn);
    const again = await A.op(fresh.id, { op: "sessionNotes", moduleId: studio.id, day: new Date().toLocaleDateString("en-CA"), notes: { [mia.id]: "Updated note" } });
    check("session notes resend on the same day", again.ok !== false && again.sent === 1, again);
    check("session notes only go to studio cards", (await A.op(fresh.id, { op: "sessionNotes", moduleId: firstCard.id, notes: { [mia.id]: "x" } })).ok === false);
  }
  // A question the teacher left blank never reaches students.
  {
    const cur = courseOf(await A.state(fresh.id));
    const l0 = cur.weeks[0].lessons[0];
    const qm = { id: `m-q-${run}`, type: "practice", title: "Half-filled", body: "", audience: { kind: "all" }, tools: [], attachments: [],
      questions: [{ id: "q-blank", text: "  ", options: ["", ""], answer: 0 }, { id: "q-real", text: "Which is louder?", options: ["A", "B"], answer: 1 }] };
    await A.op(fresh.id, { op: "saveLesson", lesson: { ...l0, modules: [...l0.modules, qm] } });
    const seen = modulesOf(courseOf(await S1.state(`${fresh.id}?as=${mia.id}`))).find((m) => m.id === qm.id);
    check("blank question not sent to students", seen?.questions?.length === 1 && seen.questions[0].id === "q-real", seen?.questions);
    check("answer key not sent to students", seen?.questions?.[0]?.answer === undefined, seen?.questions?.[0]);
    const empty = { ...qm, id: `m-q2-${run}`, questions: [{ id: "q-b", text: "", options: ["", ""], answer: 0 }] };
    await A.op(fresh.id, { op: "saveLesson", lesson: { ...l0, modules: [...l0.modules, qm, empty] } });
    const seen2 = modulesOf(courseOf(await S1.state(`${fresh.id}?as=${mia.id}`))).find((m) => m.id === empty.id);
    check("only-blank questions: card has none", !seen2?.questions, seen2?.questions);
  }
  check("unknown op refused", (await A.op(fresh.id, { op: "nope" })).ok === false);
  check("unknown card refused", (await S1.op(fresh.id, { op: "setProgress", studentId: mia.id, moduleId: "m-nope", status: "done" })).ok === false);

  // "Only my list" with an empty list: nobody can add themselves.
  const off = await A.op(made["blank/music"], { op: "setAccess", access: { joinOpen: true } });
  check("turn self-join off", off.ok !== false, off);
  const offState = courseOf(await A.state(made["blank/music"]));
  if (!offState.access?.selfJoin) {
    check("joining refused when only listed names may join", (await client().post("/api/auth", { action: "join", courseId: offState.id, code: offState.joinCode, name: "Ann Lee", pin: "1234" })).ok === false);
  } else check("setAccess turned self-join off", false, offState.access);

  // ---- Uploads used by a saved card survive deleting a course
  const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const up = async (n) => { const f = new FormData(); f.append("file", new File([png], n, { type: "image/png" })); return A.post("/api/upload", f); };
  const fa = await up("keep.png"), fb = await up("drop.png");
  check("uploads work", !!fa.url && !!fb.url, [fa, fb]);
  const dc = await A.post("/api/courses", { title: `Delete me ${run}`, start: "blank" });
  const dl = courseOf(await A.state(dc.id)).weeks[0].lessons[0];
  const att = (u, i) => ({ id: `a-${i}`, kind: "image", url: u, name: `f${i}` });
  const fm = { id: "m-files", type: "read", title: "Files", body: "", audience: { kind: "all" }, tools: [], attachments: [att(fa.url, 1), att(fb.url, 2)] };
  await A.op(dc.id, { op: "saveLesson", lesson: { ...dl, modules: [fm] } });
  await A.del("/api/library", { id: (await A.get("/api/library")).cards[0].id });
  const keeper = await A.post("/api/library", { name: "Keeper", module: { ...fm, attachments: [att(fa.url, 1)] } });
  check("save a card with a file", keeper.ok, keeper);
  const del = await A.del("/api/courses", { id: dc.id, confirm: `Delete me ${run}` });
  check("course deleted, one file removed", del.ok && del.files === 1, del);
  check("the saved card's file still loads", (await A.get(fa.url)).status !== 404);
  check("the other file is gone", (await A.get(fb.url)).status === 404);

  // ---- Demo course
  const demo = await anon.state("demo");
  check("demo is open to visitors", demo.status === 200);
  check("demo visitor has no library", (await anon.get("/api/library")).status === 401);

  // ---- Clean up what can be cleaned through the API
  for (const c of (await A.get("/api/library")).cards) await A.del("/api/library", { id: c.id });
  for (const [k, id] of Object.entries(made)) {
    const t = courseOf(await A.state(id)).title;
    const r = await A.del("/api/courses", { id, confirm: t });
    check(`delete ${k}`, r.ok, r);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
