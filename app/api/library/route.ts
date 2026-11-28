import { withKind } from "@/lib/kinds";
import { getSession, teacherOf, unauthorized } from "@/lib/auth";
import { uid } from "@/lib/profile";
import { save, type SavedCard } from "@/lib/store";
import { TYPE_ORDER } from "@/lib/ui";
import { fold } from "@/lib/cardmodel";
import type { Module } from "@/lib/types";
import { mapSlot } from "@/lib/branching";

/** A teacher's own saved cards: the "custom" choices under each suit in New card, usable in any of their courses. */

const MAX_CARDS = 60;
const MAX_BYTES = 40_000;
const UNSAFE_KEY = /^(__proto__|constructor|prototype)$/;

export async function GET(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  return Response.json({ cards: t.cards ?? [] });
}

/** Keep a card's content; drop what only makes sense in the course it came from. */
function clean(m: Partial<Module>, inSet?: Set<string>): Module | null {
  if (!m || typeof m !== "object" || !TYPE_ORDER.includes(m.type as Module["type"])) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { audience, due, choice, picked, personal, dealtFor, collected, ...rest } = m as Module;
  const keep = (id: string | null) => (id && inSet?.has(id) ? id : null);
  // A card tree's wiring is kept only between cards saved together.
  if (Array.isArray(rest.questions)) rest.questions = rest.questions.map((q) => (inSet && q.next ? { ...q, next: q.next.map((x) => mapSlot(x, keep)) } : (({ next: _n, ...o }) => o)(q))); // eslint-disable-line @typescript-eslint/no-unused-vars
  rest.bands = inSet && Array.isArray(rest.bands) ? rest.bands.map((b) => ({ ...b, next: keep(b.next) })) : undefined;
  rest.members = inSet && Array.isArray(rest.members) ? rest.members.filter((id) => inSet.has(id)) : undefined;
  return withKind(fold({ ...rest, id: inSet ? String(rest.id ?? "") : "", audience: { kind: "all" }, tools: Array.isArray(rest.tools) ? rest.tools : [], attachments: Array.isArray(rest.attachments) ? rest.attachments : [], title: String(rest.title ?? "").slice(0, 120), body: String(rest.body ?? "").slice(0, 8000) } as Module));
}

export async function POST(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  let body: { name?: unknown; module?: Partial<Module>; modules?: Partial<Module>[]; kind?: unknown };
  try {
    body = JSON.parse(await request.text(), (k, v) => (UNSAFE_KEY.test(k) ? undefined : v));
  } catch {
    return Response.json({ ok: false, error: "That didn’t look like a card" }, { status: 400 });
  }
  const cards = (t.cards ??= []);
  if (cards.length >= MAX_CARDS) return Response.json({ ok: false, error: `You can keep up to ${MAX_CARDS} saved cards. Remove one first.` }, { status: 400 });
  let card: SavedCard;
  if (Array.isArray(body.modules)) {
    // A set: a whole lesson, or a card group with its cards.
    const ids = new Set(body.modules.map((m) => String(m?.id ?? "")).filter(Boolean));
    const modules = body.modules.slice(0, 60).map((m) => clean(m, ids));
    if (!modules.length || modules.some((m) => !m)) return Response.json({ ok: false, error: "That didn’t look like a set of cards" }, { status: 400 });
    if (JSON.stringify(modules).length > MAX_BYTES * 8) return Response.json({ ok: false, error: "This is too big to save" }, { status: 400 });
    const name = String(body.name ?? "").trim().slice(0, 60) || "Saved cards";
    const { id: _id, ...first } = modules[0]!; // eslint-disable-line @typescript-eslint/no-unused-vars
    card = { id: uid("my-"), name, module: first, set: { kind: body.kind === "group" ? "group" : "lesson", modules: modules as Module[] }, at: Date.now() };
  } else {
    const m = clean(body.module ?? {});
    if (!m) return Response.json({ ok: false, error: "That didn’t look like a card" }, { status: 400 });
    const { id: _id, ...card0 } = m; // eslint-disable-line @typescript-eslint/no-unused-vars
    if (JSON.stringify(card0).length > MAX_BYTES) return Response.json({ ok: false, error: "This card is too big to save" }, { status: 400 });
    const name = String(body.name ?? card0.title ?? "").trim().slice(0, 60) || "My card";
    card = { id: uid("my-"), name, module: card0, at: Date.now() };
  }
  cards.push(card);
  save();
  return Response.json({ ok: true, card });
}

/** Update a saved card with a newer version of it (the teacher changed a card they had collected and said to keep it). */
export async function PUT(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  let body: { id?: unknown; module?: Partial<Module> };
  try {
    body = JSON.parse(await request.text(), (k, v) => (UNSAFE_KEY.test(k) ? undefined : v));
  } catch {
    return Response.json({ ok: false, error: "That didn’t look like a card" }, { status: 400 });
  }
  const card = (t.cards ?? []).find((c) => c.id === String(body.id ?? ""));
  if (!card || card.set) return Response.json({ ok: false, error: "That card isn’t in Saved cards any more" }, { status: 404 });
  const m = clean(body.module ?? {});
  if (!m) return Response.json({ ok: false, error: "That didn’t look like a card" }, { status: 400 });
  const { id: _id, ...next } = m; // eslint-disable-line @typescript-eslint/no-unused-vars
  if (JSON.stringify(next).length > MAX_BYTES) return Response.json({ ok: false, error: "This card is too big to save" }, { status: 400 });
  card.module = next;
  card.name = String(next.title ?? "").trim().slice(0, 60) || card.name;
  card.at = Date.now();
  save();
  return Response.json({ ok: true, card });
}

export async function DELETE(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  const body = await request.json().catch(() => ({}));
  const before = t.cards?.length ?? 0;
  t.cards = (t.cards ?? []).filter((c) => c.id !== String(body.id ?? ""));
  if (t.cards.length === before) return Response.json({ ok: false, error: "That card isn’t saved" }, { status: 404 });
  save();
  return Response.json({ ok: true });
}
