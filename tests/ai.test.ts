// AI feedback with each teacher's own key, against stand-in AI services (no real keys, nothing sent anywhere).
// Runs in a throwaway folder so it never touches real data:
//   d=$(mktemp -d) && (cd "$d" && npx tsx --tsconfig <repo>/tsconfig.json <repo>/tests/ai.test.ts)
import fs from "fs";
import path from "path";
import { db } from "../lib/store";
import { makeCourse } from "../lib/newcourse";
import { aiFor, isLocalCli, listModels, LOCAL_KEY, openKey, sealKey, startAiFeedback } from "../lib/aifeedback";
import { cleanCard } from "../lib/cleancard";
import { noteOf, rankModels } from "../lib/aimeta";
import { probe } from "../lib/aifeedback";
import { startSession } from "../lib/auth";
import { GET as aiGet, POST as aiPost } from "../app/api/ai/route";
import { GET as toolsGet } from "../app/api/connectors/route";
import { ai as tutor } from "../lib/connectors/ai";
import { UPLOAD_DIR } from "../lib/uploads";
import type { Module, Progress } from "../lib/types";

if (!process.cwd().includes("tmp") && !process.cwd().includes("T/")) { console.error("Run this from a temporary folder (see the top of the file)."); process.exit(1); }

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) passed++; else failures.push(`${name} — ${JSON.stringify(detail)?.slice(0, 300)}`); };
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, ms = 2000) { const t = Date.now(); while (!f() && Date.now() - t < ms) await tick(); }

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let reply: (url: string, init?: RequestInit) => Response = () => new Response("{}", { status: 500 });
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => { calls.push({ url: String(url), init }); return reply(String(url), init); }) as typeof fetch;
const json = (o: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }, ...init });

async function main() {
  // Keys at rest.
  const sealed = sealKey("sk-test-123456");
  check("a key is stored encrypted", !sealed.includes("sk-test") && openKey(sealed) === "sk-test-123456", sealed);
  check("a tampered key doesn't open", openKey(sealed.slice(0, -4) + "AAAA") === null);

  // Model lists, newest first, only models that write.
  reply = () => json({ data: [{ id: "gpt-old", created: 1 }, { id: "gpt-new", created: 9 }, { id: "tts-1", created: 5 }, { id: "gpt-4o-realtime", created: 8 }, { id: "text-embedding-3", created: 7 }] });
  const om = await listModels("openai", "sk-x");
  check("OpenAI models: writers only, newest first", om.map((m) => m.id).join() === "gpt-new,gpt-old", om);
  reply = () => json({ models: [{ name: "models/gemini-a", displayName: "Gemini A", supportedGenerationMethods: ["generateContent"] }, { name: "models/text-embedding", supportedGenerationMethods: ["embedContent"] }, { name: "models/gemini-b-tts", supportedGenerationMethods: ["generateContent"] }] });
  const gm = await listModels("gemini", "AIza-x");
  check("Gemini models: ones that write", gm.length === 1 && gm[0].id === "gemini-a", gm);
  reply = () => new Response("no", { status: 401 });
  const bad = await listModels("openai", "sk-bad").then(() => "ok", (e: Error) => e.message);
  check("a refused key says so", /didn’t accept the key/.test(bad), bad);

  // A teacher, a course, an open-answer card with AI feedback on.
  const d = db();
  d.users["u-ai"] = { id: "u-ai", email: "ai@example.test", name: "AI Teacher", hash: "", salt: "", createdAt: Date.now() };
  const card = cleanCard({ id: "m-ai", type: "submit", kind: "answer", title: "Your pitch", body: "Write your one-minute pitch.", audience: { kind: "all" }, tools: [], aiFeedback: true } as Module);
  const off = cleanCard({ id: "m-off", type: "submit", kind: "answer", title: "No AI", body: "", audience: { kind: "all" }, tools: [] } as Module);
  check("the card keeps its AI switch", card.aiFeedback === true && off.aiFeedback === undefined, card.aiFeedback);
  const course = makeCourse("u-ai", "AI test", [{ id: "w1", title: "Week 1", lessons: [{ id: "l1", title: "Lesson 1", branches: {}, modules: [card, off] }] }]);
  course.students = [{ id: "s1", name: "Ann" } as never];
  const prog = ((d.progress[course.id] ??= {})["s1"] ??= {});
  const p = (prog["m-ai"] = { status: "done", output: "Hi, I'm Ann. I build tiny robots that water plants.", updatedAt: Date.now() } as Progress);

  check("no AI while the teacher hasn't connected one", aiFor(course, card) === null);
  startAiFeedback(course, card, "s1", p);
  check("so nothing starts", p.ai === undefined, p.ai);

  d.users["u-ai"].ai = { provider: "openai", model: "gpt-new", key: sealKey("sk-teacher"), tail: "cher" };
  check("a card with AI off gets none", aiFor(course, off) === null);
  calls = [];
  reply = () => json({ choices: [{ message: { content: "Works well: a clear picture.\nTry next: say who it helps." } }] });
  startAiFeedback(course, card, "s1", p);
  check("hand-in starts the AI", p.ai?.state === "working" && p.ai.model === "gpt-new", p.ai);
  await until(() => d.progress[course.id].s1["m-ai"].ai?.state !== "working");
  const got = d.progress[course.id].s1["m-ai"].ai;
  check("the feedback lands on the card", got?.state === "done" && /clear picture/.test(got.text ?? ""), got);
  const sent = JSON.parse(String(calls[0]?.init?.body ?? "{}"));
  check("the AI gets the card and the student's work", calls[0]?.url.includes("api.openai.com") && JSON.stringify(sent).includes("tiny robots") && JSON.stringify(sent).includes("Your pitch"), sent);
  check("with the teacher's own key", String((calls[0]?.init?.headers as Record<string, string>)?.Authorization) === "Bearer sk-teacher", calls[0]?.init?.headers);

  // A newer hand-in wins: the older answer arriving late is dropped.
  let release: (v: Response) => void = () => {};
  reply = () => new Promise<Response>((r) => { release = r; }) as unknown as Response;
  p.output += " Version two.";
  startAiFeedback(course, card, "s1", p);
  const first = release;
  await tick(5);
  reply = () => json({ choices: [{ message: { content: "Second look." } }] });
  p.ai!.at -= 1; // two hand-ins in the same millisecond still differ
  p.output += " Version three.";
  startAiFeedback(course, card, "s1", p);
  await until(() => d.progress[course.id].s1["m-ai"].ai?.text === "Second look.");
  first(json({ choices: [{ message: { content: "Stale." } }] }));
  await tick(50);
  check("a late answer to an older hand-in is dropped", d.progress[course.id].s1["m-ai"].ai?.text === "Second look.", d.progress[course.id].s1["m-ai"].ai);

  // An error says why, in words.
  reply = () => new Response("{}", { status: 429 });
  p.output += " Version four.";
  startAiFeedback(course, card, "s1", p);
  await until(() => d.progress[course.id].s1["m-ai"].ai?.state !== "working");
  check("a failed call says why", d.progress[course.id].s1["m-ai"].ai?.state === "error" && /limit|credit/.test(d.progress[course.id].s1["m-ai"].ai?.error ?? ""), d.progress[course.id].s1["m-ai"].ai);

  // Gemini watches the video, closer when the student asked, and deletes it after.
  d.users["u-ai"].ai = { provider: "gemini", model: "gemini-a", key: sealKey("AIza-teacher"), tail: "cher" };
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, "abc123.webm"), Buffer.alloc(1000, 1));
  p.output = "";
  p.work = [{ id: "w1", kind: "video", url: "/api/upload/abc123.webm", name: "Video", transcript: "um so I build robots", duration: 40, fps: 4 }];
  calls = [];
  reply = (url, init) => {
    if (url.includes("/upload/v1beta/files")) return new Response("{}", { status: 200, headers: { "x-goog-upload-url": "https://upload.example/u1" } });
    if (url === "https://upload.example/u1") return json({ file: { name: "files/f1", uri: "https://g/files/f1", state: "ACTIVE", mimeType: "video/webm" } });
    if (url.includes(":generateContent")) return json({ candidates: [{ content: { parts: [{ text: "Delivery: 0:12 you looked down." }] } }] });
    if (init?.method === "DELETE") return json({});
    return new Response("{}", { status: 404 });
  };
  startAiFeedback(course, card, "s1", p);
  check("Gemini marks that it's watching", p.ai?.watched === true, p.ai);
  await until(() => d.progress[course.id].s1["m-ai"].ai?.state !== "working");
  const g = d.progress[course.id].s1["m-ai"].ai;
  check("the video feedback lands", g?.state === "done" && /looked down/.test(g.text ?? "") && g.watched === true, g);
  const gen = JSON.parse(String(calls.find((c) => c.url.includes(":generateContent"))?.init?.body ?? "{}"));
  const parts = gen.contents?.[0]?.parts ?? [];
  check("the video goes with a closer look (4 frames a second)", parts[0]?.file_data?.file_uri === "https://g/files/f1" && parts[0]?.video_metadata?.fps === 4, parts[0]);
  check("and the transcript too", JSON.stringify(parts).includes("I build robots"), parts);
  await tick(20);
  check("the video is deleted at Google afterwards", calls.some((c) => c.init?.method === "DELETE" && c.url.includes("files/f1")), calls.map((c) => c.url));

  // Quiz answers and discussion posts are read too.
  const quiz = cleanCard({ id: "m-q", type: "practice", kind: "choice", title: "Check", body: "", audience: { kind: "all" }, tools: [], aiFeedback: true, questions: [{ id: "q1", text: "Best opener?", options: ["A story", "Your CV"], answer: 0 }] } as Module);
  const pq = (prog["m-q"] = { status: "done", answers: { q1: 1 }, results: { q1: false }, updatedAt: Date.now() } as Progress);
  d.users["u-ai"].ai = { provider: "openai", model: "gpt-new", key: sealKey("sk-teacher"), tail: "cher" };
  calls = [];
  reply = () => json({ choices: [{ message: { content: "ok" } }] });
  startAiFeedback(course, quiz, "s1", pq);
  await until(() => calls.length > 0);
  check("a quiz answer is read, with whether it was right", String(calls[0]?.init?.body).includes("Your CV (not right)"), calls[0]?.init?.body);

  // The model list: the most used first (newest Flash, Pro, Flash Lite), special-purpose ones left out, video marked.
  const names = ["gemini-2.5-computer-use-preview-10-2025", "gemini-robotics-er-2-preview", "gemini-4-neon", "gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.9-flash-preview", "gemini-3.5-transcribe", "gemini-omni-1.2-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash-lite", "gemini-3.5-pro", "gemini-3.7-pro-preview", "gemini-3.5-flash"];
  reply = () => json({ models: names.map((n) => ({ name: `models/${n}`, displayName: n, description: /gemini-4/.test(n) ? `The ${n} model, for agents and long tasks.` : undefined, supportedGenerationMethods: ["generateContent"] })) });
  const listed = await listModels("gemini", "AIza-x");
  check("tools for other jobs aren't offered", !listed.some((m) => /computer-use|robotics|transcribe/.test(m.id)), listed.map((m) => m.id));
  const ranked = rankModels("gemini", listed);
  check("most used: the newest stable Flash, Pro and Flash Lite", ranked.top.map((m) => m.id).join() === "gemini-3.8-flash,gemini-3.5-pro,gemini-3.6-flash-lite", ranked.top.map((m) => m.id));
  check("every model says what it's for", [...ranked.top, ...ranked.more].every((m) => m.note), [...ranked.top, ...ranked.more].filter((m) => !m.note).map((m) => m.id));
  check("the rest follow, stable before previews", ranked.more.length === listed.length - 3 && !ranked.more.some((m) => ranked.top.includes(m)), ranked.more.map((m) => m.id));
  check("Gemini models watch video", [...ranked.top, ...ranked.more].every((m) => m.video));
  const cl = rankModels("anthropic", [{ id: "claude-haiku-5-5", name: "Haiku 5.5" }, { id: "claude-sonnet-5", name: "Sonnet 5" }, { id: "claude-sonnet-5-5", name: "Sonnet 5.5" }, { id: "claude-opus-5-5", name: "Opus 5.5" }, { id: "claude-fable-5-2", name: "Fable 5.2" }]);
  check("Claude: Sonnet, Opus, Haiku first, newest of each", cl.top.map((m) => m.id).join() === "claude-sonnet-5-5,claude-opus-5-5,claude-haiku-5-5", cl.top.map((m) => m.id));
  check("Claude doesn't watch video", [...cl.top, ...cl.more].every((m) => !m.video));
  const op = rankModels("openai", [{ id: "gpt-5", name: "gpt-5" }, { id: "gpt-6", name: "gpt-6" }, { id: "gpt-6-mini", name: "gpt-6-mini" }, { id: "o4", name: "o4" }]);
  check("ChatGPT: newest main model, then its mini", op.top.map((m) => m.id).join() === "gpt-6,gpt-6-mini", op.top.map((m) => m.id));

  // Notes come from the service when it describes its models (Gemini does), so new models are described too.
  check("a model's own description is its note", noteOf("gemini", { id: "gemini-4-neon", name: "Gemini 4 Neon", description: "Our newest frontier model for agents. More text." }) === "Our newest frontier model for agents", noteOf("gemini", { id: "gemini-4-neon", name: "x", description: "Our newest frontier model for agents. More text." }));
  check("otherwise what its family is for, and when it came out", /Most capable.*released/.test(noteOf("anthropic", { id: "claude-opus-9", name: "Opus 9", created: Date.UTC(2027, 2, 1) }) ?? ""), noteOf("anthropic", { id: "claude-opus-9", name: "Opus 9", created: Date.UTC(2027, 2, 1) }));

  // Does the key have credit? One tiny request says.
  reply = () => json({ choices: [{ message: { content: "Hi" } }] });
  check("a key that answers is ready", (await probe("openai", "sk", "gpt-6")).state === "ready");
  reply = () => new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }), { status: 429 });
  check("a key without credit says so", (await probe("openai", "sk", "gpt-6")).state === "no_credit");
  reply = () => new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), { status: 429 });
  check("a Gemini key over its quota says so", (await probe("gemini", "AIza", "gemini-a")).state === "no_credit");
  reply = () => new Response("{}", { status: 403 });
  check("a refused key says so too", (await probe("gemini", "AIza", "gemini-a")).state === "bad_key");

  // Settings → AI: each service keeps its own key; switching back and forth never clears one.
  d.users["u-set"] = { id: "u-set", email: "set@example.test", name: "Set", hash: "", salt: "", createdAt: Date.now() };
  const cookie = startSession({ kind: "teacher", userId: "u-set" } as never).split(";")[0];
  const req = (body?: object) => new Request("http://x/api/ai", { method: body ? "POST" : "GET", headers: { cookie, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const services = (url: string) =>
    url.includes("generativelanguage") && url.includes("/models?") ? json({ models: [{ name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", description: "Fast. Good.", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-3.5-pro", displayName: "Gemini 3.5 Pro", supportedGenerationMethods: ["generateContent"] }] })
    : url.includes("api.openai.com/v1/models") ? json({ data: [{ id: "gpt-6", created: 9 }, { id: "gpt-6-mini", created: 9 }] })
    : url.includes(":generateContent") ? json({ candidates: [{ content: { parts: [{ text: "Hi" }] } }] })
    : url.includes("chat/completions") ? new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 })
    : new Response("{}", { status: 404 });
  reply = (url) => services(url);
  let r = await (await aiPost(req({ provider: "gemini", key: "AIza-gemini-key-1234567890" }))).json();
  check("pasting a key saves it, picks the most used model, and checks credit", r.ok && r.ai.active === "gemini" && r.ai.providers.gemini.model === "gemini-3.8-flash" && r.ai.providers.gemini.status.state === "ready" && r.ai.providers.gemini.keyTail === "7890", r);
  check("the key itself never comes back", !JSON.stringify(r).includes("AIza-gemini-key"), null);
  r = await (await aiPost(req({ provider: "gemini", model: "gemini-3.5-pro" }))).json();
  check("picking a model saves it", r.ok && r.ai.providers.gemini.model === "gemini-3.5-pro", r.ai);
  r = await (await aiPost(req({ provider: "openai", key: "sk-openai-key-abcdefghijkl" }))).json();
  check("a second service keeps its own key; out of credit is said", r.ok && r.ai.active === "openai" && r.ai.providers.openai.status.state === "no_credit" && r.ai.providers.gemini?.keyTail === "7890", r.ai);
  r = await (await aiPost(req({ provider: "gemini", use: true }))).json();
  check("switching back: the Gemini key and model are still there, and in use", r.ok && r.ai.active === "gemini" && r.ai.providers.gemini.model === "gemini-3.5-pro" && r.ai.providers.openai?.keyTail === "ijkl", r.ai);
  check("cards now use Gemini with its own key", d.users["u-set"].ai?.provider === "gemini" && openKey(d.users["u-set"].ai!.key) === "AIza-gemini-key-1234567890", d.users["u-set"].ai?.provider);
  r = await (await aiGet(req())).json();
  check("reading the setup shows both saved keys", Object.keys(r.ai.providers).sort().join() === "gemini,openai", r.ai);

  // The AI tutor's tools run on the teacher's own AI, and show as ready once it's connected.
  reply = (url) => url.includes(":generateContent") ? json({ candidates: [{ content: { parts: [{ text: "Try thinking about what the plant needs." }] } }] }) : services(url);
  const out = await tutor.invoke("ask", { question: "Why do plants need light?" }, { ai: { provider: "gemini", key: "AIza-x", model: "gemini-3.8-flash" }, moduleTitle: "Plants" });
  check("the tutor answers with the teacher's AI", out.render === "text" && /plant needs/.test((out as { text: string }).text), out);
  check("using the teacher's key", calls.some((c) => c.url.includes(":generateContent") && (c.init?.headers as Record<string, string>)["x-goog-api-key"] === "AIza-x"), null);
  const tools = await (await toolsGet(req())).json();
  const aiTool = tools.connectors.find((c: { id: string }) => c.id === "ai");
  check("with an AI connected, the AI tools are ready", aiTool?.configured === true && aiTool.usesAi === true, aiTool);
  d.users["u-none"] = { id: "u-none", email: "none@example.test", name: "None", hash: "", salt: "", createdAt: Date.now() };
  const noneCookie = startSession({ kind: "teacher", userId: "u-none" } as never).split(";")[0];
  const noneTools = await (await toolsGet(new Request("http://x/api/connectors", { headers: { cookie: noneCookie } }))).json();
  check("without one, they wait for a key", !!process.env.ANTHROPIC_API_KEY || noneTools.connectors.find((c: { id: string }) => c.id === "ai")?.configured === false, null);

  // ——— Real-key findings (CaPS run with a free Gemini key): busy answers, free limits, repeats, discussions. ———
  d.users["u-ai"].ai = { provider: "gemini", model: "gemini-a", key: sealKey("AIza-teacher"), tail: "cher", saved: { gemini: { key: sealKey("AIza-teacher"), tail: "cher", model: "gemini-a", status: { state: "ready", at: 1 } } } };
  const journal = cleanCard({ id: "m-j", type: "submit", kind: "answer", title: "Learning Journal", body: "Key takeaways.", audience: { kind: "all" }, tools: [], aiFeedback: true } as Module);
  course.weeks[0].lessons[0].modules.push(journal);
  const pj = (prog["m-j"] = { status: "done", output: "I learned to open with a story.", updatedAt: Date.now() } as Progress);
  const ok = () => json({ candidates: [{ content: { parts: [{ text: "Works well: the story." }] } }] });
  let n = 0;
  calls = [];
  reply = (url) => (url.includes(":generateContent") ? (n++ === 0 ? new Response('{"error":{"code":503,"message":"The model is overloaded."}}', { status: 503 }) : ok()) : new Response("{}", { status: 404 }));
  startAiFeedback(course, journal, "s1", pj);
  await until(() => d.progress[course.id].s1["m-j"].ai?.state !== "working", 9000);
  check("Google busy (503): it tries again and the feedback lands", d.progress[course.id].s1["m-j"].ai?.state === "done" && n === 2, { n, ai: d.progress[course.id].s1["m-j"].ai });

  calls = [];
  startAiFeedback(course, journal, "s1", pj);
  check("the same work handed in again keeps its feedback, with no new request", calls.length === 0 && pj.ai?.state === "done", { calls: calls.length, ai: pj.ai });
  pj.output = "I learned to open with a story, and to pause.";

  const daily = JSON.stringify({ error: { code: 429, message: "You exceeded your current quota", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ description: "Generate content requests per day limit exceeded on Free Tier.", quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }, { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "24816s" }] } });
  calls = [];
  reply = (url) => (url.includes(":generateContent") ? new Response(daily, { status: 429 }) : new Response("{}", { status: 404 }));
  startAiFeedback(course, journal, "s1", pj);
  await until(() => d.progress[course.id].s1["m-j"].ai?.state !== "working");
  const dj = d.progress[course.id].s1["m-j"].ai;
  check("a free key's daily limit: no retry, and the teacher is told plainly", dj?.state === "error" && /free key.*today/.test(dj.error ?? "") && calls.filter((c) => c.url.includes(":generateContent")).length === 1, { dj, calls: calls.length });
  const st = d.users["u-ai"].ai?.saved?.gemini?.status;
  check("and Settings shows the key is over its free limit", st?.state === "no_credit" && /free key/.test(st.message ?? ""), st);
  reply = (url) => (url.includes(":generateContent") ? ok() : new Response("{}", { status: 404 }));
  pj.output += " Also eye contact.";
  startAiFeedback(course, journal, "s1", pj);
  await until(() => d.progress[course.id].s1["m-j"].ai?.state !== "working");
  check("once feedback works again, Settings is back to ready", d.users["u-ai"].ai?.saved?.gemini?.status?.state === "ready", d.users["u-ai"].ai?.saved?.gemini?.status);

  const free = await probe("gemini", "AIza-x", "gemini-a").then(() => null);
  void free;
  reply = () => new Response(daily, { status: 429 });
  const pr = await probe("gemini", "AIza-x", "gemini-a");
  check("the key check also says it's a free key over today's limit", pr.state === "no_credit" && /free key/.test(pr.message ?? ""), pr);

  const wall = cleanCard({ id: "m-w", type: "wall", kind: "discussion", title: "Peer feedback", body: "Post your take, then give two people feedback.", audience: { kind: "all" }, tools: [], aiFeedback: true, wall: { replies: 2 } } as unknown as Module);
  course.weeks[0].lessons[0].modules.push(wall);
  (d.posts[course.id] ??= []).push({ id: "p-w", moduleId: "m-w", studentId: "s1", text: "My take: I open with a question.", createdAt: Date.now() });
  const pw = (prog["m-w"] = { status: "doing", updatedAt: Date.now() } as Progress);
  calls = [];
  reply = (url) => (url.includes(":generateContent") ? ok() : new Response("{}", { status: 404 }));
  startAiFeedback(course, wall, "s1", pw);
  await until(() => d.progress[course.id].s1["m-w"].ai?.state !== "working");
  const wsent = String(calls.find((c) => c.url.includes(":generateContent"))?.init?.body ?? "");
  check("a discussion post: the AI is told replies come later", /don't mention replies/.test(wsent) && wsent.includes("open with a question"), wsent.slice(0, 200));

  // The local Claude CLI stands in for a key only off the live site.
  const env = process.env as Record<string, string | undefined>;
  const was = env.NODE_ENV;
  env.NODE_ENV = "development";
  check("the local CLI key works on a local server", isLocalCli("anthropic", LOCAL_KEY) && (await listModels("anthropic", LOCAL_KEY)).some((m) => /local CLI/.test(m.name)));
  check("the local CLI key is only for Claude", !isLocalCli("openai", LOCAL_KEY));
  env.NODE_ENV = "production";
  check("the local CLI key does nothing on the live site", !isLocalCli("anthropic", LOCAL_KEY));
  env.NODE_ENV = was;

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
