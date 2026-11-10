import { uid } from "./profile";
import type { Lesson, Module, Week } from "./types";

/**
 * Deep-copy a lesson with fresh ids everywhere: lesson, cards, attachments, and version slots
 * (with recommendations and choice slots remapped), so the copy never collides with the original.
 */
export function cloneLesson(src: Lesson, title?: string): Lesson {
  const l: Lesson = structuredClone(src);
  const slotMap = new Map<string, string>();
  const slot = (s: string) => slotMap.get(s) ?? (slotMap.set(s, uid("slot-")), slotMap.get(s)!);
  l.id = uid("l-");
  if (title) l.title = title;
  l.modules = l.modules.map((m): Module => ({
    ...m,
    id: uid("m-"),
    attachments: m.attachments?.map((a) => ({ ...a, id: uid("a-") })),
    audience: m.audience.kind === "branch" ? { ...m.audience, slot: slot(m.audience.slot) } : m.audience,
  }));
  l.branches = Object.fromEntries(Object.entries(l.branches ?? {}).map(([k, v]) => [slot(k), v]));
  l.choiceSlots = l.choiceSlots?.map(slot);
  return l;
}

export function cloneWeek(src: Week, title?: string): Week {
  return { id: uid("w-"), title: title ?? `${src.title} (copy)`, lessons: src.lessons.map((l) => cloneLesson(l)) };
}
