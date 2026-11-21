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
    make: () => base({ type: "wall", kind: "discussion", title: "Share and discuss", body: "Post your work and one question about it. Then reply to two classmates.", minutes: 15, wall: { posting: "students", comments: true, reactions: "likes", anonymous: false, approval: false } }),
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
