"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bandLabel, bandsOf, branchBelow, canBranch, DEFAULT_BANDS, SCORE, SHARED_ONLY, wiresOf, type Wire } from "@/lib/branching";
import { suitOfCard, suitOfKind } from "@/lib/ui";
import { PICKABLE, kindMeta, kindOf, newCard as makeCard, type CardKind } from "@/lib/kinds";
import type { AnswerValue, Lesson, Module, ProgressMap } from "@/lib/types";
import { Icon } from "../Icon";
import { toast } from "@/lib/toast";

// Fixed sizes, so ports and wires are placed from numbers, not by measuring the page.
const W = 256;
const HEAD = 72;
const FAR_H = 52; // a card zoomed out: its colour and title
const PREVIEW = 46; // zoomed in: two lines of what to do
const SEC = 28; // a question's (or the score's) title row
const ROW = 30; // one answer or one score band
const PAD = 10;
const COL = 120; // gap between columns inside a lesson
const GAP = 22; // gap between cards in a column
const REGION_GAP = 104; // gap between lessons
const TOP = 92; // room for each lesson's header
// Kinds a branch can deal (not a discussion, which the whole class or group shares), and every kind.
const NEW_KINDS: CardKind[] = PICKABLE.map((k) => k.id).filter((k) => k !== "discussion");
const ALL_KINDS: CardKind[] = PICKABLE.map((k) => k.id);
const INK = "#4b56a8";
const SOFT = "#a3a8cf";
const DAY = 86400000;

export type Level = "far" | "mid" | "near";
const levelOf = (z: number): Level => (z < 0.55 ? "far" : z >= 1.2 ? "near" : "mid");

const branchQs = (m: Module) => (m.questions ?? []).filter((q) => canBranch(q));
/** Cards that branch by score: a quiz, and a card group. */
const isQuiz = (m: Module) => m.type === "quiz" || m.type === "group";
const wantsQuestion = (m: Module) => (kindOf(m) === "choice" || kindOf(m) === "poll") && !branchQs(m).length && m.type !== "quiz";
/** Whether a card's node has anything under its head: answers, score ranges, its group's cards, or that invitation. */
const hasBody = (m: Module) => branchQs(m).length > 0 || isQuiz(m) || wantsQuestion(m);
const letter = (i: number) => String.fromCharCode(65 + i);
const picked = (v: AnswerValue | undefined, w: Wire) =>
  w.score ? typeof v === "number" && v >= w.score.min && v < w.score.max : Array.isArray(v) ? (v as number[]).includes(w.option) : v === w.option;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

/** The rows on a card at a zoom level: its head, (zoomed in) a preview, then each question's answers and the score bands. */
function rowsOf(m: Module, level: Level, readOnly: boolean, members: Module[] = []) {
  const ports = new Map<string, number>();
  if (level === "far") return { h: m.type === "group" ? FAR_H + members.length * 22 : FAR_H, ports };
  let y = HEAD + (level === "near" && m.type !== "group" ? PREVIEW : 0);
  // A card group: a row per card, with that card's answers (their ports keyed by the card), then the group's score.
  if (m.type === "group")
    for (const c of members) {
      y += SEC;
      for (const q of branchQs(c)) q.options.forEach((_, i) => { ports.set(`${c.id}|${q.id}:${i}`, y + ROW / 2); y += ROW; });
    }
  for (const q of m.type === "group" ? [] : branchQs(m)) {
    y += SEC;
    q.options.forEach((_, i) => { ports.set(`${q.id}:${i}`, y + ROW / 2); y += ROW; });
  }
  if (isQuiz(m)) {
    y += SEC;
    const bands = bandsOf(m);
    bands.forEach((_, i) => { ports.set(`${SCORE}:${i}`, y + ROW / 2); y += ROW; });
    if (!bands.length && !readOnly) y += ROW;
  }
  // Only a Multiple choice or Poll card without its question yet gets a line inviting one; other kinds don't branch.
  if (wantsQuestion(m)) y += 34;
  return { h: y + PAD, ports };
}

interface Node { m: Module; lessonId: string; li: number; x: number; y: number; h: number; ports: Map<string, number>; parent?: string; members?: Module[] }
interface Region { lesson: Lesson; li: number; x: number; w: number }

/**
 * The whole course, left to right: each lesson a region, its cards laid out as a tree inside it (cards everyone gets in
 * its first column, what their answers deal to the right). A card dealt from an earlier lesson starts its own lesson's
 * tree, with the wire coming in from the left.
 */
function layout(lessons: Lesson[], wires: Wire[], level: Level, readOnly: boolean) {
  const nodes = new Map<string, Node>();
  const regions: Region[] = [];
  let x = 40, height = 0;
  lessons.forEach((lesson, li) => {
    // Cards in a group are drawn inside their group's node; a wire from one of them leaves from the group.
    const groupOf = new Map<string, string>();
    for (const g of lesson.modules) if (g.type === "group") for (const id of g.members ?? []) groupOf.set(id, g.id);
    const eff = (id: string) => groupOf.get(id) ?? id;
    const local = new Set(lesson.modules.map((m) => m.id));
    const localWires = wires.filter((w) => local.has(w.from) && local.has(w.to) && !groupOf.has(w.to)).map((w) => ({ ...w, from: eff(w.from) }));
    const dealtHere = new Set(localWires.map((w) => w.to));
    const roots = lesson.modules.filter((m) => !dealtHere.has(m.id) && !groupOf.has(m.id));
    const kids = new Map<string, string[]>();
    const parent = new Map<string, string>();
    const seen = new Set<string>();
    const walk = (id: string) => {
      seen.add(id);
      const list: string[] = [];
      for (const w of localWires.filter((v) => v.from === id)) {
        if (seen.has(w.to) || list.includes(w.to)) continue;
        list.push(w.to);
        parent.set(w.to, id);
        seen.add(w.to);
      }
      kids.set(id, list);
      list.forEach(walk);
    };
    roots.forEach((r) => walk(r.id));
    const loose = lesson.modules.filter((m) => !seen.has(m.id) && !groupOf.has(m.id));
    loose.forEach((m) => walk(m.id));
    const byId = new Map(lesson.modules.map((m) => [m.id, m]));
    const membersOf = (id: string) => (byId.get(id)?.members ?? []).map((x) => byId.get(x)).filter((x): x is Module => !!x);
    const size = (id: string) => rowsOf(byId.get(id)!, level, readOnly, membersOf(id));
    const span = new Map<string, number>();
    const depthOf = new Map<string, number>();
    const measure = (id: string, d: number): number => {
      depthOf.set(id, d);
      const k = kids.get(id) ?? [];
      const below = k.reduce((n, c) => n + measure(c, d + 1), 0) + Math.max(0, k.length - 1) * GAP;
      const s = Math.max(size(id).h, below);
      span.set(id, s);
      return s;
    };
    const place = (id: string, top: number) => {
      const { h, ports } = size(id);
      const s = span.get(id)!;
      const k = kids.get(id) ?? [];
      const below = k.reduce((n, c) => n + span.get(c)!, 0) + Math.max(0, k.length - 1) * GAP;
      nodes.set(id, { m: byId.get(id)!, lessonId: lesson.id, li, x: x + depthOf.get(id)! * (W + COL), y: top + (s - h) / 2, h, ports, parent: parent.get(id), members: byId.get(id)!.type === "group" ? membersOf(id) : undefined });
      let y = top + (s - below) / 2;
      for (const c of k) { place(c, y); y += span.get(c)! + GAP; }
    };
    let top = TOP;
    for (const r of [...roots, ...loose]) { measure(r.id, 0); place(r.id, top); top += span.get(r.id)! + GAP * (level === "far" ? 0.8 : 1.4); }
    const depth = Math.max(0, ...[...depthOf.values()]);
    const w = Math.max(W, (depth + 1) * (W + COL) - COL);
    regions.push({ lesson, li, x, w });
    height = Math.max(height, top + 40);
    x += w + REGION_GAP;
  });
  return { nodes, regions, width: x + 40, height: Math.max(height, 420) };
}

/** Positions that glide to their new place when the map changes (nodes and wires read the same numbers). */
function useGlide(target: Map<string, { x: number; y: number }>, spawnAt: (id: string) => { x: number; y: number } | undefined) {
  const [pos, setPos] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = new Map<string, { x: number; y: number }>();
    for (const [id, p] of target) from.set(id, cur.current.get(id) ?? spawnAt(id) ?? p);
    const same = [...target].every(([id, p]) => { const f = from.get(id)!; return f.x === p.x && f.y === p.y; });
    let raf = 0;
    if (reduce || same) {
      cur.current = target;
      raf = requestAnimationFrame(() => setPos(target));
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now(), D = 380;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      const next = new Map<string, { x: number; y: number }>();
      for (const [id, p] of target) { const f = from.get(id)!; next.set(id, { x: f.x + (p.x - f.x) * e, y: f.y + (p.y - f.y) * e }); }
      cur.current = next;
      setPos(next);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return pos;
}

type Port = { from: string; q: string; option: number };
type Menu = { port: Port; x: number; y: number; mode: "port" | "new" } | { add: string; x: number; y: number };

/**
 * The course map: every lesson's cards on one canvas, with the wires that deal follow-ups (by answer or score, within a
 * lesson or into a later one). Zoomed out, cards shrink to their titles; zoomed in, they show what to do. Drag from a
 * port onto a card to deal it, or into empty space for a new card. Click a card to edit it in the panel.
 */
export function CourseMap({ lessons, weekOf, todayId, students, progress, readOnly, busy, selected, focus, onChange, onChangeMany, onEdit, onAddLesson }: {
  /** Every lesson in the course, in order (with unsaved edits). */
  lessons: Lesson[];
  /** Lesson id → its week's title. */
  weekOf: Record<string, string>;
  todayId?: string;
  students: { id: string; name: string }[];
  progress: ProgressMap;
  readOnly?: boolean;
  /** Something is open over the map (the card editor): leave Escape to it. */
  busy?: boolean;
  /** The card being edited. */
  selected?: string | null;
  /** A card or lesson to bring into view (changes when it should move there). */
  focus?: { id: string; at: number } | null;
  onChange: (l: Lesson) => void;
  onChangeMany: (ls: Lesson[]) => Promise<void>;
  onEdit: (lessonId: string, moduleId: string) => void;
  onAddLesson?: () => void;
}) {
  const all = useMemo(() => lessons.flatMap((l, i) => l.modules.map((m) => ({ m, lessonId: l.id, at: i }))), [lessons]);
  const wires = useMemo(() => wiresOf(all.map((x) => x.m)), [all]);
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.85);
  const level = levelOf(zoom);
  const { nodes, regions, width, height } = useMemo(() => layout(lessons, wires, level, !!readOnly), [lessons, wires, level, readOnly]);
  const [drag, setDrag] = useState<{ port: Port; x: number; y: number; over?: string } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuLesson, setMenuLesson] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  // Words edited in place on a card (double-click a title, a question or an answer).
  const [typing, setTyping] = useState<{ id: string; field: string; value: string } | null>(null);
  // A card being dragged to another lesson, and where the pointer is.
  const [moving, setMoving] = useState<{ id: string; x: number; y: number; to?: string } | null>(null);
  const [dragged, setDragged] = useState(false);
  // Cards picked to put in a card group: shift-click a card, or shift-drag a box around several.
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [live, setLive] = useState(true);
  const [now] = useState(() => Date.now());
  const [born] = useState(() => new Map<string, { x: number; y: number }>());

  const targets = useMemo(() => new Map([...nodes].map(([id, n]) => [id, { x: n.x, y: n.y }])), [nodes]);
  const pos = useGlide(targets, (id) => born.get(id) ?? (nodes.get(id)?.parent ? targets.get(nodes.get(id)!.parent!) : undefined));
  const at = (id: string) => pos.get(id) ?? targets.get(id)!;
  const lessonIndex = (lid: string) => lessons.findIndex((l) => l.id === lid);

  // How many students each answer or score band sent down its wire, and who is on which card right now.
  const took = (w: Wire) => students.filter((s) => picked(progress[s.id]?.[w.from]?.dealt?.[w.q], w)).length;
  const onCard = useMemo(() => {
    const out = new Map<string, { id: string; name: string; stuck: boolean }[]>();
    for (const s of students)
      for (const [mid, p] of Object.entries(progress[s.id] ?? {}))
        if (p.status === "doing") (out.get(mid) ?? out.set(mid, []).get(mid)!).push({ id: s.id, name: s.name, stuck: now - (p.updatedAt ?? now) > 2 * DAY });
    return out;
  }, [students, progress, now]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menu && !busy && !document.querySelector("[data-confirm]")) setMenu(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [menu, busy]);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 1600);
    return () => clearTimeout(t);
  }, [fresh]);

  /** Scroll so a card (or a lesson's region) sits in view, left of the editor panel when it's open. */
  function bringIntoView(id: string, z = zoom) {
    const el = scroller.current;
    if (!el) return;
    const n = targets.get(id);
    const r = regions.find((x) => x.lesson.id === id);
    const px = n ? n.x + W / 2 : r ? r.x + Math.min(r.w, 700) / 2 : null;
    const py = n ? n.y + 80 : r ? TOP + 120 : null;
    if (px == null || py == null) return;
    const panel = selected && window.innerWidth >= 900 ? 480 : 0;
    el.scrollTo({ left: px * z - (el.clientWidth - panel) / 2, top: Math.max(0, py * z - el.clientHeight / 2.4), behavior: "smooth" });
  }
  useEffect(() => {
    if (focus) requestAnimationFrame(() => bringIntoView(focus.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.at]);

  /** Zoom keeping the middle of the view still. */
  function zoomTo(z: number) {
    const el = scroller.current;
    const nz = Math.min(1.6, Math.max(0.25, +z.toFixed(2)));
    if (!el) return setZoom(nz);
    const cx = (el.scrollLeft + el.clientWidth / 2) / zoom, cy = (el.scrollTop + el.clientHeight / 2) / zoom;
    setZoom(nz);
    requestAnimationFrame(() => { el.scrollLeft = cx * nz - el.clientWidth / 2; el.scrollTop = cy * nz - el.clientHeight / 2; });
  }
  const fitAll = () => {
    const el = scroller.current;
    if (!el) return;
    setZoom(Math.max(0.25, Math.min(1, (el.clientWidth - 24) / width, (el.clientHeight - 24) / height)));
    requestAnimationFrame(() => el.scrollTo({ left: 0, top: 0, behavior: "smooth" }));
  };

  const toCanvas = (cx: number, cy: number) => {
    const r = scroller.current!.getBoundingClientRect();
    return { x: (cx - r.left + scroller.current!.scrollLeft) / zoom, y: (cy - r.top + scroller.current!.scrollTop) / zoom };
  };
  // A card inside a group has its ports on the group's node.
  const groupOf = useMemo(() => new Map(all.flatMap((x) => (x.m.type === "group" ? (x.m.members ?? []).map((id) => [id, x.m.id] as const) : []))), [all]);
  const nodeOf = (id: string) => groupOf.get(id) ?? id;
  const portPos = (port: Port) => {
    const nid = nodeOf(port.from), n = nodes.get(nid)!, p = at(nid);
    const key = nid !== port.from ? `${port.from}|${port.q}:${port.option}` : `${port.q}:${port.option}`;
    return { x: p.x + W, y: p.y + (n.ports.get(key) ?? n.h / 2) };
  };
  const inPos = (id: string) => { const p = at(id); return { x: p.x, y: p.y + (level === "far" ? FAR_H / 2 : HEAD / 2) }; };

  /** Cards a port may deal: in its lesson or a later one, not the card itself, not class-wide, and no loops. */
  function targetsFor(port: Port) {
    const from = all.find((x) => x.m.id === port.from);
    const above = new Set<string>([port.from]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const w of wires) if (above.has(w.to) && !above.has(w.from)) { above.add(w.from); grew = true; }
    }
    return all.filter((x) => from && x.at >= from.at && !above.has(x.m.id) && !SHARED_ONLY.has(x.m.type));
  }
  const canTarget = (port: Port, id: string) => targetsFor(port).some((x) => x.m.id === id);
  const lessonWith = (id: string) => lessons.find((l) => l.modules.some((m) => m.id === id))!;

  /** A lesson with one port pointed at `to`. */
  function withWire(l: Lesson, port: Port, to: string | null): Lesson {
    return {
      ...l,
      modules: l.modules.map((m) => {
        if (m.id !== port.from) return m;
        if (port.q === SCORE) return { ...m, bands: bandsOf(m).map(({ min, next }, i) => ({ min, next: i === port.option ? to : next })) };
        return {
          ...m,
          questions: m.questions?.map((q) => {
            if (q.id !== port.q) return q;
            const next = [...(q.next ?? [])];
            while (next.length < q.options.length) next.push(null);
            next[port.option] = to;
            return { ...q, next: next.some(Boolean) ? next : undefined };
          }),
        };
      }),
    };
  }
  const wire = (port: Port, to: string | null) => onChange(withWire(lessonWith(port.from), port, to));
  const setBands = (m: Module, bands: { min: number; next: string | null }[] | undefined) => {
    const l = lessonWith(m.id);
    onChange({ ...l, modules: l.modules.map((x) => (x.id === m.id ? { ...x, bands } : x)) });
  };

  const blank = (k: CardKind, title: string): Module => makeCard(k, title);

  async function newCard(port: Port, type: CardKind, into: string) {
    const lesson = lessonWith(port.from);
    const src = lesson.modules.find((m) => m.id === port.from)!;
    const what = port.q === SCORE ? `Score ${bandLabel(bandsOf(src)[port.option])}` : src.questions?.find((x) => x.id === port.q)?.options[port.option]?.trim();
    const card = blank(type, what ? `If “${what.slice(0, 40)}”` : `New ${kindMeta(type).name} card`);
    const p = portPos(port);
    born.set(card.id, { x: p.x + 40, y: p.y - HEAD / 2 });
    setMenu(null);
    if (into === lesson.id) {
      // After the card that deals it and that card's other follow-ups, so the list reads in order.
      const below = new Set(branchBelow(lesson, port.from));
      let i = lesson.modules.findIndex((m) => m.id === port.from);
      while (i + 1 < lesson.modules.length && below.has(lesson.modules[i + 1].id)) i++;
      const modules = [...lesson.modules];
      modules.splice(i + 1, 0, card);
      onChange(withWire({ ...lesson, modules }, port, card.id));
    } else {
      // The card in the other lesson and the wire that points at it are saved together.
      const target = lessons.find((l) => l.id === into)!;
      await onChangeMany([{ ...target, modules: [...target.modules, card] }, withWire(lesson, port, card.id)]);
    }
    setFresh(card.id);
    onEdit(into, card.id);
  }
  function addCard(lessonId: string, type: CardKind) {
    const l = lessons.find((x) => x.id === lessonId)!;
    const card = blank(type, `New ${kindMeta(type).name} card`);
    const r = regions.find((x) => x.lesson.id === lessonId);
    if (r) born.set(card.id, { x: r.x, y: TOP - 40 });
    setMenu(null);
    onChange({ ...l, modules: [...l.modules, card] });
    setFresh(card.id);
    onEdit(lessonId, card.id);
  }

  /** Why the picked cards can't become a card group, or null if they can. */
  function whyNoGroup(ids: string[]): string | null {
    if (ids.length < 2) return "Pick at least two cards (shift-click them, or shift-drag a box).";
    const ls = new Set(ids.map((id) => lessonWith(id)?.id));
    if (ls.size > 1) return "A card group’s cards all come from one lesson.";
    const ms = ids.map((id) => all.find((x) => x.m.id === id)!.m);
    if (ms.some((m) => m.type === "group")) return "A card group can’t go inside another one.";
    if (ms.some((m) => groupOf.has(m.id))) return "One of these cards is already in a card group.";
    const dealt = ms.find((m) => wires.some((w) => w.to === m.id));
    if (dealt) return `“${dealt.title}” is dealt by an answer. Group the cards first, then deal the group.`;
    return null;
  }
  /** Put the picked cards in a new card group, where the first of them was. */
  function makeGroup() {
    const ids = [...picks];
    const why = whyNoGroup(ids);
    if (why) { toast(why, { icon: "layers", tone: "plain" }); return; }
    const l = lessonWith(ids[0])!;
    const ordered = l.modules.filter((m) => ids.includes(m.id)).map((m) => m.id);
    const g: Module = { ...makeCard("text", "Card group"), type: "group", kind: "group", suit: "question", members: ordered };
    // The group goes where its first card was, its cards right after it in their order.
    const before = l.modules.slice(0, l.modules.findIndex((m) => m.id === ordered[0])).filter((m) => !ordered.includes(m.id));
    const after = l.modules.filter((m) => !ordered.includes(m.id) && !before.includes(m));
    onChange({ ...l, modules: [...before, g, ...ordered.map((id) => l.modules.find((m) => m.id === id)!), ...after] });
    setPicks(new Set());
    setFresh(g.id);
    onEdit(l.id, g.id);
    toast(`Made a card group of ${ordered.length} cards`, { icon: "layers" });
  }

  /** Save words typed in place: a card's title, a question, or one answer. */
  function commitTyping() {
    if (!typing) return;
    const { id, field, value } = typing;
    setTyping(null);
    const l = lessonWith(id);
    const m = l?.modules.find((x) => x.id === id);
    if (!l || !m) return;
    let next: Module = m;
    if (field === "title") next = { ...m, title: value.trim().slice(0, 120) || m.title };
    else {
      const [kind, qid, oi] = field.split(":");
      next = { ...m, questions: m.questions?.map((q) => {
        if (q.id !== qid) return q;
        if (kind === "q") return { ...q, text: value.slice(0, 300) };
        return { ...q, options: q.options.map((o, k) => (k === Number(oi) ? value.slice(0, 200) : o)) };
      }) };
    }
    if (JSON.stringify(next) !== JSON.stringify(m)) onChange({ ...l, modules: l.modules.map((x) => (x.id === id ? next : x)) });
  }
  const typeBox = (cls: string) => typing && (
    <input
      autoFocus
      value={typing.value}
      onChange={(e) => setTyping({ ...typing, value: e.target.value })}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitTyping(); if (e.key === "Escape") setTyping(null); }}
      onBlur={commitTyping}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      aria-label="Edit text"
      className={`w-full rounded-md border border-[#4b56a8]/50 bg-white px-1.5 outline-none ring-2 ring-[#4b56a8]/15 ${cls}`}
    />
  );
  const startTyping = (id: string, field: string, value: string) => (e: React.MouseEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    setTyping({ id, field, value });
  };

  /** Which lesson's region a point on the canvas is over. */
  const regionAt = (x: number) => regions.find((r) => x >= r.x - REGION_GAP / 2 && x <= r.x + r.w + REGION_GAP / 2)?.lesson.id;

  /** Why a card can't go to a lesson: wires only run forward, so it can't go before a card that deals it, or after one it deals. */
  function whyNot(id: string, to: string): string | null {
    const ti = lessonIndex(to);
    const before = wires.filter((w) => w.to === id).find((w) => lessonIndex(lessonWith(w.from).id) > ti);
    if (before) return `It’s dealt by “${all.find((x) => x.m.id === before.from)?.m.title}” in ${lessonWith(before.from).title}, so it can’t come before that lesson.`;
    const after = wires.filter((w) => w.from === id).find((w) => lessonIndex(lessonWith(w.to).id) < ti);
    if (after) return `It deals “${all.find((x) => x.m.id === after.to)?.m.title}” in ${lessonWith(after.to).title}, so it can’t come after that lesson.`;
    return null;
  }
  async function moveCard(id: string, to: string) {
    const from = lessonWith(id);
    if (!from || from.id === to) return;
    const why = whyNot(id, to);
    if (why) { toast(`Can’t move it there. ${why}`, { icon: "split", tone: "plain" }); return; }
    const m = from.modules.find((x) => x.id === id)!;
    const target = lessons.find((l) => l.id === to)!;
    born.delete(id);
    await onChangeMany([{ ...from, modules: from.modules.filter((x) => x.id !== id) }, { ...target, modules: [...target.modules, m] }]);
    setFresh(id);
    toast(`Moved “${m.title}” to ${target.title}`, { icon: "layers" });
  }
  /** Press on a card's head and move: drag it to another lesson. A press without moving is a click (opens it). */
  function startMove(e: React.PointerEvent, id: string) {
    if (readOnly || e.button !== 0 || typing) return;
    const start = { x: e.clientX, y: e.clientY };
    let on = false;
    const move = (ev: PointerEvent) => {
      if (!on && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) return;
      on = true;
      const p = toCanvas(ev.clientX, ev.clientY);
      setMoving({ id, x: p.x, y: p.y, to: regionAt(p.x) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setMoving(null);
      if (!on) return;
      setDragged(true);
      setTimeout(() => setDragged(false), 0);
      const to = regionAt(toCanvas(ev.clientX, ev.clientY).x);
      if (to && ev.type === "pointerup") moveCard(id, to);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function startDrag(e: React.PointerEvent, port: Port) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const overAt = (ev: PointerEvent) => (document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-node]") as HTMLElement | null)?.dataset.node;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      moved = true;
      const p = toCanvas(ev.clientX, ev.clientY);
      setDrag({ port, x: p.x, y: p.y, over: overAt(ev) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
      setMenuLesson(lessonWith(port.from).id);
      if (!moved) return setMenu({ port, ...portPos(port), mode: "port" });
      const over = overAt(ev);
      if (over) { if (canTarget(port, over)) wire(port, over); return; }
      if (ev.type === "pointerup") { const p = toCanvas(ev.clientX, ev.clientY); setMenu({ port, x: p.x, y: p.y, mode: "new" }); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  /** Arrow keys move between cards (the nearest one that way), Enter opens it. */
  function onKey(e: React.KeyboardEvent) {
    const dirs: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const cur = selected && nodes.get(selected) ? selected : hot;
    if (e.key === "Enter" && cur) { e.preventDefault(); onEdit(nodes.get(cur)!.lessonId, cur); return; }
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const from = cur ? nodes.get(cur) : undefined;
    if (!from) { const first = [...nodes.values()][0]; if (first) { setHot(first.m.id); bringIntoView(first.m.id); } return; }
    let best: Node | undefined, score = Infinity;
    for (const n of nodes.values()) {
      if (n.m.id === from.m.id) continue;
      const dx = n.x - from.x, dy = n.y - from.y;
      const along = dx * d[0] + dy * d[1];
      if (along <= 0) continue;
      const off = Math.abs(dx * d[1]) + Math.abs(dy * d[0]);
      const s = along + off * 2.5;
      if (s < score) { score = s; best = n; }
    }
    if (best) {
      if (selected) onEdit(best.lessonId, best.m.id);
      else setHot(best.m.id);
      bringIntoView(best.m.id);
    }
  }

  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(48, Math.abs(b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };
  const drawn = wires.filter((w) => nodes.has(nodeOf(w.from)) && nodes.has(w.to));
  const snap = drag?.over && canTarget(drag.port, drag.over) ? inPos(drag.over) : null;
  const nothing = !all.length;

  return (
    <div className="relative">
      {picks.size > 0 && (
        <div className="pop absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-[13px] shadow-[0_16px_40px_-16px_rgba(20,20,18,0.4)]">
          <Icon name="layers" size={14} className="text-[#4b56a8]" />
          <span>{picks.size} card{picks.size === 1 ? "" : "s"} picked</span>
          <button onClick={makeGroup} disabled={!!whyNoGroup([...picks])} title={whyNoGroup([...picks]) ?? "Put these cards in a card group"} className="btn btn-dark press h-8 px-3 text-[12.5px] disabled:opacity-40">Make a card group</button>
          <button onClick={() => setPicks(new Set())} className="btn btn-quiet press h-8 px-2 text-[12.5px]">Clear</button>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-line bg-white/95 p-0.5 shadow-sm backdrop-blur">
          <button onClick={() => zoomTo(zoom - 0.15)} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom out">−</button>
          <button onClick={fitAll} className="mono h-7 w-12 rounded-lg text-center hover:bg-lane" title="See the whole course">{Math.round(zoom * 100)}%</button>
          <button onClick={() => zoomTo(zoom + 0.15)} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom in">+</button>
        </div>
        <select
          value=""
          onChange={(e) => { if (e.target.value) { bringIntoView(e.target.value); e.target.value = ""; } }}
          aria-label="Go to a lesson"
          className="pointer-events-auto h-8 rounded-xl border border-line bg-white/95 px-2 text-[12.5px] shadow-sm"
        >
          <option value="">Go to a lesson…</option>
          {lessons.map((l) => <option key={l.id} value={l.id}>{weekOf[l.id] ? `${weekOf[l.id]} · ` : ""}{l.title}</option>)}
        </select>
        {students.length > 0 && (
          <button onClick={() => setLive((v) => !v)} aria-pressed={live} className={`pointer-events-auto press flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[12.5px] shadow-sm ${live ? "border-[#4b56a8]/30 bg-[#eef0fb] text-[#4b56a8]" : "border-line bg-white/95 text-ink-2"}`}>
            <Icon name="users" size={13} /> Where students are
          </button>
        )}
      </div>

      <div
        ref={scroller}
        tabIndex={0}
        onKeyDown={onKey}
        aria-label="Course map"
        className="tree-canvas relative h-[calc(100vh-11.5rem)] min-h-[30rem] overflow-auto rounded-2xl border border-line bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-[#4b56a8]/30"
        style={{ backgroundSize: `${22 * zoom}px ${22 * zoom}px` }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvas) return;
          setMenu(null);
          if (e.shiftKey && !readOnly) {
            // Shift-drag: a box that picks every card it touches.
            const a = toCanvas(e.clientX, e.clientY);
            setBox({ x0: a.x, y0: a.y, x1: a.x, y1: a.y });
            const mv = (ev: PointerEvent) => { const b = toCanvas(ev.clientX, ev.clientY); setBox({ x0: a.x, y0: a.y, x1: b.x, y1: b.y }); };
            const done = (ev: PointerEvent) => {
              window.removeEventListener("pointermove", mv);
              window.removeEventListener("pointerup", done);
              const b = toCanvas(ev.clientX, ev.clientY);
              const [l, r, t, bt] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
              const hit = [...nodes.values()].filter((n) => n.x < r && n.x + W > l && n.y < bt && n.y + n.h > t).map((n) => n.m.id);
              setPicks((s) => new Set([...s, ...hit]));
              setBox(null);
            };
            window.addEventListener("pointermove", mv);
            window.addEventListener("pointerup", done);
            return;
          }
          if (picks.size) setPicks(new Set());
          // Drag the background to move around.
          const el = scroller.current!;
          const s = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
          el.style.cursor = "grabbing";
          const move = (ev: PointerEvent) => { el.scrollLeft = s.l - (ev.clientX - s.x); el.scrollTop = s.t - (ev.clientY - s.y); };
          const up = () => { el.style.cursor = ""; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoomTo(zoom - e.deltaY * 0.003);
        }}
      >
        <div data-canvas="1" style={{ width: width * zoom, height: height * zoom }} className="relative">
          <div data-canvas="1" className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${zoom})` }}>
            {/* Lessons: a quiet band each, with its name and a way to add a card. */}
            {regions.map((r) => {
              const today = r.lesson.id === todayId;
              const branches = wiresOf(r.lesson).length;
              return (
                <div key={r.lesson.id} data-canvas="1" className={`absolute rounded-[28px] transition-[background-color,box-shadow] duration-200 ${moving && moving.to === r.lesson.id && lessonWith(moving.id)?.id !== r.lesson.id ? (whyNot(moving.id, r.lesson.id) ? "bg-bad/[0.06] ring-2 ring-bad/30" : "bg-[#4b56a8]/[0.07] ring-2 ring-[#4b56a8]/40") : today ? "bg-ok/[0.045]" : "bg-black/[0.018]"}`} style={{ left: r.x - 20, top: 16, width: r.w + 40, height: height - 32 }}>
                  <div className="flex min-w-0 items-center gap-2 px-5 pt-3.5" style={{ fontSize: level === "far" ? 22 : 13 }}>
                    <span className="min-w-0 truncate font-semibold text-ink">{r.lesson.title}</span>
                    {weekOf[r.lesson.id] && <span className="flex-none text-ink-3">{weekOf[r.lesson.id]}</span>}
                    {today && <span className="chip h-5 flex-none bg-ok/10 text-[11px] text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Today</span>}
                  </div>
                  <div className="flex items-center gap-2 px-5 pt-1.5">
                    {level !== "far" && <span className="mono">{r.lesson.modules.filter((m) => m.type !== "group").length} cards{branches ? ` · ${branches} branch${branches === 1 ? "" : "es"}` : ""}</span>}
                    <span className="flex-1" />
                    {!readOnly && level !== "far" && (
                      <button onClick={(e) => { e.stopPropagation(); const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); const p = toCanvas(b.left, b.bottom); setMenu({ add: r.lesson.id, x: p.x - 200, y: p.y + 4 }); }}
                        className="press flex h-7 items-center gap-1 rounded-lg bg-white px-2 text-[12px] text-ink-2 shadow-sm hover:text-ink"><Icon name="plus" size={12} /> Card</button>
                    )}
                  </div>
                  {!r.lesson.modules.length && (
                    <div className="mx-5 mt-6 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[12.5px] text-ink-3">No cards yet</div>
                  )}
                </div>
              );
            })}
            {!readOnly && onAddLesson && (
              <button onClick={onAddLesson} className="press absolute flex items-center gap-1.5 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-3 hover:text-ink" style={{ left: width - REGION_GAP + 4, top: 36 }}>
                <Icon name="plus" size={13} /> Lesson
              </button>
            )}

            <svg width={width} height={height} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
              <defs>
                <marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={INK} /></marker>
              </defs>
              {drawn.map((w) => {
                const d = curve(portPos(w), inPos(w.to));
                const on = hot === w.from || hot === w.to || selected === w.from || selected === w.to;
                const n = took(w);
                const cross = nodes.get(nodeOf(w.from))!.li !== nodes.get(w.to)!.li;
                return (
                  <g key={`${w.from}-${w.q}-${w.option}-${w.to}`}>
                    <path d={d} fill="none" stroke={on ? INK : SOFT} strokeWidth={(on ? 2.6 : 2) * (level === "far" ? 2 : 1)} strokeDasharray={cross ? "7 5" : undefined} pathLength={cross ? undefined : 1} className={cross ? "" : "tree-wire"} />
                    {n > 0 && live && <path d={d} fill="none" stroke={INK} strokeWidth={2.4 * (level === "far" ? 2 : 1)} strokeLinecap="round" className="tree-flow" />}
                  </g>
                );
              })}
              {drag && <path d={curve(portPos(drag.port), snap ?? drag)} fill="none" stroke={INK} strokeWidth={2.2} strokeDasharray={snap ? undefined : "6 6"} markerEnd="url(#map-arrow)" className={snap ? "" : "tree-dash"} />}
              {menu && "port" in menu && menu.mode === "new" && <path d={curve(portPos(menu.port), menu)} fill="none" stroke={INK} strokeWidth={2.2} strokeDasharray="6 6" markerEnd="url(#map-arrow)" className="tree-dash" />}
            </svg>

            {level !== "far" && live && drawn.map((w) => {
              const n = took(w);
              if (!n) return null;
              const a = portPos(w);
              return (
                <span key={`n-${w.from}-${w.q}-${w.option}`} className="chip pop absolute h-5 -translate-y-1/2 bg-[#4b56a8] px-1.5 text-[10.5px] text-white shadow-[0_4px_10px_-4px_rgba(75,86,168,0.8)]" style={{ left: a.x + 16, top: a.y - 13 }}
                  title={`${n} student${n === 1 ? "" : "s"} went this way`}>{n}</span>
              );
            })}

            {[...nodes.values()].map((nd, i) => {
              const { m } = nd;
              const p = at(m.id);
              const suit = suitOfCard(m);
              const qs = branchQs(m);
              const inbound = wires.filter((w) => w.to === m.id);
              const fromLesson = inbound.length ? lessons.find((l) => l.modules.some((x) => x.id === inbound[0].from)) : undefined;
              const fromElsewhere = !!fromLesson && fromLesson.id !== nd.lessonId;
              const targetable = drag ? canTarget(drag.port, m.id) : false;
              const here = live ? onCard.get(m.id) ?? [] : [];
              const stuck = here.filter((s) => s.stuck).length;
              const bands = isQuiz(m) ? bandsOf(m) : [];
              const isSel = selected === m.id;
              // While its title is being typed, the head isn't a button (a text box can't sit inside one).
              const Head = typing?.id === m.id && typing.field === "title" ? "div" : "button";
              return (
                <div
                  key={m.id}
                  data-node={m.id}
                  onPointerEnter={() => setHot(m.id)}
                  onPointerLeave={() => setHot((h) => (h === m.id ? null : h))}
                  className={`tree-node absolute rounded-[18px] border bg-white ${m.type === "group" ? "isolate" : ""} ${fresh === m.id ? "tree-fresh" : ""} ${isSel || picks.has(m.id) ? "border-[#4b56a8] ring-4 ring-[#4b56a8]/20" : drag?.over === m.id && targetable ? "tree-target border-[#4b56a8]" : drag && !targetable && m.id !== drag.port.from ? "border-line opacity-45" : stuck >= 2 ? "border-[#d08a4a]" : hot === m.id ? "border-line-strong" : "border-line"}`}
                  style={{ left: p.x, top: p.y, width: W, animationDelay: `${Math.min(i, 14) * 25}ms` }}
                >
                  {m.type === "group" && (
                    // A card group looks like a small stack of cards.
                    <>
                      <span aria-hidden="true" className="absolute inset-0 -z-10 translate-x-[6px] translate-y-[6px] rounded-[18px] border border-line bg-white" />
                      <span aria-hidden="true" className="absolute inset-0 -z-20 translate-x-[12px] translate-y-[12px] rounded-[18px] border border-line bg-white" />
                    </>
                  )}
                  {inbound.length > 0 && <span className={`absolute -left-[5px] rounded-full border-2 border-white bg-[#4b56a8] ${level === "far" ? "top-[21px] h-3 w-3" : "top-[31px] h-2.5 w-2.5"}`} />}
                  {here.length > 0 && (
                    <span className="absolute -top-3 right-3 flex -space-x-1.5" title={`${here.map((s) => s.name).join(", ")} ${here.length === 1 ? "is" : "are"} working on this${stuck ? ` (${stuck} for over 2 days)` : ""}`}>
                      {here.slice(0, 4).map((s) => (
                        <span key={s.id} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9.5px] font-semibold text-white ${s.stuck ? "bg-[#d08a4a]" : "bg-[#4b56a8]"}`}>{initials(s.name)}</span>
                      ))}
                      {here.length > 4 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-ink px-1 text-[9.5px] font-semibold text-white">+{here.length - 4}</span>}
                    </span>
                  )}
                  <Head onPointerDown={(e: React.PointerEvent) => startMove(e, m.id)} onClick={(e: React.MouseEvent) => {
                    if (dragged || typing) return;
                    if (e.shiftKey && !readOnly) { setPicks((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; }); return; }
                    onEdit(nd.lessonId, m.id);
                  }} className={`tree-head block w-full rounded-t-[18px] text-left ${readOnly ? "" : "cursor-grab active:cursor-grabbing"} ${moving?.id === m.id ? "opacity-40" : ""}`} style={{ height: level === "far" ? FAR_H : HEAD }} aria-label={`Edit ${m.title}`} title={readOnly ? undefined : "Click to edit · double-click the title to rename · drag to another lesson"}>
                    <span className="block h-1.5 rounded-t-[18px]" style={{ background: suit.tint }} />
                    {level === "far" ? (
                      <span className="block truncate px-3.5 pt-2.5 text-[17px] font-semibold text-ink">{m.title || "Untitled card"}</span>
                    ) : (
                      <>
                        <span className="flex items-center gap-1.5 px-3.5 pt-2 text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: suit.tint }}>
                          <Icon name={kindMeta(kindOf(m)).icon} size={11} />{kindMeta(kindOf(m)).name}
                          <span className="truncate normal-case tracking-normal text-ink-3">
                            · {fromElsewhere ? `dealt in ${fromLesson?.title}` : inbound.length ? "dealt by an answer" : "everyone"}
                          </span>
                        </span>
                        {typing?.id === m.id && typing.field === "title"
                          ? <span className="block px-2 pt-0.5">{typeBox("h-7 text-[14px] font-semibold")}</span>
                          : <span onDoubleClick={startTyping(m.id, "title", m.title)} className="block truncate px-3.5 pt-1 text-[14px] font-semibold leading-snug text-ink">{m.title || "Untitled card"}</span>}
                      </>
                    )}
                  </Head>
                  {level === "near" && (
                    <div className="line-clamp-2 border-t border-line px-3.5 pt-2 text-[12px] leading-[1.45] text-ink-2" style={{ height: PREVIEW }}>
                      {m.body.trim() || <span className="text-ink-3">No instructions yet</span>}
                    </div>
                  )}
                  {level === "far" && nd.members && (
                    <div className="border-t border-line px-3.5 pb-1.5 pt-1">
                      {nd.members.map((c) => <div key={c.id} className="truncate text-[13px] leading-[22px] text-ink-2">{c.title || "Untitled card"}</div>)}
                    </div>
                  )}
                  {level !== "far" && (hasBody(m) || nd.members) && (
                    <div className="border-t border-line pb-[10px]">
                      {nd.members?.map((c) => (
                        <div key={c.id}>
                          <button onClick={() => onEdit(nd.lessonId, c.id)} className="flex w-full items-center gap-2 px-3.5 text-left hover:bg-lane" style={{ height: SEC }} title="Edit this card">
                            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md" style={{ color: suitOfCard(c).tint, background: "rgba(0,0,0,0.035)" }}><Icon name={kindMeta(kindOf(c)).icon} size={11} /></span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{c.title || "Untitled card"}</span>
                            <span className="text-[10.5px] text-ink-3">{kindMeta(kindOf(c)).name}</span>
                          </button>
                          {branchQs(c).map((q) => q.options.map((o, oi) => {
                            const to = q.next?.[oi];
                            return (
                              <div key={`${q.id}-${oi}`} className="relative flex items-center gap-2 pl-9 pr-3.5" style={{ height: ROW }}>
                                <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[10.5px] font-semibold transition-colors ${to ? "bg-[#4b56a8] text-white" : q.answer === oi ? "bg-ok/15 text-ok" : "bg-lane text-ink-3"}`}>{letter(oi)}</span>
                                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">{o.trim() || `Option ${oi + 1}`}</span>
                                <PortDot wired={!!to} readOnly={readOnly} label={to ? `${c.title}: answer ${letter(oi)} deals a card. Change it` : `${c.title}: deal a card for answer ${letter(oi)}`} onPointerDown={(e) => startDrag(e, { from: c.id, q: q.id, option: oi })} />
                              </div>
                            );
                          }))}
                        </div>
                      ))}
                      {qs.map((q) => (
                        <div key={q.id}>
                          {typing?.id === m.id && typing.field === `q:${q.id}`
                            ? <div className="flex items-center px-2" style={{ height: SEC }}>{typeBox("h-6 text-[11.5px]")}</div>
                            : <div onDoubleClick={startTyping(m.id, `q:${q.id}`, q.text)} className="truncate px-3.5 text-[11.5px] leading-[28px] text-ink-3" style={{ height: SEC }} title={readOnly ? undefined : "Double-click to edit"}>{q.text.trim() || "Question"}</div>}
                          {q.options.map((o, oi) => {
                            const to = q.next?.[oi];
                            return (
                              <div key={oi} className="relative flex items-center gap-2 px-3.5" style={{ height: ROW }}>
                                <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[10.5px] font-semibold transition-colors ${to ? "bg-[#4b56a8] text-white" : "bg-lane text-ink-3"}`}>{letter(oi)}</span>
                                {typing?.id === m.id && typing.field === `o:${q.id}:${oi}`
                                  ? <span className="min-w-0 flex-1 pr-3">{typeBox("h-6 text-[12.5px]")}</span>
                                  : <span onDoubleClick={startTyping(m.id, `o:${q.id}:${oi}`, o)} className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2" title={readOnly ? undefined : "Double-click to edit"}>{o.trim() || `Option ${oi + 1}`}</span>}
                                <PortDot wired={!!to} readOnly={readOnly} label={to ? `Answer ${letter(oi)} deals a card. Change it` : `Deal a card for answer ${letter(oi)}`} onPointerDown={(e) => startDrag(e, { from: m.id, q: q.id, option: oi })} />
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {isQuiz(m) && (
                        <div>
                          <div className="flex items-center justify-between px-3.5 text-[11.5px] leading-[28px] text-ink-3" style={{ height: SEC }}>
                            <span>Score (first try)</span>
                            {!readOnly && bands.length > 0 && (
                              <span className="flex gap-2">
                                {bands.length < 5 && bands[bands.length - 1].min < 99 && (
                                  <button onClick={() => { const top = bands[bands.length - 1]; setBands(m, [...bands.map(({ min, next }) => ({ min, next })), { min: Math.round((top.min + 100) / 2), next: null }]); }} className="hover:text-ink">+ Range</button>
                                )}
                                <button onClick={() => setBands(m, undefined)} className="hover:text-bad">Remove</button>
                              </span>
                            )}
                          </div>
                          {bands.map((b, bi) => (
                            <div key={bi} className="relative flex items-center gap-2 px-3.5" style={{ height: ROW }}>
                              <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md transition-colors ${b.next ? "bg-[#4b56a8] text-white" : "bg-lane text-ink-3"}`}><Icon name="quiz" size={11} /></span>
                              {bi === 0 || readOnly ? (
                                <span className="min-w-0 flex-1 text-[12.5px] text-ink-2">{bandLabel(b)}</span>
                              ) : (
                                <span className="flex min-w-0 flex-1 items-center gap-1 text-[12.5px] text-ink-2">
                                  <input
                                    type="number" min={bands[bi - 1].min + 1} max={(bands[bi + 1]?.min ?? 101) - 1} value={b.min}
                                    onChange={(e) => {
                                      const v = Math.round(Number(e.target.value));
                                      if (!(v > bands[bi - 1].min && v < (bands[bi + 1]?.min ?? 101))) return;
                                      setBands(m, bands.map(({ min, next }, k) => ({ min: k === bi ? v : min, next })));
                                    }}
                                    aria-label="Lowest score in this range"
                                    className="h-6 w-12 rounded-md border border-line bg-white px-1 text-center text-[12px] focus:border-line-strong focus:outline-none"
                                  />
                                  <span>{b.max > 100 ? "–100%" : `–${b.max - 1}%`}</span>
                                </span>
                              )}
                              <PortDot wired={!!b.next} readOnly={readOnly} label={b.next ? `Score ${bandLabel(b)} deals a card. Change it` : `Deal a card for score ${bandLabel(b)}`} onPointerDown={(e) => startDrag(e, { from: m.id, q: SCORE, option: bi })} />
                            </div>
                          ))}
                          {!bands.length && !readOnly && (
                            <div style={{ height: ROW }} className="px-3.5">
                              <button onClick={() => setBands(m, DEFAULT_BANDS)} className="press flex h-6 items-center gap-1.5 rounded-md bg-[#eef0fb] px-2 text-[11.5px] font-medium text-[#4b56a8] hover:bg-[#e3e6f8]">
                                <Icon name="split" size={11} /> Branch by score
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {wantsQuestion(m) && (
                        <div className="px-3.5 text-[11.5px] leading-[34px] text-ink-3">
                          {readOnly ? "No question yet" : <button onClick={() => onEdit(nd.lessonId, m.id)} className="hover:text-ink">Add its question to branch from the answers</button>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {box && (
              <div className="pointer-events-none absolute z-30 rounded-lg border-2 border-dashed border-[#4b56a8] bg-[#4b56a8]/[0.06]"
                style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} />
            )}
            {moving && (() => {
              const m = all.find((x) => x.m.id === moving.id)?.m;
              if (!m) return null;
              const bad = moving.to && moving.to !== lessonWith(moving.id)?.id ? whyNot(moving.id, moving.to) : null;
              return (
                <div className="pointer-events-none absolute z-30 rotate-[2deg] rounded-[18px] border border-[#4b56a8] bg-white shadow-[0_24px_50px_-18px_rgba(20,20,18,0.55)]" style={{ left: moving.x - W / 2, top: moving.y - 20, width: W }}>
                  <span className="block h-1.5 rounded-t-[18px]" style={{ background: suitOfCard(m).tint }} />
                  <span className="block truncate px-3.5 pb-3 pt-2 text-[14px] font-semibold text-ink">{m.title || "Untitled card"}</span>
                  {moving.to && moving.to !== lessonWith(moving.id)?.id && (
                    <span className={`block border-t border-line px-3.5 py-1.5 text-[11.5px] ${bad ? "text-bad" : "text-[#4b56a8]"}`}>{bad ? "Can’t go here" : `Move to ${lessons.find((l) => l.id === moving.to)?.title}`}</span>
                  )}
                </div>
              );
            })()}
            {menu && "add" in menu && (
              <div className="pop absolute z-20 w-64 rounded-2xl border border-line bg-white p-2 shadow-[0_24px_60px_-20px_rgba(20,20,18,0.45)]" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
                <div className="px-2 pb-1.5 pt-0.5 text-[12px] font-medium text-ink">New card for everyone in {lessons.find((l) => l.id === menu.add)?.title}</div>
                <div className="grid grid-cols-2 gap-0.5">
                  {ALL_KINDS.map((t) => (
                    <button key={t} onClick={() => addCard(menu.add, t)} className="press flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-lane">
                      <span className="h-3 w-2 flex-none rounded-[3px]" style={{ background: suitOfKind(t).tint }} />{kindMeta(t).name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {menu && "port" in menu && (() => {
              const src = all.find((x) => x.m.id === menu.port.from)?.m;
              const isScore = menu.port.q === SCORE;
              const band = isScore && src ? bandsOf(src)[menu.port.option] : undefined;
              const q = !isScore ? src?.questions?.find((x) => x.id === menu.port.q) : undefined;
              const to = isScore ? band?.next : q?.next?.[menu.port.option];
              const others = targetsFor(menu.port).filter((x) => x.m.id !== to);
              const fromLi = lessonIndex(lessonWith(menu.port.from).id);
              const later = lessons.slice(fromLi, fromLi + 4);
              const groups = lessons.map((l) => ({ l, cards: others.filter((x) => x.lessonId === l.id) })).filter((g) => g.cards.length);
              const into = menuLesson ?? lessons[fromLi].id;
              return (
                <div className="pop absolute z-20 w-72 rounded-2xl border border-line bg-white p-2 shadow-[0_24px_60px_-20px_rgba(20,20,18,0.45)]" style={{ left: menu.x + 14, top: Math.max(8, menu.y - 24) }} onPointerDown={(e) => e.stopPropagation()}>
                  <div className="px-2 pb-1.5 pt-0.5 text-[12px] font-medium text-ink">
                    {isScore ? `Score ${band ? bandLabel(band) : ""}` : `Answer ${letter(menu.port.option)}${q?.options[menu.port.option]?.trim() ? ` · “${q.options[menu.port.option].trim()}”` : ""}`}
                  </div>
                  <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">New card in</div>
                  <div className="mb-1.5 flex flex-wrap gap-1 px-1">
                    {later.map((l, k) => (
                      <button key={l.id} onClick={() => setMenuLesson(l.id)} aria-pressed={into === l.id}
                        className={`press h-6 rounded-full px-2.5 text-[11.5px] transition-colors ${into === l.id ? "bg-ink text-white" : "bg-lane text-ink-2 hover:bg-line"}`}>
                        {k === 0 ? "This lesson" : l.title}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-0.5">
                    {NEW_KINDS.map((t) => (
                      <button key={t} onClick={() => newCard(menu.port, t, into)} className="press flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-lane">
                        <span className="h-3 w-2 flex-none rounded-[3px]" style={{ background: suitOfKind(t).tint }} />{kindMeta(t).name}
                      </button>
                    ))}
                  </div>
                  {menu.mode === "port" && groups.length > 0 && (
                    <>
                      <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">Deal a card already made</div>
                      <div className="max-h-44 overflow-auto">
                        {groups.map((g) => (
                          <div key={g.l.id}>
                            <div className="px-2 pt-1 text-[11px] text-ink-3">{g.l.title}</div>
                            {g.cards.map((x) => (
                              <button key={x.m.id} onClick={() => { wire(menu.port, x.m.id); setMenu(null); }} className="press flex w-full items-center gap-2 truncate rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-lane">
                                <span className="h-3 w-2 flex-none rounded-[3px]" style={{ background: suitOfCard(x.m).tint }} /><span className="truncate">{x.m.title || "Untitled card"}</span>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {menu.mode === "port" && to && (
                    <button onClick={() => { wire(menu.port, null); setMenu(null); }} className="press mt-1 block w-full rounded-lg border-t border-line px-2 py-1.5 text-left text-[12.5px] text-bad hover:bg-lane">
                      Disconnect (the card goes to everyone)
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        {nothing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl border border-line bg-white px-5 py-4 text-center text-[13px] text-ink-2 shadow-sm">
              This course has no cards yet. Use <b>+ Card</b> on a lesson to put one down. Give a card a question with choices (or make it a quiz) and drag its answers to the cards they deal.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PortDot({ wired, readOnly, label, onPointerDown }: { wired: boolean; readOnly?: boolean; label: string; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <button
      onPointerDown={onPointerDown}
      disabled={readOnly}
      aria-label={label}
      className={`tree-port absolute -right-[10px] top-1/2 z-10 flex h-[20px] w-[20px] -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 ${wired ? "border-[#4b56a8] bg-[#4b56a8]" : "border-[#a3a8cf] bg-white"} ${readOnly ? "cursor-default" : "cursor-crosshair"}`}
    >
      {wired && <span className="block h-1.5 w-1.5 rounded-full bg-white" />}
    </button>
  );
}
