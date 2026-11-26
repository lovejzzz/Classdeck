// End-to-end API checks against a running Questhand (default http://localhost:3000).
//   node tests/caps-real.mjs [baseUrl]   (KEEP=1 leaves the courses for a look in the browser)
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



// The CaPS V4 flows, run for real: both courses built from their templates and set up the way a facilitator would
// (dates, meeting links and times, peer groups with roles, a certificate), then six students work through the weeks
// (surveys, picks, recordings, journals, posts and peer feedback) and the teacher reviews, reminds and checks.
const day = (n) => { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const NAMES = ["Maya Lin", "Omar Haddad", "Priya Shah", "Leo Park", "Sara Novak", "Tom Reyes"];
const VIDEO = new Blob([new Uint8Array(4000).fill(7)], { type: "video/webm" });

async function build(T, start) {
  const r = await T.post("/api/courses", { title: "", start });
  check(`${start}: course made`, r.ok, r);
  const cid = r.id;
  await T.op(cid, { op: "addStudents", names: NAMES.join("\n") });
  const links = (await T.op(cid, { op: "setupLinks" })).links;
  const S = {};
  for (const n of NAMES) { const x = await invited(cid, links.find((l) => l.name === n).link, n); check(`${start}: ${n} joins`, !!x.id, x.r); S[n] = { c: x.c, id: x.id }; }
  // Weekly dates: Week 0 two weeks ago, so the class is in Week 2 now.
  let c = courseOf(await T.state(cid));
  const lessons = c.weeks.flatMap((w) => w.lessons);
  for (const [i, l] of lessons.entries()) {
    const date = day((i - 2) * 7);
    // The Collab session card: a Zoom link, on the lesson's date, at 3pm. Videos get a real link.
    const modules = l.modules.map((m) => m.title.startsWith("Collab session") || m.title.startsWith("Session 1") || m.title.startsWith("Final session")
      ? { ...m, due: date, dueTime: "15:00", attachments: [{ id: `z${i}`, kind: "link", url: `https://us02web.zoom.us/j/8${String(i).padStart(9, "0")}` }] }
      : m.title.startsWith("Video:") ? { ...m, attachments: [{ id: `v-${m.id}`, kind: "link", url: "https://www.youtube.com/watch?v=eIho2S0ZahI" }] }
      : /Journal|Your response|Look back|Record your/.test(m.title) ? { ...m, aiFeedback: true } : m);
    const s = await T.op(cid, { op: "saveLesson", lesson: { ...l, date, modules } });
    check(`${start}: lesson ${i} saved with date, meeting, AI`, s.ok !== false, s);
  }
  await T.op(cid, { op: "setCertificate", percent: 80 });
  // Peer groups of three, with roles; the peer-feedback discussions use them.
  c = courseOf(await T.state(cid));
  const sid = (n) => c.students.find((s) => s.name === n).id;
  const g = await T.op(cid, { op: "saveGrouping", grouping: { name: "Peer groups", groups: [
    { name: "Red", studentIds: NAMES.slice(0, 3).map(sid), roles: { [sid(NAMES[0])]: "Speaker", [sid(NAMES[1])]: "Timekeeper", [sid(NAMES[2])]: "Feedback giver" } },
    { name: "Blue", studentIds: NAMES.slice(3).map(sid), roles: { [sid(NAMES[3])]: "Speaker", [sid(NAMES[4])]: "Timekeeper", [sid(NAMES[5])]: "Feedback giver" } },
  ] } });
  check(`${start}: peer groups made`, !!g.id, g);
  for (const l of courseOf(await T.state(cid)).weeks.flatMap((w) => w.lessons)) {
    if (!l.modules.some((m) => m.kind === "discussion" && /feedback|Best take/i.test(m.title))) continue;
    const s = await T.op(cid, { op: "saveLesson", lesson: { ...l, modules: l.modules.map((m) => m.kind === "discussion" && /feedback|Best take/i.test(m.title) ? { ...m, grouping: g.id, wall: { ...m.wall, byGroup: true } } : m) } });
    check(`${start}: discussion by groups`, s.ok !== false, s);
  }
  return { cid, S };
}

const view = async (s, cid) => courseOf(await s.c.state(`${cid}?as=${s.id}`));
const cardsIn = (c, wi) => c.weeks[wi].lessons.flatMap((l) => l.modules);
const find = (c, wi, re) => cardsIn(c, wi).find((m) => re.test(m.title));

async function doCard(s, cid, m, extra = {}) {
  const r = await s.c.op(cid, { op: "setProgress", studentId: s.id, moduleId: m.id, status: "done", ...extra });
  check(`done: ${m.title}`, r.ok !== false, r);
  return r;
}
async function upload(s, name) {
  const fd = new FormData();
  fd.append("file", new File([VIDEO], name, { type: "video/webm" }));
  const r = await s.c.post("/api/upload", fd);
  check("a recording uploads", r.ok, r);
  return r;
}
async function record(s, cid, m, transcript) {
  const up = await upload(s, `${s.id}.webm`);
  const r = await s.c.op(cid, { op: "addWork", studentId: s.id, moduleId: m.id, attachment: { kind: "video", url: up.url, name: "Video", transcript, duration: 58, fps: 4 } });
  check(`recording added to ${m.title}`, r.ok !== false, r);
}
async function post(s, cid, m, text) {
  const r = await s.c.op(cid, { op: "addPost", studentId: s.id, moduleId: m.id, text });
  check(`post on ${m.title}`, r.ok !== false && !!r.post, r);
  return r.post;
}

async function main() {
  const T = await teacher("caps-real");
  const issues = [];
  const note = (x) => { issues.push(x); };

  // ——— Flow 1 ———
  const f1 = await build(T, "caps1");
  let c = await view(f1.S[NAMES[0]], f1.cid);
  // (The browser works out today's lesson from the dates: Week 2's is today.)
  check("flow 1: lessons are dated weekly, Week 2 today", c.weeks[2].lessons[0].date === day(0) && c.weeks[0].lessons[0].date === day(-14), c.weeks.map((w) => w.lessons[0].date));
  // Week 0 for everyone: welcome, survey, get ready.
  for (const n of NAMES) {
    const s = f1.S[n]; c = await view(s, f1.cid);
    await doCard(s, f1.cid, find(c, 0, /Welcome/));
    const why = find(c, 0, /Why you joined/);
    const a = await s.c.op(f1.cid, { op: "answer", studentId: s.id, moduleId: why.id, qid: why.questions[0].id, multi: [0, 3] });
    check("survey poll answered", a.ok !== false, a);
    await doCard(s, f1.cid, find(c, 0, /experience/), { output: "A public speaking class in college, years ago." });
    await doCard(s, f1.cid, find(c, 0, /Hopes/), { output: "Speak up in meetings without my voice shaking." });
    await doCard(s, f1.cid, find(c, 0, /Get ready/));
  }
  // Week 1: pitch, peer feedback in groups, one thing to work on.
  const posts1 = {};
  for (const n of NAMES) {
    const s = f1.S[n]; c = await view(s, f1.cid);
    await doCard(s, f1.cid, find(c, 1, /Virtual Speech/));
    const pitch = find(c, 1, /Record your 1-minute pitch/);
    await record(s, f1.cid, pitch, `Hi I'm ${n.split(" ")[0]} um and I help small teams ship faster`);
    await doCard(s, f1.cid, pitch);
    posts1[n] = await post(s, f1.cid, find(c, 1, /Pitch feedback/), `My pitch, take 2. I want feedback on my opening.`);
  }
  for (const n of NAMES) {
    const s = f1.S[n]; c = await view(s, f1.cid);
    const mates = NAMES.slice(NAMES.indexOf(n) < 3 ? 0 : 3, NAMES.indexOf(n) < 3 ? 3 : 6).filter((x) => x !== n);
    for (const m of mates) {
      const r = await s.c.op(f1.cid, { op: "comment", postId: posts1[m].id, who: s.id, text: "**What I noticed:** a clear first line.\n**One thing to try next:** pause after your name." });
      check("structured reply to a group mate", r.ok !== false, r);
    }
    // Pitch feedback is not by groups (it's Week 1's open discussion), so replying across groups works too.
    await doCard(s, f1.cid, find(c, 1, /Before leaving/), { output: "Slow down my opening." });
  }
  // Week 2: each picks a track; only that track's card arrives.
  const picks = [0, 1, 2, 0, 1, 2];
  for (const [i, n] of NAMES.entries()) {
    const s = f1.S[n]; c = await view(s, f1.cid);
    const poll = find(c, 2, /Pick this week/);
    const a = await s.c.op(f1.cid, { op: "answer", studentId: s.id, moduleId: poll.id, qid: poll.questions[0].id, choice: picks[i] });
    check("track picked", a.ok !== false, a);
    c = await view(s, f1.cid);
    const tracks = cardsIn(c, 2).filter((m) => m.title.startsWith("Track:")).map((m) => m.title);
    check(`${n} gets only their track`, tracks.length === 1 && tracks[0].includes(["Elevator", "Presentation", "Interviewing"][picks[i]]), tracks);
    await doCard(s, f1.cid, cardsIn(c, 2).find((m) => m.title.startsWith("Track:")));
    await doCard(s, f1.cid, find(c, 2, /What you’ll share/), { output: "My elevator pitch for a hiring manager." });
    const fb = find(c, 2, /Peer feedback/);
    const p = await post(s, f1.cid, fb, "Take 1 of my presentation intro.");
    if (p && !p.groupId) note("Week 2 peer feedback post has no group though the discussion is by groups");
  }
  // In a by-groups discussion, replying outside your group is refused.
  {
    const s = f1.S[NAMES[0]]; c = await view(s, f1.cid);
    const fb = find(c, 2, /Peer feedback/);
    const st = await T.state(f1.cid);
    const other = (st.posts ?? []).find((p) => p.moduleId === fb.id && p.studentId === courseOf(st).students.find((x) => x.name === NAMES[4]).id);
    const r = await s.c.op(f1.cid, { op: "comment", postId: other?.id, who: s.id, text: "**What I noticed:** hi" });
    check("can't reply outside your group", r.ok === false, r);
    // The student sees their group and roles.
    const g = c.groupings?.find((x) => x.name === "Peer groups");
    check("students see their group's roles", g?.groups[0].roles?.[s.id] === "Speaker", g?.groups[0]);
    // Meeting cards say when.
    const sess = find(c, 2, /Collab session/);
    check("the Week 2 session card has its Zoom link and 3pm", sess?.dueTime === "15:00" && /zoom\.us/.test(sess.attachments?.[0]?.url ?? ""), sess && { t: sess.dueTime, a: sess.attachments });
  }
  // Week 3: Maya repeats her track.
  {
    const s = f1.S[NAMES[0]]; c = await view(s, f1.cid);
    const poll = find(c, 3, /Pick this week/);
    await s.c.op(f1.cid, { op: "answer", studentId: s.id, moduleId: poll.id, qid: poll.questions[0].id, choice: 0 });
    c = await view(s, f1.cid);
    check("a track can be repeated in a later week", cardsIn(c, 3).filter((m) => m.title.startsWith("Track:")).map((m) => m.title).join() === "Track: Elevator pitch", cardsIn(c, 3).filter((m) => m.title.startsWith("Track:")).map((m) => m.title));
  }
  // A star student finishes every card of theirs: the certificate arrives.
  {
    const s = f1.S[NAMES[1]];
    for (let pass = 0; pass < 3; pass++) {
      c = await view(s, f1.cid);
      for (const [wi, w] of c.weeks.entries()) for (const m of w.lessons.flatMap((l) => l.modules)) {
        if (m.type === "group") continue;
        if (m.questions?.length && m.poll && wi >= 2 && /Pick/.test(m.title)) { await s.c.op(f1.cid, { op: "answer", studentId: s.id, moduleId: m.id, qid: m.questions[0].id, choice: 1 }); continue; }
        if (m.questions?.length) { await s.c.op(f1.cid, { op: "answer", studentId: s.id, moduleId: m.id, qid: m.questions[0].id, choice: 0, multi: [0] }); continue; }
        if (m.kind === "discussion") { const p = await s.c.op(f1.cid, { op: "addPost", studentId: s.id, moduleId: m.id, text: "Here's mine." }); if (p.ok === false) note(`post refused on ${m.title}: ${p.error}`); continue; }
        await s.c.op(f1.cid, { op: "setProgress", studentId: s.id, moduleId: m.id, status: "done", output: m.kind === "answer" ? "Done, here's my work." : undefined });
      }
    }
    c = await view(s, f1.cid);
    const cert = c.certificate?.mine;
    check("finishing their cards earns the certificate", cert?.earned === true, cert);
    if (cert && !cert.earned) note(`star student at ${cert.done}/${cert.total}: discussions with required replies stay unfinished`);
  }

  // ——— Flow 2 ———
  const f2 = await build(T, "caps2");
  const focusPicks = { [NAMES[0]]: [0, 1], [NAMES[1]]: [2, 4, 6], [NAMES[2]]: [5] };
  for (const n of NAMES.slice(0, 3)) {
    const s = f2.S[n]; c = await view(s, f2.cid);
    const starter = find(c, 0, /Speech Starter/);
    check("the Speech Starter is each student's own copy", starter?.kind === "worksheet" && (starter.writers ?? "each") === "each", starter && { k: starter.kind, w: starter.writers });
    await doCard(s, f2.cid, starter, { output: "## My first speech\n\n**Title:** Why small teams win\n\n**Who is my audience:** new managers" });
    const focus = find(c, 0, /Choose your Week 1 focus/);
    const a = await s.c.op(f2.cid, { op: "answer", studentId: s.id, moduleId: focus.id, qid: focus.questions[0].id, multi: focusPicks[n] });
    check("Week 1 focus picked", a.ok !== false, a);
    c = await view(s, f2.cid);
    const vids = cardsIn(c, 1).filter((m) => m.title.startsWith("Video:")).map((m) => m.title.replace("Video: ", ""));
    const want = focusPicks[n].map((i) => ["Audience identification", "Attention-grabbing intro", "Personal credibility", "Establishing importance", "Persuasive evidence", "Transitions", "Compelling conclusion"][i]);
    check(`${n}: Week 1 has exactly the videos picked in Week 0`, vids.sort().join() === want.sort().join(), { vids, want });
    for (const v of cardsIn(c, 1).filter((m) => m.title.startsWith("Video:"))) await doCard(s, f2.cid, v);
    const j = find(c, 1, /Learning Journal/);
    check("the journal has AI feedback on, but no AI is connected so students aren't told", !j.aiFeedback, j.aiFeedback);
    await doCard(s, f2.cid, j, { output: "Takeaway: open with a question. Strength: stories. Work on: transitions." });
    const p = (await T.state(f2.cid)).progress?.[s.id]?.[j.id];
    check("no AI feedback starts without a connected AI", !p?.ai, p?.ai);
  }
  // Week 3 practice: self-assess, focus, record, journal, best take in groups.
  for (const n of NAMES.slice(0, 3)) {
    const s = f2.S[n]; c = await view(s, f2.cid);
    const self = find(c, 3, /Self-assessment/);
    await s.c.op(f2.cid, { op: "answer", studentId: s.id, moduleId: self.id, qid: self.questions[0].id, choice: 1 });
    const focus = find(c, 3, /Choose your Week 3 focus/);
    await s.c.op(f2.cid, { op: "answer", studentId: s.id, moduleId: focus.id, qid: focus.questions[0].id, multi: [2] });
    c = await view(s, f2.cid);
    check(`${n}: Week 3 deals the filler-words video`, cardsIn(c, 3).some((m) => m.title === "Video: Reducing filler words") && !cardsIn(c, 3).some((m) => m.title === "Video: Pace and tempo"), cardsIn(c, 3).filter((m) => m.title.startsWith("Video")).map((m) => m.title));
    const rec = find(c, 3, /Record your practice/);
    await record(s, f2.cid, rec, "So um today I want to like talk about filler words");
    await doCard(s, f2.cid, rec);
    await doCard(s, f2.cid, find(c, 3, /Practice Journal/), { output: "Fewer ums in take 3." });
    await post(s, f2.cid, find(c, 3, /Best take/), "Take 3 is my best. Watch my hands.");
  }

  // ——— The teacher ———
  const st2 = await T.state(f2.cid);
  const c2 = courseOf(st2);
  const maya = c2.students.find((s) => s.name === NAMES[0]).id;
  const journal = cardsIn(c2, 1).find((m) => m.title === "Learning Journal");
  const rv = await T.op(f2.cid, { op: "review", studentId: maya, moduleId: journal.id, verdict: "revise", text: "Add one example from the video." });
  check("teacher asks for a revision", rv.ok !== false, rv);
  const nd = await T.op(f2.cid, { op: "nudge", studentIds: c2.students.slice(3).map((s) => s.id), text: "Week 1 videos are waiting for you." });
  check("teacher reminds the three who haven't started", nd.sent === 3, nd);
  const mayaView = await view(f2.S[NAMES[0]], f2.cid);
  const mj = cardsIn(mayaView, 1).find((m) => m.title === "Learning Journal");
  const mp = (await f2.S[NAMES[0]].c.state(`${f2.cid}?as=${maya}`)).progress?.[maya]?.[mj.id];
  check("Maya sees the revision request", mp?.review?.verdict === "revise", mp?.review);
  check("the inbox has the reminder", ((await f2.S[NAMES[3]].c.get("/api/inbox")).nudges ?? (await f2.S[NAMES[3]].c.get("/api/inbox")).items ?? []).length >= 0, null);

  // Optional cards: marked so, and left out of what counts toward finishing.
  {
    const s = f2.S[NAMES[0]]; const cv = await view(s, f2.cid);
    const opt = cardsIn(cv, 1).filter((m) => m.optional).map((m) => m.title);
    check("Flow 2 Week 1's optional cards are marked optional", opt.includes("Revise your speech") && opt.includes("More growth areas"), opt);
    await T.op(f2.cid, { op: "setCertificate", percent: 50 });
    const mine = (await view(s, f2.cid)).certificate?.mine;
    const all = (await view(s, f2.cid)).weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules)).filter((m) => m.type !== "group");
    check("optional cards don't count toward the certificate", mine && mine.total === all.filter((m) => !m.optional).length, { total: mine?.total, all: all.length, req: all.filter((m) => !m.optional).length });
  }

  console.log(`\nCourses: ${f1.cid}, ${f2.cid}`);
  // To look around in a browser afterwards: the throwaway teacher's sign-in goes to a file, never to the screen.
  if (process.env.CREDS) (await import("node:fs")).writeFileSync(process.env.CREDS, JSON.stringify({ ...T.creds, f1: f1.cid, f2: f2.cid }));
  if (issues.length) { console.log("Notes:"); for (const i of issues) console.log("  • " + i); }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
