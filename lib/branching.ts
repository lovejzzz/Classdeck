// Card trees: a choice question can deal a different follow-up card for each answer.
//
// The wiring lives on the question, beside its options: question.next[i] is the card dealt when a student picks
// option i. A card that some question deals is a follow-up: it stays off every board until a student's answer deals
// it. Follow-ups can have their own questions, so the wiring grows into a tree. Which option a student picked is
// fixed by their first answer (progress.dealt), so a retake or a changed answer never takes away a card they have.
import type { AnswerValue, Lesson, Module, Progress, Question } from "./types";

/** Question kinds that can deal cards: the ones with options a student picks. */
export const canBranch = (q: Question) => !q.kind || q.kind === "choice" || q.kind === "multi";

/** Card types that can't be dealt to some students only: they assume the whole class or group has them. */
export const SHARED_ONLY = new Set(["studio", "wall"]);

/** Every wire in a lesson: from a card's question option to the card it deals. */
export interface Wire { from: string; q: string; option: number; to: string }

export function wiresOf(lesson: { modules: Module[] }): Wire[] {
  const out: Wire[] = [];
  for (const m of lesson.modules)
    for (const q of m.questions ?? [])
      if (canBranch(q)) (q.next ?? []).forEach((to, option) => { if (to && option < q.options.length) out.push({ from: m.id, q: q.id, option, to }); });
  return out;
}

/** The cards in a lesson that are dealt by an answer (and so are hidden until then). */
export const followUps = (lesson: { modules: Module[] }) => new Set(wiresOf(lesson).map((w) => w.to));

const picked = (v: AnswerValue | undefined, option: number) => (Array.isArray(v) ? (v as number[]).includes(option) : v === option);

/**
 * The follow-up cards this student has been dealt in a lesson. A card counts only once the card that deals it is on
 * their board, so a chain deals one step at a time.
 */
export function dealtTo(lesson: { modules: Module[] }, prog: Record<string, Progress> = {}): Set<string> {
  const wires = wiresOf(lesson);
  const hidden = new Set(wires.map((w) => w.to));
  const on = new Set(lesson.modules.filter((m) => !hidden.has(m.id)).map((m) => m.id));
  const dealt = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const w of wires) {
      if (dealt.has(w.to) || !on.has(w.from)) continue;
      if (picked(prog[w.from]?.dealt?.[w.q], w.option)) {
        dealt.add(w.to);
        on.add(w.to);
        grew = true;
      }
    }
  }
  return dealt;
}

/** Whether this question deals any card (so its first answer should be kept). */
export const deals = (q: Question) => canBranch(q) && (q.next ?? []).some(Boolean);

/**
 * Clean the wiring in a lesson the teacher saved: targets must be other cards in the same lesson, not class-wide
 * activities, with no loops; anything else is dropped.
 */
export function cleanWiring(lesson: Lesson): Lesson {
  const ids = new Map(lesson.modules.map((m) => [m.id, m]));
  for (const m of lesson.modules)
    for (const q of m.questions ?? []) {
      if (!canBranch(q) || !Array.isArray(q.next)) { delete q.next; continue; }
      q.next = q.next.slice(0, q.options.length).map((to) => {
        const t = typeof to === "string" ? ids.get(to) : undefined;
        return t && t.id !== m.id && !SHARED_ONLY.has(t.type) ? t.id : null;
      });
      if (!q.next.some(Boolean)) delete q.next;
    }
  // Break loops: walk the wires from each card; an edge that leads back to a card on the current path is cut.
  const edges = () => wiresOf(lesson);
  const state = new Map<string, 1 | 2>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const w of edges().filter((x) => x.from === id)) {
      const s = state.get(w.to);
      if (s === 1) {
        const q = ids.get(w.from)!.questions!.find((x) => x.id === w.q)!;
        q.next![w.option] = null;
      } else if (!s) visit(w.to);
    }
    state.set(id, 2);
  };
  for (const m of lesson.modules) if (!state.has(m.id)) visit(m.id);
  for (const m of lesson.modules) for (const q of m.questions ?? []) if (q.next && !q.next.some(Boolean)) delete q.next;
  return lesson;
}

/** Remove a card from a lesson's wiring (it was deleted or moved away). */
export function unwire(lesson: Lesson, id: string): Lesson {
  return {
    ...lesson,
    modules: lesson.modules.map((m) =>
      m.questions?.some((q) => q.next?.includes(id))
        ? { ...m, questions: m.questions.map((q) => (q.next?.includes(id) ? { ...q, next: q.next.map((x) => (x === id ? null : x)) } : q)) }
        : m,
    ),
  };
}

/** The follow-ups a card deals, and theirs, that nothing else deals: what goes with it if it's deleted. */
export function branchBelow(lesson: { modules: Module[] }, id: string): string[] {
  const wires = wiresOf(lesson);
  const out = new Set<string>();
  const walk = (from: string) => {
    for (const w of wires.filter((x) => x.from === from)) {
      if (out.has(w.to)) continue;
      // Only if every card that deals it is the deleted card or already going.
      if (wires.filter((x) => x.to === w.to).every((x) => x.from === id || out.has(x.from) || x.from === from)) {
        out.add(w.to);
        walk(w.to);
      }
    }
  };
  walk(id);
  return [...out];
}
