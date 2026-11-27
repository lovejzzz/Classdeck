// AI feedback on the CaPS flows with a real AI key, against a running local Questhand.
//   1. node tests/caps-ai.mjs setup <state.json>          throwaway teacher, both CaPS courses, AI on, students
//   2. stop the server; put a teacher's saved AI into the throwaway teacher:
//        node tests/caps-ai.mjs inject <state.json> <ai.json>   (ai.json: a User.ai object, its key sealed with this
//        site's .data/ai-secret), then start the server again
//   3. node tests/caps-ai.mjs run <state.json> <video.webm> <report.md>
// Real requests go to the teacher's AI service (a few cents). The key itself never leaves the server.
import fs from "node:fs";
import { randomBytes } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3000";
const [, , phase, stateFile, arg2, arg3] = process.argv;
let passed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) passed++;
  else failures.push(`${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`);
}

function client(cookie = "") {
  async function call(method, path, body) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      if (k === "cd_s") cookie = v ? `cd_s=${v}` : "";
    }
    const text = await res.text();
    try { return { status: res.status, ...JSON.parse(text) }; } catch { return { status: res.status, _text: text.slice(0, 200) }; }
  }
  return {
    get: (p) => call("GET", p), post: (p, b) => call("POST", p, b),
    op: (cid, b) => call("POST", `/api/course/${cid}`, b), state: (cid) => call("GET", `/api/course/${cid}`),
    get cookie() { return cookie; },
  };
}
const courseOf = (s) => s.course ?? s;
const modulesOf = (c) => c.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules));
const run = randomBytes(3).toString("hex");

// The cards in each flow that hand in words or a recording: AI feedback goes on these.
const AI_CARDS = {
  caps1: /^(Record your 1-minute pitch|What you’ll share|Pitch feedback|Peer feedback|Before leaving)/,
  caps2: /^(Speech Starter|Learning Journal|Practice Journal|Record your practice|Record your full speech|Best take|Camera setup|Before leaving)/,
};

async function setup() {
  const T = client();
  const email = `t-caps-ai-${run}@example.test`;
  const r = await T.post("/api/auth", { action: "signup", email, name: "Teacher caps-ai", password: randomBytes(12).toString("hex") });
  if (!r.ok) throw new Error(JSON.stringify(r));
  const me = await T.get("/api/auth");
  const out = { teacher: { cookie: T.cookie, email: me.email }, courses: {} };
  for (const start of ["caps1", "caps2"]) {
    const c0 = await T.post("/api/courses", { title: "", start });
    const cid = c0.id;
    await T.op(cid, { op: "addStudents", names: "Maya Lin\nOmar Haddad" });
    const links = (await T.op(cid, { op: "setupLinks" })).links;
    const S = {};
    for (const n of ["Maya Lin", "Omar Haddad"]) {
      const s = client();
      await s.post("/api/auth", { action: "signup", email: `t-ai-${n.split(" ")[0].toLowerCase()}-${start}-${run}@example.test`, name: n, password: randomBytes(12).toString("hex"), as: "student" });
      const link = links.find((l) => l.name === n).link;
      const j = await s.post("/api/auth", { action: "invite", courseId: cid, token: link.split("#")[1] ?? link });
      S[n.split(" ")[0]] = { cookie: s.cookie, id: j.studentId };
    }
    const c = courseOf(await T.state(cid));
    let on = 0;
    for (const l of c.weeks.flatMap((w) => w.lessons)) {
      if (!l.modules.some((m) => AI_CARDS[start].test(m.title))) continue;
      const modules = l.modules.map((m) => (AI_CARDS[start].test(m.title) ? (on++, { ...m, aiFeedback: true }) : m));
      await T.op(cid, { op: "saveLesson", lesson: { ...l, modules } });
    }
    out.courses[start] = { cid, S, aiCards: on };
    console.log(`${start}: ${cid}, AI on ${on} cards`);
  }
  fs.writeFileSync(stateFile, JSON.stringify(out, null, 2), { mode: 0o600 });
}

// With the server stopped: the saved AI (key sealed) goes onto the throwaway teacher in the local database.
async function inject() {
  const { DatabaseSync } = await import("node:sqlite");
  const st = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const ai = JSON.parse(fs.readFileSync(arg2, "utf8"));
  const db = new DatabaseSync(".data/questhand.db");
  const users = JSON.parse(db.prepare("select v from kv where k = 'users'").get().v);
  const t = Object.values(users).filter((u) => (st.teacher.email ? u.email === st.teacher.email : u.name === "Teacher caps-ai")).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
  if (!t) throw new Error("teacher not found");
  t.ai = ai;
  db.prepare("update kv set v = ? where k = 'users'").run(JSON.stringify(users));
  db.close();
  console.log("AI set on", t.id, ai.provider, ai.model);
}

async function runAll() {
  const st = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const video = fs.readFileSync(arg2);
  const report = [];
  const T = client(st.teacher.cookie);

  // ——— Settings: the saved key works, the live model list comes back, and it has credit. ———
  const g = await T.get("/api/ai");
  check("teacher's AI is in use", g.ai?.active === "gemini", g);
  const t0 = Date.now();
  const k = await T.post("/api/ai", { provider: "gemini" });
  check("saved key checks out and lists models", k.ok && k.models?.length > 0, k);
  check("key has credit", k.ai?.providers?.gemini?.status?.state === "ready", k.ai?.providers?.gemini);
  report.push(`## Settings\n- Key check + model list: ${Date.now() - t0} ms, ${k.models?.length} models; in use: ${k.ai?.providers?.gemini?.model}; status: ${k.ai?.providers?.gemini?.status?.state}`);
  report.push(`- First models: ${(k.models ?? []).slice(0, 8).map((m) => m.id).join(", ")}`);

  const S = (flow, who) => ({ ...st.courses[flow].S[who], c: client(st.courses[flow].S[who].cookie) });
  const view = async (s, cid) => courseOf(await s.c.state(`${cid}?as=${s.id}`));
  async function upload(s) {
    const fd = new FormData();
    fd.append("file", new File([video], "take.webm", { type: "video/webm" }));
    const r = await s.c.post("/api/upload", fd);
    check("video uploads", r.ok, r);
    return r.url;
  }
  const TRANSCRIPT = "Hi everyone. Um, my name is Maya, and I'm, uh, a data analyst who, like, turns messy spreadsheets into decisions people can actually use. So, um, last year I helped our clinic cut patient wait times by, uh, twenty percent, just by looking at when people really showed up. What I love is, um, that moment when a chart makes someone go, oh, now I get it. I'm looking for a role where I can, like, do that every day, on a team that cares about the people behind the numbers. Thanks.";
  const jobs = []; // { flow, cid, who, s, title, what, startedAt }

  async function handIn(flow, who, re, what, { output, videoFps, transcript, post, reply } = {}) {
    const { cid } = st.courses[flow];
    const s = S(flow, who);
    const c = await view(s, cid);
    const m = modulesOf(c).find((x) => re.test(x.title));
    if (!m) { check(`${flow}: card ${re} for ${who}`, false, "not in the student's course"); return; }
    check(`${flow}/${m.title}: student sees AI feedback is on`, m.aiFeedback === true, m.aiFeedback);
    check(`${flow}/${m.title}: student sees it watches video (Gemini)`, m.aiWatches === true, m.aiWatches);
    if (videoFps) {
      const url = await upload(s);
      const r = await s.c.op(cid, { op: "addWork", studentId: s.id, moduleId: m.id, attachment: { kind: "video", url, name: "Video", transcript, duration: 33, fps: videoFps > 1 ? videoFps : undefined } });
      check(`${m.title}: video added`, r.ok !== false, r);
    }
    let r;
    if (post !== undefined) {
      r = await s.c.op(cid, { op: "addPost", studentId: s.id, moduleId: m.id, text: post, ...(reply ? { parentId: reply } : {}) });
      check(`${m.title}: post`, r.ok !== false, r);
    } else {
      r = await s.c.op(cid, { op: "setProgress", studentId: s.id, moduleId: m.id, status: "done", ...(output !== undefined ? { output } : {}) });
      check(`${m.title}: handed in`, r.ok !== false, r);
    }
    jobs.push({ flow, cid, who, s, m, what, startedAt: Date.now(), postId: r.post?.id });
    return r;
  }

  // ——— Flow 1 ———
  await handIn("caps1", "Maya", /^Record your 1-minute pitch/, "Pitch video, normal (1 fps), with transcript", { videoFps: 1, transcript: TRANSCRIPT });
  await handIn("caps1", "Omar", /^Record your 1-minute pitch/, "Pitch video, “look closely at my gestures” (4 fps), no transcript", { videoFps: 4 });
  const mayaPost = await handIn("caps1", "Maya", /^Pitch feedback/, "Discussion post (text only)", { post: "Here's my pitch take from the session. I'd love feedback on whether my opening grabs attention and if the clinic example is clear enough." });
  await handIn("caps1", "Maya", /^Before leaving/, "Open answer (text)", { output: "I'll cut my filler words. I'll record my pitch three times this week and count the ums each time, aiming for fewer than three." });
  await handIn("caps1", "Omar", /^Before leaving/, "Open answer, off-topic/empty-ish", { output: "idk" });

  // ——— Flow 2 ———
  await handIn("caps2", "Maya", /^Speech Starter/, "Worksheet (each writes their own)", { output: "## My first speech\n\n**Title:** Why every team needs a data translator\n\n**Who is my audience, and what do they care about?** Clinic managers; they care about wait times and staff stress.\n\n**My goal:** They agree to try one weekly data check-in.\n\n**Opening:** A story about a patient who waited 2 hours.\n\n**Three points:** 1. Data is already there. 2. Small checks beat big reports. 3. It saves staff time.\n\n**Close:** Ask them to try it for one month." });
  await handIn("caps2", "Maya", /^Learning Journal/, "Learning Journal (text)", { output: "Takeaways: open with a story, not a statistic. Strength: my examples are concrete. To improve: I rush the ending and look down at notes. Question for the session: how do I make eye contact on camera without reading?" });
  await handIn("caps2", "Omar", /^Learning Journal/, "Learning Journal, very short", { output: "it was good" });
  await handIn("caps2", "Maya", /^Record your practice/, "Practice video + transcript", { videoFps: 1, transcript: TRANSCRIPT });
  await handIn("caps2", "Maya", /^Practice Journal/, "Practice Journal (text)", { output: "I rated my recording 3/5 on the checklist: good opening story, but 9 filler words in 30 seconds and I never paused. Next take: one breath after each point." });

  // ——— Wait for the feedback to land on each card ———
  const deadline = Date.now() + 240_000;
  const results = new Map();
  while (Date.now() < deadline && results.size < jobs.length) {
    await new Promise((r) => setTimeout(r, 4000));
    for (const [i, j] of jobs.entries()) {
      if (results.has(i)) continue;
      const p = (await j.s.c.state(`${j.cid}?as=${j.s.id}`)).progress?.[j.s.id]?.[j.m.id];
      if (p?.ai && p.ai.state !== "working") results.set(i, { ...p.ai, secs: Math.round((Date.now() - j.startedAt) / 1000) });
    }
  }

  report.push("\n## Feedback");
  for (const [i, j] of jobs.entries()) {
    const a = results.get(i);
    check(`${j.flow}/${j.m.title} (${j.who}): feedback arrived`, a?.state === "done", a ?? "still working after 4 minutes");
    if (j.what.includes("video")) check(`${j.m.title} (${j.who}): the AI watched the video`, a?.watched === true, a);
    report.push(`\n### ${j.flow === "caps1" ? "Flow 1" : "Flow 2"} · ${j.m.title} · ${j.who}\n_${j.what}_ — ${a ? `${a.state}, ~${a.secs}s, ${a.model}${a.watched ? ", watched the video" : ""}` : "no result"}\n\n${a?.text ?? a?.error ?? ""}`);
  }

  // ——— The teacher sees it too ———
  const tc = await T.state(st.courses.caps1.cid);
  const tp = tc.progress?.[st.courses.caps1.S.Maya.id] ?? tc.progress;
  const seen = JSON.stringify(tc).includes("\"ai\":{\"state\":\"done\"");
  check("teacher's course state carries the AI feedback", seen, Object.keys(tp ?? {}).slice(0, 3));

  // A reply on the discussion: does it start another round of feedback?
  if (mayaPost?.post) {
    const o = S("caps1", "Omar");
    const m = modulesOf(await view(o, st.courses.caps1.cid)).find((x) => /^Pitch feedback/.test(x.title));
    const r = await o.c.op(st.courses.caps1.cid, { op: "comment", postId: mayaPost.post.id, who: o.id, text: "Noticed: your clinic number landed. Effect: I trusted you. Try: pause after it." });
    check("Omar replies to Maya", r.ok !== false, r);
    await new Promise((res) => setTimeout(res, 1500));
    const p = (await o.c.state(`${st.courses.caps1.cid}?as=${o.id}`)).progress?.[o.id]?.[m.id];
    report.push(`\n## A reply on the discussion\nOmar's card after only replying: ai = ${JSON.stringify(p?.ai ? { state: p.ai.state } : null)}`);
  }

  fs.writeFileSync(arg3, report.join("\n"));
  console.log(`${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  ✗", f);
}

if (phase === "setup") await setup();
else if (phase === "inject") await inject();
else if (phase === "run") await runAll();
else console.log("usage: setup | inject | run");
