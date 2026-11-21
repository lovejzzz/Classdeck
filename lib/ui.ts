import type { Module, ModuleType, Status } from "./types";
import { familyOf, kindOf, PICKABLE, type CardKind } from "./kinds";
import type { ToolResult } from "./connectors/types";

/**
 * Two families, like the suits of a deck: every card is Content (something to take in) or a Question (something to
 * answer). Colour belongs to the family; the kind (Text, Image, Poll, …) gives the icon. See lib/kinds.ts.
 */
export type Suit = "content" | "question";

const COVER = {
  content: "radial-gradient(55% 90% at 20% 20%, #b4cdf0 0%, transparent 70%), radial-gradient(50% 80% at 80% 90%, #d6e6f2 0%, transparent 70%), #e6ebf2",
  question: "radial-gradient(55% 90% at 25% 30%, #f4ccb0 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #efe0c9 0%, transparent 70%), #efe8e1",
};

export const SUITS: { id: Suit; name: string; tint: string; cover: string; rule: string; types: ModuleType[]; kinds: CardKind[] }[] = [
  { id: "content", name: "Content", tint: "#3d68a6", cover: COVER.content, rule: "Words, pictures, videos, links and recordings to take in.", types: ["read", "explore"], kinds: PICKABLE.filter((k) => k.family === "content").map((k) => k.id) },
  { id: "question", name: "Question", tint: "#a0561f", cover: COVER.question, rule: "A question, answered with choices (a quiz question or a poll), in students’ own words, or in a discussion.", types: ["quiz", "practice", "submit", "reflect", "builder", "selfcheck", "wall", "studio", "group"], kinds: PICKABLE.filter((k) => k.family === "question").map((k) => k.id) },
];

export const suitOf = (t: ModuleType): (typeof SUITS)[number] => SUITS.find((s) => s.types.includes(t)) ?? SUITS[1];
/** A kind's family, as a suit (its colour and name). */
export const suitOfKind = (k: CardKind): (typeof SUITS)[number] => SUITS.find((s) => s.id === familyOf(k))!;

export const TYPE_ORDER: ModuleType[] = SUITS.flatMap((s) => s.types);

/** A card's family: from its kind (which every card has once loaded; older cards get theirs from their type). */
export const suitOfCard = (m: Pick<Module, "type" | "kind" | "attachments" | "poll" | "questions">): (typeof SUITS)[number] => suitOfKind(kindOf(m));

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
  group: variant("group", { label: "Group", name: "Card group", hint: "Cards that go together; its score counts the questions with a right answer", doneLabel: "Done" }),
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

/** Colours for a card tree's paths: answer A, B, C… each have their own, used on the letter, the port and the wire. */
export const PATHS = ["#4b56a8", "#1f8a7a", "#c27a1e", "#b4466a", "#7552b8", "#2f7fb5"];
export const pathColor = (option: number) => PATHS[option % PATHS.length];
/** A score range's colour, from low (rose) through amber to high (green). */
export function bandTone(i: number, count: number): string {
  const tones = ["#c0485f", "#c27a1e", "#8a9a2a", "#2f8a55"];
  if (count <= 1) return tones[3];
  return tones[Math.round((i / (count - 1)) * (tones.length - 1))];
}
