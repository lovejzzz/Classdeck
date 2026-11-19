import { uid } from "./profile";
import type { Lesson, Module, Week } from "./types";

/**
 * Deep-copy a lesson with fresh ids everywhere: lesson, cards, attachments, and version slots
 * (with recommendations and choice slots remapped), so the copy never collides with the original.
 * Card trees: wires between copied cards point at the copies; a wire to a card outside what's being copied keeps
 * pointing at that card. Pass `ids` to share one map across several lessons (a whole week).
 */
export function cloneLesson(src: Lesson, title?: string, ids?: Map<string, string>): Lesson {
  const l: Lesson = structuredClone(src);
  const slotMap = new Map<string, string>();
  const slot = (s: string) => slotMap.get(s) ?? (slotMap.set(s, uid("slot-")), slotMap.get(s)!);
  l.id = uid("l-");
  if (title) l.title = title;
  const map = ids ?? new Map<string, string>();
  for (const m of l.modules) if (!map.has(m.id)) map.set(m.id, uid("m-"));
  const to = (x: string | null) => (x ? (map.get(x) ?? x) : null);
  l.modules = l.modules.map((m): Module => ({
    ...m,
    id: map.get(m.id)!,
    questions: m.questions?.map((q) => (q.next ? { ...q, next: q.next.map(to) } : q)),
    bands: m.bands?.map((b) => ({ ...b, next: to(b.next) })),
    // A copy starts without a due date; the old date would make every copied card overdue at once.
    due: undefined,
    attachments: m.attachments?.map((a) => ({ ...a, id: uid("a-") })),
    audience: m.audience.kind === "branch" ? { ...m.audience, slot: slot(m.audience.slot) } : m.audience,
  }));
  l.branches = Object.fromEntries(Object.entries(l.branches ?? {}).map(([k, v]) => [slot(k), v]));
  l.choiceSlots = l.choiceSlots?.map(slot);
  return l;
}

export function cloneWeek(src: Week, title?: string): Week {
  // One id map for the whole week, so wires from one lesson to a later one land on the copies.
  const ids = new Map<string, string>();
  for (const l of src.lessons) for (const m of l.modules) ids.set(m.id, uid("m-"));
  return { id: uid("w-"), title: title ?? `${src.title} (copy)`, lessons: src.lessons.map((l) => cloneLesson(l, undefined, ids)) };
}
