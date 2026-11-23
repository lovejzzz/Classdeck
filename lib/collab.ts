// Shared Text cards (Who writes: Each group, or Whole class): one document per group (or per class) that its writers
// edit together, live. The document is a Yjs doc; edits come in as Yjs updates (POST) and go out to everyone else who
// has it open (server-sent events), with each writer's cursor. Kept in the store: the doc's state, its text as
// Markdown (for the teacher's review, My work and search), and a version every few minutes, with who wrote in it.
import * as Y from "yjs";
import { db, save } from "./store";
export { cardOf, docKey, writersOf } from "./shared";

export type CollabVersion = { at: number; md: string; by: string[] };
export interface CollabEntry {
  /** The Yjs doc, base64. */
  state: string;
  /** The same text as Markdown, as last sent by a writer. */
  md: string;
  history: CollabVersion[];
  /** Who has written since the last version was kept. */
  pending?: string[];
}

const VERSION_EVERY = 5 * 60_000;
const KEEP_VERSIONS = 60;

const entries = (courseId: string) => ((db().collab[courseId] ??= {}) as Record<string, CollabEntry>);
export const entryOf = (courseId: string, key: string): CollabEntry | undefined => entries(courseId)[key];

// —— Open documents, in memory: the Yjs doc, who's listening, and each writer's latest cursor ——
type Send = (event: string, data: unknown) => void;
type Live = { doc: Y.Doc; listeners: Map<number, Send>; cursors: Map<number, { update: string; at: number }>; seeding?: number };
const g = globalThis as unknown as { __collab?: Map<string, Live> };
const live = (g.__collab ??= new Map());
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

function open(courseId: string, key: string): Live {
  const id = `${courseId}/${key}`;
  let l = live.get(id);
  if (!l) {
    const doc = new Y.Doc();
    const e = entryOf(courseId, key);
    if (e?.state) Y.applyUpdate(doc, unb64(e.state));
    l = { doc, listeners: new Map(), cursors: new Map() };
    live.set(id, l);
  }
  return l;
}

/**
 * Start listening to a document. The first message has its whole state, everyone's cursors, and whether this
 * listener should put the card's starting text in (only one at a time, and only while the document is empty).
 */
export function listen(courseId: string, key: string, listener: number, send: Send): () => void {
  const l = open(courseId, key);
  const empty = l.doc.getXmlFragment("default").length === 0;
  const seed = empty && (!l.seeding || Date.now() - l.seeding > 15_000);
  if (seed) l.seeding = Date.now();
  const now = Date.now();
  for (const [c, v] of l.cursors) if (now - v.at > 60_000) l.cursors.delete(c);
  send("init", { state: b64(Y.encodeStateAsUpdate(l.doc)), cursors: [...l.cursors.values()].map((v) => v.update), seed });
  l.listeners.set(listener, send);
  return () => { l.listeners.delete(listener); };
}

/** A writer's edit: apply it, keep it, and pass it on to everyone else. */
export function applyEdit(courseId: string, key: string, from: number, update: string, who: string) {
  const l = open(courseId, key);
  Y.applyUpdate(l.doc, unb64(update));
  l.seeding = undefined;
  const e = (entries(courseId)[key] ??= { state: "", md: "", history: [] });
  e.state = b64(Y.encodeStateAsUpdate(l.doc));
  if (!(e.pending ??= []).includes(who)) e.pending.push(who);
  for (const [id, send] of l.listeners) if (id !== from) send("update", update);
  save();
}

/** A writer's cursor moved (or they left): pass it on. */
export function moveCursor(courseId: string, key: string, from: number, client: number, update: string) {
  const l = open(courseId, key);
  l.cursors.set(client, { update, at: Date.now() });
  for (const [id, send] of l.listeners) if (id !== from) send("cursor", update);
}

/** The text as Markdown, from a writer. Every few minutes (and when asked) it's also kept as a version. */
export function setText(courseId: string, key: string, md: string, force = false) {
  const e = (entries(courseId)[key] ??= { state: "", md: "", history: [] });
  e.md = md.slice(0, 200_000);
  const last = e.history[e.history.length - 1];
  if ((force || !last || Date.now() - last.at > VERSION_EVERY) && (!last || last.md !== e.md)) {
    e.history.push({ at: Date.now(), md: e.md, by: e.pending ?? [] });
    e.pending = [];
    if (e.history.length > KEEP_VERSIONS) e.history.splice(0, e.history.length - KEEP_VERSIONS);
  }
  save();
}
