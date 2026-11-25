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
  { id: "content", name: "Content", tint: "#3d68a6", cover: COVER.content, rule: "Words, pictures, videos, links and recordings to take in.", types: ["read"], kinds: PICKABLE.filter((k) => k.family === "content").map((k) => k.id) },
  { id: "question", name: "Question", tint: "#a0561f", cover: COVER.question, rule: "A question, answered with choices (a quiz question or a poll), in students’ own words, or in a discussion.", types: ["quiz", "practice", "submit", "wall", "studio", "group"], kinds: PICKABLE.filter((k) => k.family === "question").map((k) => k.id) },
];

export const suitOf = (t: ModuleType): (typeof SUITS)[number] => SUITS.find((s) => s.types.includes(t)) ?? SUITS[1];
/** A kind's family, as a suit (its colour and name). */
export const suitOfKind = (k: CardKind): (typeof SUITS)[number] => SUITS.find((s) => s.id === familyOf(k))!;

export const TYPE_ORDER: ModuleType[] = SUITS.flatMap((s) => s.types);

/**
 * Colours a teacher can give a card (its ⋮ menu): six soft washes like the families' own, three metals (gold, silver,
 * platinum) and three holographic foils. `tint` is the edge, label and icon; `cover` the art's wash; `frame`, for the
 * metals and foils, the card's edge as a gradient.
 */
const wash = (a: string, b: string, base: string) => `radial-gradient(55% 90% at 22% 25%, ${a} 0%, transparent 70%), radial-gradient(50% 80% at 80% 85%, ${b} 0%, transparent 70%), ${base}`;
export type CardColor = { id: string; name: string; tint: string; cover: string; frame?: string; foil?: "metal" | "holo" };
export const CARD_COLORS: CardColor[] = [
  { id: "blue", name: "Blue", tint: "#3d68a6", cover: COVER.content },
  { id: "rust", name: "Rust", tint: "#a0561f", cover: COVER.question },
  { id: "green", name: "Sage", tint: "#3f7a52", cover: wash("#bfe0c8", "#dcefe2", "#e6efe8") },
  { id: "teal", name: "Teal", tint: "#287670", cover: wash("#b0dfda", "#d5ece9", "#e3efed") },
  { id: "violet", name: "Lavender", tint: "#6a4fa8", cover: wash("#d6c9f2", "#e8e1f6", "#ece8f4") },
  { id: "rose", name: "Rose", tint: "#ad4767", cover: wash("#f3c4d2", "#f6dfe6", "#f3e7eb") },
  { id: "gold", name: "Gold", tint: "#8c6a10", foil: "metal",
    cover: "linear-gradient(135deg, #fbecb4 0%, #dcb54c 28%, #fff6d2 48%, #c89a2c 70%, #f1d88c 100%)",
    frame: "linear-gradient(135deg, #f6e3a0, #c7962a 35%, #fff3c4 55%, #b48422 80%, #ecd17c)" },
  { id: "silver", name: "Silver", tint: "#626871", foil: "metal",
    cover: "linear-gradient(135deg, #f3f4f6 0%, #c3c7cd 28%, #ffffff 48%, #a9aeb6 70%, #e6e8eb 100%)",
    frame: "linear-gradient(135deg, #eceef1, #a7acb4 35%, #ffffff 55%, #9aa0a9 80%, #e2e4e8)" },
  { id: "platinum", name: "Platinum", tint: "#4f6378", foil: "metal",
    cover: "linear-gradient(135deg, #f4f7fa 0%, #d3dce6 22%, #fdfeff 42%, #c3cedb 62%, #eef2f7 80%, #d9e1ea 100%)",
    frame: "linear-gradient(135deg, #e9eef4, #b9c6d4 30%, #ffffff 50%, #aebccb 75%, #e4eaf1)" },
  { id: "aurora", name: "Aurora", tint: "#5a54b0", foil: "holo",
    cover: "linear-gradient(120deg, #ffd3ec 0%, #d7e3ff 25%, #c9fbef 50%, #fff4c2 72%, #f1d2ff 100%)",
    frame: "linear-gradient(120deg, #ff9ad5, #8fb3ff 25%, #7ef2d4 50%, #ffe27a 75%, #d59bff)" },
  { id: "nebula", name: "Nebula", tint: "#7a3f9c", foil: "holo",
    cover: "linear-gradient(140deg, #e9d2ff 0%, #ffd0e6 30%, #cfe0ff 55%, #d7c6ff 78%, #ffc9dc 100%)",
    frame: "linear-gradient(140deg, #b46bff, #ff7fb8 30%, #6f9bff 55%, #9d72ff 78%, #ff8fb6)" },
  { id: "prism", name: "Prism", tint: "#2f6f87", foil: "holo",
    cover: "linear-gradient(110deg, #d4f6ff 0%, #e2ffd6 22%, #fff2c9 44%, #ffd6d6 66%, #e3d6ff 88%, #d4f6ff 100%)",
    frame: "linear-gradient(110deg, #5fd6ff, #9bf27a 22%, #ffd75a 44%, #ff8a8a 66%, #a98bff 88%, #5fd6ff)" },
];
export const cardColor = (m: { look?: Module["look"] }): CardColor | undefined => (m.look?.color ? CARD_COLORS.find((x) => x.id === m.look!.color) : undefined);
/** A card's family: from its kind (which every card has once loaded; older cards get theirs from their type). Its
 *  colour is the family's, or the one the teacher gave it. */
export const suitOfCard = (m: Pick<Module, "type" | "kind" | "attachments" | "poll" | "questions"> & { look?: Module["look"] }): (typeof SUITS)[number] => {
  const suit = suitOfKind(kindOf(m));
  const c = cardColor(m);
  return c ? { ...suit, tint: c.tint, cover: c.cover } : suit;
};

type Meta = { label: string; name: string; hint: string; tint: string; cover: string; outputLabel?: string; doneLabel: string };
const variant = (t: ModuleType, v: Omit<Meta, "tint" | "cover">): Meta => {
  const s = suitOf(t);
  return { ...v, tint: s.tint, cover: s.cover };
};

/** Each variant: its name, a one-line hint for the editor, and the suit's colour. */
export const TYPE_META: Record<ModuleType, Meta> = {
  read: variant("read", { label: "Read", name: "Read", hint: "Text, a handout, or a link", outputLabel: "Your thoughts (optional)", doneLabel: "Done" }),
  quiz: variant("quiz", { label: "Quiz", name: "Quiz", hint: "Quick questions to check understanding", doneLabel: "Submit" }),
  practice: variant("practice", { label: "Practice", name: "Practice", hint: "Steps to try, a timer, a recording", outputLabel: "Your practice notes", doneLabel: "Done" }),
  submit: variant("submit", { label: "Hand in", name: "Hand in", hint: "A piece of work for the teacher", outputLabel: "Your work", doneLabel: "Hand in" }),
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
