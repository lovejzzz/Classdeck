import type { ModuleType, Status } from "./types";
import type { ToolResult } from "./connectors/types";

export const TYPE_ORDER: ModuleType[] = ["read", "explore", "practice", "submit", "selfcheck", "studio", "wall", "quiz", "reflect"];

/** 每种模块：一个单色图标，一个用于封面的柔和渐变。颜色只出现在这两处。 */
export const TYPE_META: Record<
  ModuleType,
  { label: string; name: string; tint: string; cover: string; outputLabel?: string; doneLabel: string }
> = {
  read: {
    label: "Read", name: "Read", tint: "#416f9f",
    cover: "radial-gradient(55% 90% at 20% 20%, #a9cdf0 0%, transparent 70%), radial-gradient(50% 80% at 80% 90%, #f2dfa6 0%, transparent 70%), #e7edf2",
    outputLabel: "Your thoughts (optional)", doneLabel: "Done reading",
  },
  explore: {
    label: "Explore", name: "Explore", tint: "#367856",
    cover: "radial-gradient(55% 90% at 25% 30%, #bfe0c8 0%, transparent 70%), radial-gradient(45% 80% at 85% 70%, #e7e3c2 0%, transparent 70%), #e6ece5",
    outputLabel: "What you found", doneLabel: "Done",
  },
  practice: {
    label: "Practice", name: "Practice", tint: "#965f24",
    cover: "radial-gradient(55% 90% at 25% 30%, #f4ccb0 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #efe0c9 0%, transparent 70%), #efe8e1",
    outputLabel: "Your practice notes", doneLabel: "Done",
  },
  wall: {
    label: "Wall", name: "Wall", tint: "#995293",
    cover: "radial-gradient(55% 90% at 25% 30%, #e6c3df 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #cfc9ef 0%, transparent 70%), #ebe6ee",
    doneLabel: "Done",
  },
  submit: {
    label: "Assignment", name: "Assignment", tint: "#287670",
    cover: "radial-gradient(55% 90% at 25% 30%, #b7e0da 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #d9e7c9 0%, transparent 70%), #e4ecea",
    outputLabel: "Your work", doneLabel: "Hand in",
  },
  quiz: {
    label: "Quiz", name: "Quiz", tint: "#6a5ac0",
    cover: "radial-gradient(55% 90% at 30% 30%, #cbc2f0 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #e8cfe6 0%, transparent 70%), #e9e6f1",
    doneLabel: "Submit",
  },
  selfcheck: {
    label: "Self-check", name: "Self-check", tint: "#367195", outputLabel: "Notes for yourself (optional)",
    cover: "radial-gradient(55% 90% at 25% 30%, #b9d9ea 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #d8e6d2 0%, transparent 70%), #e5ecef",
    doneLabel: "Save",
  },
  studio: {
    label: "Studio", name: "Collab Studio", tint: "#ae502f",
    cover: "radial-gradient(55% 90% at 25% 30%, #f3c3ad 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #ead2e6 0%, transparent 70%), #efe6e2",
    doneLabel: "Done",
  },
  reflect: {
    label: "Reflect", name: "Reflect", tint: "#6c6976",
    cover: "radial-gradient(55% 90% at 25% 30%, #d9d6e2 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #e6e1d6 0%, transparent 70%), #ebeae8",
    outputLabel: "Your reflection (only you and your teacher can see it)", doneLabel: "Save",
  },
};

export const STATUS_LABEL: Record<Status, string> = { todo: "Not started", doing: "In progress", done: "Done" };

export function resultToText(r: ToolResult): string {
  switch (r.render) {
    case "card":
      return `${r.title}: ${r.text}`;
    case "list":
      return r.items.map((i) => `${i.title}: ${i.text}`).join("\n");
    case "table":
      return r.rows.map((row) => row.join(": ")).join("\n");
    case "text":
      return r.text;
  }
}
