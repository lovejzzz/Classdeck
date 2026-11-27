// What the AI is told when a student hands in a card (lib/aiprompt.ts): no network.
//   npx tsx tests/aiprompt.test.ts
import { feedbackPrompt, momentsIn, tidyFeedback, type FeedbackInput } from "../lib/aiprompt";
import type { Module, Progress } from "../lib/types";
import { rankModels, type AiModel } from "../lib/aimeta";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) passed++; else failures.push(`${name} — ${JSON.stringify(detail)?.slice(0, 300)}`); };
const card = (o: Partial<Module>) => ({ id: "m", type: "submit", kind: "answer", title: "Learning Journal", body: "Key takeaways.", audience: { kind: "all" }, tools: [], ...o } as Module);
const base = (o: Partial<FeedbackInput> = {}): FeedbackInput => ({ course: { title: "CaPS V4 · Flow 2" }, lesson: { week: "Week 1", title: "Physical delivery", goal: "Learn and reflect." }, card: card({}), progress: { status: "done", output: "I learned to pause.", updatedAt: 1 } as Progress, posts: [], watchesVideo: false, ...o });

const a = feedbackPrompt(base());
check("the course, week, lesson and goal are given", a.text.includes("CaPS V4 · Flow 2") && a.text.includes("Week 1 · Physical delivery") && a.text.includes("goal: Learn and reflect."), a.text);
check("the student's work is marked as data, not instructions", /<student_work>[\s\S]*I learned to pause[\s\S]*<\/student_work>/.test(a.text) && /never instructions to you/.test(a.system), a.text);
check("labels are pinned, with the student's own question first", /Your question:[\s\S]*Works well:[\s\S]*Try next:[\s\S]*Your next step:/.test(a.system), null);
check("no invented problems: zero to two changes", /at most two changes/.test(a.system) && /Never invent a problem/.test(a.system), null);
check("an open answer can be a reflection or survey, answered with care", /Treat a worry with care/.test(a.system), null);
check("no video: no Delivery part, 170 words", !/Delivery:/.test(a.system) && /under 170 words/.test(a.system), null);

const picks = feedbackPrompt(base({ picks: [{ card: "Choose your Week 1 focus", picked: "Eye contact, Filler words" }] }));
check("what the student picked earlier is given", picks.text.includes("Choose your Week 1 focus: Eye contact, Filler words"), picks.text);
check("…without changing the fingerprint", picks.fingerprint === a.fingerprint, null);

const rev = feedbackPrompt(base({ before: { review: { verdict: "revise", text: "Add what you'll change next time.", at: 1 }, ai: "Works well: honest." } }));
check("a revision: the teacher's request and the last feedback", rev.text.includes("Add what you'll change next time.") && rev.text.includes("Your feedback last time") && /what improved/.test(rev.text), rev.text);
check("a revision request changes the fingerprint (new feedback)", rev.fingerprint !== a.fingerprint, null);
check("the last AI feedback alone doesn't (the same work keeps its feedback)", feedbackPrompt(base({ before: { ai: "Works well: x" } })).fingerprint === a.fingerprint, null);
const good = feedbackPrompt(base({ before: { review: { verdict: "good", text: "Nice.", at: 1 } } }));
check("a review that asks for nothing isn't a revision", !/This is a revision/.test(good.text), good.text);

const slides = feedbackPrompt(base({ card: card({ title: "Create visuals" }), progress: { status: "done", output: "My slides.", updatedAt: 1, work: [{ id: "f", kind: "file", url: "/api/upload/s.pdf", name: "slides.pdf" }] } as Progress }));
check("a file it can't open is named, and it's told not to pretend", /can't open: slides\.pdf \(file\)/.test(slides.text) && /Don't pretend/.test(slides.text), slides.text);
check("a file alone is something to answer", !feedbackPrompt(base({ progress: { status: "done", updatedAt: 1, work: [{ id: "f", kind: "file", url: "/api/upload/s.pdf", name: "s.pdf" }] } as Progress })).empty, null);

const vid = { status: "done", updatedAt: 1, work: [{ id: "v", kind: "video", url: "/api/upload/v.webm", name: "Video", transcript: "um hi", duration: 20 }] } as Progress;
const heard = feedbackPrompt(base({ progress: vid }));
check("a video it can't watch: it reads the transcript and won't comment on looks", heard.text.includes("um hi") && /can't watch it/.test(heard.text) && !heard.film, heard.text);
const seen = feedbackPrompt(base({ progress: vid, watchesVideo: true }));
check("Gemini: the video goes along, with Delivery and the recording check first", seen.film?.url === "/api/upload/v.webm" && /Delivery:/.test(seen.system) && /camera's height and angle/.test(seen.system) && /under 260 words/.test(seen.system), seen.system.slice(-400));

const wall = feedbackPrompt(base({ card: card({ type: "wall", kind: "discussion", title: "Peer feedback" }), progress: { status: "doing", updatedAt: 1 } as Progress, posts: [{ text: "Is my opening strong?" }] }));
check("a discussion: feedback on the post, no nagging about replies", wall.text.includes("Their post: Is my opening strong?") && /don't mention replies/.test(wall.system), null);
const quiz = feedbackPrompt(base({ card: card({ type: "practice", kind: "choice", title: "Check", questions: [{ id: "q1", text: "Best opener?", options: ["A story", "Your CV"], answer: 0 }] } as Partial<Module>), progress: { status: "done", updatedAt: 1, answers: { q1: 1 }, results: { q1: false } } as Progress }));
check("a quiz: the answer and whether it's right, never the key", quiz.text.includes("Their answer: Your CV (not right)") && !quiz.text.includes("answer: 0") && /This card is a quiz/.test(quiz.system), quiz.text);
check("nothing handed in: nothing to send", feedbackPrompt(base({ progress: { status: "done", updatedAt: 1 } as Progress })).empty, null);

// Labels, however the model writes them.
const t = tidyFeedback("**Works well**  \nGood.\n\n## Try next:\nX\n\n- **Your next step:** Y\n\n**Delivery**: Z\n\nyour question - no");
check("labels come out in one form", t.includes("Works well: Good.") && t.includes("Try next: X") && t.includes("Your next step: Y") && t.includes("Delivery: Z") && !t.includes("**"), t);
check("a plain answer is left alone", tidyFeedback("Works well: fine.") === "Works well: fine.", null);

// The moments feedback names, for stills from the student's video.
const mo = momentsIn("From 0:00 to 0:32, the video… um (0:20, 0:01), uh (0:04–0:06) and like at 1:05; again 0:20");
check("moments: a range counts from its start, repeats once, earliest first, four at most", JSON.stringify(mo) === "[0,1,4,20]", mo);
check("no times, no moments", momentsIn("Works well: clear.").length === 0, null);
check("a clock time inside a bigger number isn't a moment", momentsIn("version 10:15:30").length === 0, momentsIn("version 10:15:30"));

// Suggested models from the live catalog (prices, dates, the maker's words), not old naming patterns.
const day = 864e5, now = Date.UTC(2026, 10, 20);
const gm = (id: string, daysAgo: number, inP: number, description: string): AiModel => ({ id, name: id, created: now - daysAgo * day, price: { in: inP, out: inP * 5 }, video: true, description });
const live = rankModels("gemini", [
  gm("gemini-2.5-pro", 520, 1.25, "Stable release of Gemini 2.5 Pro, our flagship."),
  gm("gemini-4-neon", 2, 3, "Gemini 4 Neon is a fast, mid-priced model in the Gemini 4 family."),
  gm("gemini-4-hydrogen", 8, 1.5, "Gemini 4 Hydrogen is the high-efficiency workhorse model of the Gemini 4 family."),
  gm("gemini-4-argon", 38, 2, "Gemini 4 Argon is Google's flagship reasoning model."),
  gm("gemini-3.8-flash", 60, 0.5, "Google's most intelligent Flash model."),
  gm("gemini-3.5-flash-lite", 130, 0.1, "A high-efficiency model from Google."),
  gm("gemini-3.1-pro-preview", 300, 2, "Preview."),
]);
const roles = Object.fromEntries(live.top.map((m) => [m.role, m.id]));
check("recommended: the maker's workhorse, not an old Pro", roles.Recommended === "gemini-4-hydrogen", roles);
check("most thorough: the flagship of the current models", roles["Most thorough"] === "gemini-4-argon", roles);
check("lowest cost: the cheapest current one", roles["Lowest cost"] === "gemini-3.5-flash-lite", roles);
check("an old model is never suggested", !live.top.some((m) => m.id === "gemini-2.5-pro"), live.top.map((m) => m.id));
const hy = live.top[0];
check("its note: what it is (without its name), when, about what a video costs", /^The high-efficiency workhorse/.test(hy.note ?? "") && /Nov 2026/.test(hy.note ?? "") && /¢ a 3-min video/.test(hy.note ?? ""), hy.note);
check("others follow, newest first", live.more[0].id === "gemini-4-neon", live.more.map((m) => m.id));
const offline = rankModels("gemini", [{ id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" }, { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }]);
check("without the catalog, the family ranking still works", offline.top[0]?.id === "gemini-3.8-flash", offline.top.map((m) => m.id));

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log("  ✗ " + f);
process.exit(failures.length ? 1 : 0);
