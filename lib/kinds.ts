// What a card is, as teachers and students see it: two kinds of card (plus card groups, made by merging cards).
//   Content cards (something to take in): words, a picture, a video or audio link, or a recording. Its face follows its media.
//   Question cards (something to answer), in one of three forms: choices (a right answer, or a poll with none), an open
//   answer, or a discussion.
// Each kind runs on one of the stored types underneath (read, submit, quiz, practice, wall, studio), which the rest of
// the site already knows how to show and grade. Question cards are where card trees branch: each choice of a Choice
// card (quiz question or poll), and each score range of a quiz or a card group, can deal a card.
import type { Module, ModuleType, Question } from "./types";
import { isAsked } from "./grading";
import { hasTable } from "./markdown";

export type Family = "content" | "question";
/**
 * What a teacher picks: a Content card or a Question card. A Question card asks something; how students answer is its
 * form (CardKind): with choices (a quiz question or a poll), an open answer, or a discussion everyone takes part in.
 * A card group is made by merging cards.
 */
export type CardKind = "content" | "answer" | "choice" | "worksheet" | "discussion" | "group";
/** How a card looks: its picture and name. A Content card looks like its media; a Question card like how it's answered. */
export type Face =
  | "text" | "table" | "image" | "video" | "link" | "recording" | "file" | "worksheet" | "doc"
  | "answer" | "choice" | "checkboxes" | "order" | "short" | "quiz" | "poll" | "signup" | "discussion" | "group";

/** The two kinds of card a teacher puts down, and what each starts as. */
export const FAMILIES: { id: Family; name: string; hint: string; start: CardKind }[] = [
  { id: "content", name: "Content", hint: "Words, a picture, a video, a link or a recording", start: "content" },
  { id: "question", name: "Question", hint: "Students answer: with choices, in their own words, on a worksheet, or in a discussion", start: "choice" },
];
export const familyMeta = (f: Family) => FAMILIES.find((x) => x.id === f)!;

export const KINDS: { id: CardKind; family: Family; name: string; hint: string; icon: string; done: string }[] = [
  { id: "content", family: "content", name: "Content", hint: "Words, a picture, a video, a link or a recording", icon: "read", done: "Done" },
  { id: "choice", family: "question", name: "Choices", hint: "Pick an answer: a quiz question, or a poll with no right answer", icon: "quiz", done: "Submit" },
  { id: "answer", family: "question", name: "Open answer", hint: "Students write, record or upload; you give feedback", icon: "message", done: "Hand in" },
  { id: "worksheet", family: "question", name: "Worksheet", hint: "Students fill in a copy of your text: each their own, or one per group or for the class", icon: "practice", done: "Hand in" },
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
  table: { name: "Table", icon: "table" },
  image: { name: "Image", icon: "image" },
  video: { name: "Video", icon: "video" },
  link: { name: "Link", icon: "link" },
  recording: { name: "Recording", icon: "mic" },
  file: { name: "File", icon: "file" },
  worksheet: { name: "Worksheet", icon: "practice" },
  doc: { name: "Shared doc", icon: "users" },
  answer: { name: "Open answer", icon: "message" },
  choice: { name: "Multiple choice", icon: "quiz" },
  checkboxes: { name: "Checkboxes", icon: "checkbox" },
  order: { name: "Put in order", icon: "ordered" },
  short: { name: "Short answer", icon: "type" },
  quiz: { name: "Quiz", icon: "quiz" },
  poll: { name: "Poll", icon: "chart" },
  signup: { name: "Sign-up", icon: "groups" },
  discussion: { name: "Discussion", icon: "wall" },
  group: { name: "Card group", icon: "layers" },
};

const firstMedia = (m: Pick<Module, "attachments">) => (m.attachments ?? [])[0];
const isRecording = (a?: { kind: string; url: string; name?: string }) => !!a && a.kind === "audio";
const VIDEO_LINK = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com)/;

type KindFields = Pick<Module, "kind" | "type" | "attachments" | "poll" | "questions"> & Partial<Pick<Module, "writers" | "signup" | "body">>;
export const isKind = (k: unknown): k is CardKind => KINDS.some((x) => x.id === k);

/** A card's kind: the one stored, or (for a card made without one, such as a template) the one its type points to. */
export function kindOf(m: KindFields): CardKind {
  // Students only ever read a Content card: one they write in (from before Worksheet was an answer type) is a worksheet.
  if ((m.kind === "content" || (!isKind(m.kind) && (m.type === "read" || m.type === "explore"))) && m.writers) return "worksheet";
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

/**
 * How a card looks: it follows what's in the card. A Content card that students write in is a worksheet (each their
 * own) or a shared doc; otherwise it follows its first piece of media (a picture, a video, a recording, a link, a file),
 * or a table in its text. A Choice card follows what its question asks for: one answer, several, an order, a typed
 * answer; several questions are a quiz, and a poll that makes groups is a sign-up.
 */
export function faceOf(m: KindFields): Face {
  const k = kindOf(m);
  if (k === "choice") {
    if (isPoll(m)) return m.signup ? "signup" : "poll";
    const qs = (m.questions ?? []).filter(isAsked);
    if (qs.length > 1 || m.type === "quiz") return "quiz";
    const q = qs[0] ?? m.questions?.[0];
    return q?.kind === "multi" ? "checkboxes" : q?.kind === "order" ? "order" : q?.kind === "short" ? "short" : "choice";
  }
  if (k === "worksheet") return (m.writers ?? "each") === "each" ? "worksheet" : "doc";
  if (k !== "content") return k;
  const a = firstMedia(m);
  if (!a) return m.body && hasTable(m.body) ? "table" : "text";
  if (a.kind === "image") return "image";
  if (isRecording(a)) return "recording";
  if (a.kind === "video" || (a.kind === "link" && VIDEO_LINK.test(a.url))) return "video";
  if (a.kind === "file") return "file";
  if (a.kind === "audio" || a.kind === "link") return "link";
  return "text";
}
export const faceMeta = (m: KindFields): { name: string; icon: string } => {
  const face = faceOf(m);
  const f = FACES[face];
  // A file says what it is (PDF, DOCX…); a shared doc says who shares it.
  if (face === "file") {
    const a = firstMedia(m)!;
    const ext = (a.name || a.url).match(/\.([a-z0-9]{2,5})(?:$|\?)/i)?.[1]?.toUpperCase();
    return { ...f, name: ext ?? f.name };
  }
  if (face === "doc") return { ...f, name: m.writers === "group" ? "Group doc" : "Class doc" };
  return f;
};

/**
 * The stored type a kind runs on, given the card's current type. A Multiple choice card answers right away (practice);
 * one that is already a quiz (several questions, a Submit button, tries, score ranges) stays a quiz. A discussion in
 * groups runs on the group studio; one for the whole class on the wall.
 */
export function typeOfKind(k: CardKind, current?: ModuleType, inGroups = current === "studio"): ModuleType {
  if (k === "group") return "group";
  // A worksheet runs on a Content card's type: its copies, history and hand-in are kept on the card.
  if (familyOf(k) === "content" || k === "worksheet") return "read";
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
  next.writers = k === "worksheet" ? m.writers ?? "each" : undefined;
  if (k === "answer") next.submitTo = undefined;
  if (k === "discussion" && !inGroups) next.submitTo = undefined;
  return next;
}

/** A card made without a kind (or with one its type doesn't fit), given one. Idempotent. */
export function withKind(m: Module): Module {
  // A poll keeps no right answer, and only one question.
  const cleanPoll = !m.poll || (m.type === "practice" && (m.questions?.length ?? 0) <= 1 && !m.questions?.some((q) => q.answer !== undefined));
  if (isKind(m.kind) && m.kind === kindOf(m) && cleanPoll && m.type === typeOfKind(m.kind, m.type)) return m;
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
export function addToGroup<L extends { modules: Module[] }>(lesson: L, groupId: string, given?: Module): { lesson: L; card: Module } {
  const g = lesson.modules.find((x) => x.id === groupId);
  const members = g?.members ?? [];
  const card = given ?? newCard("choice", `Question ${members.length + 1}`);
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

/** A worksheet each student fills in, in their own copy of it. */
export const writesOwn = (m: KindFields & Pick<Module, "writers">) => kindOf(m) === "worksheet" && (m.writers ?? "each") === "each";

/** A worksheet a group (or the whole class) fills in together, in one shared copy. */
export const sharedDoc = (m: KindFields & Pick<Module, "writers">) => kindOf(m) === "worksheet" && (m.writers === "group" || m.writers === "class");

/**
 * Work a student hands in for the teacher to read and give feedback on: an open answer, their own copy of a Text
 * card, or their group's shared copy.
 */
export const reviewableCard = (m: KindFields & Pick<Module, "writers" | "choice">) =>
  // A Content card is only read (an older "Watch & listen" card included): nothing to review.
  (kindOf(m) !== "content" && ["explore", "practice", "submit", "reflect"].includes(m.type) && !m.questions?.length && !m.choice) || writesOwn(m) || (kindOf(m) === "worksheet" && m.writers === "group");

/**
 * Handed-in work waiting for the teacher: done, and either not reviewed yet, or handed in again after the teacher asked
 * for a revision.
 */
export const awaitingFeedback = (p?: { status: string; updatedAt: number; review?: { verdict?: string; at: number } }) =>
  !!p && p.status === "done" && (!p.review || (p.review.verdict === "revise" && p.updatedAt > p.review.at));

/** A card with choices that has neither words nor options yet: students don't see it until the teacher writes them. */
export const unasked = (m: KindFields) => kindOf(m) === "choice" && !(m.questions ?? []).some(isAsked);
/** A Content card just added and left as it was (no words, no media, its title still "New … card"). */
export const blankContent = (m: KindFields & Pick<Module, "title" | "body">) =>
  kindOf(m) === "content" && !(m.body ?? "").trim() && !(m.attachments ?? []).length && (!m.title.trim() || /^New .* card$/.test(m.title.trim()));
/** A card students don't see yet: a question not written, or a Content card left blank. */
export const unfinished = (m: KindFields & Pick<Module, "title" | "body">) => unasked(m) || blankContent(m);
