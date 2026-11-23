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

async function main() {
  const A = await teacher("a");
  const B = await teacher("b");
  const anon = client();

  // ---- Courses: blank or the standard weeks (no subject skills, no CaPS copy)
  const made = {};
  for (const [key, start] of [["blank/music", "blank"], ["template/writing", "template"]]) {
    const r = await A.post("/api/courses", { title: `C ${key} ${run}`, start, skillSet: "music" });
    check(`create ${key}`, r.ok && r.id, r);
    made[key] = r.id;
  }
  const blank = courseOf(await A.state(made["blank/music"]));
  check("new course has no skills (the picker is gone)", Array.isArray(blank.skills) && blank.skills.length === 0, blank.skills);
  check("blank: 4 levels", blank.levels?.length === 4, blank.levels?.length);
  check("blank: one week, one lesson, no cards", blank.weeks.length === 1 && blank.weeks[0].lessons.length === 1 && modulesOf(blank).length === 0);
  check("new course: students add themselves with the teacher's OK", blank.access?.selfJoin === "approve", blank.access);
  const tmpl = courseOf(await A.state(made["template/writing"]));
  check("template cards carry no skill tags", !modulesOf(tmpl).some((m) => m.skills?.length), modulesOf(tmpl).map((m) => m.skills));
  check("template lessons named Lesson 1..3", tmpl.weeks.map((w) => w.lessons[0].title).join() === "Lesson 1,Lesson 2,Lesson 3", tmpl.weeks.map((w) => w.lessons[0].title));
  const capsTry = await A.post("/api/courses", { title: `Caps try ${run}`, start: "caps" });
  const capsTryCourse = courseOf(await A.state(capsTry.id));
  check("asking for a CaPS copy makes a blank course", modulesOf(capsTryCourse).length === 0, modulesOf(capsTryCourse).length);
  made["capstry"] = capsTry.id;
  check("empty title refused", (await A.post("/api/courses", { title: "  ", start: "blank" })).ok === false);
  check("anonymous can't create", (await anon.post("/api/courses", { title: "x", start: "blank" })).status === 401);
  check("demo not in the course list", !(await A.get("/api/courses")).courses.some((c) => c.id === "demo"));

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
  // Older types become the four kinds: Content; Q&A, Choice (a poll is a Choice card with no right answer), Discussion.
  const kinds = ["content", "content", "answer", "choice", "answer", "answer", "choice", "answer", "discussion", "discussion"];
  check("older types come back as kinds", modulesOf(after).map((m) => m.kind).join() === kinds.join(), modulesOf(after).map((m) => m.kind));
  check("each kind runs on its type (a quiz stays a quiz, a group discussion stays a studio)", modulesOf(after).map((m) => m.type).join() === "read,read,submit,quiz,submit,submit,practice,submit,studio,wall", modulesOf(after).map((m) => m.type));
  check("a rating card becomes a poll with choices and no right answer", (() => { const p = modulesOf(after).find((m) => m.poll); return p?.kind === "choice" && p.questions?.[0]?.options?.length === 4 && p.questions[0].answer === undefined; })());
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

  // ---- Skills
  const lv = after.levels;
  // Skills can't be set in the app any more, but the operation still guards its input.
  after.skills = [{ id: "mu-pitch", name: "Pitch" }, { id: "mu-ear", name: "Ear" }];
  check("setSkills works", (await A.op(cid, { op: "setSkills", skills: after.skills, levels: lv })).ok !== false);
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
  check("saved card keeps content (a practice card is now a Q&A)", sm.body === "Do scales" && sm.kind === "answer" && sm.type === "submit", sm);
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
  const S1 = await student("Mia Chen");
  const j1 = await S1.post("/api/auth", { action: "joinCode", code });
  check("a signed-in student joins with the class code (waits for OK)", j1.ok && j1.waiting === true && j1.courseId === fresh.id, j1);
  check("joining again keeps the same place", (await S1.post("/api/auth", { action: "joinCode", code })).studentId === j1.studentId);
  check("wrong code refused", (await S1.post("/api/auth", { action: "joinCode", code: "ZZZZZZ" })).ok === false);
  check("no account, no joining", (await client().post("/api/auth", { action: "joinCode", code })).status === 401);
  check("the old name-and-PIN ways in are closed", (await client().post("/api/auth", { action: "join", courseId: fresh.id, code, name: "Bo Li", pin: "1234" })).ok === false && (await client().post("/api/auth", { action: "student", courseId: fresh.id, code, studentId: "x", pin: "1234" })).ok === false);
  check("a teacher can't join their own course as a student", (await A.post("/api/auth", { action: "joinCode", code })).ok === false);
  check("a waiting student's course is listed as waiting", (await S1.get("/api/courses")).studying?.some((c) => c.id === fresh.id && c.waiting), (await S1.get("/api/courses")).studying);
  const w = courseOf(await A.state(fresh.id)).waiting ?? [];
  check("teacher sees the waiting student", w.some((s) => s.name === "Mia Chen"), w);
  const li = await A.op(fresh.id, { op: "letIn", studentIds: w.map((s) => s.id), allow: true });
  check("let in", li.ok !== false, li);
  const inClass = courseOf(await A.state(fresh.id));
  const mia = inClass.students.find((s) => s.name === "Mia Chen");
  check("student is on the list, still linked to their account", !!mia?.userId, inClass.students);
  const mine = (await S1.get("/api/courses"));
  check("their course list has it as a student, not as a teacher", mine.studying?.some((c) => c.id === fresh.id && c.studentId === mia?.id && !c.waiting) && !mine.courses.some((c) => c.id === fresh.id) && mine.firstRole === "student", mine);
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
  check("a student account's library is its own (empty)", ((await S1.get("/api/library")).cards ?? []).length === 0);
  check("student can't read another course", [401, 403, 404].includes((await S1.state(`${cid}?as=${mia.id}`)).status));
  check("student can't read as a classmate", [401, 403].includes((await S1.state(`${fresh.id}?as=${leo.id}`)).status));
  check("student can't read the teacher view", [401, 403].includes((await S1.state(fresh.id)).status));
  // Session notes go with a discussion run in groups; the standard weeks don't start with one, so add one.
  let studio = modulesOf(inClass).find((m) => m.type === "studio");
  if (!studio) {
    const l0 = inClass.weeks[0].lessons[0];
    studio = { id: `m-studio-${run}`, type: "studio", kind: "discussion", title: "Group critique", body: "Post your work to your group.", audience: { kind: "all" }, tools: [], attachments: [], submitTo: "studio" };
    await A.op(fresh.id, { op: "saveLesson", lesson: { ...l0, modules: [...l0.modules, studio] } });
  }
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
  // Peer review on a wall: a reply finishes the card, and taking it back un-finishes it.
  {
    const cur = courseOf(await A.state(fresh.id));
    const l0 = cur.weeks[0].lessons[0];
    const wm = { id: `m-w-${run}`, type: "wall", kind: "discussion", title: "Video wall", body: "Post, then reply to one classmate.", audience: { kind: "all" }, tools: [], attachments: [],
      wall: { posting: "students", comments: true, reactions: "likes", anonymous: false, approval: false, replies: 1 } };
    await A.op(fresh.id, { op: "saveLesson", lesson: { ...l0, modules: [...l0.modules, wm] } });
    await A.op(fresh.id, { op: "addPost", moduleId: wm.id, studentId: leo.id, text: "Leo's talk" });
    await S1.op(fresh.id, { op: "addPost", moduleId: wm.id, studentId: mia.id, text: "Mia's talk" });
    const statusOf = async () => (await S1.state(`${fresh.id}?as=${mia.id}`)).progress?.[mia.id]?.[wm.id]?.status;
    check("posting alone leaves a peer-review card in progress", (await statusOf()) === "doing", await statusOf());
    const postsOf = async () => (await S1.state(`${fresh.id}?as=${mia.id}`)).posts ?? [];
    const leoPost = (await postsOf()).find((p) => p.text === "Leo's talk");
    await S1.op(fresh.id, { op: "comment", who: mia.id, postId: leoPost.id, text: "Strong hook!" });
    check("a reply finishes the card", (await statusOf()) === "done", await statusOf());
    await A.op(fresh.id, { op: "comment", who: "teacher", postId: leoPost.id, text: "Agreed." });
    const cs = (await postsOf()).find((p) => p.id === leoPost.id).comments;
    const miaC = cs.find((c) => c.text === "Strong hook!"), tC = cs.find((c) => c.text === "Agreed.");
    check("a student can't delete someone else's reply", (await S1.op(fresh.id, { op: "comment", who: mia.id, postId: leoPost.id, remove: tC.id })).ok === false);
    const del = await S1.op(fresh.id, { op: "comment", who: mia.id, postId: leoPost.id, remove: miaC.id });
    check("a student deletes her own reply", del.ok !== false && !(await postsOf()).find((p) => p.id === leoPost.id).comments.some((c) => c.id === miaC.id), del);
    check("without the reply, the card is back in progress", (await statusOf()) === "doing", await statusOf());
    const tdel = await A.op(fresh.id, { op: "comment", who: "teacher", postId: leoPost.id, remove: tC.id });
    check("the teacher deletes a reply", tdel.ok !== false && !(await postsOf()).find((p) => p.id === leoPost.id).comments.length, tdel);
  }
  // Student View: the teacher tries the course as a student in a sandbox. Nothing is saved.
  {
    const cur = courseOf(await A.state(fresh.id));
    const l0 = cur.weeks[0].lessons[0];
    const qv = { id: `m-sv-${run}`, type: "practice", kind: "choice", title: "Preview check", body: "", audience: { kind: "all" }, tools: [], attachments: [],
      questions: [{ id: "q-sv", text: "Pick one", options: ["Right", "Wrong"], answer: 0, next: [null, `m-svx-${run}`] }] };
    const xv = { id: `m-svx-${run}`, type: "read", kind: "content", title: "Preview follow-up", body: "", audience: { kind: "all" }, tools: [], attachments: [] };
    await A.op(fresh.id, { op: "saveLesson", lesson: { ...l0, modules: [...l0.modules, qv, xv] } });
    const realOf = async () => (await A.state(fresh.id)).progress?.[mia.id]?.[qv.id];
    const eventsBefore = (await A.state(fresh.id)).events.length;
    const r = await A.op(fresh.id, { op: "answer", preview: true, as: mia.id, studentId: mia.id, moduleId: qv.id, qid: "q-sv", choice: 1 });
    check("Student View: the teacher answers as a student", r.ok !== false, r);
    const pv = await A.state(`${fresh.id}?as=${mia.id}&preview=1`);
    check("Student View: the answer deals the follow-up in the test", modulesOf(courseOf(pv)).some((m) => m.id === xv.id) && pv.progress[mia.id]?.[qv.id]?.status === "done");
    check("Student View: the student's real progress is untouched", (await realOf()) === undefined, await realOf());
    check("Student View: the student's real board is untouched", !modulesOf(courseOf(await S1.state(`${fresh.id}?as=${mia.id}`))).some((m) => m.id === xv.id));
    check("Student View: no notification for the teacher", (await A.state(fresh.id)).events.length === eventsBefore);
    check("Student View: a teacher-only change is refused", (await A.op(fresh.id, { op: "addStudents", preview: true, as: mia.id, names: "Nope" })).ok === false);
    check("Student View: a student can't use it", (await S1.op(fresh.id, { op: "answer", preview: true, as: mia.id, studentId: mia.id, moduleId: qv.id, qid: "q-sv", choice: 0 })).ok === false);
    const tv = await A.state(`${fresh.id}?as=s-test&preview=1`);
    check("Student View: a new test student sees the course with no work", modulesOf(courseOf(tv)).some((m) => m.id === qv.id) && !Object.keys(tv.progress?.["s-test"] ?? {}).length);
    check("Student View: the test student isn't in the real class", !courseOf(await A.state(fresh.id)).students.some((s) => s.id === "s-test"));
    // The demo student: in every course, never in the class list; their progress is kept for the next test.
    const dm = await A.op(fresh.id, { op: "answer", preview: true, as: "s-demo", studentId: "s-demo", moduleId: qv.id, qid: "q-sv", choice: 1 });
    check("Student View: the demo student can answer", dm.ok !== false, dm);
    check("Student View: the demo student isn't in the real class", !courseOf(await A.state(fresh.id)).students.some((s) => s.id === "s-demo"));
    check("Student View: the demo student is in no real progress", !(await A.state(fresh.id)).progress?.["s-demo"]);
    const A2 = client();
    await A2.post("/api/auth", { action: "login", ...A.creds });
    const later = await A2.state(`${fresh.id}?as=s-demo&preview=1`);
    check("Student View: the demo student's progress is kept for a new test", later.progress?.["s-demo"]?.[qv.id]?.status === "done" && modulesOf(courseOf(later)).some((m) => m.id === xv.id), later.progress?.["s-demo"]);
    await A2.op(fresh.id, { op: "endPreview", as: "s-demo" });
    check("Student View: Start over clears the demo student", !(await A.state(`${fresh.id}?as=s-demo&preview=1`)).progress?.["s-demo"]?.[qv.id]);
    await A.op(fresh.id, { op: "endPreview", as: mia.id });
    const again = await A.state(`${fresh.id}?as=${mia.id}&preview=1`);
    check("Student View: Start over goes back to the real progress", !again.progress[mia.id]?.[qv.id] && !modulesOf(courseOf(again)).some((m) => m.id === xv.id));
  }
  // The map's trash bin: deleted cards are kept for the teacher, never shown to students.
  {
    const entry = { id: `t-${run}`, title: "Gone card", lessons: [{ lessonId: "l-x", lessonTitle: "Lesson", cards: [{ m: { id: "m-gone", type: "read", title: "Gone card", body: "", audience: { kind: "all" }, tools: [], attachments: [] }, index: 0 }] }], inbound: [] };
    check("trash: the teacher keeps a deleted card", (await A.op(fresh.id, { op: "trashPut", entry })).ok !== false && courseOf(await A.state(fresh.id)).trash?.some((e) => e.id === entry.id));
    check("trash: students never receive it", !JSON.stringify(courseOf(await S1.state(`${fresh.id}?as=${mia.id}`))).includes("Gone card"));
    check("trash: a student can't add to it", (await S1.op(fresh.id, { op: "trashPut", entry })).ok === false);
    await A.op(fresh.id, { op: "trashDrop", id: entry.id });
    check("trash: an entry can be removed", !courseOf(await A.state(fresh.id)).trash?.some((e) => e.id === entry.id));
  }
  check("unknown op refused", (await A.op(fresh.id, { op: "nope" })).ok === false);
  check("unknown card refused", (await S1.op(fresh.id, { op: "setProgress", studentId: mia.id, moduleId: "m-nope", status: "done" })).ok === false);

  // ---- A student's own link links their place on the list to their account
  {
    const tokenOf = (r) => (r.links ?? []).find((x) => x.id === leo.id)?.link?.split("#")[1];
    const t1 = tokenOf(await A.op(fresh.id, { op: "setupLinks", studentIds: [leo.id] }));
    check("teacher gets a link for a listed student", !!t1);
    const anon = await client().post("/api/auth", { action: "invite", courseId: fresh.id, token: t1 });
    check("opened signed out, the link asks for an account and says whose invitation it is", anon.status === 401 && anon.needAccount && anon.name === "Leo Park", anon);
    const L1 = await student("Leo Park");
    const in1 = await L1.post("/api/auth", { action: "invite", courseId: fresh.id, token: t1 });
    check("signed in, the link links the student to the account", in1.ok && in1.studentId === leo.id && courseOf(await A.state(fresh.id)).students.find((x) => x.id === leo.id)?.userId, in1);
    check("the student reads their board, just signed in", (await L1.state(`${fresh.id}?as=${leo.id}`)).status === 200);
    check("the same link works again for the same account", (await L1.post("/api/auth", { action: "invite", courseId: fresh.id, token: t1 })).ok === true);
    const thief = await student("Not Leo");
    check("another account can't use a link that's already linked", (await thief.post("/api/auth", { action: "invite", courseId: fresh.id, token: t1 })).status === 409);
    check("…and can't read Leo's board", [401, 403].includes((await thief.state(`${fresh.id}?as=${leo.id}`)).status));
    check("the teacher's own account can't take a student's place", (await A.post("/api/auth", { action: "invite", courseId: fresh.id, token: t1 })).status === 409);
    const t2 = tokenOf(await A.op(fresh.id, { op: "setupLinks", studentIds: [leo.id] }));
    check("a new link doesn't break the first one", t2 !== t1 && (await L1.post("/api/auth", { action: "invite", courseId: fresh.id, token: t1 })).ok === true);
    check("a made-up link is refused", (await L1.post("/api/auth", { action: "invite", courseId: fresh.id, token: "nope" })).ok === false);
    await A.op(fresh.id, { op: "resetPin", studentId: leo.id });
    check("reset sign-in unlinks the account and turns the links off", (await L1.post("/api/auth", { action: "invite", courseId: fresh.id, token: t2 })).ok === false && [401, 403].includes((await L1.state(`${fresh.id}?as=${leo.id}`)).status));
  }

  // "Only my list" with an empty list: nobody can add themselves.
  const off = await A.op(made["blank/music"], { op: "setAccess", access: { joinOpen: true } });
  check("turn self-join off", off.ok !== false, off);
  const offState = courseOf(await A.state(made["blank/music"]));
  if (!offState.access?.selfJoin) {
    check("joining refused when only invited students may join", (await (await student("Ann Lee")).post("/api/auth", { action: "joinCode", code: offState.joinCode })).ok === false);
  } else check("setAccess turned self-join off", false, offState.access);

  // ---- Card trees: each answer deals its own follow-up card
  {
    const tc = await A.post("/api/courses", { title: `Tree ${run}`, start: "blank" });
    const tid = tc.id;
    await A.op(tid, { op: "addStudents", names: "Ana One\nBen Two\nCal Three" });
    const roster = courseOf(await A.state(tid)).students;
    const sid = (n) => roster.find((s) => s.name === n).id;
    const links = (await A.op(tid, { op: "setupLinks" })).links;
    const as = async (name) => (await invited(tid, links.find((x) => x.name === name).link, name)).c;
    const [SA, SB, SC] = [await as("Ana One"), await as("Ben Two"), await as("Cal Three")];
    const base = courseOf(await A.state(tid)).weeks[0].lessons[0];
    const card = (id, type, title, extra = {}) => ({ id, type, title, body: "", audience: { kind: "all" }, tools: [], attachments: [], ...extra });
    const Q = card("m-tq", "practice", "Which feels harder?", { questions: [{ id: "q1", text: "Which feels harder?", options: ["Rhythm", "Pitch"], answer: 0, next: ["m-tx", "m-ty"] }] });
    const X = card("m-tx", "practice", "Rhythm drills");
    const Y = card("m-ty", "read", "Pitch guide", { questions: [{ id: "q2", text: "Ready?", options: ["Yes", "Not yet"], answer: 0, next: [null, "m-tz"] }] });
    const Z = card("m-tz", "read", "Pitch basics");
    const Wl = card("m-tw", "wall", "Class wall");
    const QZ = card("m-quiz", "quiz", "Check", { questions: [{ id: "q3", text: "2+2", options: ["4", "5"], answer: 0, next: ["m-tq2", null] }] });
    const QX = card("m-tq2", "read", "After the quiz");
    const lesson = { ...base, modules: [Q, X, Y, Z, Wl, QZ, QX] };
    check("save a lesson with a card tree", (await A.op(tid, { op: "saveLesson", lesson })).ok !== false);
    const saved = courseOf(await A.state(tid)).weeks[0].lessons[0];
    check("teacher keeps the wiring", JSON.stringify(saved.modules.find((m) => m.id === "m-tq").questions[0].next) === JSON.stringify(["m-tx", "m-ty"]));
    const ids = async (c, who) => modulesOf(courseOf(await c.state(`${tid}?as=${sid(who)}`))).map((m) => m.id);
    const a0 = await ids(SA, "Ana One");
    check("follow-ups hidden before answering", a0.includes("m-tq") && !a0.includes("m-tx") && !a0.includes("m-ty") && !a0.includes("m-tz"), a0);
    const sView = JSON.stringify(courseOf(await SA.state(`${tid}?as=${sid("Ana One")}`)));
    check("students never get the wiring", !sView.includes("\"next\""));
    const r1 = await SA.op(tid, { op: "answer", studentId: sid("Ana One"), moduleId: "m-tq", qid: "q1", choice: 0 });
    check("answer reports the dealt card", r1.dealt?.length === 1 && r1.dealt[0].id === "m-tx", r1);
    const a1 = await ids(SA, "Ana One");
    check("answer A deals X, not Y", a1.includes("m-tx") && !a1.includes("m-ty"), a1);
    await SA.op(tid, { op: "answer", studentId: sid("Ana One"), moduleId: "m-tq", qid: "q1", choice: 1 });
    const a2 = await ids(SA, "Ana One");
    check("first answer decides (changing it deals nothing new)", a2.includes("m-tx") && !a2.includes("m-ty"), a2);
    await SB.op(tid, { op: "answer", studentId: sid("Ben Two"), moduleId: "m-tq", qid: "q1", choice: 1 });
    const b1 = await ids(SB, "Ben Two");
    check("answer B deals Y", b1.includes("m-ty") && !b1.includes("m-tx") && !b1.includes("m-tz"), b1);
    await SB.op(tid, { op: "answer", studentId: sid("Ben Two"), moduleId: "m-ty", qid: "q2", choice: 1 });
    check("a follow-up's own answer deals the next step", (await ids(SB, "Ben Two")).includes("m-tz"));
    check("no answer, no follow-ups", !(await ids(SC, "Cal Three")).some((x) => ["m-tx", "m-ty", "m-tz"].includes(x)));
    check("can't work on a card not dealt to you", /not on your board|isn’t on your board/.test((await SC.op(tid, { op: "setProgress", studentId: sid("Cal Three"), moduleId: "m-tx", status: "done" })).error ?? ""));
    check("can't answer a card not dealt to you", /isn’t on your board/.test((await SA.op(tid, { op: "answer", studentId: sid("Ana One"), moduleId: "m-ty", qid: "q2", choice: 1 })).error ?? ""));
    // A quiz deals when it's submitted.
    await SC.op(tid, { op: "answer", studentId: sid("Cal Three"), moduleId: "m-quiz", qid: "q3", choice: 0 });
    check("a quiz doesn't deal mid-way", !(await ids(SC, "Cal Three")).includes("m-tq2"));
    const sub = await SC.op(tid, { op: "submitQuiz", studentId: sid("Cal Three"), moduleId: "m-quiz" });
    check("a quiz deals on submit", sub.dealt?.[0]?.id === "m-tq2" && (await ids(SC, "Cal Three")).includes("m-tq2"), sub);
    // The server cleans bad wiring.
    const bad = structuredClone(saved);
    const bq = bad.modules.find((m) => m.id === "m-tq").questions[0];
    bq.next = ["m-tq", "m-nope", "m-tw"];
    bad.modules.find((m) => m.id === "m-tz").questions = [{ id: "q4", text: "Loop?", options: ["a", "b"], answer: 0, next: ["m-ty", null] }];
    await A.op(tid, { op: "saveLesson", lesson: bad });
    const cleaned = courseOf(await A.state(tid)).weeks[0].lessons[0];
    check("self, missing and class-wide targets are dropped", !cleaned.modules.find((m) => m.id === "m-tq").questions[0].next, cleaned.modules.find((m) => m.id === "m-tq").questions[0]);
    const loop = [cleaned.modules.find((m) => m.id === "m-ty").questions[0].next, cleaned.modules.find((m) => m.id === "m-tz").questions?.[0]?.next];
    check("a loop is cut", !(loop[0]?.[1] === "m-tz" && loop[1]?.[0] === "m-ty"), loop);
    // Duplicating keeps the tree, pointing at the copies.
    await A.op(tid, { op: "saveLesson", lesson });
    await A.op(tid, { op: "duplicateLesson", lessonId: base.id });
    const copy = courseOf(await A.state(tid)).weeks[0].lessons.find((l) => l.id !== base.id);
    const cq = copy?.modules.find((m) => m.title === "Which feels harder?");
    const targets = cq?.questions?.[0]?.next ?? [];
    check("a copied lesson keeps its tree on the copied cards", targets.length === 2 && targets.every((t) => copy.modules.some((m) => m.id === t) && !["m-tx", "m-ty"].includes(t)), targets);
    // One answer can deal several cards: they're kept as a list and all dealt.
    const two = { ...lesson, modules: lesson.modules.map((m) => (m.id === "m-tq" ? { ...m, questions: [{ ...m.questions[0], next: [["m-tx", "m-tz"], "m-ty"] }] } : m)) };
    await A.op(tid, { op: "saveLesson", lesson: two });
    const kept = courseOf(await A.state(tid)).weeks[0].lessons.find((l) => l.id === base.id).modules.find((m) => m.id === "m-tq").questions[0].next;
    check("an answer that deals two cards is saved with both", JSON.stringify(kept) === JSON.stringify([["m-tx", "m-tz"], "m-ty"]), kept);
    const rc = await SC.op(tid, { op: "answer", studentId: sid("Cal Three"), moduleId: "m-tq", qid: "q1", choice: 0 });
    const c2 = await ids(SC, "Cal Three");
    check("picking it deals both cards", c2.includes("m-tx") && c2.includes("m-tz") && !c2.includes("m-ty") && rc.dealt?.length === 2, [c2, rc.dealt]);
    await A.del("/api/courses", { id: tid, confirm: `Tree ${run}` });
  }

  // ---- Card trees by score, and across lessons
  {
    const tc = await A.post("/api/courses", { title: `Tree2 ${run}`, start: "blank" });
    const tid = tc.id;
    const wk = courseOf(await A.state(tid)).weeks[0];
    await A.op(tid, { op: "addLesson", weekId: wk.id });
    await A.op(tid, { op: "addStudents", names: "Dee Low\nEve Mid\nFay Top" });
    const roster = courseOf(await A.state(tid)).students;
    const sid = (n) => roster.find((s) => s.name === n).id;
    const links = (await A.op(tid, { op: "setupLinks" })).links;
    const as = async (name) => (await invited(tid, links.find((x) => x.name === name).link, name)).c;
    const S = { Dee: await as("Dee Low"), Eve: await as("Eve Mid"), Fay: await as("Fay Top") };
    const [L1, L2] = courseOf(await A.state(tid)).weeks[0].lessons;
    const card = (id, type, title, extra = {}) => ({ id, type, title, body: "", audience: { kind: "all" }, tools: [], attachments: [], ...extra });
    const five = [1, 2, 3, 4, 5].map((i) => ({ id: `s${i}`, text: `Q${i}`, options: ["right", "wrong"], answer: 0 }));
    const quiz = card("m-sq", "quiz", "Score quiz", { attempts: 2, questions: five, bands: [{ min: 0, next: "m-low" }, { min: 60, next: "m-mid" }, { min: 90, next: "m-top" }] });
    const pickQ = card("m-pq", "quiz", "Pick quiz", { pick: 2, questions: [1, 2, 3, 4].map((i) => ({ id: `p${i}`, text: `P${i}`, options: ["right", "wrong"], answer: 0 })), bands: [{ min: 0, next: null }, { min: 100, next: "m-ptop" }] });
    const choose = card("m-ch", "practice", "Pick a path", { questions: [{ id: "c1", text: "Which?", options: ["Next lesson card", "Nothing"], answer: 0, next: ["m-l2x", null] }] });
    const l1 = { ...L1, modules: [quiz, card("m-low", "read", "Low"), card("m-mid", "read", "Mid"), card("m-top", "read", "Top"), pickQ, card("m-ptop", "read", "Pick top"), choose] };
    const l2 = { ...L2, modules: [card("m-l2a", "read", "Lesson 2 for all"), card("m-l2x", "practice", "Dealt from lesson 1"),
      card("m-back", "practice", "Backward", { questions: [{ id: "b1", text: "Back?", options: ["a", "b"], answer: 0, next: ["m-low", null] }] })] };
    await A.op(tid, { op: "saveLesson", lesson: l2 });
    await A.op(tid, { op: "saveLesson", lesson: l1 });
    const saved = courseOf(await A.state(tid)).weeks[0].lessons;
    check("score bands are kept", saved[0].modules.find((m) => m.id === "m-sq").bands?.length === 3, saved[0].modules.find((m) => m.id === "m-sq").bands);
    check("a lesson-1 answer can deal a lesson-2 card", saved[0].modules.find((m) => m.id === "m-ch").questions[0].next?.[0] === "m-l2x");
    check("a wire back to an earlier lesson is dropped", !saved[1].modules.find((m) => m.id === "m-back").questions[0].next);
    const ids = async (who) => modulesOf(courseOf(await S[who].state(`${tid}?as=${sid(`${who} ${{ Dee: "Low", Eve: "Mid", Fay: "Top" }[who]}`)}`))).map((m) => m.id);
    const view = JSON.stringify(courseOf(await S.Dee.state(`${tid}?as=${sid("Dee Low")}`)));
    check("students never get score bands", !view.includes("\"bands\"") && !view.includes("\"next\""));
    const before = await ids("Dee");
    check("score and cross-lesson follow-ups start hidden", !["m-low", "m-mid", "m-top", "m-l2x"].some((x) => before.includes(x)) && before.includes("m-l2a"), before);
    const take = async (who, rightCount) => {
      const c = S[who], id = sid(`${who} ${{ Dee: "Low", Eve: "Mid", Fay: "Top" }[who]}`);
      for (const [i, q] of five.entries()) await c.op(tid, { op: "answer", studentId: id, moduleId: "m-sq", qid: q.id, choice: i < rightCount ? 0 : 1 });
      return c.op(tid, { op: "submitQuiz", studentId: id, moduleId: "m-sq" });
    };
    const dee = await take("Dee", 2); // 40%
    const eve = await take("Eve", 3); // exactly 60%: the higher band
    await take("Fay", 5); // 100%
    check("40% deals the low card", dee.dealt?.[0]?.id === "m-low" && (await ids("Dee")).includes("m-low"), dee);
    const e = await ids("Eve");
    check("a score on a threshold goes to the higher band", eve.dealt?.[0]?.id === "m-mid" && e.includes("m-mid") && !e.includes("m-low"), [eve, e]);
    const f = await ids("Fay");
    check("100% deals the top card only", f.includes("m-top") && !f.includes("m-mid") && !f.includes("m-low"), f);
    // With a try left, a missed question's answer stays hidden (the next try would just copy it).
    const eveId = sid("Eve Mid");
    const eveRev = (await S.Eve.state(`${tid}?as=${eveId}`)).progress[eveId]["m-sq"].reveal ?? {};
    check("with a try left, only the right answers are revealed", ["s1", "s2", "s3"].every((q) => eveRev[q]) && !eveRev.s4 && !eveRev.s5, eveRev);
    // A better retake deals the card for its band too, and keeps what was dealt before.
    await S.Dee.op(tid, { op: "retakeQuiz", studentId: sid("Dee Low"), moduleId: "m-sq" });
    const dee2 = await take("Dee", 5);
    const d2 = await ids("Dee");
    check("a better retake deals its band's card and keeps the earlier one", d2.includes("m-low") && d2.includes("m-top") && dee2.dealt?.[0]?.id === "m-top", [d2, dee2]);
    const deeId = sid("Dee Low");
    const deeRev = (await S.Dee.state(`${tid}?as=${deeId}`)).progress[deeId]["m-sq"].reveal ?? {};
    check("after the last try every answer is revealed", five.every((q) => deeRev[q.id]?.answer === 0), deeRev);
    // A drawn quiz scores against the questions this student got.
    const pq = modulesOf(courseOf(await S.Fay.state(`${tid}?as=${sid("Fay Top")}`))).find((m) => m.id === "m-pq");
    for (const q of pq.questions) await S.Fay.op(tid, { op: "answer", studentId: sid("Fay Top"), moduleId: "m-pq", qid: q.id, choice: 0 });
    await S.Fay.op(tid, { op: "submitQuiz", studentId: sid("Fay Top"), moduleId: "m-pq" });
    check("a drawn quiz routes by its own score (2 of 2 drawn = 100%)", (await ids("Fay")).includes("m-ptop"));
    // Across lessons.
    const r = await S.Eve.op(tid, { op: "answer", studentId: sid("Eve Mid"), moduleId: "m-ch", qid: "c1", choice: 0 });
    check("the deal names the later lesson", r.dealt?.[0]?.id === "m-l2x" && r.dealt[0].lesson === L2.title, r);
    check("the lesson-2 card reaches only that student", (await ids("Eve")).includes("m-l2x") && !(await ids("Dee")).includes("m-l2x"));
    check("others can't act on it", /isn’t on your board/.test((await S.Dee.op(tid, { op: "setProgress", studentId: sid("Dee Low"), moduleId: "m-l2x", status: "done" })).error ?? ""));
    // Duplicating the week keeps the cross-lesson wire, on the copies.
    await A.op(tid, { op: "duplicateWeek", weekId: wk.id });
    const copyWeek = courseOf(await A.state(tid)).weeks[1];
    const cch = copyWeek.lessons[0].modules.find((m) => m.title === "Pick a path");
    const target = copyWeek.lessons[1].modules.find((m) => m.title === "Dealt from lesson 1");
    check("a copied week keeps lesson-to-lesson wires on the copies", !!cch && !!target && cch.questions[0].next?.[0] === target.id, cch?.questions?.[0]);
    const cq = copyWeek.lessons[0].modules.find((m) => m.title === "Score quiz");
    check("a copied quiz's bands point at the copies", (cq?.bands ?? []).every((b) => !b.next || copyWeek.lessons[0].modules.some((m) => m.id === b.next)) && cq.bands.some((b) => b.next), cq?.bands);
    // Several lessons saved together: a wire to a card that only exists in the other lesson's new version survives.
    {
      const now = courseOf(await A.state(tid)).weeks[0].lessons;
      const a = { ...now[0], modules: [...now[0].modules, card("m-new-src", "practice", "New source", { questions: [{ id: "n1", text: "Go?", options: ["yes", "no"], answer: 0, next: ["m-new-target", null] }] })] };
      const b = { ...now[1], modules: [...now[1].modules, card("m-new-target", "read", "New target")] };
      const r = await A.op(tid, { op: "saveLessons", lessons: [a, b] });
      const after = courseOf(await A.state(tid)).weeks[0].lessons;
      check("saveLessons keeps a wire into the other lesson saved with it", r.ok !== false && after[0].modules.find((m) => m.id === "m-new-src")?.questions?.[0]?.next?.[0] === "m-new-target", r);
      check("saveLessons refuses an empty list", (await A.op(tid, { op: "saveLessons", lessons: [] })).ok === false);
      check("students can't save lessons", [401, 403].includes((await S.Dee.op(tid, { op: "saveLessons", lessons: [a] })).status));
    }
    // The server's own guard: a lesson saved without a source card (not through the website's delete) takes the
    // follow-ups only it dealt with it, even in another lesson; a wire just unhooked keeps its card.
    {
      const now = courseOf(await A.state(tid)).weeks[0].lessons;
      const l1 = now[0], l2 = now[1];
      const unhooked = { ...l1, modules: l1.modules.map((m) => (m.id === "m-ch" ? { ...m, questions: [{ ...m.questions[0], next: [null, null] }] } : m)) };
      await A.op(tid, { op: "saveLesson", lesson: unhooked });
      check("unhooking a wire keeps the card", courseOf(await A.state(tid)).weeks[0].lessons[1].modules.some((m) => m.id === "m-l2x"));
      await A.op(tid, { op: "saveLesson", lesson: l1 }); // wire back
      const r = await A.op(tid, { op: "saveLesson", lesson: { ...l1, modules: l1.modules.filter((m) => m.id !== "m-sq") } });
      const after = courseOf(await A.state(tid)).weeks[0].lessons;
      const ids0 = after[0].modules.map((m) => m.id);
      check("deleting a quiz removes the cards only its scores dealt", !["m-low", "m-mid", "m-top"].some((x) => ids0.includes(x)) && (r.removedFollowUps ?? []).length === 3, [ids0, r.removedFollowUps]);
      const r2 = await A.op(tid, { op: "saveLesson", lesson: { ...after[0], modules: after[0].modules.filter((m) => m.id !== "m-ch") } });
      const l2now = courseOf(await A.state(tid)).weeks[0].lessons[1].modules.map((m) => m.id);
      check("deleting a source removes its follow-up in a later lesson", !l2now.includes("m-l2x") && l2now.includes("m-l2a") && r2.removedFollowUps?.includes("m-l2x"), [l2now, r2]);
      void l2;
    }
    await A.del("/api/courses", { id: tid, confirm: `Tree2 ${run}` });
  }

  // ---- The student's map: paths taken (and why), card backs for the rest; a template that starts with a tree
  {
    const tc = await A.post("/api/courses", { title: `Map ${run}`, start: "blank" });
    const tid = tc.id;
    await A.op(tid, { op: "addStudents", names: "Gus Map" });
    const l = courseOf(await A.state(tid)).weeks[0].lessons[0];
    const card = (id, type, title, extra = {}) => ({ id, type, title, body: "", audience: { kind: "all" }, tools: [], attachments: [], ...extra });
    await A.op(tid, { op: "saveLesson", lesson: { ...l, modules: [card("m-src", "practice", "Pick", { questions: [{ id: "q", text: "Which?", options: ["Left", "Right"], answer: 0, next: ["m-left", "m-right"] }] }), card("m-left", "read", "Left card"), card("m-right", "read", "Secret right card")] } });
    const G = (await invited(tid, (await A.op(tid, { op: "setupLinks" })).links[0].link)).c;
    const gid = courseOf(await A.state(tid)).students[0].id;
    const srcOf = async () => modulesOf(courseOf(await G.state(`${tid}?as=${gid}`))).find((m) => m.id === "m-src");
    const before = await srcOf();
    check("before answering: one anonymous card back, however many answers", before.paths?.length === 1 && before.paths.every((p) => !p.to && !p.title && !p.why), before.paths);
    await G.op(tid, { op: "answer", studentId: gid, moduleId: "m-src", qid: "q", choice: 0 });
    const after = await srcOf();
    const taken = after.paths?.find((p) => p.to === "m-left");
    check("the path taken points at its card and says why", taken?.why === "You chose “Left”", after.paths);
    check("after answering, only the card it opened shows (no card back, no title leaks)", after.paths.length === 1 && !JSON.stringify(after).includes("Secret right card"), after.paths);
    await A.op(tid, { op: "saveLesson", lesson: { ...courseOf(await A.state(tid)).weeks[0].lessons[0], openPaths: true } });
    const open = await srcOf();
    check("with every path shown, the other path has its title and condition", open.paths.some((p) => !p.to && p.title === "Secret right card" && p.why === "If you choose “Right”"), open.paths);
    check("a dealt card is marked for the student", modulesOf(courseOf(await G.state(`${tid}?as=${gid}`))).find((m) => m.id === "m-left")?.dealtFor === true);
    await A.del("/api/courses", { id: tid, confirm: `Map ${run}` });
    const tpl = await A.post("/api/courses", { title: `Tpl ${run}`, start: "template", weeks: 1 });
    const tl = courseOf(await A.state(tpl.id)).weeks[0].lessons[0];
    const qc = tl.modules.find((m) => m.title === "Quick check");
    check("a new course from the template starts with a score tree on fresh ids", !!qc && qc.bands?.filter((b) => b.next).length === 2 && qc.bands.every((b) => !b.next || (tl.modules.some((m) => m.id === b.next) && !b.next.startsWith("qc-"))), qc?.bands);
    await A.del("/api/courses", { id: tpl.id, confirm: `Tpl ${run}` });
  }

  // ---- Poll cards: no right answer, the class tally after voting, and a card for each choice
  {
    const tc = await A.post("/api/courses", { title: `Poll ${run}`, start: "blank" });
    const tid = tc.id;
    await A.op(tid, { op: "addStudents", names: "Hal One\nIvy Two" });
    const l = courseOf(await A.state(tid)).weeks[0].lessons[0];
    const card = (id, kind, title, extra = {}) => ({ id, kind, type: "read", title, body: "", audience: { kind: "all" }, tools: [], attachments: [], ...extra });
    await A.op(tid, { op: "saveLesson", lesson: { ...l, modules: [card("m-poll", "choice", "Which do you prefer?", { type: "practice", poll: true, questions: [{ id: "p", text: "Prefer?", options: ["Ear", "Score"], answer: 1, next: ["m-ear", null] }] }), card("m-ear", "content", "Ear path"), card("m-blank", "choice", "Question 2", { type: "practice", questions: [{ id: "b", text: "", options: ["", ""], answer: 0 }] })] } });
    const savedMods = courseOf(await A.state(tid)).weeks[0].lessons[0].modules;
    const saved = savedMods.find((m) => m.id === "m-poll");
    check("a Content card saves as Content", savedMods.find((m) => m.id === "m-ear")?.kind === "content", savedMods.find((m) => m.id === "m-ear")?.kind);
    check("a poll saves as a Choice card with no right answer, its wiring kept", saved.kind === "choice" && saved.poll === true && saved.type === "practice" && saved.questions[0].answer === undefined && saved.questions[0].next?.[0] === "m-ear", saved);
    const links = (await A.op(tid, { op: "setupLinks" })).links;
    const as = async (name) => { const { c, id } = await invited(tid, links.find((x) => x.name === name).link, name); return { c, id }; };
    const h = await as("Hal One"), i = await as("Ivy Two");
    const v1 = await h.c.op(tid, { op: "answer", studentId: h.id, moduleId: "m-poll", qid: "p", choice: 0 });
    check("a vote counts (no wrong answers in a poll), and deals that choice's card", v1.correct === true && v1.dealt?.[0]?.id === "m-ear", v1);
    await i.c.op(tid, { op: "answer", studentId: i.id, moduleId: "m-poll", qid: "p", choice: 1 });
    const seen = modulesOf(courseOf(await i.c.state(`${tid}?as=${i.id}`))).find((m) => m.id === "m-poll");
    check("students see the class tally", JSON.stringify(seen.tally) === "[1,1]", seen.tally);
    const again = await i.c.op(tid, { op: "answer", studentId: i.id, moduleId: "m-poll", qid: "p", choice: 0 });
    check("a vote can't be changed once it's in", again.ok === false && JSON.stringify(modulesOf(courseOf(await i.c.state(`${tid}?as=${i.id}`))).find((m) => m.id === "m-poll").tally) === "[1,1]", again);
    check("a Choice card with no question yet is hidden from students", !modulesOf(courseOf(await i.c.state(`${tid}?as=${i.id}`))).some((m) => m.id === "m-blank"));
    check("but the teacher still has it", modulesOf(courseOf(await A.state(tid))).some((m) => m.id === "m-blank"));
    check("the other choice deals nothing", !modulesOf(courseOf(await i.c.state(`${tid}?as=${i.id}`))).some((m) => m.id === "m-ear"));
    const events = (await A.state(tid)).events ?? [];
    check("a poll vote is never logged as a wrong answer", !events.some((e) => e.kind === "wrong" && e.moduleId === "m-poll"));
    await A.del("/api/courses", { id: tid, confirm: `Poll ${run}` });
  }

  // ---- Card groups: one question per card, a group scores them together and deals by the total
  {
    const tc = await A.post("/api/courses", { title: `Group ${run}`, start: "blank" });
    const tid = tc.id;
    await A.op(tid, { op: "addStudents", names: "Jo Low\nKit High" });
    const l = courseOf(await A.state(tid)).weeks[0].lessons[0];
    const mc = (id, answer) => ({ id, kind: "choice", type: "practice", title: id, body: "", audience: { kind: "all" }, tools: [], attachments: [], questions: [{ id: `${id}-q`, text: "Pick", options: ["A", "B"], answer }] });
    const card = (id, kind, title, extra = {}) => ({ id, kind, type: "read", title, body: "", audience: { kind: "all" }, tools: [], attachments: [], ...extra });
    const group = { id: "m-g", kind: "group", type: "group", title: "Check", body: "", audience: { kind: "all" }, tools: [], attachments: [], members: ["m-c1", "m-c2", "m-c3", "m-nope"], bands: [{ min: 0, next: "m-lo" }, { min: 60, next: null }, { min: 90, next: "m-hi" }] };
    // Members out of order in the lesson: the server puts them right after their group.
    await A.op(tid, { op: "saveLesson", lesson: { ...l, modules: [mc("m-c2", 1), group, card("m-lo", "content", "Review"), mc("m-c1", 0), card("m-hi", "content", "Stretch"), mc("m-c3", 0)] } });
    const ls = courseOf(await A.state(tid)).weeks[0].lessons[0];
    check("a group keeps real members only, right after it", JSON.stringify(ls.modules.find((m) => m.id === "m-g").members) === JSON.stringify(["m-c1", "m-c2", "m-c3"]) && ls.modules.map((m) => m.id).slice(0, 4).join() === "m-g,m-c1,m-c2,m-c3", ls.modules.map((m) => m.id));
    const links = (await A.op(tid, { op: "setupLinks" })).links;
    const as = async (name) => { const { c, id } = await invited(tid, links.find((x) => x.name === name).link, name); return { c, id }; };
    const jo = await as("Jo Low"), kit = await as("Kit High");
    const view = async (s) => courseOf(await s.c.state(`${tid}?as=${s.id}`));
    const v0 = await view(jo);
    check("students see the group's cards, framed as a deck, not the group as a card", !modulesOf(v0).some((m) => m.id === "m-g") && v0.weeks[0].lessons[0].decks?.[0]?.members?.join() === "m-c1,m-c2,m-c3", v0.weeks[0].lessons[0].decks);
    // Jo gets one right of three (and fixes a wrong one later: the first answer is what counts).
    await jo.c.op(tid, { op: "answer", studentId: jo.id, moduleId: "m-c1", qid: "m-c1-q", choice: 0 });
    await jo.c.op(tid, { op: "answer", studentId: jo.id, moduleId: "m-c2", qid: "m-c2-q", choice: 0 });
    await jo.c.op(tid, { op: "answer", studentId: jo.id, moduleId: "m-c2", qid: "m-c2-q", choice: 1 });
    const mid = await view(jo);
    check("no deal before every card in the group is answered", !modulesOf(mid).some((m) => m.id === "m-lo" || m.id === "m-hi"));
    const last = await jo.c.op(tid, { op: "answer", studentId: jo.id, moduleId: "m-c3", qid: "m-c3-q", choice: 1 });
    check("the last answer scores the group and deals by the total (1 of 3 → review)", last.dealt?.some((d) => d.id === "m-lo"), last);
    const jv = await view(jo);
    check("the deck shows its score", jv.weeks[0].lessons[0].decks[0].score === 33 && jv.weeks[0].lessons[0].decks[0].done === true, jv.weeks[0].lessons[0].decks[0]);
    for (const [m, a] of [["m-c1", 0], ["m-c2", 1], ["m-c3", 0]]) await kit.c.op(tid, { op: "answer", studentId: kit.id, moduleId: m, qid: `${m}-q`, choice: a });
    const kv = modulesOf(await view(kit)).map((m) => m.id);
    check("all right → the stretch card only", kv.includes("m-hi") && !kv.includes("m-lo"), kv);
    // A group dealt as a follow-up hides its cards until then.
    const ls2 = courseOf(await A.state(tid)).weeks[0].lessons[0];
    const gate = mc("m-gate", 0);
    gate.questions[0].next = ["m-g", null];
    await A.op(tid, { op: "saveLesson", lesson: { ...ls2, modules: [gate, ...ls2.modules] } });
    const fresh = await A.op(tid, { op: "addStudents", names: "Lou New" });
    void fresh;
    const l3 = (await A.op(tid, { op: "setupLinks" })).links.find((x) => x.name === "Lou New");
    const { c: lou, r: lr } = await invited(tid, l3.link);
    const louIds = modulesOf(courseOf(await lou.state(`${tid}?as=${lr.studentId}`))).map((m) => m.id);
    check("a group dealt by an answer keeps its cards hidden until then", !louIds.some((x) => ["m-c1", "m-c2", "m-c3"].includes(x)) && louIds.includes("m-gate"), louIds);
    await lou.op(tid, { op: "answer", studentId: lr.studentId, moduleId: "m-gate", qid: "m-gate-q", choice: 0 });
    check("…and shows them once dealt", modulesOf(courseOf(await lou.state(`${tid}?as=${lr.studentId}`))).filter((m) => ["m-c1", "m-c2", "m-c3"].includes(m.id)).length === 3);
    const l4 = courseOf(await A.state(tid)).weeks[0].lessons[0];
    await A.op(tid, { op: "saveLesson", lesson: { ...l4, modules: l4.modules.map((m) => (m.id === "m-gate" ? { ...m, questions: [{ ...m.questions[0], next: ["m-g", "m-c2"] }] } : m)) } });
    const gateNext = courseOf(await A.state(tid)).weeks[0].lessons[0].modules.find((m) => m.id === "m-gate").questions[0].next;
    check("a card inside a group can't be dealt on its own (deal the group)", gateNext?.[0] === "m-g" && !gateNext?.[1], gateNext);
    await A.del("/api/courses", { id: tid, confirm: `Group ${run}` });
  }

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

  // ---- Co-teachers: only Google-verified accounts match an invite; only the owner manages people
  {
    const share = made["template/writing"];
    const bEmail = `t-b-${run}@example.test`;
    const sp = await A.op(share, { op: "setPeople", people: [{ email: bEmail, role: "editor" }, { email: "not-an-email", role: "editor" }, { email: `v-${run}@example.test`, role: "viewer" }] });
    check("owner shares the course", sp.ok !== false, sp);
    const sharedState = await A.state(share);
    check("owner sees the people list", courseOf(sharedState).people?.length === 2, courseOf(sharedState).people);
    check("owner is told they own it", sharedState.me?.role === "owner", sharedState.me);
    check("password account with the invited email gets nothing", [401, 403].includes((await B.state(share)).status));
    check("…and can't write", [401, 403].includes((await B.op(share, { op: "addStudents", names: "X" })).status));
    check("…and doesn't list it", !(await B.get("/api/courses")).courses.some((c) => c.id === share));
    check("only the owner changes people", [401, 403].includes((await B.op(share, { op: "setPeople", people: [] })).status));
    const stu = await S1.state(`${share}?as=${mia.id}`);
    check("students never get co-teachers or owner", !("people" in courseOf(stu)) && !("ownerId" in courseOf(stu)) && !stu.me, Object.keys(courseOf(stu)));
    const gt = courseOf(await A.state(share)).access;
    await A.op(share, { op: "setAccess", access: { joinOpen: true, selfJoin: gt?.selfJoin, guestToken: true } });
    const tok = courseOf(await A.state(share)).access?.guestToken;
    const guest = await anon.get(`/api/course/${share}?guest=${tok}`);
    check("guest view has no co-teachers", guest.course && !("people" in guest.course) && !("ownerId" in guest.course), guest.course && Object.keys(guest.course));
  }

  // ---- Lesson numbers follow position across the course
  {
    const tc = made["template/writing"];
    const before = courseOf(await A.state(tc));
    await A.op(tc, { op: "addLesson", weekId: before.weeks[0].id, title: "Lesson 9" });
    const after2 = courseOf(await A.state(tc));
    const names = after2.weeks.map((w) => w.lessons.map((l) => l.title).join("+")).join(" | ");
    check("adding to week 1 makes Lesson 2 and moves the rest up", names === "Lesson 1+Lesson 2 | Lesson 3 | Lesson 4", names);
    const l2 = after2.weeks[1].lessons[0];
    await A.op(tc, { op: "saveLesson", lesson: { ...l2, title: "Lesson 2" } });
    check("a stale save can't put an old number back", courseOf(await A.state(tc)).weeks[1].lessons[0].title === "Lesson 3");
    await A.op(tc, { op: "saveLesson", lesson: { ...courseOf(await A.state(tc)).weeks[1].lessons[0], title: "Scales" } });
    await A.op(tc, { op: "addLesson", weekId: after2.weeks[0].id });
    const names2 = courseOf(await A.state(tc)).weeks.map((w) => w.lessons.map((l) => l.title).join("+")).join(" | ");
    check("named lessons keep their names", names2 === "Lesson 1+Lesson 2+Lesson 3 | Scales | Lesson 5", names2);
    const l1 = courseOf(await A.state(tc)).weeks[0].lessons[0];
    await A.op(tc, { op: "saveLesson", lesson: { ...l1, date: "2030-02-04" } });
    check("a lesson keeps its date", courseOf(await A.state(tc)).weeks[0].lessons[0].date === "2030-02-04");
    await A.op(tc, { op: "saveLesson", lesson: { ...l1, date: "next tuesday" } });
    check("a bad date is dropped", !courseOf(await A.state(tc)).weeks[0].lessons[0].date);
  }

  // ---- Students added by email
  {
    const ec = made["template/writing"];
    const r1 = await A.op(ec, { op: "addStudentEmails", emails: ["ana.lopez@example.test", "ANA.LOPEZ@example.test", "bad", "kai@example.test"] });
    check("add students by email", r1.added === 2, r1);
    const roster = courseOf(await A.state(ec)).students;
    check("name made from the address", roster.some((x) => x.name === "Ana Lopez" && x.email === "ana.lopez@example.test"), roster.map((x) => [x.name, x.email]));
    check("emails not sent to classmates", !courseOf(await S1.state(`${ec}?as=${mia.id}`)).students.some((x) => "email" in x));
  }

  // ---- Invitation emails: only when the site has a mail key (never in tests), and never to classmates
  {
    const ec = made["template/writing"];
    const kids = courseOf(await A.state(ec)).students.filter((x) => x.email).map((x) => x.id);
    const r = await A.op(ec, { op: "emailInvites", studentIds: kids });
    check("invitations refused when sending isn't set up", r.ok === false && /isn.t set up/.test(r.error ?? ""), r);
    check("students can't send invitations", [401, 403].includes((await S1.op(ec, { op: "emailInvites", studentIds: kids })).status));
    check("teacher view says whether mail is on", typeof (await A.state(ec)).me?.mail === "boolean");
    const l0 = courseOf(await A.state(ec)).weeks[0].lessons[0];
    await A.op(ec, { op: "saveLesson", lesson: { ...l0, modules: l0.modules.map((m, i) => (i === 0 ? { ...m, suit: "share" } : i === 1 ? { ...m, suit: "boss" } : m)) } });
    const back = courseOf(await A.state(ec)).weeks[0].lessons[0].modules;
    check("a card keeps its suit", back[0].suit === "share", back[0].suit);
    check("an unknown suit is dropped", back[1].suit === undefined, back[1].suit);
  }

  // ---- Messages between the teacher and one student
  {
    const mc = (await A.post("/api/courses", { title: `Messages ${run}`, start: "blank" })).id;
    made["messages"] = mc;
    await A.op(mc, { op: "addStudents", names: "Ola\nPim" });
    const links = (await A.op(mc, { op: "setupLinks" })).links;
    const ola = await invited(mc, links.find((x) => x.name === "Ola").link, "Ola");
    const pim = await invited(mc, links.find((x) => x.name === "Pim").link, "Pim");
    check("teacher messages a student", (await A.op(mc, { op: "message", studentId: ola.id, text: "Hi Ola" })).ok);
    const seen = (await ola.c.get(`/api/course/${mc}?as=${ola.id}`)).nudges ?? [];
    check("the student sees the teacher's message", seen.some((n) => n.text === "Hi Ola" && !n.from));
    check("another student doesn't", !((await pim.c.get(`/api/course/${mc}?as=${pim.id}`)).nudges ?? []).some((n) => n.text === "Hi Ola"));
    check("the student replies", (await ola.c.op(mc, { op: "messageTeacher", studentId: ola.id, text: "Thanks!" })).ok);
    check("a student can't write as someone else", (await ola.c.op(mc, { op: "messageTeacher", studentId: pim.id, text: "fake" })).ok !== true);
    check("a student can't use the teacher's message op", (await ola.c.op(mc, { op: "message", studentId: ola.id, text: "fake" })).ok !== true);
    const tv = (await A.state(mc)).nudges ?? [];
    check("the teacher sees the reply, unread", tv.some((n) => n.text === "Thanks!" && n.from === "student" && !n.read));
    await A.op(mc, { op: "readMessages", studentId: ola.id });
    check("the teacher reads it", ((await A.state(mc)).nudges ?? []).find((n) => n.text === "Thanks!")?.read === true);
    await ola.c.op(mc, { op: "readMyMessages", studentId: ola.id });
    check("the student reads theirs", ((await ola.c.get(`/api/course/${mc}?as=${ola.id}`)).nudges ?? []).find((n) => n.text === "Hi Ola")?.read === true);
    check("an empty message is refused", (await A.op(mc, { op: "message", studentId: ola.id, text: "  " })).ok === false);
  }

  // ---- The inbox: every conversation of an account, across courses; students message each other unless turned off
  {
    const ic = (await A.post("/api/courses", { title: `Inbox ${run}`, start: "blank" })).id;
    made["inbox"] = ic;
    await A.op(ic, { op: "addStudents", names: "Rae\nSol\nTam" });
    const links = (await A.op(ic, { op: "setupLinks" })).links;
    const [rae, sol, tam] = await Promise.all(["Rae", "Sol", "Tam"].map((n) => invited(ic, links.find((x) => x.name === n).link, n)));
    const send = (who, me, other, text) => who.post("/api/inbox", { action: "send", course: ic, me, with: other, text });
    check("a student writes to the teacher from the inbox", (await send(rae.c, rae.id, "teacher", "Question about the task")).ok);
    check("a student writes to a classmate", (await send(rae.c, rae.id, sol.id, "Want to work together?")).ok);
    check("a student can't write as someone else", (await send(rae.c, sol.id, tam.id, "fake")).ok !== true);
    const solBox = await sol.c.get("/api/inbox");
    const t = solBox.threads?.find((x) => x.course === ic && x.with === rae.id);
    check("the classmate sees it, unread", t?.unread === 1 && t.last?.text === "Want to work together?", solBox.threads);
    check("classmates are contacts", solBox.contacts?.some((x) => x.course === ic && x.with === tam.id) && solBox.contacts?.some((x) => x.course === ic && x.with === "teacher"));
    check("a third student can't read their conversation", (await tam.c.get(`/api/inbox?course=${ic}&me=${rae.id}&with=${sol.id}`)).status === 403);
    await sol.c.post("/api/inbox", { action: "read", course: ic, me: sol.id, with: rae.id });
    check("reading clears the unread count", ((await sol.c.get("/api/inbox")).threads.find((x) => x.course === ic && x.with === rae.id))?.unread === 0);
    const tBox = await A.get("/api/inbox");
    check("the teacher's inbox has the student's message", tBox.threads?.some((x) => x.course === ic && x.me === "teacher" && x.with === rae.id && x.unread === 1));
    check("the teacher doesn't see messages between students", !tBox.threads?.some((x) => x.course === ic && x.with === sol.id && x.last?.text === "Want to work together?"));
    check("the teacher replies from the inbox", (await A.post("/api/inbox", { action: "send", course: ic, me: "teacher", with: rae.id, text: "Ask me in class" })).ok);
    check("the student gets the reply", ((await rae.c.get(`/api/inbox?course=${ic}&me=${rae.id}&with=teacher`)).messages ?? []).some((m) => m.text === "Ask me in class" && !m.mine));
    check("a student can't turn messages off", (await rae.c.op(ic, { op: "setPeerMessages", on: false })).ok !== true);
    await A.op(ic, { op: "setPeerMessages", on: false });
    check("turned off: students can't write to each other", (await send(rae.c, rae.id, sol.id, "still there?")).ok !== true);
    check("turned off: they can still write to the teacher", (await send(rae.c, rae.id, "teacher", "ok")).ok);
    check("turned off: classmates aren't contacts", !((await rae.c.get("/api/inbox")).contacts ?? []).some((x) => x.course === ic && x.with === sol.id));
    await A.op(ic, { op: "setPeerMessages", on: true });
    check("signed out: no inbox", (await anon.get("/api/inbox")).status === 401);
  }

  // ---- A Text card each student writes in (their own copy), with the teacher's comments on passages
  {
    const wc = (await A.post("/api/courses", { title: `Writing ${run}`, start: "blank" })).id;
    made["writing"] = wc;
    const l0 = courseOf(await A.state(wc)).weeks[0].lessons[0];
    await A.op(wc, { op: "saveLesson", lesson: { ...l0, modules: [{ id: "m-own", type: "read", kind: "content", title: "Your copy", body: "## Start here\n\n| a | b |\n|---|---|\n| 1 | |", audience: { kind: "all" }, tools: [], attachments: [], writers: "each" }] } });
    check("a Text card keeps who writes in it", modulesOf(courseOf(await A.state(wc)))[0].writers === "each");
    await A.op(wc, { op: "addStudents", names: "Uma\nVic" });
    const links = (await A.op(wc, { op: "setupLinks" })).links;
    const uma = await invited(wc, links.find((x) => x.name === "Uma").link, "Uma");
    const vic = await invited(wc, links.find((x) => x.name === "Vic").link, "Vic");
    check("the student hands in their copy", (await uma.c.op(wc, { op: "setProgress", studentId: uma.id, moduleId: "m-own", output: "## Start here\n\nMy words.", status: "done" })).ok);
    const glance = (await A.get("/api/courses")).courses.find((c) => c.id === wc);
    check("it waits for feedback", glance?.toReview === 1, glance);
    const note = await A.op(wc, { op: "docNote", studentId: uma.id, moduleId: "m-own", quote: "My words", text: "Say more" });
    check("the teacher comments on a passage", note.ok && note.note?.quote === "My words");
    check("the student sees the comment", ((await uma.c.get(`/api/course/${wc}?as=${uma.id}`)).progress?.[uma.id]?.["m-own"]?.notes ?? []).some((n) => n.text === "Say more"));
    check("the student replies", (await uma.c.op(wc, { op: "docReply", studentId: uma.id, moduleId: "m-own", replyTo: note.note.id, text: "OK" })).ok);
    check("a student can't comment on someone's work", (await vic.c.op(wc, { op: "docReply", studentId: uma.id, moduleId: "m-own", replyTo: note.note.id, text: "hi" })).ok !== true);
    check("a student can't start a comment", (await uma.c.op(wc, { op: "docNote", studentId: uma.id, moduleId: "m-own", text: "x" })).ok !== true);
    await A.op(wc, { op: "docNoteDelete", studentId: uma.id, moduleId: "m-own", noteId: note.note.id });
    check("removing a comment removes its replies", !(((await A.state(wc)).progress?.[uma.id]?.["m-own"]?.notes) ?? []).length);
  }

  // ---- New teachers start with Questhand 101
  {
    const N = await teacher("new");
    const mine = (await N.get("/api/courses")).courses ?? [];
    check("a new teacher has Questhand 101", mine.some((c) => c.title === "Questhand 101"), mine.map((c) => c.title));
    const S1 = await student("Fresh student");
    check("a new student account doesn't", ((await S1.get("/api/courses")).courses ?? []).length === 0);
  }

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
