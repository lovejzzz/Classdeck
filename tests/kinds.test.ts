// Card kinds and faces, checked without a server: npx tsx tests/kinds.test.ts
import { mixedOrder, wallProgress } from "../lib/grading";
import { ANSWER_FORMS, FAMILIES, addNextQuestion, addToGroup, asKind, faceMeta, faceOf, familyOf, isPoll, kindOf, newCard, withKind } from "../lib/kinds";
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

// Two kinds of card: Content and Question. A Question card is answered with choices, an open answer or a discussion.
check("two kinds of card: Content and Question", FAMILIES.map((f) => f.name).join() === "Content,Question");
check("a Question card starts with choices", FAMILIES[1].start === "choice" && newCard(FAMILIES[1].start).title === "New Question card");
check("three ways to answer a Question card", ANSWER_FORMS.map((k) => k.id).join() === "choice,answer,discussion" && ANSWER_FORMS.every((k) => familyOf(k.id) === "question"));
const swapped = asKind(asKind(card({ title: "Look", body: "words" }), "choice"), "content");
check("a card swapped to Question and back keeps its words, and has no question left", swapped.title === "Look" && swapped.body === "words" && kindOf(swapped) === "content" && !swapped.questions);

// "Add the next question": a card on its own becomes a card group with the new card; a grouped card's group grows.
const solo = { modules: [card({ id: "x", kind: "content" }), card({ id: "q1", kind: "choice", type: "practice", title: "Chords" })] };
const n1 = addNextQuestion(solo, "q1", false);
const grp = n1.lesson.modules.find((m) => m.type === "group");
check("a lone Question card becomes a card group with the next question", n1.grouped === "new" && grp?.members?.join() === `q1,${n1.card.id}` && grp?.title === "Chords" && n1.lesson.modules.map((m) => m.id).join() === `x,${grp?.id},q1,${n1.card.id}`);
const n2 = addNextQuestion(n1.lesson, n1.card.id, false);
check("the next one joins that group", n2.grouped === "joined" && n2.lesson.modules.find((m) => m.type === "group")?.members?.length === 3);
const n3 = addNextQuestion(solo, "q1", true);
check("a card an answer deals gets the next question on its own", n3.grouped === false && !n3.lesson.modules.some((m) => m.type === "group") && n3.lesson.modules[2].id === n3.card.id);
// Put-in-order questions reach students mixed up, never already solved.
const steps = ["Dm7", "G7", "Cmaj7"];
check("order options are never sent in the right order", Array.from({ length: 50 }, (_, i) => mixedOrder(steps, `q${i}`)).every((o) => o.join() !== steps.join() && [...o].sort().join() === [...steps].sort().join()));
check("an order card is labelled Put in order", faceMeta(card({ kind: "choice", type: "practice", questions: [{ id: "q", kind: "order", text: "", options: steps }] })).name === "Put in order");

// Peer review on a discussion: done once you've posted and replied to enough different classmates (not yourself, not the teacher).
const wall = [
  { id: "p1", moduleId: "w", studentId: "ada", comments: [{ from: "ben" }, { from: "ben" }] },
  { id: "p2", moduleId: "w", studentId: "ben", comments: [{ from: "ben" }] },
  { id: "p3", moduleId: "w", studentId: "teacher", comments: [{ from: "ben" }] },
  { id: "p4", moduleId: "w", studentId: "cy", comments: [] },
];
check("replies to one classmate count once, own post and teacher post don't count", wallProgress(wall, "w", "ben", 2).replied === 1 && !wallProgress(wall, "w", "ben", 2).done && wallProgress(wall, "w", "ben", 1).done);
check("no post yet: not done even with replies", !wallProgress(wall.filter((p) => p.studentId !== "ben"), "w", "ben", 1).done);

const failed = rows.filter(([, ok]) => !ok);
for (const [n] of failed) console.log("  ✗", n);
console.log(`${rows.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
