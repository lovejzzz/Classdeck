// What a card is, as teachers and students see it: two families, eight kinds.
//   Content cards (something to take in): Text, Image, Link (a video or audio link), Recording (made in the browser).
//   Question cards (something to answer): Q&A, Multiple choice, Poll, Discussion.
// Each kind runs on one of the stored types underneath (read, submit, quiz, practice, wall, studio), which the rest of
// the site already knows how to show and grade. Question cards are where card trees branch: each choice of a Multiple
// choice or a Poll card, and each score range of a Multiple choice card with several questions, can deal a card.
import type { Module, ModuleType, Question } from "./types";

export type Family = "content" | "question";
export type CardKind = "text" | "image" | "link" | "recording" | "answer" | "choice" | "poll" | "discussion" | "group";

export const KINDS: { id: CardKind; family: Family; name: string; hint: string; icon: string; done: string }[] = [
  { id: "text", family: "content", name: "Text", hint: "Words to read", icon: "read", done: "Done reading" },
  { id: "image", family: "content", name: "Image", hint: "A picture, a diagram, a score", icon: "image", done: "Done" },
  { id: "link", family: "content", name: "Link", hint: "A video, audio or page link", icon: "link", done: "Done" },
  { id: "recording", family: "content", name: "Recording", hint: "Video or audio you record here", icon: "mic", done: "Done" },
  { id: "answer", family: "question", name: "Q&A", hint: "Students write, record or upload", icon: "message", done: "Hand in" },
  { id: "choice", family: "question", name: "Multiple choice", hint: "Right answers; branch by answer or score", icon: "quiz", done: "Submit" },
  { id: "poll", family: "question", name: "Poll", hint: "No right answer; see how the class voted", icon: "chart", done: "Vote" },
  { id: "discussion", family: "question", name: "Discussion", hint: "Everyone posts and replies", icon: "wall", done: "Done" },
  // Not a kind you pick: made by selecting cards and merging them. Listed so its name and icon are known.
  { id: "group", family: "question", name: "Card group", hint: "Cards that go together", icon: "layers", done: "Done" },
];
/** The eight kinds a card can be (a card group is made from cards, not picked). */
export const PICKABLE = KINDS.filter((k) => k.id !== "group");
export const kindMeta = (k: CardKind) => KINDS.find((x) => x.id === k)!;
export const familyOf = (k: CardKind): Family => kindMeta(k).family;

const firstMedia = (m: Pick<Module, "attachments">) => (m.attachments ?? [])[0];
const isRecording = (a?: { kind: string; url: string; name?: string }) => !!a && (a.kind === "video" || a.kind === "audio") && !/^https?:\/\/(www\.)?(youtube|youtu\.be|vimeo)/.test(a.url);

/** A card's kind: the one stored, or (for a card from before kinds) the one its type and media point to. */
export function kindOf(m: Pick<Module, "kind" | "type" | "attachments" | "poll" | "questions">): CardKind {
  if (m.kind && KINDS.some((k) => k.id === m.kind)) return m.kind;
  switch (m.type) {
    case "group":
      return "group";
    case "read":
    case "explore": {
      if (m.questions?.some((q) => q.text?.trim())) return "choice";
      const a = firstMedia(m);
      if (!a) return "text";
      if (a.kind === "image") return "image";
      if (isRecording(a)) return "recording";
      if (a.kind === "video" || a.kind === "audio" || a.kind === "link") return "link";
      return "text";
    }
    case "quiz":
      return "choice";
    case "practice":
      return m.poll ? "poll" : m.questions?.some((q) => q.text?.trim()) ? "choice" : "answer";
    case "selfcheck":
      return "poll";
    case "wall":
    case "studio":
      return "discussion";
    default:
      return "answer"; // submit, reflect, builder
  }
}

/**
 * The stored type a kind runs on, given the card's current type. A Multiple choice card answers right away (practice);
 * one that is already a quiz (several questions, a Submit button, tries, score ranges) stays a quiz. A discussion in
 * groups runs on the group studio; one for the whole class on the wall.
 */
export function typeOfKind(k: CardKind, current?: ModuleType, inGroups = current === "studio"): ModuleType {
  if (k === "group") return "group";
  if (familyOf(k) === "content") return "read";
  if (k === "choice") return current === "quiz" ? "quiz" : "practice";
  return k === "answer" ? "submit" : k === "poll" ? "practice" : inGroups ? "studio" : "wall";
}

const qid = () => `q-${Math.random().toString(36).slice(2, 9)}`;

/**
 * A card turned into a kind: its title, instructions and media stay; what only the old kind used goes. A Multiple
 * choice card keeps its questions (or gets one to fill in); a Poll keeps one question's choices without a right answer.
 */
export function asKind(m: Module, k: CardKind): Module {
  if (k === "group" || m.type === "group") return m.type === "group" ? { ...m, kind: "group", suit: "question" } : m;
  const inGroups = m.type === "studio" || (k === "discussion" && m.submitTo === "studio");
  const next: Module = { ...m, kind: k, type: typeOfKind(k, m.type, inGroups), suit: familyOf(k) as Module["suit"] };
  // Everything that belongs to one kind only (a quiz's settings stay only on a quiz).
  if (next.type !== "quiz") { next.attempts = undefined; next.timeLimit = undefined; next.shuffle = undefined; next.pick = undefined; next.bands = undefined; }
  if (k !== "poll") next.poll = undefined;
  if (k !== "discussion") next.wall = undefined;
  if (k === "choice") {
    const qs = (m.questions ?? []).filter((q) => q.text?.trim() || q.options.some((o) => o.trim()));
    next.questions = qs.length ? qs.map((q) => (q.answer === undefined && !q.answerSet && !q.accept && (!q.kind || q.kind === "choice") ? { ...q, answer: 0 } : q)) : [{ id: qid(), text: "", options: ["", ""], answer: 0 }];
    if (next.type === "quiz") next.attempts ??= 2;
  } else if (k === "poll") {
    const q = (m.questions ?? []).find((x) => !x.kind || x.kind === "choice" || x.kind === "multi");
    const fromRating = m.type === "selfcheck" && !q;
    const poll: Question = q
      ? { id: q.id, text: q.text, options: q.options, next: q.next }
      : { id: qid(), text: fromRating ? "How confident do you feel about this?" : "", options: fromRating ? ["Not yet", "Getting there", "Confident", "Could teach it"] : ["", ""] };
    next.questions = [poll];
    next.poll = true;
  } else {
    next.questions = undefined;
  }
  if (k === "answer") next.submitTo = undefined;
  if (k === "discussion" && !inGroups) next.submitTo = undefined;
  return next;
}

/** A card from before kinds, given one (idempotent: a card with a kind comes back unchanged). */
export function withKind(m: Module): Module {
  if (m.kind && KINDS.some((k) => k.id === m.kind) && typeOfKind(m.kind, m.type) === m.type) return m;
  return asKind(m, kindOf(m));
}

/** Every card in these weeks given a kind. Returns how many changed. */
export function kindWeeks(weeks: { lessons: { modules: Module[] }[] }[]): number {
  let n = 0;
  for (const w of weeks) for (const l of w.lessons) l.modules = l.modules.map((m) => { const k = withKind(m); if (k !== m) n++; return k; });
  return n;
}

/** A new, empty card of a kind. */
export function newCard(k: CardKind, title?: string): Module {
  const blank: Module = { id: `m-${Math.random().toString(36).slice(2, 9)}`, type: "read", title: title ?? `New ${kindMeta(k).name} card`, body: "", audience: { kind: "all" }, tools: [], attachments: [] };
  return asKind(blank, k);
}
