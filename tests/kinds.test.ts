// Card kinds and faces, checked without a server: npx tsx tests/kinds.test.ts
import { addToGroup, asKind, faceOf, isPoll, kindOf, newCard, withKind } from "../lib/kinds";
import type { Attachment, Module } from "../lib/types";

const card = (extra: Partial<Module> = {}): Module => ({ id: "m", type: "read", title: "t", body: "", audience: { kind: "all" }, tools: [], attachments: [], ...extra });
const att = (kind: Attachment["kind"], url: string): Attachment => ({ id: "a", kind, url });
const rows: [string, boolean][] = [];
const check = (name: string, ok: boolean) => rows.push([name, ok]);

// A Content card's face follows its first piece of media.
check("no media: Text", faceOf(card({ kind: "content" })) === "text");
check("a picture: Image", faceOf(card({ kind: "content", attachments: [att("image", "/a.png")] })) === "image");
check("a YouTube link: Video", faceOf(card({ kind: "content", attachments: [att("link", "https://www.youtube.com/watch?v=x")] })) === "video");
check("a page link: Link", faceOf(card({ kind: "content", attachments: [att("link", "https://en.wikipedia.org/wiki/Cadence")] })) === "link");
check("an uploaded video: Recording", faceOf(card({ kind: "content", attachments: [att("video", "/api/upload/x.webm")] })) === "recording");

// A poll is a Choice card with no right answer.
const oldPoll = withKind(card({ type: "practice", poll: true, questions: [{ id: "q", text: "?", options: ["a", "b"], answer: 1, next: ["x", null] }] }));
check("a poll card is a Choice card with no right answer", oldPoll.kind === "choice" && oldPoll.poll === true && oldPoll.questions?.[0].answer === undefined && oldPoll.questions?.[0].next?.[0] === "x");
check("a poll looks like a poll", faceOf(oldPoll) === "poll" && isPoll(oldPoll));
check("withKind leaves a current poll alone", withKind(oldPoll) === oldPoll);
check("a rating card becomes a poll", isPoll(withKind(card({ type: "selfcheck" }))));
check("an unknown kind falls back to its type", withKind(card({ kind: "text" as never })).kind === "content");

// The right-answer switch.
const quizQ = asKind(oldPoll, "choice", false);
check("switching a poll to one-is-right gives it an answer and keeps its wiring", !quizQ.poll && quizQ.questions?.[0].answer === 0 && quizQ.questions?.[0].next?.[0] === "x" && faceOf(quizQ) === "choice");
const back = asKind(quizQ, "choice", true);
check("and back to a poll drops the answer", back.poll === true && back.questions?.[0].answer === undefined);
check("turning a poll into Content drops poll and questions", (() => { const c = asKind(oldPoll, "content"); return !c.poll && !c.questions && c.type === "read"; })());
check("a quiz stays a quiz", kindOf(card({ type: "quiz" })) === "choice" && asKind(card({ type: "quiz", questions: [{ id: "q", text: "?", options: ["a", "b"], answer: 0 }] }), "choice").type === "quiz");

// Adding a question to a card group.
const g = card({ id: "g", kind: "group", type: "group", members: ["a", "b"] });
const l = { modules: [card({ id: "x" }), g, card({ id: "a" }), card({ id: "b" }), card({ id: "y" })] };
const { lesson: l2, card: added } = addToGroup(l, "g");
check("the new question goes right after the group's last card", l2.modules.map((m) => m.id).join() === `x,g,a,b,${added.id},y`);
check("and joins the group", l2.modules.find((m) => m.id === "g")?.members?.join() === `a,b,${added.id}`);
check("it is a Choice card with a right answer, named in order", added.kind === "choice" && !added.poll && added.title === "Question 3" && added.questions?.[0].answer === 0);
check("a new poll card", isPoll(newCard("choice", undefined, true)) && newCard("choice", undefined, true).title === "New Poll card");

const failed = rows.filter(([, ok]) => !ok);
for (const [n] of failed) console.log("  ✗", n);
console.log(`${rows.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
