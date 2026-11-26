// AI feedback with each teacher's own key, against stand-in AI services (no real keys, nothing sent anywhere).
// Runs in a throwaway folder so it never touches real data:
//   d=$(mktemp -d) && (cd "$d" && npx tsx --tsconfig <repo>/tsconfig.json <repo>/tests/ai.test.ts)
import fs from "fs";
import path from "path";
import { db } from "../lib/store";
import { makeCourse } from "../lib/newcourse";
import { aiFor, listModels, openKey, sealKey, startAiFeedback } from "../lib/aifeedback";
import { cleanCard } from "../lib/cleancard";
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
  startAiFeedback(course, card, "s1", p);
  const first = release;
  await tick(5);
  reply = () => json({ choices: [{ message: { content: "Second look." } }] });
  p.ai!.at -= 1; // two hand-ins in the same millisecond still differ
  startAiFeedback(course, card, "s1", p);
  await until(() => d.progress[course.id].s1["m-ai"].ai?.text === "Second look.");
  first(json({ choices: [{ message: { content: "Stale." } }] }));
  await tick(50);
  check("a late answer to an older hand-in is dropped", d.progress[course.id].s1["m-ai"].ai?.text === "Second look.", d.progress[course.id].s1["m-ai"].ai);

  // An error says why, in words.
  reply = () => new Response("{}", { status: 429 });
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

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
