import { getSession, teacherOf, unauthorized } from "@/lib/auth";
import { uid } from "@/lib/profile";
import { save, type SavedCard } from "@/lib/store";
import { TYPE_ORDER } from "@/lib/ui";
import { fold } from "@/lib/cardmodel";
import type { Module } from "@/lib/types";

/** A teacher's own saved cards: the "custom" choices under each suit in New card, usable in any of their courses. */

const MAX_CARDS = 60;
const MAX_BYTES = 40_000;
const UNSAFE_KEY = /^(__proto__|constructor|prototype)$/;

export async function GET(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  return Response.json({ cards: t.cards ?? [] });
}

export async function POST(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  let body: { name?: unknown; module?: Partial<Module> };
  try {
    body = JSON.parse(await request.text(), (k, v) => (UNSAFE_KEY.test(k) ? undefined : v));
  } catch {
    return Response.json({ ok: false, error: "That didn’t look like a card" }, { status: 400 });
  }
  const m = body.module;
  if (!m || typeof m !== "object" || !TYPE_ORDER.includes(m.type as Module["type"])) return Response.json({ ok: false, error: "That didn’t look like a card" }, { status: 400 });
  // Keep the content; drop what only makes sense in the course it came from.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, audience, due, choice, picked, personal, ...rest } = m as Module;
  const card0 = fold({ ...rest, audience: { kind: "all" }, tools: Array.isArray(rest.tools) ? rest.tools : [], attachments: Array.isArray(rest.attachments) ? rest.attachments : [], title: String(rest.title ?? "").slice(0, 120), body: String(rest.body ?? "").slice(0, 8000) } as Omit<Module, "id">);
  if (JSON.stringify(card0).length > MAX_BYTES) return Response.json({ ok: false, error: "This card is too big to save" }, { status: 400 });
  const name = String(body.name ?? card0.title ?? "").trim().slice(0, 60) || "My card";
  const cards = (t.cards ??= []);
  if (cards.length >= MAX_CARDS) return Response.json({ ok: false, error: `You can keep up to ${MAX_CARDS} saved cards. Remove one first.` }, { status: 400 });
  const card: SavedCard = { id: uid("my-"), name, module: card0, at: Date.now() };
  cards.push(card);
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
