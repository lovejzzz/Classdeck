import type { Lesson, Module, Week } from "./types";

// Card and week templates drawn from the recurring post types in the CaPS course plan.

export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  make: () => Omit<Module, "id">;
}

const base = (m: Partial<Module> & Pick<Module, "type" | "title" | "body">): Omit<Module, "id"> => ({ audience: { kind: "all" }, tools: [], attachments: [], ...m });

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "goal", name: "Weekly goal", description: "Set the week’s goal and what “done” looks like.",
    make: () => base({ type: "explore", title: "This week’s goal", body: "Read the goal for this week. Then write, in one or two sentences, what you want to get better at and how you’ll know you did.", minutes: 10, submitTo: "personal", criteria: "A personal goal with a way to check it." }),
  },
  {
    id: "example", name: "Watch and observe", description: "A short video or audio example with observation questions.",
    make: () => base({ type: "explore", title: "Watch and observe", body: "Watch the example. Note one thing the speaker did well, the moment it happened (a timestamp), and why it worked.", minutes: 15, submitTo: "personal", criteria: "One observation with a timestamp and a reason." }),
  },
  {
    id: "compare", name: "Hear the difference", description: "Two versions of the same thing to compare.",
    make: () => base({ type: "explore", title: "Hear the difference", body: "Listen to both versions. Which is easier to follow? Point to a specific sentence and explain what made the difference.", minutes: 10, submitTo: "personal", criteria: "A specific moment identified and explained." }),
  },
  {
    id: "takes", name: "Two comparable takes", description: "Record before and after, keep both, note a timestamp.",
    make: () => base({ type: "practice", title: "Two comparable takes", body: "Record your usual version. Change one thing on purpose and record again. Keep both, and note a timestamp where you can hear or see the change.", minutes: 20, submitTo: "personal", criteria: "Two recordings and one timestamped change." }),
  },
  {
    id: "studio", name: "Collab Studio post", description: "Post work to your group and give feedback to two peers.",
    make: () => base({ type: "studio", title: "Collab Studio", body: "Share this week’s work with your group and ask one specific question.", minutes: 60, submitTo: "studio", criteria: "Posted, and feedback given to two peers." }),
  },
  {
    id: "wall", name: "Feedback wall", description: "Everyone posts; classmates vote for the most useful.",
    make: () => base({ type: "wall", title: "Share and vote", body: "Post your answer. Then vote for the two most specific posts from your classmates.", minutes: 15, submitTo: "studio", wall: { posting: "students", comments: true, reactions: "votes", anonymous: false, approval: false } }),
  },
  {
    id: "self", name: "Self-check", description: "Rate the six skills on the four-level rubric.",
    make: () => base({ type: "selfcheck", title: "Self-check", body: "Rate yourself honestly on each skill. You’ll compare against this later.", minutes: 15, submitTo: "personal", criteria: "All skills rated." }),
  },
  {
    id: "reflect", name: "Reflect and next goal", description: "What changed, what to keep, what’s next.",
    make: () => base({ type: "reflect", title: "Reflect and set the next goal", body: "What did you change this week? How did listeners respond? What will you keep, and what will you work on next?", minutes: 10, submitTo: "personal", criteria: "One change, one thing to keep, one next goal." }),
  },
];

/** A standard CaPS week: six cards, a Guided/Stretch choice, and a 60-minute Collab Studio agenda. */
export function standardWeek(theme: string, n: number): Week {
  const t = (id: string, patch: Partial<Module> = {}): Module => {
    const tpl = CARD_TEMPLATES.find((x) => x.id === id)!;
    return { id: `${id}-${Math.random().toString(36).slice(2, 7)}`, ...tpl.make(), ...patch };
  };
  const practice = CARD_TEMPLATES.find((x) => x.id === "takes")!.make();
  const lesson: Lesson = {
    id: "new",
    title: theme,
    goal: `Practice ${theme.toLowerCase()} and bring one piece of work to Collab Studio.`,
    branches: {},
    choiceSlots: ["path"],
    session: { minutes: 60, agenda: [{ label: "Warm-up and example", minutes: 10 }, { label: "Paired practice", minutes: 10 }, { label: "Round-robin presentations and feedback", minutes: 30, roundRobin: true }, { label: "Reflection", minutes: 10 }] },
    modules: [
      t("goal"),
      t("example"),
      { id: "g", ...practice, title: `${practice.title} (guided)`, body: `${practice.body}\n\nGuided: use the prompts and keep it short, one passage and one change.`, audience: { kind: "branch", slot: "path", variant: "Guided" } },
      { id: "s", ...practice, title: `${practice.title} (stretch)`, body: `${practice.body}\n\nStretch: try a new audience or context, and explain your choices.`, audience: { kind: "branch", slot: "path", variant: "Stretch" } },
      t("studio"),
      t("reflect"),
    ],
  };
  return { id: "new", title: `Week ${n}`, lessons: [lesson] };
}
