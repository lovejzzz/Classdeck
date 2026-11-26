import { fold } from "./cardmodel";
import type { Lesson, Module, Week } from "./types";

// The cards a "standard week" starts with. They fit any subject: the teacher swaps in their own example and task.

export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  make: () => Omit<Module, "id">;
}

const base = (m: Partial<Module> & Pick<Module, "type" | "title" | "body">): Omit<Module, "id"> => fold({ audience: { kind: "all" }, tools: [], attachments: [], ...m });

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "goal", name: "Weekly goal", description: "Each student sets a goal for the week.",
    make: () => base({ type: "submit", kind: "answer", title: "This week’s goal", body: "Read this week’s goal. Then write, in one or two sentences, what you want to get better at and how you’ll know you did.", minutes: 10 }),
  },
  {
    id: "example", name: "Watch and learn", description: "This week’s example: a video, a reading or a picture.",
    make: () => base({ type: "read", kind: "content", title: "Watch and learn", body: "Watch or read this week’s example. Note one thing that stands out to you, and why.", minutes: 15 }),
  },
  {
    id: "task", name: "Try it yourself", description: "The week’s task; students hand in what they made.",
    make: () => base({ type: "submit", kind: "answer", title: "Try it yourself", body: "Do this week’s task. Hand in what you made: a photo, a file, a recording or a few sentences.", minutes: 20 }),
  },
  {
    id: "share", name: "Share and discuss", description: "Everyone posts their work and replies to classmates.",
    make: () => base({ type: "wall", kind: "discussion", title: "Share and discuss", body: "Post your work and one question about it. Then reply to two classmates.", minutes: 15, wall: { posting: "students", comments: true, reactions: "likes", anonymous: false, approval: false, replies: 2 } }),
  },
  {
    id: "reflect", name: "Reflect and next goal", description: "What changed, what to keep, what’s next.",
    make: () => base({ type: "submit", kind: "answer", title: "Reflect and set the next goal", body: "What did you change this week? What will you keep, and what will you work on next?", minutes: 10 }),
  },
];

/** The next free number for "Week N" or "Lesson N": one past the highest in use, so names never repeat. */
export function nextNumber(titles: string[], word: "Week" | "Lesson"): number {
  const re = new RegExp(`^${word} (\\d+)\\b`);
  const used = titles.map((t) => Number(re.exec(t)?.[1] ?? NaN)).filter((n) => !Number.isNaN(n));
  return used.length ? Math.max(...used) + 1 : titles.length + 1;
}

export function standardWeek(theme: string, n: number): Week {
  const t = (id: string, patch: Partial<Module> = {}): Module => {
    const tpl = CARD_TEMPLATES.find((x) => x.id === id)!;
    return { id: `${id}-${Math.random().toString(36).slice(2, 7)}`, ...tpl.make(), ...patch };
  };
  const lesson: Lesson = {
    id: "new",
    title: theme,
    // A placeholder name ("Lesson 2") gets no goal, so the goal field invites the teacher to write one.
    goal: /^Lesson \d+$/.test(theme) ? undefined : `Practice ${theme.toLowerCase()} and share one piece of work with the class.`,
    branches: {},
    modules: [
      t("goal"),
      t("example"),
      // A small card tree to start from: a quick check (a card group of two questions) that deals a review card
      // below 60% and a stretch card at 90%+. The questions start blank, so students don't see them until the teacher
      // writes them (the map marks them "hidden until it has a question").
      { id: "qc", ...base({ type: "group", kind: "group", title: "Quick check", body: "", members: ["qc1", "qc2"], bands: [{ min: 0, next: "qc-review" }, { min: 60, next: null }, { min: 90, next: "qc-stretch" }] }) },
      { id: "qc1", ...base({ type: "practice", kind: "choice", title: "Quick check 1", body: "", questions: [{ id: "qc1q", text: "", options: ["", ""], answer: 0 }] }) },
      { id: "qc2", ...base({ type: "practice", kind: "choice", title: "Quick check 2", body: "", questions: [{ id: "qc2q", text: "", options: ["", ""], answer: 0 }] }) },
      { id: "qc-review", ...base({ type: "read", kind: "content", title: "Go over it again", body: "Go back to the example, slowly. Find the part that answers the quick check, and write down what you notice.", minutes: 10 }) },
      { id: "qc-stretch", ...base({ type: "submit", kind: "answer", title: "Stretch: try it somewhere new", body: "Use this week’s idea somewhere new of your choice, and hand in what you did.", minutes: 15 }) },
      t("task"),
      t("share"),
      t("reflect"),
    ],
  };
  return { id: "new", title: `Week ${n}`, lessons: [lesson] };
}

/**
 * Ready-made weeks to start from, shown as pictures of their card trees in the New week window. Each builds one
 * lesson named after the week's theme; every card is the teacher's to edit, and question cards that still need the
 * teacher's own question start blank (students don't see them until it's written).
 */
export interface WeekTemplate {
  id: string;
  name: string;
  /** One line: what a week like this does. */
  blurb: string;
  /** Who it suits. */
  fits: string;
  build: (theme: string, n: number) => Week;
}

const week = (theme: string, n: number, goal: string | undefined, modules: Module[]): Week => ({
  id: "new",
  title: `Week ${n}`,
  lessons: [{ id: "new", title: theme, goal: /^Lesson \d+$/.test(theme) ? undefined : goal, branches: {}, modules }],
});
const card = (id: string, m: Partial<Module> & Pick<Module, "type" | "title" | "body">): Module => ({ id, ...base(m) });
const blankChoice = (id: string, title: string): Module => card(id, { type: "practice", kind: "choice", title, body: "", questions: [{ id: `${id}q`, text: "", options: ["", ""], answer: 0 }] });

export const WEEK_TEMPLATES: WeekTemplate[] = [
  {
    id: "standard", name: "Learn, check, make",
    blurb: "A goal, an example, a quick check that deals a review or a stretch card, a task, a discussion and a reflection.",
    fits: "Most weeks, any subject",
    build: standardWeek,
  },
  {
    id: "practice", name: "Practice until it sticks",
    blurb: "A short lesson and a worked example, then three tries at a practice set. Low scores get another explanation; high scores a challenge.",
    fits: "Skills, maths, languages",
    build: (theme, n) => week(theme, n, `Get confident with ${theme.toLowerCase()}.`, [
      card("p-learn", { type: "read", kind: "content", title: "The idea", body: "This week’s idea in a few lines, with a picture or a short video.", minutes: 10 }),
      card("p-example", { type: "read", kind: "content", title: "A worked example", body: "Follow one example step by step. Notice the step that people most often skip.", minutes: 10 }),
      card("p-set", { type: "group", kind: "group", title: "Practice set", body: "", members: ["p-q1", "p-q2", "p-q3"], attempts: 3, bands: [{ min: 0, next: "p-again" }, { min: 60, next: null }, { min: 90, next: "p-challenge" }] }),
      blankChoice("p-q1", "Practice 1"),
      blankChoice("p-q2", "Practice 2"),
      blankChoice("p-q3", "Practice 3"),
      card("p-again", { type: "read", kind: "content", title: "Another way to see it", body: "The same idea explained differently. Then go back and try the practice set again.", minutes: 10 }),
      card("p-challenge", { type: "submit", kind: "answer", title: "Challenge", body: "A harder problem for when the practice set felt easy. Show your thinking.", minutes: 15 }),
      card("p-exit", { type: "submit", kind: "answer", title: "Exit ticket", body: "In one sentence: what will you remember from this week? What is still unclear?", minutes: 5 }),
    ]),
  },
  {
    id: "seminar", name: "Read and discuss",
    blurb: "A reading, a poll on where students stand that deals each side a different prompt, then a class discussion and a written response.",
    fits: "Humanities, ethics, book clubs",
    build: (theme, n) => week(theme, n, `Read closely and argue a position on ${theme.toLowerCase()}.`, [
      card("s-read", { type: "read", kind: "content", title: "The reading", body: "Read the text. Mark one passage you agree with and one you’d push back on.", minutes: 25 }),
      card("s-poll", { type: "practice", kind: "choice", poll: true, title: "Where do you stand?", body: "", questions: [{ id: "s-pollq", text: "After the reading, where do you stand?", options: ["I agree", "I’m not sure", "I disagree"], next: ["s-against", "s-both", "s-for"] }] }),
      card("s-against", { type: "submit", kind: "answer", title: "Argue the other side", body: "You agree, so make the strongest case against the reading. Then say whether it changed your mind.", minutes: 10 }),
      card("s-both", { type: "submit", kind: "answer", title: "Weigh both sides", body: "Write the best point for and the best point against. Which one weighs more for you?", minutes: 10 }),
      card("s-for", { type: "submit", kind: "answer", title: "Argue the other side", body: "You disagree, so make the strongest case for the reading. Then say whether it changed your mind.", minutes: 10 }),
      card("s-talk", { type: "wall", kind: "discussion", title: "Class discussion", body: "Post your position and your best reason. Reply to someone who stands somewhere else.", minutes: 20, wall: { posting: "students", comments: true, reactions: "likes", anonymous: false, approval: false, replies: 1 } }),
      card("s-response", { type: "submit", kind: "answer", title: "Your response", body: "A short written response: your position after the discussion, and what moved you (or didn’t).", minutes: 20 }),
    ]),
  },
  {
    id: "project", name: "Studio project",
    blurb: "A brief and inspiration, a plan, work in progress shared for feedback, the final piece, and a look back.",
    fits: "Art, design, music, writing",
    build: (theme, n) => week(theme, n, `Make a piece about ${theme.toLowerCase()} and share it with the class.`, [
      card("j-brief", { type: "read", kind: "content", title: "The brief", body: "What to make, the limits, and what a strong piece looks like.", minutes: 10 }),
      card("j-inspo", { type: "read", kind: "content", title: "Inspiration", body: "A few examples to look at. Note what you’d borrow from each.", minutes: 15 }),
      card("j-plan", { type: "submit", kind: "answer", title: "Your plan", body: "Sketch or describe what you’ll make, and the first step you’ll take.", minutes: 10 }),
      card("j-wip", { type: "wall", kind: "discussion", title: "Work in progress", body: "Post your work so far and one question about it. Give two classmates one thing that works and one to try.", minutes: 20, wall: { posting: "students", comments: true, reactions: "likes", anonymous: false, approval: false, replies: 2 } }),
      card("j-final", { type: "submit", kind: "answer", title: "Hand in the final piece", body: "Hand in what you made, with a sentence on what you changed after feedback.", minutes: 30 }),
      card("j-back", { type: "submit", kind: "answer", title: "Look back", body: "What worked? What would you do differently next time?", minutes: 10 }),
    ]),
  },
  {
    id: "paths", name: "Choose your path",
    blurb: "Students pick one of three ways in, each with its own card, then everyone shows what they made in a gallery.",
    fits: "Mixed levels, student choice",
    build: (theme, n) => week(theme, n, `Explore ${theme.toLowerCase()} your own way.`, [
      card("c-intro", { type: "read", kind: "content", title: "This week’s question", body: "The big question for the week, and the three ways in. Pick the one that pulls you.", minutes: 5 }),
      card("c-pick", { type: "practice", kind: "choice", poll: true, title: "Pick your path", body: "", questions: [{ id: "c-pickq", text: "Which path will you take?", options: ["Watch", "Read", "Make"], next: ["c-watch", "c-read", "c-make"] }] }),
      card("c-watch", { type: "read", kind: "content", title: "Path: watch", body: "A video that takes on the question. Note two moments that stood out.", minutes: 15 }),
      card("c-read", { type: "read", kind: "content", title: "Path: read", body: "A text that takes on the question. Note two lines that stood out.", minutes: 15 }),
      card("c-make", { type: "read", kind: "content", title: "Path: make", body: "Start making something that answers the question. Keep it small.", minutes: 15 }),
      card("c-show", { type: "submit", kind: "answer", title: "Show what you found", body: "Hand in what you made or noticed on your path, in any form.", minutes: 15 }),
      card("c-gallery", { type: "wall", kind: "discussion", title: "Gallery", body: "Post what you made and reply to someone who took a different path.", minutes: 15, wall: { posting: "students", comments: true, reactions: "likes", anonymous: false, approval: false, replies: 1 } }),
    ]),
  },
];
