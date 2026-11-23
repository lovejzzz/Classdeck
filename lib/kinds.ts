// What a card is, as teachers and students see it: two kinds of card (plus card groups, made by merging cards).
//   Content cards (something to take in): words, a picture, a video or audio link, or a recording. Its face follows its media.
//   Question cards (something to answer), in one of three forms: choices (a right answer, or a poll with none), an open
//   answer, or a discussion.
// Each kind runs on one of the stored types underneath (read, submit, quiz, practice, wall, studio), which the rest of
// the site already knows how to show and grade. Question cards are where card trees branch: each choice of a Choice
// card (quiz question or poll), and each score range of a quiz or a card group, can deal a card.
import type { Module, ModuleType, Question } from "./types";
import { isAsked } from "./grading";

export type Family = "content" | "question";
/**
 * What a teacher picks: a Content card or a Question card. A Question card asks something; how students answer is its
 * form (CardKind): with choices (a quiz question or a poll), an open answer, or a discussion everyone takes part in.
 * A card group is made by merging cards.
 */
export type CardKind = "content" | "answer" | "choice" | "discussion" | "group";
/** How a card looks: its picture and name. A Content card looks like its media; a Question card like how it's answered. */
export type Face = "text" | "image" | "video" | "link" | "recording" | "answer" | "choice" | "poll" | "discussion" | "group";

/** The two kinds of card a teacher puts down, and what each starts as. */
export const FAMILIES: { id: Family; name: string; hint: string; start: CardKind }[] = [
  { id: "content", name: "Content", hint: "Words, a picture, a video, a link or a recording", start: "content" },
  { id: "question", name: "Question", hint: "Students answer: with choices, in their own words, or in a discussion", start: "choice" },
];
export const familyMeta = (f: Family) => FAMILIES.find((x) => x.id === f)!;

export const KINDS: { id: CardKind; family: Family; name: string; hint: string; icon: string; done: string }[] = [
  { id: "content", family: "content", name: "Content", hint: "Words, a picture, a video, a link or a recording", icon: "read", done: "Done" },
  { id: "choice", family: "question", name: "Choices", hint: "Pick an answer: a quiz question, or a poll with no right answer", icon: "quiz", done: "Submit" },
  { id: "answer", family: "question", name: "Open answer", hint: "Students write, record or upload; you give feedback", icon: "message", done: "Hand in" },
  { id: "discussion", family: "question", name: "Discussion", hint: "Everyone posts and replies", icon: "wall", done: "Done" },
  // Not a kind you pick: made by selecting cards and merging them. Listed so its name and icon are known.
  { id: "group", family: "question", name: "Card group", hint: "Cards that go together", icon: "layers", done: "Done" },
];
/** The forms a card can take (a card group is made from cards, not picked). */
export const PICKABLE = KINDS.filter((k) => k.id !== "group");
/** How a Question card can be answered. */
export const ANSWER_FORMS = PICKABLE.filter((k) => k.family === "question");
export const kindMeta = (k: CardKind) => KINDS.find((x) => x.id === k)!;
export const familyOf = (k: CardKind): Family => kindMeta(k).family;

export const FACES: Record<Face, { name: string; icon: string }> = {
  text: { name: "Text", icon: "read" },
  image: { name: "Image", icon: "image" },
  video: { name: "Video", icon: "video" },
  link: { name: "Link", icon: "link" },
  recording: { name: "Recording", icon: "mic" },
  answer: { name: "Open answer", icon: "message" },
  choice: { name: "Multiple choice", icon: "quiz" },
  poll: { name: "Poll", icon: "chart" },
  discussion: { name: "Discussion", icon: "wall" },
  group: { name: "Card group", icon: "layers" },
};

const firstMedia = (m: Pick<Module, "attachments">) => (m.attachments ?? [])[0];
const isRecording = (a?: { kind: string; url: string; name?: string }) => !!a && a.kind === "audio";
const VIDEO_LINK = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com)/;

type KindFields = Pick<Module, "kind" | "type" | "attachments" | "poll" | "questions">;
const isKind = (k: unknown): k is CardKind => KINDS.some((x) => x.id === k);

/** A card's kind: the one stored, or (for a card made without one, such as a template) the one its type points to. */
export function kindOf(m: KindFields): CardKind {
  if (isKind(m.kind)) return m.kind;
  switch (m.type) {
    case "group":
      return "group";
    case "read":
    case "explore":
      return m.questions?.some(isAsked) ? "choice" : "content";
    case "quiz":
    case "selfcheck":
      return "choice";
    case "practice":
      return m.poll || m.questions?.some(isAsked) ? "choice" : "answer";
    case "wall":
    case "studio":
      return "discussion";
    default:
      return "answer"; // submit, reflect, builder
  }
}

/** Whether a card is a poll: a Choice card with no right answer. */
export const isPoll = (m: KindFields) => kindOf(m) === "choice" && !!(m.poll || m.type === "selfcheck");

/** How a card looks. A Content card follows its first piece of media: a picture, a video, a recording, a link, or words. */
export function faceOf(m: KindFields): Face {
  const k = kindOf(m);
  if (k === "choice") return isPoll(m) ? "poll" : "choice";
  if (k !== "content") return k;
  const a = firstMedia(m);
  if (!a) return "text";
  if (a.kind === "image") return "image";
  if (isRecording(a)) return "recording";
  if (a.kind === "video" || (a.kind === "link" && VIDEO_LINK.test(a.url))) return "video";
  if (a.kind === "audio" || a.kind === "link") return "link";
  return "text";
}
export const faceMeta = (m: KindFields): { name: string; icon: string } => {
  const f = FACES[faceOf(m)];
  // A choice card's label says what its question asks for: picking, ordering or typing.
  if (faceOf(m) === "choice" && (m.questions?.length ?? 0) === 1) {
    const k = m.questions![0].kind;
    if (k === "order") return { ...f, name: "Put in order" };
    if (k === "short") return { ...f, name: "Short answer" };
  }
  return f;
};

/**
 * The stored type a kind runs on, given the card's current type. A Multiple choice card answers right away (practice);
 * one that is already a quiz (several questions, a Submit button, tries, score ranges) stays a quiz. A discussion in
 * groups runs on the group studio; one for the whole class on the wall.
 */
export function typeOfKind(k: CardKind, current?: ModuleType, inGroups = current === "studio"): ModuleType {
  if (k === "group") return "group";
  if (familyOf(k) === "content") return "read";
  if (k === "choice") return current === "quiz" ? "quiz" : "practice"; // a poll answers right away too
  return k === "answer" ? "submit" : inGroups ? "studio" : "wall";
}

const qid = () => `q-${Math.random().toString(36).slice(2, 9)}`;

/**
 * A card turned into a kind: its title, instructions and media stay; what only the old kind used goes. A Choice card
 * keeps its questions (or gets one to fill in). Pass `poll` to say whether it has no right answer; otherwise a card that
 * was a poll (or a rating) stays one.
 */
export function asKind(m: Module, k: CardKind, poll?: boolean): Module {
  if (k === "group" || m.type === "group") return m.type === "group" ? { ...m, kind: "group", suit: "question" } : m;
  const wasPoll = isPoll(m);
  const inGroups = m.type === "studio" || (k === "discussion" && m.submitTo === "studio");
  const asPoll = k === "choice" && (poll ?? wasPoll);
  const next: Module = { ...m, kind: k, type: typeOfKind(k, asPoll ? undefined : m.type, inGroups), suit: familyOf(k) as Module["suit"] };
  // Everything that belongs to one kind only (a quiz's settings stay only on a quiz).
  if (next.type !== "quiz") { next.attempts = undefined; next.timeLimit = undefined; next.shuffle = undefined; next.pick = undefined; next.bands = undefined; }
  next.poll = asPoll ? true : undefined;
  if (k !== "discussion") next.wall = undefined;
  if (asPoll) {
    const q = (m.questions ?? []).find((x) => !x.kind || x.kind === "choice" || x.kind === "multi");
    const fromRating = m.type === "selfcheck" && !q;
    const one: Question = q
      ? { id: q.id, text: q.text, options: q.options, next: q.next }
      : { id: qid(), text: fromRating ? "How confident do you feel about this?" : "", options: fromRating ? ["Not yet", "Getting there", "Confident", "Could teach it"] : ["", ""] };
    next.questions = [one];
  } else if (k === "choice") {
    const qs = (m.questions ?? []).filter((q) => q.text?.trim() || q.options.some((o) => o.trim()));
    next.questions = qs.length ? qs.map((q) => (q.answer === undefined && !q.answerSet && !q.accept && (!q.kind || q.kind === "choice") ? { ...q, answer: 0 } : q)) : [{ id: qid(), text: "", options: ["", ""], answer: 0 }];
    if (next.type === "quiz") next.attempts ??= 2;
  } else {
    next.questions = undefined;
  }
  if (k === "answer") next.submitTo = undefined;
  if (k === "discussion" && !inGroups) next.submitTo = undefined;
  return next;
}

/** A card made without a kind (or with one its type doesn't fit), given one. Idempotent. */
export function withKind(m: Module): Module {
  // A poll keeps no right answer, and only one question.
  const cleanPoll = !m.poll || (m.type === "practice" && (m.questions?.length ?? 0) <= 1 && !m.questions?.some((q) => q.answer !== undefined));
  if (isKind(m.kind) && cleanPoll && m.type === typeOfKind(m.kind, m.type)) return m;
  return asKind(m, kindOf(m));
}

/** Every card in these weeks given a kind. Returns how many changed. */
export function kindWeeks(weeks: { lessons: { modules: Module[] }[] }[]): number {
  let n = 0;
  for (const w of weeks) for (const l of w.lessons) l.modules = l.modules.map((m) => { const k = withKind(m); if (k !== m) n++; return k; });
  return n;
}

/** A new, empty card of a kind (a poll: a Choice card with `poll`). */
export function newCard(k: CardKind, title?: string, poll?: boolean): Module {
  const blank: Module = { id: `m-${Math.random().toString(36).slice(2, 9)}`, type: "read", title: title ?? `New ${poll ? "Poll" : familyMeta(familyOf(k)).name} card`, body: "", audience: { kind: "all" }, tools: [], attachments: [] };
  return asKind(blank, k, poll);
}

/**
 * Add a new Choice card to a card group: it goes into the lesson right after the group's last card, at the end of the
 * group. Returns the changed lesson and the new card. A quick way to build a quiz one question at a time.
 */
export function addToGroup<L extends { modules: Module[] }>(lesson: L, groupId: string): { lesson: L; card: Module } {
  const g = lesson.modules.find((x) => x.id === groupId);
  const members = g?.members ?? [];
  const card = newCard("choice", `Question ${members.length + 1}`);
  const last = Math.max(-1, ...members.map((id) => lesson.modules.findIndex((x) => x.id === id)));
  const at = last >= 0 ? last + 1 : lesson.modules.length;
  const modules = lesson.modules.map((x) => (x.id === groupId ? { ...x, members: [...members, card.id] } : x));
  modules.splice(at, 0, card);
  return { lesson: { ...lesson, modules }, card };
}

/**
 * "Add the next question" on a Question card: a quiz grows one card at a time. A card already in a card group gets a
 * new card at the end of its group. A card on its own becomes a card group with the new card, named after it, so the
 * questions are answered together and their total score can deal cards. A card an answer deals can't join a group,
 * so the new card goes right after it on its own.
 */
export function addNextQuestion<L extends { modules: Module[] }>(lesson: L, cardId: string, dealt: boolean): { lesson: L; card: Module; grouped: "new" | "joined" | false } {
  const group = lesson.modules.find((x) => x.type === "group" && x.members?.includes(cardId));
  if (group) return { ...addToGroup(lesson, group.id), grouped: "joined" };
  const m = lesson.modules.find((x) => x.id === cardId);
  const at = lesson.modules.findIndex((x) => x.id === cardId);
  if (!m || at < 0) { const card = newCard("choice", "Question 2"); return { lesson: { ...lesson, modules: [...lesson.modules, card] }, card, grouped: false }; }
  const card = newCard("choice", "Question 2");
  const modules = [...lesson.modules];
  if (dealt) {
    modules.splice(at + 1, 0, card);
    return { lesson: { ...lesson, modules }, card, grouped: false };
  }
  const g: Module = { ...newCard("content", m.title || "Quiz"), type: "group", kind: "group", suit: "question", members: [m.id, card.id] } as Module;
  modules.splice(at, 1, g, m, card);
  return { lesson: { ...lesson, modules }, card, grouped: "new" };
}

/** A Text card each student writes in, in their own copy of it (Who writes: Each student). */
export const writesOwn = (m: KindFields & Pick<Module, "writers">) => kindOf(m) === "content" && m.writers === "each";

/** A Text card a group (or the whole class) writes in together, in one shared copy. */
export const sharedDoc = (m: KindFields & Pick<Module, "writers">) => kindOf(m) === "content" && (m.writers === "group" || m.writers === "class");

/**
 * Work a student hands in for the teacher to read and give feedback on: an open answer, their own copy of a Text
 * card, or their group's shared copy.
 */
export const reviewableCard = (m: KindFields & Pick<Module, "writers" | "choice">) =>
  (["explore", "practice", "submit", "reflect"].includes(m.type) && !m.questions?.length && !m.choice) || writesOwn(m) || (kindOf(m) === "content" && m.writers === "group");

/** A card with choices that has neither words nor options yet: students don't see it until the teacher writes them. */
export const unasked = (m: KindFields) => kindOf(m) === "choice" && !(m.questions ?? []).some(isAsked);
/** A Content card just added and left as it was (no words, no media, its title still "New … card"). */
export const blankContent = (m: KindFields & Pick<Module, "title" | "body">) =>
  kindOf(m) === "content" && !(m.body ?? "").trim() && !(m.attachments ?? []).length && (!m.title.trim() || /^New .* card$/.test(m.title.trim()));
/** A card students don't see yet: a question not written, or a Content card left blank. */
export const unfinished = (m: KindFields & Pick<Module, "title" | "body">) => unasked(m) || blankContent(m);
