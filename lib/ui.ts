import type { ModuleType, Status } from "./types";
import type { ToolResult } from "./connectors/types";

/**
 * Three suits, like a card game: every card is Learn, Do, or Share. Each suit has a few variants
 * (the stored ModuleType); colour belongs to the suit, the icon to the variant.
 */
export type Suit = "learn" | "do" | "share";

const COVER = {
  learn: "radial-gradient(55% 90% at 20% 20%, #b4cdf0 0%, transparent 70%), radial-gradient(50% 80% at 80% 90%, #d6e6f2 0%, transparent 70%), #e6ebf2",
  do: "radial-gradient(55% 90% at 25% 30%, #f4ccb0 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #efe0c9 0%, transparent 70%), #efe8e1",
  share: "radial-gradient(55% 90% at 25% 30%, #e6c3df 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #f0d0c8 0%, transparent 70%), #eee6ec",
};

export const SUITS: { id: Suit; name: string; tint: string; cover: string; rule: string; types: ModuleType[] }[] = [
  { id: "learn", name: "Learn", tint: "#3d68a6", cover: COVER.learn, rule: "Read, watch, and listen.", types: ["read", "explore"] },
  { id: "do", name: "Do", tint: "#a0561f", cover: COVER.do, rule: "Practice, answer, make, hand in, and look back.", types: ["practice", "quiz", "builder", "submit", "selfcheck", "reflect"] },
  { id: "share", name: "Share", tint: "#9a4a8c", cover: COVER.share, rule: "Show your work and trade feedback.", types: ["studio", "wall"] },
];

export const suitOf = (t: ModuleType): (typeof SUITS)[number] => SUITS.find((s) => s.types.includes(t)) ?? SUITS[1];

export const TYPE_ORDER: ModuleType[] = SUITS.flatMap((s) => s.types);

type Meta = { label: string; name: string; hint: string; tint: string; cover: string; outputLabel?: string; doneLabel: string };
const variant = (t: ModuleType, v: Omit<Meta, "tint" | "cover">): Meta => {
  const s = suitOf(t);
  return { ...v, tint: s.tint, cover: s.cover };
};

/** Each variant: its name, a one-line hint for the editor, and the suit's colour. */
export const TYPE_META: Record<ModuleType, Meta> = {
  read: variant("read", { label: "Read", name: "Read", hint: "Text, a handout, or a link", outputLabel: "Your thoughts (optional)", doneLabel: "Done reading" }),
  explore: variant("explore", { label: "Watch", name: "Watch & listen", hint: "A video or recording with things to notice", outputLabel: "What you found", doneLabel: "Done" }),
  quiz: variant("quiz", { label: "Quiz", name: "Quiz", hint: "Quick questions to check understanding", doneLabel: "Submit" }),
  practice: variant("practice", { label: "Practice", name: "Practice", hint: "Steps to try, a timer, a recording", outputLabel: "Your practice notes", doneLabel: "Done" }),
  builder: variant("builder", { label: "Build", name: "Builder", hint: "Build a piece step by step from a structure", doneLabel: "Done" }),
  submit: variant("submit", { label: "Hand in", name: "Hand in", hint: "A piece of work for the teacher", outputLabel: "Your work", doneLabel: "Hand in" }),
  selfcheck: variant("selfcheck", { label: "Rate", name: "Rate yourself", hint: "Students rate their own skills", outputLabel: "Notes for yourself (optional)", doneLabel: "Save" }),
  reflect: variant("reflect", { label: "Reflect", name: "Reflect", hint: "Look back: what worked, what's next", outputLabel: "Your reflection (only you and your teacher can see it)", doneLabel: "Save" }),
  studio: variant("studio", { label: "Studio", name: "Collab Studio", hint: "Small groups present and give feedback", doneLabel: "Done" }),
  wall: variant("wall", { label: "Wall", name: "Class wall", hint: "Everyone posts; the class responds", doneLabel: "Done" }),
};

export const STATUS_LABEL: Record<Status, string> = { todo: "Not started", doing: "In progress", done: "Done" };

export function resultToText(r: ToolResult): string {
  switch (r.render) {
    case "card":
      return `${r.title}: ${r.text}`;
    case "list":
      return r.items.every((i) => !i.text) ? r.items.map((i) => i.title).join(", ") : r.items.map((i) => `${i.title}: ${i.text}`).join("\n");
    case "table":
      return r.rows.map((row) => row.join(": ")).join("\n");
    case "text":
      return r.text;
    case "gallery":
      return r.items.map((i) => `${i.title}${i.credit ? ` (${i.credit})` : ""}${i.url ? `: ${i.url}` : ""}`).join("\n");
  }
}
