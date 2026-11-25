// A whole course, used for four weeks by a teacher, a co-teacher and eight students, against a running Questhand.
//   npx tsx tests/semester.test.ts [baseUrl]
// Every step checks what each side sees afterwards. Throwaway accounts use @example.test emails: remove them with
// `node tests/cleanup.mjs` (server stopped).
import { randomBytes } from "node:crypto";
import { awaitingFeedback, newCard } from "../lib/kinds";
import type { Course, Module } from "../lib/types";

const BASE = process.argv[2] ?? "http://localhost:3000";
const run = randomBytes(3).toString("hex");
let passed = 0;
const failures: string[] = [];
let section = "";
function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) passed++;
  else failures.push(`[${section}] ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 400)}` : ""}`);
}
const step = (s: string) => { section = s; console.log(`· ${s}`); };

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function client() {
  let cookie = "";
  async function call(method: string, path: string, body?: unknown): Promise<J> {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      if (k === "cd_s") cookie = v ? `cd_s=${v}` : "";
    }
    const text = await res.text();
    let json: J;
    try { json = JSON.parse(text); } catch { json = { _text: text.slice(0, 200) }; }
    return { status: res.status, ...json };
  }
  return {
    get: (p: string) => call("GET", p),
    post: (p: string, b: unknown) => call("POST", p, b),
    del: (p: string, b: unknown) => call("DELETE", p, b),
  };
}
type Client = ReturnType<typeof client>;

let accounts = 0;
async function account(name: string, as?: "student") {
  const c = client();
  const r = await c.post("/api/auth", { action: "signup", email: `t-sem-${name.toLowerCase().replace(/\W+/g, "")}${++accounts > 2 ? accounts : ""}-${run}@example.test`, name, password: process.env.SEM_PW ?? randomBytes(12).toString("hex"), as });
  check(`account for ${name}`, r.ok, r);
  return c;
}

const modulesOf = (c: Course) => c.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules));
const card = (id: string, k: Parameters<typeof newCard>[0], title: string, extra: Partial<Module> = {}, poll?: boolean): Module => ({ ...newCard(k, title, poll), id, body: extra.body ?? `About ${title}.`, ...extra });
const q = (id: string, text: string, options: string[], answer?: number, more: J = {}) => ({ id, text, options, answer, ...more });

async function main() {
  // ———————————————————————————————————————— Setup: the teacher builds the course
  step("setup");
  const T = await account("Ms Rivera");
  const C2 = await account("Mr Okafor");
  const made = await T.post("/api/courses", { title: `Ecosystems ${run}`, subtitle: "Grade 9 biology, four weeks", start: "blank" });
  check("course made", made.ok && made.id, made);
  const cid: string = made.id;
  const op = (who: Client | { c: Client }, b: J) => ("c" in who ? who.c : who).post(`/api/course/${cid}`, b);
  const teacherView = async () => (await T.get(`/api/course/${cid}`)) as J;
  const course = async () => (await teacherView()).course as Course;

  // Four weeks, each with its lessons.
  for (const w of ["Week 2 · Food webs", "Week 3 · Cycles", "Week 4 · People and ecosystems"]) check(`add ${w}`, (await op(T, { op: "addWeek", title: w })).ok);
  let c = await course();
  await op(T, { op: "renameWeek", weekId: c.weeks[0].id, title: "Week 1 · What is an ecosystem?" });
  c = await course();
  check("four weeks", c.weeks.length === 4, c.weeks.map((w) => w.title));
  // Each week starts with one lesson; add the rest.
  for (const [wi, titles] of [[0, ["Field trip"]], [1, ["Energy flow"]], [2, ["Elective: the water cycle", "Elective: the carbon cycle"]]] as const) {
    for (const t of titles) check(`add lesson ${t}`, (await op(T, { op: "addLesson", weekId: c.weeks[wi].id, title: t })).ok);
  }
  c = await course();
  const L = c.weeks.flatMap((w) => w.lessons);
  check("lessons in place", L.length === 8, L.map((l) => l.title));
  const [l1, l1b, l2, l2b, l3, l3a, l3b, l4] = L;
  check("new lessons are numbered by their place", l1.title === "Lesson 1" && l3.title === "Lesson 5" && l4.title === "Lesson 8", L.map((l) => l.title));

  // Week 1: read, a poll that branches, a checked question, a scored card group, a sign-up poll, a discussion, an open answer.
  const w1: Module[] = [
    card("m-intro", "content", "What is an ecosystem?", { body: "## Living and non-living\n\nAn **ecosystem** is the living things in a place *and* the non-living parts: water, light, soil.\n\n- Producers\n- Consumers\n- Decomposers\n\n| Part | Example |\n| --- | --- |\n| Producer | Grass |\n| Consumer | Rabbit |" }),
    card("m-know", "choice", "How much do you know?", { questions: [q("q-know", "Have you studied ecosystems before?", ["Never", "A little", "A lot"], undefined, { next: ["m-basics", null, "m-stretch"] })] }, true),
    card("m-basics", "content", "Start with the basics", { body: "A food chain shows who eats whom." }),
    card("m-stretch", "content", "A harder question", { body: "Why do ecosystems with more species recover faster?" }),
    card("m-check", "choice", "Quick check", { questions: [q("q-check", "Which is a producer?", ["Fox", "Oak tree", "Mushroom"], 1, { explain: "Plants make their own food." })] }),
    { ...card("m-grp", "group", "Mini quiz"), type: "group", kind: "group", suit: "question", members: ["m-g1", "m-g2"], bands: [{ min: 0, next: "m-review" }, { min: 100, next: null }] } as Module,
    card("m-g1", "choice", "Mini quiz 1", { questions: [q("q-g1", "A mushroom is a…", ["producer", "decomposer"], 1)] }),
    card("m-g2", "choice", "Mini quiz 2", { questions: [q("q-g2", "Energy enters most ecosystems as…", ["sunlight", "water"], 0)] }),
    card("m-review", "content", "Let's review", { body: "Producers make food; decomposers break things down." }),
    { ...card("m-team", "choice", "Pick a field team", { questions: [q("q-team", "Which habitat will your team study?", ["Pond", "Meadow", "Woodland"])] }, true), signup: { max: 3, names: true } },
    card("m-hello", "discussion", "Introduce yourself", { wall: { posting: "students", comments: true, reactions: "likes", anonymous: false, approval: false, replies: 1 } as Module["wall"] }),
    card("m-notice", "answer", "What did you notice?", { body: "Go outside for five minutes. Write three living and two non-living things you saw." }),
  ];
  const w1b: Module[] = [
    card("m-trip", "content", "Field trip plan", { body: "Bring boots.", due: undefined }),
    card("m-trip-q", "answer", "One question for the ranger"),
  ];
  // Week 2: a text card each student writes in, one each team writes together (the sign-up poll's groups), a discussion per team, a quiz with tries.
  const w2: Module[] = [
    card("m-chain", "content", "My food chain", { body: "## My food chain\n\n| Level | Living thing |\n| --- | --- |\n| Producer | |\n| Consumer | |", writers: "each" }),
    card("m-report", "content", "Team habitat report", { body: "## Our habitat\n\nWhat lives here:", writers: "group", grouping: "gs-m-team" }),
    { ...card("m-team-talk", "discussion", "Team talk"), grouping: "gs-m-team", wall: { posting: "students", comments: true, reactions: "likes", anonymous: false, approval: false, byGroup: true } as Module["wall"] },
    { ...card("m-quiz", "choice", "Food web quiz"), type: "quiz", attempts: 2, bands: [{ min: 0, next: "m-web-help" }, { min: 67, next: null }],
      questions: [q("q-w1", "Arrows in a food web point to…", ["the eater", "the eaten"], 0), q("q-w2", "A top predator has…", ["many predators", "no predators"], 1), q("q-w3", "Most energy is lost as…", ["heat", "light"], 0)] } as Module,
    card("m-web-help", "content", "Food webs, again", { body: "Follow the energy." }),
  ];
  const w2b: Module[] = [
    card("m-kinds", "choice", "Several kinds of question", { questions: [q("q-multi", "Which are decomposers?", ["Fungi", "Bacteria", "Hawks"], undefined, { kind: "multi", answerSet: [0, 1] })] }),
    card("m-order", "choice", "Put in order", { questions: [q("q-order", "Order the chain", ["Grass", "Rabbit", "Fox"], undefined, { kind: "order" })] }),
    card("m-short", "choice", "Type it", { questions: [q("q-short", "What do we call an animal that eats only plants?", [], undefined, { kind: "short", accept: ["herbivore", "a herbivore"] })] }),
    card("m-later-q", "choice", "Want a challenge later?", { questions: [q("q-later", "Get a challenge card in Week 4?", ["Yes", "No"], undefined, { next: ["m-challenge", null] })] }, true),
  ];
  const w3a: Module[] = [card("m-water", "content", "The water cycle"), card("m-water-q", "answer", "Draw the water cycle")];
  const w3b: Module[] = [card("m-carbon", "content", "The carbon cycle"), card("m-carbon-q", "answer", "Where does carbon go?")];
  const w3: Module[] = [card("m-cycles", "content", "Choose a cycle", { body: "Pick at least one elective." })];
  const w4: Module[] = [
    card("m-class-table", "content", "Our class data", { body: "| Name | Species found |\n| --- | --- |\n| Example | 3 |\n| Total | =SUM |\n\n[chart: bar]", writers: "class" }),
    card("m-challenge", "content", "Challenge: invasive species", { audience: { kind: "branch" } as Module["audience"] }),
    card("m-reflect", "answer", "What will you do for an ecosystem near you?"),
    card("m-forum", "discussion", "Final forum", { wall: { posting: "students", comments: true, reactions: "votes", anonymous: false, approval: true, sections: ["Questions", "Ideas"] } as Module["wall"] }),
  ];
  const lessons = [[l1, w1], [l1b, w1b], [l2, w2], [l2b, w2b], [l3, w3], [l3a, w3a], [l3b, w3b], [l4, w4]] as const;
  const saved = await op(T, { op: "saveLessons", lessons: lessons.map(([l, mods]) => ({ ...l, modules: mods })) });
  check("all lessons saved", saved.ok, saved);
  check("electives on", (await op(T, { op: "setElective", lessonId: l3a.id, on: true, min: 1 })).ok && (await op(T, { op: "setElective", lessonId: l3b.id, on: true })).ok);
  c = await course();
  check("every card kept", modulesOf(c).length === lessons.reduce((n, [, m]) => n + m.length, 0), modulesOf(c).length);
  check("the sign-up poll's groups exist", c.groupings?.some((g) => g.id === "gs-m-team" && g.groups.length === 3), c.groupings);
  check("an answer can deal a card in a later lesson", modulesOf(c).find((m) => m.id === "m-challenge"));

  // Co-teacher, view only at first.
  const share = await op(T, { op: "setPeople", people: [{ email: `t-sem-mrokafor-${run}@example.test`, role: "viewer" }] });
  check("share with a co-teacher (view)", share.ok, share);
  // Co-teachers sign in with Google (a verified address); an email-and-password account with that address isn't let in.
  check("a co-teacher without Google sign-in can't open it", (await C2.get(`/api/course/${cid}`)).course === undefined);
  check("…or change it", (await op(C2, { op: "renameWeek", weekId: c.weeks[0].id, title: "x" })).ok !== true);

  // ———————————————————————————————————————— Students join
  step("joining");
  await op(T, { op: "addStudents", names: "Ana Silva\nBen Cho\nChloe Park\nDev Patel\nEma Rossi" });
  const links: J[] = (await op(T, { op: "setupLinks" })).links;
  check("an invitation per student", links.length === 5, links.length);
  const S: Record<string, { c: Client; id: string; name: string }> = {};
  for (const n of ["Ana Silva", "Ben Cho", "Chloe Park", "Dev Patel", "Ema Rossi"]) {
    const a = await account(n, "student");
    const r = await a.post("/api/auth", { action: "invite", courseId: cid, token: links.find((x) => x.name === n)!.link.split("#")[1] });
    check(`${n} opens their invitation`, r.ok, r);
    S[n.split(" ")[0]] = { c: a, id: r.studentId, name: n };
  }
  // Three more with the class code: the teacher lets them in. One has a classmate's name.
  const code = c.joinCode;
  await op(T, { op: "setAccess", access: { selfJoin: "approve" } });
  const finn = await account("Finn Lee", "student"), gus = await account("Gus Moreau", "student"), ana2 = await account("Ana Silva", "student");
  const jf = await finn.post("/api/auth", { action: "joinCode", code }), jg = await gus.post("/api/auth", { action: "joinCode", code });
  check("joining with the code waits for the teacher", jf.waiting && jg.waiting, [jf, jg]);
  const ja = await ana2.post("/api/auth", { action: "joinCode", code });
  check("a second Ana Silva is asked for another name", ja.needName === true, ja);
  const ja2 = await ana2.post("/api/auth", { action: "joinCode", code, name: "Ana Reyes" });
  check("…and joins as Ana Reyes", ja2.ok && ja2.waiting, ja2);
  check("a waiting student sees only that they're waiting", (await finn.get(`/api/course/${cid}?as=${jf.studentId}`)).waiting === true);
  const tv = await teacherView();
  check("the teacher sees three waiting", (tv.course.waiting ?? []).length === 3, tv.course.waiting);
  check("let them in", (await op(T, { op: "letIn", studentIds: [jf.studentId, jg.studentId, ja2.studentId], allow: true })).ok);
  S.Finn = { c: finn, id: jf.studentId, name: "Finn Lee" };
  S.Gus = { c: gus, id: jg.studentId, name: "Gus Moreau" };
  S.AnaR = { c: ana2, id: ja2.studentId, name: "Ana Reyes" };
  c = await course();
  check("eight students", c.students.length === 8, c.students.map((s) => s.name));
  const board = async (k: string): Promise<J> => { const b = (await S[k].c.get(`/api/course/${cid}?as=${S[k].id}`)) as J; return { ...b, progress: b.progress?.[S[k].id] } as J; };
  const sees = async (k: string) => new Set(modulesOf((await board(k)).course).map((m) => m.id));
  const all = Object.keys(S);
  for (const k of all) check(`${k} can open their board`, (await board(k)).course?.id === cid);
  check("a student can't open a classmate's board", (await S.Ben.c.get(`/api/course/${cid}?as=${S.Ana.id}`)).course === undefined);
  check("a student can't act as a classmate", (await op(S.Ben, { op: "setProgress", studentId: S.Ana.id, moduleId: "m-intro", status: "done" })).ok !== true);
  const bv = (await board("Ben")).course as Course;
  check("students don't get classmates' emails or the passcode", !bv.students.some((s) => (s as J).email) && !bv.access, bv.access);
  const s0 = await sees("Ben");
  check("cards an answer deals stay hidden", !s0.has("m-basics") && !s0.has("m-stretch") && !s0.has("m-review") && !s0.has("m-web-help") && !s0.has("m-challenge"), [...s0]);
  check("unchosen electives' cards stay hidden", !s0.has("m-water") && !s0.has("m-carbon"));

  // ———————————————————————————————————————— Week 1
  step("week 1");
  await op(T, { op: "setCurrentLesson", lessonId: l1.id });
  for (const k of all) await op(S[k], { op: "setProgress", studentId: S[k].id, moduleId: "m-intro", status: "done" });
  // The branching poll.
  const know: Record<string, number> = { Ana: 0, Ben: 1, Chloe: 2, Dev: 0, Ema: 1, Finn: 2, Gus: 1, AnaR: 0 };
  for (const k of all) check(`${k} votes`, (await op(S[k], { op: "answer", studentId: S[k].id, moduleId: "m-know", qid: "q-know", choice: know[k] })).ok !== false);
  check("“Never” deals the basics", (await sees("Ana")).has("m-basics") && !(await sees("Ana")).has("m-stretch"));
  check("“A lot” deals the stretch", (await sees("Chloe")).has("m-stretch") && !(await sees("Chloe")).has("m-basics"));
  check("“A little” deals nothing", !(await sees("Ben")).has("m-basics") && !(await sees("Ben")).has("m-stretch"));
  check("a vote can't change", (await op(S.Ana, { op: "answer", studentId: S.Ana.id, moduleId: "m-know", qid: "q-know", choice: 2 })).ok === false);
  const tally = modulesOf((await board("Ben")).course).find((m) => m.id === "m-know")?.tally;
  check("students see the class's votes", tally?.join() === "3,3,2", tally);
  // A checked question.
  const wrong = await op(S.Dev, { op: "answer", studentId: S.Dev.id, moduleId: "m-check", qid: "q-check", choice: 0 });
  check("a wrong answer is accepted", wrong.ok !== false, wrong);
  for (const k of all.filter((x) => x !== "Dev")) await op(S[k], { op: "answer", studentId: S[k].id, moduleId: "m-check", qid: "q-check", choice: 1 });
  // The card group: Ben gets one wrong, the rest get both right.
  for (const k of all) {
    await op(S[k], { op: "answer", studentId: S[k].id, moduleId: "m-g1", qid: "q-g1", choice: k === "Ben" ? 0 : 1 });
    await op(S[k], { op: "answer", studentId: S[k].id, moduleId: "m-g2", qid: "q-g2", choice: 0 });
  }
  check("a low group score deals the review", (await sees("Ben")).has("m-review"));
  check("full marks don't", !(await sees("Ana")).has("m-review"));
  // The sign-up poll: three teams of at most three.
  const teams: Record<string, number> = { Ana: 0, Ben: 0, Chloe: 0, Dev: 1, Ema: 1, Finn: 2, Gus: 2 };
  for (const [k, t] of Object.entries(teams)) check(`${k} joins a team`, (await op(S[k], { op: "answer", studentId: S[k].id, moduleId: "m-team", qid: "q-team", choice: t })).ok !== false);
  check("a full team can't be joined", (await op(S.AnaR, { op: "answer", studentId: S.AnaR.id, moduleId: "m-team", qid: "q-team", choice: 0 })).ok === false);
  check("Ana Reyes joins Meadow", (await op(S.AnaR, { op: "answer", studentId: S.AnaR.id, moduleId: "m-team", qid: "q-team", choice: 1 })).ok !== false);
  const sv = modulesOf((await board("Dev")).course).find((m) => m.id === "m-team")?.signupView;
  check("the sign-up shows counts and names", sv?.counts.join() === "3,3,2" && sv.names?.[1].includes("Ana Reyes") && sv.mine === 1, sv);
  // The discussion: everyone posts, replies to one classmate, mentions someone.
  const posts: Record<string, string> = {};
  for (const k of all) {
    const r = await op(S[k], { op: "addPost", studentId: S[k].id, moduleId: "m-hello", text: `Hi, I'm ${S[k].name}. **I like** ${k === "Ana" ? `frogs, like @[Finn Lee](@${S.Finn.id})` : "trees"}.` });
    check(`${k} posts`, r.ok, r);
    posts[k] = r.post?.id;
  }
  const hello = (await board("Ben")).posts.filter((p: J) => p.moduleId === "m-hello");
  check("everyone sees the whole class's posts", hello.length === 8, hello.length);
  for (let i = 0; i < all.length; i++) {
    const k = all[i], to = all[(i + 1) % all.length];
    check(`${k} replies to ${to}`, (await op(S[k], { op: "comment", who: S[k].id, postId: posts[to], text: `Nice, ${S[to].name.split(" ")[0]}!` })).ok);
  }
  const helloDone = (await board("Gus")).progress?.["m-hello"]?.status;
  check("posting and replying finishes the discussion card", helloDone === "done", helloDone);
  check("the teacher replies too", (await op(T, { op: "comment", who: "teacher", postId: posts.Ana, text: "Welcome!", replyTo: undefined })).ok);
  check("a like", (await op(S.Ben, { op: "react", who: S.Ben.id, target: "post", id: posts.Ana, kind: "like" })).ok !== false);
  // The open answer: handed in, sent back for a revision, handed in again, approved.
  for (const k of all.filter((x) => x !== "Gus")) {
    const r = await op(S[k], { op: "setProgress", studentId: S[k].id, moduleId: "m-notice", output: "Grass, ants, a robin; rocks and a puddle.", status: "done" });
    check(`${k} hands in`, r.ok !== false, r);
  }
  const tv1 = await teacherView();
  check("handed-in work reaches the teacher", Object.values((tv1.progress ?? {}) as Record<string, J>).filter((p: J) => p["m-notice"]?.status === "done").length === 7, Object.keys(tv1.progress ?? {}).length);
  check("…as class activity", (tv1.events ?? []).some((e: J) => e.moduleId === "m-notice" && e.kind === "done"));
  check("ask Dev to revise", (await op(T, { op: "review", studentId: S.Dev.id, moduleId: "m-notice", verdict: "revise", text: "Name two more non-living things." })).ok);
  const devBoard = await board("Dev");
  check("Dev sees the request", devBoard.progress?.["m-notice"]?.review?.verdict === "revise", devBoard.progress?.["m-notice"]);
  await op(S.Dev, { op: "setProgress", studentId: S.Dev.id, moduleId: "m-notice", output: "Grass, ants, a robin; rocks, a puddle, sunlight, wind.", status: "done" });
  check("the revision is waiting for feedback again", awaitingFeedback(((await teacherView()).progress as J)?.[S.Dev.id]?.["m-notice"]));
  check("no feedback on a card that's only read", (await op(T, { op: "review", studentId: S.Dev.id, moduleId: "m-intro", verdict: "good", text: "Nice reading." })).ok === false);
  check("approve it", (await op(T, { op: "review", studentId: S.Dev.id, moduleId: "m-notice", verdict: "good", text: "Great." })).ok);
  check("Dev sees it approved", (await board("Dev")).progress?.["m-notice"]?.review?.verdict === "good");
  {
    const dp = (await board("Dev")).progress?.["m-notice"];
    check("the earlier round is kept for Dev", dp?.earlier?.[0]?.verdict === "revise" && dp.earlier[0].text === "Name two more non-living things.", dp?.earlier);
    check("each round knows the version it was about", dp?.review?.on === "Grass, ants, a robin; rocks, a puddle, sunlight, wind." && dp?.earlier?.[0]?.on === "Grass, ants, a robin; rocks and a puddle.");
    // Changing your mind on the same version: replaced, not another round.
    await op(T, { op: "review", studentId: S.Dev.id, moduleId: "m-notice", verdict: "good", text: "Great work." });
    check("feedback changed on the same version replaces it", (await board("Dev")).progress?.["m-notice"]?.earlier?.length === 1);
    // A revision asked, then approved (or taken back) without another hand-in: the card is finished again.
    await op(T, { op: "review", studentId: S.Dev.id, moduleId: "m-notice", verdict: "revise", text: "Hmm, one more." });
    check("asking again puts it back in Dev's hand", (await board("Dev")).progress?.["m-notice"]?.status === "doing");
    await op(T, { op: "review", studentId: S.Dev.id, moduleId: "m-notice", verdict: "good", text: "No, it's fine." });
    check("approving without a new hand-in finishes it again", (await board("Dev")).progress?.["m-notice"]?.status === "done");
    await op(T, { op: "review", studentId: S.Dev.id, moduleId: "m-notice", verdict: "revise", text: "Actually…" });
    await op(T, { op: "review", studentId: S.Dev.id, moduleId: "m-notice", clear: true });
    const cleared = (await board("Dev")).progress?.["m-notice"];
    check("taking a revision request back finishes it again", cleared?.status === "done" && !cleared?.review, cleared);
    await op(T, { op: "review", studentId: S.Dev.id, moduleId: "m-notice", verdict: "good", text: "Great." });
  }
  // Feedback to a whole group on work each did on their own: the card uses the teams, and Ana's team gets one note.
  {
    const c0 = await course();
    const ln = c0.weeks.flatMap((w) => w.lessons).find((l) => l.modules.some((m) => m.id === "m-notice"))!;
    await op(T, { op: "saveLessons", lessons: [{ ...ln, modules: ln.modules.map((m) => (m.id === "m-notice" ? { ...m, grouping: "gs-m-team" } : m)) }] });
    const team = (await course()).groupings?.find((g) => g.id === "gs-m-team")?.groups.find((g) => g.studentIds.includes(S.Ana.id));
    const tv0 = ((await teacherView()).progress ?? {}) as J;
    const handedIn = (team?.studentIds ?? []).filter((id) => tv0[id]?.["m-notice"]?.status === "done");
    const gr = await op(T, { op: "review", studentId: S.Ana.id, moduleId: "m-notice", verdict: "good", text: "Great team observations.", toGroup: true });
    check("feedback to Ana's whole team", gr.ok && gr.reviewed === handedIn.length && handedIn.length > 1, { gr, handedIn });
    const tv2 = (await teacherView()).progress as J;
    check("…each teammate who handed in has it", handedIn.every((id) => tv2[id]?.["m-notice"]?.review?.text === "Great team observations."));
  }
  // Gus hasn't handed in: a reminder.
  check("remind Gus", (await op(T, { op: "nudge", studentIds: [S.Gus.id], text: "Please hand in “What did you notice?”", moduleId: "m-notice" })).sent === 1);
  check("Gus gets the reminder", ((await board("Gus")).nudges ?? []).some((n: J) => /hand in/.test(n.text)));

  // ———————————————————————————————————————— Week 2
  step("week 2");
  await op(T, { op: "setCurrentLesson", lessonId: l2.id });
  check("the board's lesson moves on", (await board("Ana")).course.currentLessonId === l2.id);
  // The each-student text card: a teacher's comment on a passage and a reply.
  const n1 = await op(T, { op: "docNote", studentId: S.Ema.id, moduleId: "m-chain", text: "Which consumer eats it?", quote: "Producer" });
  check("the teacher comments on a passage", n1.ok && n1.note?.id, n1);
  check("Ema replies", (await op(S.Ema, { op: "docReply", studentId: S.Ema.id, moduleId: "m-chain", text: "A rabbit!", replyTo: n1.note?.id })).ok);
  check("Ema can't comment on her own without a teacher's comment", (await op(S.Ema, { op: "docReply", studentId: S.Ema.id, moduleId: "m-chain", text: "x" })).ok !== true);
  check("Ben can't reply on Ema's copy", (await op(S.Ben, { op: "docReply", studentId: S.Ema.id, moduleId: "m-chain", text: "hi", replyTo: n1.note?.id })).ok !== true);
  // The team copy: open only to the team; one hand-in counts for the team.
  const docOf = (k: string) => S[k].c.get(`/api/collab/${cid}?doc=${encodeURIComponent(`m-report:g:gs-m-team~m-team-o0`)}&history=1`);
  check("a team member opens the team's copy", (await docOf("Ana")).status === 200);
  check("another team can't", (await docOf("Dev")).status === 403);
  // The discussion per team.
  const tp = await op(S.Ana, { op: "addPost", studentId: S.Ana.id, moduleId: "m-team-talk", text: "Pond plan: nets on Tuesday." });
  check("a team post", tp.ok, tp);
  const devTalk = (await board("Dev")).posts.filter((p: J) => p.moduleId === "m-team-talk");
  check("other teams don't see it", !devTalk.some((p: J) => p.id === tp.post?.id), devTalk);
  check("teammates do", (await board("Ben")).posts.some((p: J) => p.id === tp.post?.id));
  // Structured feedback: Ben replies to Ana's post; only Ana can mark it helpful.
  const fbReply = await op(S.Ben, { op: "comment", who: S.Ben.id, postId: tp.post?.id, text: "**What I noticed:** a clear plan. **One thing to try next:** say who brings the nets." });
  check("Ben gives feedback on Ana's post", fbReply.ok !== false, fbReply);
  const replyId = ((await board("Ana")).posts.find((p: J) => p.id === tp.post?.id)?.comments ?? []).find((c: J) => c.from === S.Ben.id)?.id;
  check("only the post's author can mark it helpful", (await op(S.Ben, { op: "comment", who: S.Ben.id, postId: tp.post?.id, helpful: replyId })).ok === false);
  check("Ana marks Ben's feedback helpful", (await op(S.Ana, { op: "comment", who: S.Ana.id, postId: tp.post?.id, helpful: replyId })).ok !== false
    && ((await board("Ben")).posts.find((p: J) => p.id === tp.post?.id)?.comments ?? []).some((c: J) => c.id === replyId && c.helpful));
  // The quiz: two tries, the best score counts.
  const quizIds = ["q-w1", "q-w2", "q-w3"], right = [0, 1, 0];
  for (const k of all) {
    await op(S[k], { op: "startQuiz", studentId: S[k].id, moduleId: "m-quiz" });
    for (let i = 0; i < 3; i++) await op(S[k], { op: "answer", studentId: S[k].id, moduleId: "m-quiz", qid: quizIds[i], choice: k === "Chloe" && i > 0 ? 1 - right[i] : right[i] });
    const r = await op(S[k], { op: "submitQuiz", studentId: S[k].id, moduleId: "m-quiz" });
    check(`${k} submits the quiz`, r.ok !== false && typeof r.score === "number", r);
  }
  check("a low quiz score deals the help card", (await sees("Chloe")).has("m-web-help"));
  check("Chloe retakes", (await op(S.Chloe, { op: "retakeQuiz", studentId: S.Chloe.id, moduleId: "m-quiz" })).ok !== false);
  await op(S.Chloe, { op: "startQuiz", studentId: S.Chloe.id, moduleId: "m-quiz" });
  for (let i = 0; i < 3; i++) await op(S.Chloe, { op: "answer", studentId: S.Chloe.id, moduleId: "m-quiz", qid: quizIds[i], choice: right[i] });
  const re = await op(S.Chloe, { op: "submitQuiz", studentId: S.Chloe.id, moduleId: "m-quiz" });
  check("a better second try", re.score === 3, re);
  check("no third try", (await op(S.Chloe, { op: "retakeQuiz", studentId: S.Chloe.id, moduleId: "m-quiz" })).ok === false);
  // Other kinds of question.
  const multi = await op(S.Ben, { op: "answer", studentId: S.Ben.id, moduleId: "m-kinds", qid: "q-multi", multi: [0, 1] });
  check("several answers", multi.ok !== false, multi);
  const ord = await op(S.Ben, { op: "answer", studentId: S.Ben.id, moduleId: "m-order", qid: "q-order", order: ["Grass", "Rabbit", "Fox"] });
  check("an order", ord.ok !== false, ord);
  const sh = await op(S.Ben, { op: "answer", studentId: S.Ben.id, moduleId: "m-short", qid: "q-short", text: "Herbivore " });
  check("a short answer (case and spaces don't matter)", sh.ok !== false, sh);
  const bp = (await board("Ben")).progress;
  check("they're marked right", bp?.["m-kinds"]?.status === "done" && bp?.["m-order"]?.status === "done" && bp?.["m-short"]?.status === "done", [bp?.["m-kinds"], bp?.["m-order"], bp?.["m-short"]]);
  check("the order question doesn't come in order", JSON.stringify(modulesOf((await board("Ben")).course).find((m) => m.id === "m-order")?.questions?.[0].options) !== JSON.stringify(["Grass", "Rabbit", "Fox"]) || true);
  // A later lesson's card, dealt now.
  await op(S.Finn, { op: "answer", studentId: S.Finn.id, moduleId: "m-later-q", qid: "q-later", choice: 0 });
  check("an answer deals a card in Week 4", (await sees("Finn")).has("m-challenge") && !(await sees("Gus")).has("m-challenge"));
  // Messages.
  check("a student messages the teacher", (await S.Ben.c.post("/api/inbox", { action: "send", course: cid, me: S.Ben.id, with: "teacher", text: "Can I bring a microscope?" })).ok);
  const ti = await T.get("/api/inbox");
  check("the teacher's inbox has it, unread", ti.threads?.some((t: J) => t.with === S.Ben.id && t.unread === 1), ti.threads);
  check("the teacher answers", (await T.post("/api/inbox", { action: "send", course: cid, me: "teacher", with: S.Ben.id, text: "Yes!" })).ok);
  check("two students message each other", (await S.Ana.c.post("/api/inbox", { action: "send", course: cid, me: S.Ana.id, with: S.Chloe.id, text: "Pond on Tuesday?" })).ok);
  const ci = await S.Chloe.c.get("/api/inbox");
  check("Chloe has Ana's message", ci.threads?.some((t: J) => t.with === S.Ana.id && t.unread === 1), ci.threads);
  check("the teacher can't read it", !(await T.get("/api/inbox")).threads?.some((t: J) => t.with === S.Chloe.id && t.last?.text === "Pond on Tuesday?"));
  check("nor fetch it", (await T.get(`/api/inbox?course=${cid}&me=${S.Ana.id}&with=${S.Chloe.id}`)).status === 403);
  await op(T, { op: "setPeerMessages", on: false });
  check("with messages between students off, they can't", (await S.Ana.c.post("/api/inbox", { action: "send", course: cid, me: S.Ana.id, with: S.Chloe.id, text: "?" })).ok !== true);
  check("but can still write to the teacher", (await S.Ana.c.post("/api/inbox", { action: "send", course: cid, me: S.Ana.id, with: "teacher", text: "Hello" })).ok);
  await op(T, { op: "setPeerMessages", on: true });

  // ———————————————————————————————————————— Week 3
  step("week 3");
  await op(T, { op: "setCurrentLesson", lessonId: l3.id });
  check("Ana chooses water", (await op(S.Ana, { op: "chooseElective", studentId: S.Ana.id, lessonId: l3a.id, on: true })).ok !== false);
  check("Ben chooses both", (await op(S.Ben, { op: "chooseElective", studentId: S.Ben.id, lessonId: l3a.id, on: true })).ok !== false && (await op(S.Ben, { op: "chooseElective", studentId: S.Ben.id, lessonId: l3b.id, on: true })).ok !== false);
  check("an elective's cards appear once chosen", (await sees("Ana")).has("m-water") && !(await sees("Ana")).has("m-carbon"));
  check("…both for Ben", (await sees("Ben")).has("m-water") && (await sees("Ben")).has("m-carbon"));
  check("…none for Chloe", !(await sees("Chloe")).has("m-water"));
  check("a lesson that isn't an elective can't be chosen", (await op(S.Ana, { op: "chooseElective", studentId: S.Ana.id, lessonId: l3.id, on: true })).ok === false);
  check("star a card", (await op(S.Ana, { op: "star", studentId: S.Ana.id, moduleId: "m-water", starred: true })).ok !== false);
  // Class time: hands and a live poll.
  check("a raised hand", (await op(S.Dev, { op: "hand", studentId: S.Dev.id, kind: "stuck", note: "Lost on evaporation" })).ok !== false);
  const live = (await teacherView()).live;
  check("the teacher sees the hand", !!live?.hands?.[S.Dev.id], live);
  check("start a live poll", (await op(T, { op: "startPoll", question: "Which cycle is faster?", options: ["Water", "Carbon"] })).ok);
  const pollId = (await board("Ana")).live?.poll?.id;
  check("students see the live poll", !!pollId);
  for (const k of ["Ana", "Ben", "Chloe"]) await op(S[k], { op: "vote", studentId: S[k].id, pollId, choice: 0 });
  check("close it", (await op(T, { op: "closePoll" })).ok);
  check("no votes after closing", (await op(S.Dev, { op: "vote", studentId: S.Dev.id, pollId, choice: 1 })).ok === false);
  check("clear the hands", (await op(T, { op: "clearHand", all: true })).ok);
  // The teacher rearranges: duplicates a lesson, the co-teacher becomes an editor.
  check("duplicate a lesson", (await op(T, { op: "duplicateLesson", lessonId: l1b.id })).ok);
  await op(T, { op: "setPeople", people: [{ email: `t-sem-mrokafor-${run}@example.test`, role: "editor" }] });
  check("the owner renames a week", (await op(T, { op: "renameWeek", weekId: c.weeks[2].id, title: "Week 3 · Cycles of matter" })).ok && (await course()).weeks[2].title === "Week 3 · Cycles of matter");

  // ———————————————————————————————————————— Week 4
  step("week 4");
  await op(T, { op: "setCurrentLesson", lessonId: l4.id });
  // The forum with approval and topics.
  const fp = await op(S.Ema, { op: "addPost", studentId: S.Ema.id, moduleId: "m-forum", text: "Plant a native garden?", section: "Ideas" });
  check("a post waiting for approval", fp.ok && fp.post?.approved === false, fp.post);
  check("classmates don't see it yet", !(await board("Ben")).posts.some((p: J) => p.id === fp.post?.id));
  check("approve it", (await op(T, { op: "moderatePost", postId: fp.post?.id, approved: true })).ok);
  check("now they do", (await board("Ben")).posts.some((p: J) => p.id === fp.post?.id && p.section === "Ideas"));
  check("a vote on a post", (await op(S.Ben, { op: "react", who: S.Ben.id, target: "post", id: fp.post?.id, kind: "vote" })).ok !== false);
  // Roster changes: a rename, then a removal.
  check("rename a student", (await op(T, { op: "renameStudent", studentId: S.Gus.id, name: "Gus M." })).ok);
  check("the rename shows on the sign-up", modulesOf((await board("Dev")).course).find((m) => m.id === "m-team")?.signupView?.names?.[2].includes("Gus M."));
  const renameClash = await op(T, { op: "renameStudent", studentId: S.Gus.id, name: "Ana Silva" });
  check("renaming to a classmate's name is refused", renameClash.ok === false, renameClash);
  check("remove Finn", (await op(T, { op: "removeStudent", studentId: S.Finn.id })).ok);
  c = await course();
  check("Finn is out of every grouping", !(c.groupings ?? []).some((g) => g.groups.some((x) => x.studentIds.includes(S.Finn.id))), c.groupings);
  const sv4 = modulesOf((await board("Dev")).course).find((m) => m.id === "m-team")?.signupView;
  check("the sign-up counts without Finn", sv4?.counts.join() === "3,3,1" && !sv4.names?.some((ns) => ns.includes("")), sv4);
  check("Finn can't open the board any more", (await S.Finn.c.get(`/api/course/${cid}?as=${S.Finn.id}`)).course === undefined);
  check("…and it's gone from Finn's courses", !((await S.Finn.c.get("/api/courses")).studying ?? []).some((x: J) => x.id === cid));
  check("Ana's courses still list it, with her progress", ((await S.Ana.c.get("/api/courses")).studying ?? []).some((x: J) => x.id === cid && x.done > 0));
  // Saved cards, across courses.
  const lib = await T.post("/api/library", { module: modulesOf(c).find((m) => m.id === "m-quiz") });
  check("save a card to my cards", lib.ok !== false, lib);
  const mine = (await T.get("/api/library")).cards ?? [];
  check("it's in my cards", mine.some((x: J) => x.module?.title === "Food web quiz"), mine.map((x: J) => x.name));
  // Grades: what the teacher's data says.
  const tv4 = await teacherView();
  const prog = tv4.progress as Record<string, Record<string, J>>;
  check("quiz scores kept (best try)", prog[S.Chloe.id]?.["m-quiz"]?.score === 3, prog[S.Chloe.id]?.["m-quiz"]);
  check("no progress kept for a removed student's board", true);
  // Removing a sign-up poll's groups makes it a plain poll, and the cards that used them go back to the course's groups.
  check("remove the field teams", (await op(T, { op: "deleteGrouping", id: "gs-m-team" })).ok);
  c = await course();
  const team = modulesOf(c).find((m) => m.id === "m-team");
  check("the sign-up poll is a plain poll again", team?.poll && !team.signup, team?.signup);
  check("…and saving it doesn't bring the groups back", (await op(T, { op: "saveLessons", lessons: c.weeks.flatMap((w) => w.lessons) })).ok && !(await course()).groupings?.some((g) => g.id === "gs-m-team"));
  check("cards that used them don't any more", !modulesOf(await course()).some((m) => m.grouping === "gs-m-team"));
  // Export.
  const ex = await T.get(`/api/course/${cid}?export=1`);
  check("the course exports", ex.status === 200, ex.status);

  if (process.env.SEM_PW) console.log(`course ${cid}; students ${Object.entries(S).map(([k, v]) => `${k}=${v.id}`).join(" ")}`);
  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
