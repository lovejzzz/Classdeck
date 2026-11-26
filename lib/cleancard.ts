// Cleaning a card that comes from outside the server (a save from the page, an imported file): only known kinds of
// attachment at safe addresses, a look from the list, a form with known parts, and the card's kind put right.
import { fold } from "./cardmodel";
import { withKind } from "./kinds";
import { uid } from "./profile";
import { CARD_COLORS } from "./ui";
import { safeUrl } from "./uploads";
import type { ActivityForm, Attachment, FormPart, Module } from "./types";

export function cleanAttachment(a: Attachment): Attachment | null {
  if (!a || typeof a.url !== "string" || !safeUrl(a.url)) return null;
  const kinds = ["image", "video", "audio", "file", "link"];
  if (!kinds.includes(a.kind)) return null;
  const sec = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : undefined);
  return {
    id: a.id || uid("w-"), kind: a.kind, url: a.url, name: String(a.name ?? "").slice(0, 120) || undefined, size: Number(a.size) || undefined,
    start: sec(a.start), end: sec(a.end), credit: a.credit ? String(a.credit).slice(0, 200) : undefined,
    transcript: a.transcript && (a.kind === "audio" || a.kind === "video") ? String(a.transcript).slice(0, 20000) : undefined,
    duration: Number(a.duration) > 0 && Number(a.duration) < 36000 ? Math.round(Number(a.duration)) : undefined,
    fps: a.kind === "video" && Number(a.fps) > 1 ? Math.min(10, Math.round(Number(a.fps))) : undefined,
  };
}

export const FORM_PARTS: FormPart[] = ["feedback", "next", "levels", "score", "links", "status"];

export function cleanForm(f: ActivityForm | undefined): ActivityForm | undefined {
  if (!f || typeof f !== "object") return undefined;
  // Blank questions are kept while the teacher is still typing; filling in skips them.
  const questions = (Array.isArray(f.questions) ? f.questions : []).slice(0, 12).map((q) => {
    const options = Array.isArray(q?.options) ? q.options.map((o) => String(o).slice(0, 80)).slice(0, 8) : [];
    return { id: String(q?.id || uid("fq-")).slice(0, 40), text: String(q?.text ?? "").slice(0, 200), ...(options.length ? { options } : {}) };
  });
  const student = f.by === "student";
  // A student form can ask them to rate themselves and add links; the rest are the teacher's to give.
  const parts = FORM_PARTS.filter((x) => Array.isArray(f.parts) && f.parts.includes(x) && (!student || x === "levels" || x === "links"));
  const max = Number(f.max);
  return {
    title: String(f.title ?? "").slice(0, 80), ...(student ? { by: "student" as const, finish: !!f.finish || undefined } : {}),
    parts, max: !student && max > 0 ? Math.min(1000, max) : undefined, questions: questions.length ? questions : undefined,
  };
}

/** A card as it may be stored: its kind settled, and every part it carries cleaned. */
export function cleanCard(raw: Module): Module {
  const m = withKind(fold(raw));
  if (m.playlist) m.playlist = m.playlist.filter((x) => typeof x.url === "string" && /^https:\/\//.test(x.url)).slice(0, 60);
  m.attachments = (m.attachments ?? []).map(cleanAttachment).filter((a): a is Attachment => !!a).slice(0, 12);
  // The card's own look: a colour from the list, and a picture at a safe address.
  if (m.look) {
    const color = CARD_COLORS.some((c) => c.id === m.look!.color) ? m.look.color : undefined;
    const image = typeof m.look.image === "string" && safeUrl(m.look.image) ? m.look.image.slice(0, 2000) : undefined;
    m.look = color || image ? { color, image } : undefined;
  }
  // Who gets it: every card has one (a card saved without it made every student's page fail to open).
  if (!m.audience || typeof m.audience !== "object" || !["all", "branch", "student"].includes(m.audience.kind)) m.audience = { kind: "all" };
  if (!Array.isArray(m.tools)) m.tools = [];
  m.form = cleanForm(m.form);
  if (m.dueTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(m.dueTime))) m.dueTime = undefined;
  if (!m.due) m.dueTime = undefined;
  m.aiFeedback = m.aiFeedback === true || undefined;
  if (m.suit !== undefined && !["learn", "do", "share"].includes(m.suit)) m.suit = undefined;
  return m;
}
