"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bandLabel, bandRight, bandsOf, branchBelow, scoreCount, canBranch, DEFAULT_BANDS, SCORE, SHARED_ONLY, wiresOf, type Wire } from "@/lib/branching";
import { bandTone, pathColor, suitOfCard, suitOfKind } from "@/lib/ui";
import { FAMILIES, faceMeta, faceOf, kindOf, newCard as makeCard, unfinished, type CardKind } from "@/lib/kinds";
import { KindArt } from "../cards/KindArt";
import { MathText, plainMath } from "../MathText";
import type { AnswerValue, Lesson, Module, ProgressMap, TrashEntry } from "@/lib/types";
import { Icon } from "../Icon";
import { toast } from "@/lib/toast";
import { ask } from "../Confirm";

// Fixed sizes, so ports and wires are placed from numbers, not by measuring the page.
// A card on the map is a playing card: 5 wide by 7 tall. Only a card group (a stack) can grow taller.
const W = 230;
const CARD_H = Math.round((W * 7) / 5);
const HEAD = 72;
const FAR_H = 96; // a card zoomed out: its colour and a big title
const SEC = 28; // a question's (or the score's) title row
const ROW = 30; // one answer or one score band
const PAD = 10;
const HGAP = 64; // gap between cards side by side (room for the wires leaving their right edge)
const VGAP = 84; // gap between a card and the cards it deals below it
const REGION_GAP = 56; // gap between lessons
const TOP = 92; // room for each lesson's header
// The two kinds of card you put down: Content, or a Question (it starts with choices; its form is set in the editor).
const NEW_KINDS: CardKind[] = FAMILIES.map((f) => f.start);
const familyName = (k: CardKind) => FAMILIES.find((f) => f.start === k)!.name;
const INK = "#4b56a8";
const DAY = 86400000;

export type Level = "far" | "mid" | "near";
const levelOf = (z: number): Level => (z < 0.55 ? "far" : z >= 1.2 ? "near" : "mid");

const branchQs = (m: Module) => (m.questions ?? []).filter((q) => canBranch(q));
/** Cards that branch by score: a quiz, and a card group. */
const isQuiz = (m: Module) => m.type === "quiz" || m.type === "group";
const wantsQuestion = (m: Module) => kindOf(m) === "choice" && !branchQs(m).length && m.type !== "quiz";
/** Whether a card's node has anything under its head: answers, score ranges, its group's cards, or that invitation. */
const hasBody = (m: Module) => branchQs(m).length > 0 || isQuiz(m) || wantsQuestion(m);
const letter = (i: number) => String.fromCharCode(65 + i);
const picked = (v: AnswerValue | undefined, w: Wire) =>
  w.score ? typeof v === "number" && v >= w.score.min && v < w.score.max : Array.isArray(v) ? (v as number[]).includes(w.option) : v === w.option;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

/** The rows on a card at a zoom level: its head, (zoomed in) a preview, then each question's answers and the score bands. */
function rowsOf(m: Module, level: Level, readOnly: boolean, members: Module[] = []) {
  const ports = new Map<string, number>();
  if (level === "far") return { h: Math.max(CARD_H, m.type === "group" ? FAR_H + members.length * 26 + PAD : 0), ports };
  let y = HEAD;
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
  return { h: Math.max(CARD_H, y + PAD), ports };
}

interface Node { m: Module; lessonId: string; li: number; x: number; y: number; h: number; ports: Map<string, number>; parent?: string; members?: Module[] }
interface Region { lesson: Lesson; li: number; x: number; y: number; w: number; h: number }

/**
 * The whole course, top to bottom: each lesson a row, its cards side by side in their order (cards everyone gets on
 * its first line), and what their answers deal hanging below the card that deals them, wired into its top. A card dealt
 * from an earlier lesson starts its own lesson's row, with the wire coming down from above.
 */
function layout(lessons: Lesson[], wires: Wire[], level: Level, readOnly: boolean, weekOfLesson: Record<string, string> = {}) {
  const nodes = new Map<string, Node>();
  const regions: Region[] = [];
  // Zoomed far out, each week is a column (its lessons stacked in it), so a long course fits on one screen. Closer
  // in, every lesson is a row, one under another.
  const columns = level === "far";
  let x0 = 40;
  let y0 = 16, width = 0, height = 0;
  let col: Region[] = [];
  const endColumn = () => {
    if (!col.length) return;
    const cw = Math.max(...col.map((r) => r.w));
    for (const r of col) r.w = cw;
    x0 += cw + REGION_GAP;
    col = [];
  };
  lessons.forEach((lesson, li) => {
    if (columns && li > 0 && weekOfLesson[lesson.id] !== weekOfLesson[lessons[li - 1].id]) { endColumn(); y0 = 16; }
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
    // How wide each card's family is (the card, or what it deals side by side below it), and each card's depth.
    const span = new Map<string, number>();
    const depthOf = new Map<string, number>();
    const rowH: number[] = [];
    const measure = (id: string, d: number): number => {
      depthOf.set(id, d);
      rowH[d] = Math.max(rowH[d] ?? 0, size(id).h);
      const k = kids.get(id) ?? [];
      const below = k.reduce((n, c) => n + measure(c, d + 1), 0) + Math.max(0, k.length - 1) * HGAP;
      const s = Math.max(W, below);
      span.set(id, s);
      return s;
    };
    const order = [...roots, ...loose];
    for (const r of order) measure(r.id, 0);
    const top = y0 + TOP;
    const rowTop = (d: number) => top + rowH.slice(0, d).reduce((n, h) => n + h, 0) + d * VGAP;
    const place = (id: string, left: number) => {
      const { h, ports } = size(id);
      const s = span.get(id)!;
      const k = kids.get(id) ?? [];
      const below = k.reduce((n, c) => n + span.get(c)!, 0) + Math.max(0, k.length - 1) * HGAP;
      nodes.set(id, { m: byId.get(id)!, lessonId: lesson.id, li, x: left + (s - W) / 2, y: rowTop(depthOf.get(id)!), h, ports, parent: parent.get(id), members: byId.get(id)!.type === "group" ? membersOf(id) : undefined });
      let x = left + (s - below) / 2;
      for (const c of k) { place(c, x); x += span.get(c)! + HGAP; }
    };
    let x = x0;
    for (const r of order) { place(r.id, x); x += span.get(r.id)! + HGAP * (level === "far" ? 0.6 : 1); }
    const w = Math.max(W * 2, x - HGAP - x0);
    const h = (rowH.length ? rowTop(rowH.length) - VGAP : top + 120) - y0 + 36;
    const region = { lesson, li, x: x0, y: y0, w, h };
    regions.push(region);
    if (columns) col.push(region);
    width = Math.max(width, w);
    y0 += h + REGION_GAP;
    height = Math.max(height, y0);
  });
  // Every lesson's row is as wide as the widest, so they line up like shelves.
  if (columns) {
    endColumn();
    return { nodes, regions, width: x0 - REGION_GAP + 60, height: Math.max(height + 60, 420) };
  }
  // Every lesson's row is as wide as the widest, so they line up like shelves.
  for (const r of regions) r.w = width;
  return { nodes, regions, width: x0 + width + 60, height: Math.max(y0 + 60, 420) };
}

/**
 * A card moved to just before another card (`before`; null: the end) in a lesson, the same one or another. Its group's
 * cards go with a card group; in its own lesson its follow-ups go with it too, so the List keeps them under it.
 * Returns the lessons that changed.
 */
function applyMove(lessons: Lesson[], id: string, toId: string, before: string | null): Lesson[] {
  const from = lessons.find((l) => l.modules.some((m) => m.id === id));
  const to = lessons.find((l) => l.id === toId);
  if (!from || !to) return [];
  const card = from.modules.find((m) => m.id === id)!;
  const ids = new Set([id, ...(card.type === "group" ? card.members ?? [] : [])]);
  if (from.id === to.id) for (const x of branchBelow(from.modules, id)) ids.add(x);
  const block = from.modules.filter((m) => ids.has(m.id));
  const rest = (from.id === to.id ? from.modules : to.modules).filter((m) => !ids.has(m.id));
  let at = before ? rest.findIndex((m) => m.id === before) : rest.length;
  if (at < 0) at = rest.length;
  const placed = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  if (from.id === to.id) return placed.every((m, i) => m === from.modules[i]) ? [] : [{ ...from, modules: placed }];
  return [{ ...from, modules: from.modules.filter((m) => !ids.has(m.id)) }, { ...to, modules: placed }];
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
export function CourseMap({ lessons, weekOf, todayId, students, progress, readOnly, busy, selected, focus, onChange, onChangeMany, onEdit, onAddLesson, onDelete, trash = [], onRestore, onForget }: {
  /** Deleted cards, to put back from the trash bin. */
  trash?: TrashEntry[];
  onRestore?: (e: TrashEntry) => void;
  /** Delete a trash entry for good. */
  onForget?: (id: string) => void;
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
  /** Delete a card (it asks first, and offers Undo). Hold a card to show the delete buttons. */
  onDelete?: (m: Module) => void;
}) {
  const all = useMemo(() => lessons.flatMap((l, i) => l.modules.map((m) => ({ m, lessonId: l.id, at: i }))), [lessons]);
  const wires = useMemo(() => wiresOf(all.map((x) => x.m)), [all]);
  const scroller = useRef<HTMLDivElement>(null);
  // Playing-card sized cards are tall: start a little zoomed out so a lesson shows several at once.
  const [zoom, setZoom] = useState(0.7);
  const level = levelOf(zoom);
  // A card inside a group has its ports on the group's node.
  const groupOf = useMemo(() => new Map(all.flatMap((x) => (x.m.type === "group" ? (x.m.members ?? []).map((id) => [id, x.m.id] as const) : []))), [all]);
  const nodeOf = (id: string) => groupOf.get(id) ?? id;
  // Cards whose follow-ups are folded away (the button under a card). The map opens with everything folded: each
  // lesson's main path first, the branches a click away.
  const [folded, setFolded] = useState<Set<string>>(() => new Set(wires.map((w) => nodeOf(w.from))));
  const fold = (id: string, on: boolean) => setFolded((f) => {
    if (f.has(id) === on) return f;
    const n = new Set(f);
    if (on) n.add(id); else n.delete(id);
    return n;
  });
  /**
   * Cards out of sight because what deals them is folded: every wire into the card comes from a folded card or from a
   * card that is itself out of sight. A card another, unfolded card also deals stays on the map.
   */
  const hidden = useMemo(() => {
    const out = new Set<string>();
    if (!folded.size) return out;
    const into = new Map<string, Wire[]>();
    for (const w of wires) (into.get(w.to) ?? into.set(w.to, []).get(w.to)!).push(w);
    for (let grew = true; grew; ) {
      grew = false;
      for (const [to, ws] of into) {
        if (out.has(to)) continue;
        if (ws.every((w) => { const f = nodeOf(w.from); return folded.has(f) || out.has(f); })) { out.add(to); grew = true; }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folded, wires, groupOf]);
  /** How many cards a fold hides under each folded card (its own follow-ups and theirs). */
  const foldedUnder = (id: string) => {
    const seen = new Set<string>();
    const walk = (from: string) => { for (const w of wires) if (nodeOf(w.from) === from && hidden.has(w.to) && !seen.has(w.to)) { seen.add(w.to); walk(w.to); } };
    walk(id);
    return seen.size;
  };
  const shownLessons = useMemo(() => (hidden.size ? lessons.map((l) => ({ ...l, modules: l.modules.filter((m) => !hidden.has(m.id) && !hidden.has(groupOf.get(m.id) ?? "")) })) : lessons), [lessons, hidden]);
  // A card being dragged: where the pointer is, the lesson under it and the card it would go before (null: the end),
  // or the trash bin.
  const [moving, setMoving] = useState<{ id: string; x: number; y: number; to?: string; before?: string | null; trash?: boolean } | null>(null);
  // The lesson → week names, kept the same object while they don't change (the caller builds a new one each time).
  const weekKey = JSON.stringify(weekOf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weeksOf = useMemo(() => weekOf, [weekKey]);
  const base = useMemo(() => layout(shownLessons, wires, level, !!readOnly, weeksOf), [shownLessons, wires, level, readOnly, weeksOf]);
  // While a card is dragged, the map shows it where it would land: the other cards slide aside to make room.
  const preview = useMemo(() => {
    if (!moving?.to || moving.trash || moving.before === undefined) return null;
    const changed = applyMove(shownLessons, moving.id, moving.to, moving.before);
    if (!changed.length) return null;
    const by = new Map(changed.map((l) => [l.id, l]));
    return layout(shownLessons.map((l) => by.get(l.id) ?? l), wires, level, !!readOnly, weeksOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving?.id, moving?.to, moving?.before, moving?.trash, shownLessons, wires, level, readOnly]);
  const { nodes, regions, width, height } = preview ?? base;
  /** Whether a card deals anything (so it can fold its follow-ups away). */
  const dealsSome = (id: string) => wires.some((w) => nodeOf(w.from) === id);
  const [drag, setDrag] = useState<{ port: Port; x: number; y: number; over?: string } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuLesson, setMenuLesson] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  // Words edited in place on a card (double-click a title, a question or an answer).
  const [typing, setTyping] = useState<{ id: string; field: string; value: string } | null>(null);
  // A card being dragged to another lesson, and where the pointer is.
  const [dragged, setDragged] = useState(false);
  // Cards picked to put in a card group: shift-click a card, or shift-drag a box around several.
  const [picks, setPicks] = useState<Set<string>>(new Set());
  // "Group cards" from the toolbar: tapping a card picks it (shift-click does the same at any time).
  const [picking, setPicking] = useState(false);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [live, setLive] = useState(false);
  // Hold a card (like an app on a phone's home screen): the cards jiggle and each shows a button to delete it.
  const [jiggle, setJiggle] = useState(false);
  const [now] = useState(() => Date.now());
  const [born] = useState(() => new Map<string, { x: number; y: number }>());

  const targets = useMemo(() => new Map([...nodes].map(([id, n]) => [id, { x: n.x, y: n.y }])), [nodes]);
  const pos = useGlide(targets, (id) => born.get(id) ?? (nodes.get(id)?.parent ? targets.get(nodes.get(id)!.parent!) : undefined));
  const at = (id: string) => pos.get(id) ?? targets.get(id)!;
  const lessonIndex = (lid: string) => lessons.findIndex((l) => l.id === lid);

  // How many students each answer or score band sent down its wire, and who is on which card right now.
  const took = (w: Wire) => students.filter((s) => picked(progress[s.id]?.[w.from]?.dealt?.[w.q], w)).length;
  /** With Where students are on: how many went down an answer's (or score range's) wire, shown in that row. */
  const wentBadge = (from: string, q: string, option: number) => {
    if (!live) return null;
    const w = wires.find((x) => x.from === from && x.q === q && x.option === option);
    const n = w ? took(w) : 0;
    return n ? <span className="chip h-5 flex-none bg-[#4b56a8] px-1.5 text-[10.5px] text-white" title={`${n} student${n === 1 ? "" : "s"} went this way`}><Icon name="users" size={10} />{n}</span> : null;
  };
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
      if (e.key === "Escape" && jiggle && !busy && !document.querySelector("[data-confirm]")) setJiggle(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [menu, busy, jiggle]);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 1600);
    return () => clearTimeout(t);
  }, [fresh]);
  // A card just put down comes into view, so it never lands out of sight below the fold (a moved card stays put).
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!fresh || shown.current === fresh || !targets.has(fresh) || !born.has(fresh)) return;
    shown.current = fresh;
    requestAnimationFrame(() => bringIntoView(fresh));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, targets]);
  // The map fills the rest of the screen below wherever it starts (a banner above it moves it down), so its
  // controls stay on screen and the page's footer sits just below.
  const [fill, setFill] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      const el = scroller.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setFill(Math.max(480, window.innerHeight - top - 16));
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    if (scroller.current?.parentElement?.parentElement) ro.observe(scroller.current.parentElement.parentElement);
    return () => { window.removeEventListener("resize", measure); ro.disconnect(); };
  }, []);

  // The card panel (30rem, fixed on the right) shouldn't cover the map: while it's open the map's right edge moves in
  // to meet it, and what's under the panel is reached by scrolling right.
  const PANEL = 480;
  const [gap, setGap] = useState(0);
  useEffect(() => {
    const measure = () => {
      const wrap = scroller.current?.parentElement;
      if (!wrap || !selected || window.innerWidth < 900) return setGap(0);
      setGap(Math.max(0, Math.round(wrap.getBoundingClientRect().right - (window.innerWidth - PANEL) + 12)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [selected]);

  // Once the map has made room, the card being edited is moved into view if the panel's arrival left it out of sight.
  useEffect(() => {
    if (!gap || !selected) return;
    const t = setTimeout(() => {
      const el = scroller.current, n = targets.get(selected);
      if (!el || !n) return;
      const left = n.x * zoom - el.scrollLeft, right = (n.x + W) * zoom - el.scrollLeft;
      if (left < 0 || right > el.clientWidth) bringIntoView(selected);
    }, 480);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gap, selected]);

  /** Scroll so a card (or a lesson's region) sits in view (the map already stops at the editor panel when it's open). */
  function bringIntoView(id: string, z = zoom) {
    const el = scroller.current;
    if (!el) return;
    const n = targets.get(id);
    const r = regions.find((x) => x.lesson.id === id);
    const px = n ? n.x + W / 2 : r ? r.x + Math.min(r.w, 700) / 2 : null;
    const py = n ? n.y + 80 : r ? r.y + TOP + 120 : null;
    if (px == null || py == null) return;
    const room = el.clientWidth;
    // A lesson wider than the view starts at its left edge (its name and first cards), not cut off in the middle.
    const left = r && !n && (r.w + 40) * z > room ? (r.x - 28) * z : px * z - room / 2;
    // A lesson starts at its top (its name and first row of cards).
    const top = r && !n ? (r.y - 8) * z : py * z - el.clientHeight / 2.4;
    el.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: "smooth" });
  }
  // Going to a lesson from far out: zoom in to where cards can be read, then scroll there once the map has redrawn.
  const [going, setGoing] = useState<string | null>(null);
  function goTo(id: string) {
    if (zoom < 0.55) { setZoom(0.7); setGoing(id); } else bringIntoView(id);
  }
  useEffect(() => {
    if (!going) return;
    const id = going;
    requestAnimationFrame(() => { bringIntoView(id); setGoing(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [going, regions]);
  // A card brought into view (from the panel, a search) that is folded away: unfold what hides it first.
  useEffect(() => {
    if (!focus || !hidden.has(focus.id)) return;
    const up = new Set<string>();
    const climb = (id: string) => { for (const w of wires) if (w.to === id) { const f = nodeOf(w.from); if (!up.has(f)) { up.add(f); climb(f); } } };
    climb(focus.id);
    // Scroll to it once the map has redrawn with it in place.
    setGoing(focus.id);
    setFolded((f) => new Set([...f].filter((x) => !up.has(x))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.at]);
  useEffect(() => {
    if (focus) requestAnimationFrame(() => bringIntoView(focus.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.at]);

  // Pinch on a trackpad (or ctrl/⌘ + scroll) zooms the map, never the page. React's wheel listener can't stop the
  // browser's own zoom (it's passive), so these are the browser's listeners. Safari pinches with gesture events.
  const zoomer = useRef({ zoom, zoomTo: (z: number) => { void z; } });
  useEffect(() => { zoomer.current.zoom = zoom; zoomer.current.zoomTo = zoomTo; });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomer.current.zoomTo(zoomer.current.zoom * Math.exp(-Math.max(-30, Math.min(30, e.deltaY)) * 0.008));
    };
    let start = 1;
    const gStart = (e: Event) => { e.preventDefault(); start = zoomer.current.zoom; };
    const gChange = (e: Event) => { e.preventDefault(); const k = (e as Event & { scale?: number }).scale; if (k) zoomer.current.zoomTo(start * k); };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("gesturestart", gStart, { passive: false } as AddEventListenerOptions);
    el.addEventListener("gesturechange", gChange, { passive: false } as AddEventListenerOptions);
    return () => { el.removeEventListener("wheel", wheel); el.removeEventListener("gesturestart", gStart); el.removeEventListener("gesturechange", gChange); };
  }, []);

  /** Zoom keeping the middle of the view still. */
  function zoomTo(z: number) {
    const el = scroller.current;
    const nz = Math.min(1.6, Math.max(0.15, +z.toFixed(2)));
    if (!el) return setZoom(nz);
    const cx = (el.scrollLeft + el.clientWidth / 2) / zoom, cy = (el.scrollTop + el.clientHeight / 2) / zoom;
    setZoom(nz);
    requestAnimationFrame(() => { el.scrollLeft = cx * nz - el.clientWidth / 2; el.scrollTop = cy * nz - el.clientHeight / 2; });
  }
  /**
   * The zoom button: first the widest lesson's row fills the map's width (lessons read top to bottom, so scroll down
   * for the rest); pressed again, the whole course fits.
   */
  const fitAll = () => {
    const el = scroller.current;
    if (!el) return;
    const byWidth = Math.max(0.15, Math.min(1, (el.clientWidth - 24) / width));
    // The whole course is seen zoomed far out, where weeks are columns: size it from that layout.
    const far = layout(shownLessons, wires, "far", !!readOnly, weeksOf);
    let whole = Math.max(0.15, Math.min(1, (el.clientWidth - 24) / far.width, (el.clientHeight - 24) / far.height));
    if (whole >= 0.55) whole = Math.max(0.15, Math.min(1, (el.clientWidth - 24) / width, (el.clientHeight - 24) / height));
    setZoom(Math.abs(zoom - byWidth) < 0.01 ? whole : byWidth);
    requestAnimationFrame(() => el.scrollTo({ left: 0, top: 0, behavior: "smooth" }));
  };

  const toCanvas = (cx: number, cy: number) => {
    const r = scroller.current!.getBoundingClientRect();
    return { x: (cx - r.left + scroller.current!.scrollLeft) / zoom, y: (cy - r.top + scroller.current!.scrollTop) / zoom };
  };
  // A card inside a group has its ports on the group's node.
  const portPos = (port: Port) => {
    const nid = nodeOf(port.from), n = nodes.get(nid)!, p = at(nid);
    const key = nid !== port.from ? `${port.from}|${port.q}:${port.option}` : `${port.q}:${port.option}`;
    return { x: p.x + W, y: p.y + (n.ports.get(key) ?? n.h / 2) };
  };
  // Wires come into the top of a card (what it deals hangs below it, and later lessons sit lower down).
  const inPos = (id: string) => { const p = at(id); return { x: p.x + W / 2, y: p.y }; };

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
  /**
   * Point a port at a card. A card everyone gets now becomes one only some students get, so say so first (students who
   * already started it keep it).
   */
  const wire = async (port: Port, to: string | null) => {
    if (to && !wires.some((w) => w.to === to)) {
      const m = all.find((x) => x.m.id === to)?.m;
      const started = students.filter((st) => { const p = progress[st.id]?.[to]; return !!p && p.status !== "todo"; }).length;
      const ok = await ask({
        title: `Only students who pick this get “${m?.title || "this card"}”`,
        body: `Right now everyone gets it. Once this answer deals it, students who pick another answer won’t see it.${started ? ` ${started} student${started === 1 ? " has" : "s have"} already started it and will keep it.` : ""} You can undo this.`,
        confirm: "Deal it by this answer",
      });
      if (!ok) return;
    }
    // The card it now deals shows (a folded card would hide it).
    fold(nodeOf(port.from), false);
    onChange(withWire(lessonWith(port.from), port, to));
  };
  const setBands = (m: Module, bands: { min: number; next: string | null }[] | undefined) => {
    const l = lessonWith(m.id);
    onChange({ ...l, modules: l.modules.map((x) => (x.id === m.id ? { ...x, bands } : x)) });
  };

  const blank = (k: CardKind, title: string): Module => makeCard(k, title);

  async function newCard(port: Port, type: CardKind, into: string) {
    const lesson = lessonWith(port.from);
    const src = lesson.modules.find((m) => m.id === port.from)!;
    const what = port.q === SCORE ? `Score ${bandLabel(bandsOf(src)[port.option])}` : plainMath(src.questions?.find((x) => x.id === port.q)?.options[port.option]?.trim() ?? "");
    const card = blank(type, what ? `If “${what.slice(0, 40)}”` : `New ${familyName(type)} card`);
    const p = portPos(port);
    born.set(card.id, { x: p.x + 40, y: p.y - HEAD / 2 });
    setMenu(null);
    fold(nodeOf(port.from), false);
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
    const card = blank(type, `New ${familyName(type)} card`);
    const r = regions.find((x) => x.lesson.id === lessonId);
    if (r) born.set(card.id, { x: r.x + r.w - W, y: r.y + TOP - 40 });
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
    const g: Module = { ...makeCard("content", "Card group"), type: "group", kind: "group", suit: "question", members: ordered };
    // The group goes where its first card was, its cards right after it in their order.
    const before = l.modules.slice(0, l.modules.findIndex((m) => m.id === ordered[0])).filter((m) => !ordered.includes(m.id));
    const after = l.modules.filter((m) => !ordered.includes(m.id) && !before.includes(m));
    onChange({ ...l, modules: [...before, g, ...ordered.map((id) => l.modules.find((m) => m.id === id)!), ...after] });
    setPicks(new Set());
    setPicking(false);
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


  /** Why a card can't go to a lesson: wires only run forward, so it can't go before a card that deals it, or after one it deals. */
  function whyNot(id: string, to: string): string | null {
    const ti = lessonIndex(to);
    const before = wires.filter((w) => w.to === id).find((w) => lessonIndex(lessonWith(w.from).id) > ti);
    if (before) return `It’s dealt by “${all.find((x) => x.m.id === before.from)?.m.title}” in ${lessonWith(before.from).title}, so it can’t come before that lesson.`;
    const after = wires.filter((w) => w.from === id).find((w) => lessonIndex(lessonWith(w.to).id) < ti);
    if (after) return `It deals “${all.find((x) => x.m.id === after.to)?.m.title}” in ${lessonWith(after.to).title}, so it can’t come after that lesson.`;
    return null;
  }
  /**
   * While dragging (a wire, or a card to another lesson), holding the pointer near the map's edge scrolls the map that
   * way, so a card in a lesson further down can be reached. `again` redraws the drag at the pointer after a scroll.
   */
  function edgeScroll(again: (ev: PointerEvent) => void) {
    let last: PointerEvent | null = null, raf = 0;
    const tick = () => {
      const el = scroller.current;
      if (el && last) {
        const r = el.getBoundingClientRect(), E = 56, V = 18;
        const vx = last.clientX < r.left + E ? -V : last.clientX > r.right - E ? V : 0;
        const vy = last.clientY < r.top + E ? -V : last.clientY > r.bottom - E ? V : 0;
        if (vx || vy) { const l = el.scrollLeft, t = el.scrollTop; el.scrollBy(vx, vy); if (el.scrollLeft !== l || el.scrollTop !== t) again(last); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return { track: (ev: PointerEvent) => { last = ev; }, stop: () => cancelAnimationFrame(raf) };
  }

  /** Put a dragged card where it was dropped: before another card in its lesson's row, or in another lesson. */
  async function moveCard(id: string, to: string, before: string | null | undefined) {
    const from = lessonWith(id);
    if (!from) return;
    const m = from.modules.find((x) => x.id === id)!;
    if (from.id === to) {
      if (before === undefined) return;
      const changed = applyMove(lessons, id, to, before);
      if (changed.length) onChange(changed[0]);
      return;
    }
    const why = whyNot(id, to);
    if (why) { toast(`Can’t move it there. ${why}`, { icon: "split", tone: "plain" }); return; }
    const changed = applyMove(lessons, id, to, before ?? null);
    if (!changed.length) return;
    born.delete(id);
    await onChangeMany(changed);
    setFresh(id);
    toast(`Moved “${m.title}” to ${lessons.find((l) => l.id === to)?.title}`, { icon: "layers" });
  }
  /** Where a dragged card would land: the trash bin, or a lesson and the card in its row it would go before. */
  function dropAt(id: string, p: { x: number; y: number }, ev: PointerEvent): { to?: string; before?: string | null; trash?: boolean } {
    if ((document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest("[data-trash]")) return { trash: true };
    // Read from the map as it is without the drag, so the cards sliding aside don't move the target.
    const to = base.regions.find((r) => p.x >= r.x - REGION_GAP / 2 && p.x <= r.x + r.w + REGION_GAP / 2 && p.y >= r.y - REGION_GAP / 2 && p.y <= r.y + r.h + REGION_GAP / 2)?.lesson.id;
    if (!to) return {};
    const from = lessonWith(id);
    if (to !== from?.id && whyNot(id, to)) return { to };
    // A card an answer deals sits under that card; its place in the row isn't its own to choose.
    if (to === from?.id && base.nodes.get(id)?.parent) return { to };
    const row = [...base.nodes.values()].filter((n) => n.lessonId === to && !n.parent && n.m.id !== id).sort((a, b) => a.x - b.x);
    const next = row.find((n) => p.x < n.x + W / 2);
    return { to, before: next ? next.m.id : null };
  }
  /** Press on a card's head and move: drag it along its row to reorder, to another lesson, or into the trash. A press without moving is a click (opens it). */
  function startMove(e: React.PointerEvent, id: string) {
    if (readOnly || e.button !== 0 || typing) return;
    const start = { x: e.clientX, y: e.clientY };
    let on = false;
    let last: ReturnType<typeof dropAt> = {};
    // Held still for a moment: show the delete buttons (and don't open the card on release).
    let held = false;
    const hold = onDelete ? window.setTimeout(() => { held = true; setJiggle(true); navigator.vibrate?.(10); }, 520) : 0;
    const show = (ev: PointerEvent) => {
      const p = toCanvas(ev.clientX, ev.clientY);
      last = dropAt(id, p, ev);
      setMoving({ id, x: p.x, y: p.y, ...last });
    };
    const move = (ev: PointerEvent) => {
      if (!on && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) return;
      clearTimeout(hold);
      on = true;
      edge.track(ev);
      show(ev);
    };
    const edge = edgeScroll((ev) => { if (on) show(ev); });
    const up = (ev: PointerEvent) => {
      edge.stop();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      clearTimeout(hold);
      if (held && !on) { setMoving(null); setDragged(true); setTimeout(() => setDragged(false), 0); return; }
      if (!on) return setMoving(null);
      setDragged(true);
      setTimeout(() => setDragged(false), 0);
      if (ev.type !== "pointerup") return setMoving(null);
      if (last.trash) {
        setMoving(null);
        const m = all.find((x) => x.m.id === id)?.m;
        if (m) onDelete?.(m);
        return;
      }
      // The card stays where the preview showed it while the change is saved (no jump back first).
      if (last.to) void moveCard(id, last.to, last.before);
      requestAnimationFrame(() => setMoving(null));
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
      edge.track(ev);
      const p = toCanvas(ev.clientX, ev.clientY);
      setDrag({ port, x: p.x, y: p.y, over: overAt(ev) });
    };
    const edge = edgeScroll((ev) => { const p = toCanvas(ev.clientX, ev.clientY); setDrag({ port, x: p.x, y: p.y, over: overAt(ev) }); });
    const up = (ev: PointerEvent) => {
      edge.stop();
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
    // Out of the answer's port to the right, then down into the top of the card it deals.
    const dx = Math.max(56, Math.min(160, Math.abs(b.x - a.x) / 2));
    const dy = Math.max(56, Math.abs(b.y - a.y) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`;
  };
  /** A wire's colour: its answer's (A, B, C…), or its score range's (low rose to high green). */
  const colorOf = (w: { from: string; q: string; option: number }) => {
    if (w.q !== SCORE) return pathColor(w.option);
    const src = all.find((x) => x.m.id === w.from)?.m;
    return bandTone(w.option, src ? bandsOf(src).length : 3);
  };
  /** What a wire is for, in a few words: the answer's text, or the score range. */
  const whyOf = (w: Wire) => {
    const src = all.find((x) => x.m.id === w.from)?.m;
    if (!src) return "";
    if (w.q === SCORE) { const b = bandsOf(src)[w.option]; return b ? `Score ${bandLabel(b)}` : "Score"; }
    const o = plainMath(src.questions?.find((q) => q.id === w.q)?.options[w.option]?.trim() ?? "");
    return `${letter(w.option)} · ${o || `Option ${w.option + 1}`}`;
  };
  const drawn = wires.filter((w) => nodes.has(nodeOf(w.from)) && nodes.has(w.to));
  // Each wire leaving a card gets its own lane (top answer nearest the card), so wires side by side don't sit on each other.
  const laneOf = new Map<Wire, number>();
  for (const nid of new Set(drawn.map((w) => nodeOf(w.from)))) {
    drawn.filter((w) => nodeOf(w.from) === nid).sort((x, y) => portPos(x).y - portPos(y).y).forEach((w, i) => laneOf.set(w, i));
  }
  /**
   * A wire's path at right angles: out of the answer's port into the gap right of the card, down into the gap below it
   * (or, for a card further down, to just above that card), across, and into the target card's top. Never behind a card
   * it leaves. Returns the path and where its label goes.
   */
  const route = (w: Wire) => {
    const nid = nodeOf(w.from), n = nodes.get(nid)!, p = at(nid);
    const a = portPos(w), b = inPos(w.to), k = laneOf.get(w) ?? 0;
    if (b.y < p.y + n.h + 24) return { d: curve(a, b), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    // The bottom of the source card's row (a taller card beside it reaches lower).
    const rowBottom = Math.max(...[...nodes.values()].filter((o) => o.li === n.li && Math.abs(o.y - n.y) < 1).map((o) => at(o.m.id).y + o.h));
    const gx = p.x + W + 18 + k * 7;
    const under = rowBottom + 20 + k * 7;
    const above = Math.max(under, b.y - 26 - k * 6);
    // Straight into the next row: across the gap under the source's row, and down.
    if (b.y - rowBottom <= VGAP + 24)
      return { d: elbow([a, { x: gx, y: a.y }, { x: gx, y: under }, { x: b.x, y: under }, b]), mid: { x: (gx + b.x) / 2, y: under } };
    // Further down: run down whichever gap between cards has the fewest cards in the way.
    const hits = (x: number) => [...nodes.values()].filter((o) => { const q = at(o.m.id); return x > q.x - 6 && x < q.x + W + 6 && q.y + o.h > under && q.y < above; }).length;
    const cands = [gx, b.x - W / 2 - 22 - k * 5, b.x + W / 2 + 22 + k * 5, ...[...nodes.values()].map((o) => at(o.m.id).x - HGAP / 2 + k * 5)];
    let vx = gx, best = Infinity;
    for (const x of cands) { const s = hits(x) * 100000 + Math.abs(x - gx) + Math.abs(x - b.x) * 0.5; if (s < best) { best = s; vx = x; } }
    const pts = vx === gx
      ? [a, { x: gx, y: a.y }, { x: gx, y: above }, { x: b.x, y: above }, b]
      : [a, { x: gx, y: a.y }, { x: gx, y: under }, { x: vx, y: under }, { x: vx, y: above }, { x: b.x, y: above }, b];
    return { d: elbow(pts), mid: { x: (vx + b.x) / 2, y: above } };
  };
  const snap = drag?.over && canTarget(drag.port, drag.over) ? inPos(drag.over) : null;
  const nothing = !all.length;

  return (
    <div className="relative">
      {jiggle && (
        <div className="pop absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-line bg-white py-1.5 pl-4 pr-1.5 text-[13px] shadow-[0_16px_40px_-16px_rgba(20,20,18,0.4)]">
          <span className="text-ink-2">Tap <span className="inline-flex h-4 w-4 translate-y-[3px] items-center justify-center rounded-full bg-[#6f6f6c]"><span className="block h-[2px] w-2 rounded-full bg-white" /></span> to delete a card</span>
          <button onClick={() => setJiggle(false)} className="btn btn-dark press h-8 px-4 text-[12.5px]">Done</button>
        </div>
      )}
      {(picks.size > 0 || picking) && (
        <div className="pop absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-[13px] shadow-[0_16px_40px_-16px_rgba(20,20,18,0.4)]">
          <Icon name="layers" size={14} className="text-[#4b56a8]" />
          <span>{picks.size ? `${picks.size} card${picks.size === 1 ? "" : "s"} picked` : "Tap the Question cards to put in a group"}</span>
          <button onClick={makeGroup} disabled={!!whyNoGroup([...picks])} title={whyNoGroup([...picks]) ?? "Put these cards in a card group"} className="btn btn-dark press h-8 px-3 text-[12.5px] disabled:opacity-40">Make a card group</button>
          <button onClick={() => { setPicks(new Set()); setPicking(false); }} className="btn btn-quiet press h-8 px-2 text-[12.5px]">Cancel</button>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-line bg-white/95 p-0.5 shadow-sm backdrop-blur">
          <button onClick={() => zoomTo(zoom - 0.15)} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom out">−</button>
          <button onClick={fitAll} className="mono h-7 w-12 rounded-lg text-center hover:bg-lane" title="Fit the map’s width (press again to see the whole course)">{Math.round(zoom * 100)}%</button>
          <button onClick={() => zoomTo(zoom + 0.15)} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom in">+</button>
        </div>
        <select
          value=""
          onChange={(e) => { if (e.target.value) { goTo(e.target.value); e.target.value = ""; } }}
          aria-label="Go to a lesson"
          className="pointer-events-auto h-8 rounded-xl border border-line bg-white/95 px-2 text-[12.5px] shadow-sm"
        >
          <option value="">Go to a lesson…</option>
          {lessons.map((l) => <option key={l.id} value={l.id}>{weekOf[l.id] ? `${weekOf[l.id]} · ` : ""}{l.title}</option>)}
        </select>
        {!readOnly && (
          <button onClick={() => { setPicking((v) => !v); setJiggle(false); }} aria-pressed={picking} title="Pick cards to answer together; their total score can deal cards"
            className={`pointer-events-auto press flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[12.5px] shadow-sm ${picking ? "border-[#4b56a8]/30 bg-[#eef0fb] text-[#4b56a8]" : "border-line bg-white/95 text-ink-2"}`}>
            <Icon name="layers" size={13} /> Group cards
          </button>
        )}
        {wires.length > 0 && (
          <button
            onClick={() => {
              const all = [...new Set(wires.map((w) => nodeOf(w.from)))];
              setFolded(folded.size ? new Set<string>() : new Set(all));
            }}
            title={folded.size ? "Show every card again" : "Fold away every card an answer deals, to see the main path"}
            className="pointer-events-auto press flex h-8 items-center gap-1.5 rounded-xl border border-line bg-white/95 px-2.5 text-[12.5px] text-ink-2 shadow-sm"
          >
            <Icon name="chevron" size={13} className={folded.size ? "-rotate-90" : ""} /> {folded.size ? "Unfold all" : "Fold all"}
          </button>
        )}
        {!readOnly && onDelete && <TrashBin entries={trash} hot={!!moving?.trash} dragging={!!moving} onRestore={onRestore} onForget={onForget} />}
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
        className="tree-canvas relative overscroll-contain h-[calc(100dvh-11.75rem)] sm:h-[calc(100dvh-9.5rem)] min-h-[30rem] overflow-auto rounded-2xl border border-line bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-[#4b56a8]/30"
        style={{ backgroundSize: `${22 * zoom}px ${22 * zoom}px`, height: fill ?? undefined, marginRight: gap, transition: "margin-right 0.45s cubic-bezier(0.22, 1, 0.36, 1)" }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvas) return;
          setMenu(null);
          if (jiggle) setJiggle(false);
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
          if (picks.size && !picking) setPicks(new Set());
          // Drag the background to move around.
          const el = scroller.current!;
          const s = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
          el.style.cursor = "grabbing";
          const move = (ev: PointerEvent) => { el.scrollLeft = s.l - (ev.clientX - s.x); el.scrollTop = s.t - (ev.clientY - s.y); };
          const up = () => { el.style.cursor = ""; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        <div data-canvas="1" style={{ width: width * zoom, height: height * zoom }} className="relative">
          <div data-canvas="1" className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${zoom})` }}>
            {/* Lessons: a quiet band each, with its name and a way to add a card. */}
            {regions.map((r) => {
              const today = r.lesson.id === todayId;
              // The lesson as it really is (the drawn one leaves out folded-away cards).
              const full = lessons.find((l) => l.id === r.lesson.id) ?? r.lesson;
              const branches = wiresOf(full).length;
              return (
                <div key={r.lesson.id} data-canvas="1" className={`absolute rounded-[28px] transition-[background-color,box-shadow] duration-200 ${moving && moving.to === r.lesson.id && lessonWith(moving.id)?.id !== r.lesson.id ? (whyNot(moving.id, r.lesson.id) ? "bg-bad/[0.06] ring-2 ring-bad/30" : "bg-[#4b56a8]/[0.07] ring-2 ring-[#4b56a8]/40") : today ? "tree-lesson-today" : "tree-lesson"}`} style={{ left: r.x - 20, top: r.y, width: r.w + 40, height: r.h }}>
                  <div className="flex min-w-0 items-center gap-2 px-5 pt-3.5" style={{ fontSize: level === "far" ? 22 : 13 }}>
                    <span className={`flex flex-none items-center justify-center rounded-full font-semibold ${today ? "bg-ok text-white" : "bg-ink text-white"} ${level === "far" ? "h-9 w-9 text-[17px]" : "h-[22px] w-[22px] text-[11px]"}`}>{regions.indexOf(r) + 1}</span>
                    {readOnly || level === "far" ? <span className="min-w-0 truncate font-semibold text-ink">{r.lesson.title}</span>
                      : <LessonName title={r.lesson.title} onRename={(title) => { const real = lessons.find((l) => l.id === r.lesson.id); if (real) onChange({ ...real, title }); }} />}
                    {weekOf[r.lesson.id] && <span className="flex-none text-ink-3">{weekOf[r.lesson.id]}</span>}
                    {today && <span className="chip h-5 flex-none bg-ok/10 text-[11px] text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Today</span>}
                  </div>
                  <div className="flex items-center gap-2 px-5 pt-1.5">
                    {level !== "far" && <span className="mono">{full.modules.filter((m) => m.type !== "group").length} card{full.modules.filter((m) => m.type !== "group").length === 1 ? "" : "s"}{branches ? ` · ${branches} branch${branches === 1 ? "" : "es"}` : ""}</span>}
                    <span className="flex-1" />
                    {!readOnly && level !== "far" && (
                      <button onClick={(e) => { e.stopPropagation(); const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); const p = toCanvas(b.left, b.bottom); setMenu({ add: r.lesson.id, x: p.x - 200, y: p.y + 4 }); }}
                        className="press flex h-7 items-center gap-1 rounded-lg bg-white px-2 text-[12px] text-ink-2 shadow-sm hover:text-ink"><Icon name="plus" size={12} /> Card</button>
                    )}
                  </div>
                  {!full.modules.length && (
                    <div className="mx-5 mt-6 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[12.5px] text-ink-3">No cards yet</div>
                  )}
                </div>
              );
            })}
            {!readOnly && onAddLesson && (
              <button onClick={onAddLesson} className="press absolute flex items-center gap-1.5 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-3 hover:text-ink" style={{ left: 40, top: height - 76 }}>
                <Icon name="plus" size={13} /> Lesson
              </button>
            )}

            <svg width={width} height={height} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
              <defs>
                <marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={INK} /></marker>
              </defs>
              {drawn.map((w) => {
                const a = portPos(w);
                const { d } = route(w);
                const on = hot === w.from || hot === w.to || selected === w.from || selected === w.to;
                const dim = !!(hot || selected) && !on;
                const n = took(w);
                const cross = nodes.get(nodeOf(w.from))!.li !== nodes.get(w.to)!.li;
                const c = colorOf(w);
                const k = level === "far" ? 2 : 1;
                return (
                  <g key={`${w.from}-${w.q}-${w.option}-${w.to}`} style={{ opacity: dim ? 0.22 : 1, transition: "opacity 0.25s" }}>
                    {/* A soft halo under the line, so paths read as paths on the dotted canvas. */}
                    <path d={d} fill="none" stroke={c} strokeOpacity={on ? 0.2 : 0.09} strokeWidth={(on ? 11 : 8) * k} strokeLinecap="round" style={{ transition: "stroke-opacity 0.25s, stroke-width 0.25s" }} />
                    <path d={d} fill="none" stroke={c} strokeWidth={(on ? 2.6 : 1.9) * k} strokeLinecap="round" strokeDasharray={cross ? "7 6" : undefined} pathLength={cross ? undefined : 1} className={cross ? "" : "tree-wire"} />
                    <circle cx={a.x} cy={a.y} r={2.2 * k} fill="#fff" />
                    {n > 0 && live && <path d={d} fill="none" stroke={c} strokeWidth={2.6 * k} strokeLinecap="round" className="tree-flow" />}
                  </g>
                );
              })}
              {drag && <path d={curve(portPos(drag.port), snap ?? drag)} fill="none" stroke={colorOf(drag.port)} strokeWidth={2.2} strokeDasharray={snap ? undefined : "6 6"} markerEnd="url(#map-arrow)" className={snap ? "" : "tree-dash"} />}
              {menu && "port" in menu && menu.mode === "new" && <path d={curve(portPos(menu.port), menu)} fill="none" stroke={INK} strokeWidth={2.2} strokeDasharray="6 6" markerEnd="url(#map-arrow)" className="tree-dash" />}
            </svg>

            {level !== "far" && !drag && drawn.filter((w) => hot === w.from || hot === w.to || selected === w.from || selected === w.to).map((w) => {
              const { mid } = route(w);
              return (
                <span key={`why-${w.from}-${w.q}-${w.option}`} className="pop pointer-events-none absolute z-20 max-w-[180px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border bg-white px-2.5 py-[3px] text-[11px] font-medium shadow-[0_6px_16px_-8px_rgba(20,20,18,0.45)]"
                  style={{ left: mid.x, top: mid.y, color: colorOf(w), borderColor: `${colorOf(w)}55` }}>{whyOf(w)}</span>
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
              const nQ = isQuiz(m) ? scoreCount(m, lessons.find((l) => l.id === nd.lessonId)?.modules ?? []) : 0;
              const isSel = selected === m.id;
              // While its title is being typed, the head isn't a button (a text box can't sit inside one).
              const Head = typing?.id === m.id && typing.field === "title" ? "div" : "button";
              return (
                <div
                  key={m.id}
                  data-node={m.id}
                  onPointerEnter={() => setHot(m.id)}
                  onPointerLeave={() => setHot((h) => (h === m.id ? null : h))}
                  className={`tree-node absolute flex flex-col rounded-[18px] border bg-white ${moving?.id === m.id ? "border-dashed !border-[#4b56a8] opacity-35" : ""} ${m.type === "group" ? "isolate" : ""} ${jiggle ? "tree-jiggle" : ""} ${fresh === m.id ? "tree-fresh" : ""} ${isSel || picks.has(m.id) ? "border-[#4b56a8] ring-4 ring-[#4b56a8]/20" : drag?.over === m.id && targetable ? "tree-target border-[#4b56a8]" : drag && !targetable && m.id !== drag.port.from ? "border-line opacity-45" : stuck >= 2 ? "border-[#d08a4a]" : hot === m.id ? "border-line-strong" : "border-line"}`}
                  style={{ left: p.x, top: p.y, width: W, height: nd.h, animationDelay: jiggle ? `${-(i % 5) * 70}ms` : `${Math.min(i, 14) * 25}ms` }}
                >
                  {jiggle && onDelete && (
                    <button onClick={(e) => { e.stopPropagation(); onDelete(m); }} onPointerDown={(e) => e.stopPropagation()} aria-label={`Delete ${m.title || "this card"}`}
                      className="pop absolute -left-2.5 -top-2.5 z-30 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#6f6f6c] text-white shadow-md hover:bg-bad">
                      <span className="block h-[2.5px] w-3 rounded-full bg-white" />
                    </button>
                  )}
                  {m.type === "group" && (
                    // A card group looks like a small stack of cards.
                    <>
                      <span aria-hidden="true" className="absolute inset-0 -z-10 translate-x-[6px] translate-y-[6px] rounded-[18px] border border-line bg-white" />
                      <span aria-hidden="true" className="absolute inset-0 -z-20 translate-x-[12px] translate-y-[12px] rounded-[18px] border border-line bg-white" />
                    </>
                  )}
                  {inbound.length > 0 && <span className={`absolute left-1/2 z-10 -translate-x-1/2 rounded-full border-2 border-white shadow-[0_0_0_3px_rgba(255,255,255,0.6)] ${level === "far" ? "-top-[8px] h-3.5 w-3.5" : "-top-[7px] h-3 w-3"}`} style={{ background: colorOf(inbound[0]) }} />}
                  {here.length > 0 && (
                    <span className="absolute -bottom-3 left-3 z-10 flex -space-x-1.5" title={`${here.map((s) => s.name).join(", ")} ${here.length === 1 ? "is" : "are"} working on this${stuck ? ` (${stuck} for over 2 days)` : ""}`}>
                      {here.slice(0, 4).map((s) => (
                        <span key={s.id} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9.5px] font-semibold text-white ${s.stuck ? "bg-[#d08a4a]" : "bg-[#4b56a8]"}`}>{initials(s.name)}</span>
                      ))}
                      {here.length > 4 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-ink px-1 text-[9.5px] font-semibold text-white">+{here.length - 4}</span>}
                    </span>
                  )}
                  <Head onPointerDown={(e: React.PointerEvent) => startMove(e, m.id)} onClick={(e: React.MouseEvent) => {
                    if (dragged || typing || jiggle) return;
                    if ((e.shiftKey || picking) && !readOnly) { setPicks((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; }); return; }
                    onEdit(nd.lessonId, m.id);
                  }} onContextMenu={(e: React.MouseEvent) => { if (!readOnly) e.preventDefault(); }} className={`tree-head block w-full flex-none select-none rounded-t-[18px] text-left [-webkit-touch-callout:none] ${readOnly ? "" : "cursor-grab active:cursor-grabbing"}`} style={{ height: level === "far" ? FAR_H : HEAD }} aria-label={`Edit ${m.title}`} title={readOnly ? undefined : "Click to edit · double-click the title to rename · drag to another lesson"}>
                    <span className="tree-bar block h-[5px] rounded-t-[18px]" style={{ "--bar": suit.tint } as React.CSSProperties} />
                    {level === "far" ? (
                      <span className="line-clamp-2 px-4 pt-3 text-[26px] font-semibold leading-[1.15] text-ink">{m.title || "Untitled card"}</span>
                    ) : (
                      <>
                        <span className="flex items-center gap-1.5 px-3.5 pt-2 text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: suit.tint }}>
                          <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px]" style={{ background: `${suit.tint}16` }}><Icon name={faceMeta(m).icon} size={11} /></span>{faceMeta(m).name}
                          <span className="truncate normal-case tracking-normal text-ink-3">
                            · {unfinished(m) ? <span className="text-[#a0561f]">hidden until it has a question</span> : fromElsewhere ? `dealt in ${fromLesson?.title}` : inbound.length ? "dealt by an answer" : "everyone"}
                          </span>
                        </span>
                        {typing?.id === m.id && typing.field === "title"
                          ? <span className="block px-2 pt-0.5">{typeBox("h-7 text-[14px] font-semibold")}</span>
                          : <span onDoubleClick={startTyping(m.id, "title", m.title)} className="block truncate px-3.5 pt-1 text-[14px] font-semibold leading-snug text-ink">{m.title || "Untitled card"}</span>}
                      </>
                    )}
                  </Head>
                  {level === "far" && nd.members && (
                    <div className="border-t border-line px-4 pb-1.5 pt-1">
                      {nd.members.map((c) => <div key={c.id} className="truncate text-[17px] leading-[26px] text-ink-2">{c.title || "Untitled card"}</div>)}
                    </div>
                  )}
                  {level !== "far" && (hasBody(m) || nd.members) && (
                    <div className="flex-none border-t border-line pb-[10px]">
                      {nd.members?.map((c) => (
                        <div key={c.id}>
                          <button onClick={() => onEdit(nd.lessonId, c.id)} className="flex w-full items-center gap-2 px-3.5 text-left hover:bg-lane" style={{ height: SEC }} title="Edit this card">
                            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md" style={{ color: suitOfCard(c).tint, background: "rgba(0,0,0,0.035)" }}><Icon name={faceMeta(c).icon} size={11} /></span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{c.title || "Untitled card"}</span>
                            <span className={`text-[10.5px] ${unfinished(c) ? "text-[#a0561f]" : "text-ink-3"}`}>{unfinished(c) ? "No question yet" : faceMeta(c).name}</span>
                          </button>
                          {branchQs(c).map((q) => q.options.map((o, oi) => {
                            const to = q.next?.[oi];
                            return (
                              <div key={`${q.id}-${oi}`} className="relative flex items-center gap-2 pl-9 pr-3.5" style={{ height: ROW }}>
                                <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[10.5px] font-semibold transition-colors ${to ? "text-white" : q.answer === oi ? "bg-ok/15 text-ok" : "bg-lane text-ink-3"}`} style={to ? { background: pathColor(oi) } : undefined}>{letter(oi)}</span>
                                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">{o.trim() ? <MathText text={o.trim()} /> : `Option ${oi + 1}`}</span>
                                {wentBadge(c.id, q.id, oi)}
                                <PortDot color={pathColor(oi)} wired={!!to} readOnly={readOnly} label={to ? `${c.title}: answer ${letter(oi)} deals a card. Change it` : `${c.title}: deal a card for answer ${letter(oi)}`} onPointerDown={(e) => startDrag(e, { from: c.id, q: q.id, option: oi })} />
                              </div>
                            );
                          }))}
                        </div>
                      ))}
                      {qs.map((q) => (
                        <div key={q.id}>
                          {typing?.id === m.id && typing.field === `q:${q.id}`
                            ? <div className="flex items-center px-2" style={{ height: SEC }}>{typeBox("h-6 text-[11.5px]")}</div>
                            : <div onDoubleClick={startTyping(m.id, `q:${q.id}`, q.text)} className="truncate px-3.5 text-[11.5px] leading-[28px] text-ink-3" style={{ height: SEC }} title={readOnly ? undefined : "Double-click to edit"}><MathText text={q.text.trim() || m.title || "Question"} /></div>}
                          {q.options.map((o, oi) => {
                            const to = q.next?.[oi];
                            return (
                              <div key={oi} className="relative flex items-center gap-2 px-3.5" style={{ height: ROW }}>
                                <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[10.5px] font-semibold transition-colors ${to ? "text-white" : q.answer === oi ? "bg-ok/15 text-ok" : "bg-lane text-ink-3"}`} style={to ? { background: pathColor(oi) } : undefined} title={q.answer === oi && !m.poll ? "The right answer" : undefined}>{letter(oi)}</span>
                                {typing?.id === m.id && typing.field === `o:${q.id}:${oi}`
                                  ? <span className="min-w-0 flex-1 pr-3">{typeBox("h-6 text-[12.5px]")}</span>
                                  : <span onDoubleClick={startTyping(m.id, `o:${q.id}:${oi}`, o)} className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2" title={readOnly ? undefined : "Double-click to edit"}>{o.trim() ? <MathText text={o.trim()} /> : `Option ${oi + 1}`}</span>}
                                {wentBadge(m.id, q.id, oi)}
                                <PortDot color={pathColor(oi)} wired={!!to} readOnly={readOnly} label={to ? `Answer ${letter(oi)} deals a card. Change it` : `Deal a card for answer ${letter(oi)}`} onPointerDown={(e) => startDrag(e, { from: m.id, q: q.id, option: oi })} />
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
                              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md text-white transition-colors" style={{ background: bandTone(bi, bands.length), opacity: b.next ? 1 : 0.55 }}><Icon name="quiz" size={11} /></span>
                              {bi === 0 || readOnly ? (
                                <span className="min-w-0 flex-1 text-[12.5px] text-ink-2">{bandLabel(b)}</span>
                              ) : (
                                <span className="flex min-w-0 flex-1 items-center gap-1 whitespace-nowrap text-[12.5px] text-ink-2">
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
                                  <span className="whitespace-nowrap">{b.max > 100 ? (b.min >= 100 ? "%" : "–100%") : `–${b.max - 1}%`}</span>
                                </span>
                              )}
                              {nQ > 0 && (() => { const r = bandRight(b, nQ); return <span className={`mono mr-2 flex-none whitespace-nowrap text-[10.5px] ${r ? "" : "text-bad"}`} title={r ?? "No score falls in this range"}>{r ? r.replace(/ of \d+ right$/, " right") : "never"}</span>; })()}
                              {wentBadge(m.id, SCORE, bi)}
                              <PortDot color={bandTone(bi, bands.length)} wired={!!b.next} readOnly={readOnly} label={b.next ? `Score ${bandLabel(b)} deals a card. Change it` : `Deal a card for score ${bandLabel(b)}`} onPointerDown={(e) => startDrag(e, { from: m.id, q: SCORE, option: bi })} />
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
                  {!nd.members && <CardRest m={m} far={level === "far"} art={level === "far" || !hasBody(m)} tint={suit.tint} cover={suit.cover} />}
                  {dealsSome(m.id) && (() => {
                    // Fold this card's follow-ups away to see just this card, or bring them back.
                    const shut = folded.has(m.id);
                    const n = shut ? foldedUnder(m.id) : 0;
                    return (
                      <button
                        onClick={(e) => { e.stopPropagation(); fold(m.id, !shut); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-pressed={shut}
                        aria-label={shut ? `Show the ${n} card${n === 1 ? "" : "s"} this card deals` : "Fold away the cards this card deals"}
                        title={shut ? "Show the cards this card deals" : "Fold away the cards this card deals"}
                        className={`press absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border font-medium shadow-sm transition-colors ${shut ? "border-[#4b56a8] bg-[#4b56a8] text-white hover:bg-[#3f4991]" : "border-line bg-white text-ink-3 hover:border-line-strong hover:text-ink"} ${level === "far" ? "h-10 px-4 text-[18px]" : "h-6 px-2.5 text-[11.5px]"}`}
                      >
                        <Icon name="chevron" size={level === "far" ? 16 : 11} className={`transition-transform ${shut ? "-rotate-90" : "rotate-0"}`} />
                        {shut ? `${n} card${n === 1 ? "" : "s"}` : "Fold"}
                      </button>
                    );
                  })()}
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
                  {moving.trash ? (
                    <span className="block border-t border-line px-3.5 py-1.5 text-[11.5px] text-bad">Drop to delete</span>
                  ) : moving.to && moving.to !== lessonWith(moving.id)?.id && (
                    <span className={`block border-t border-line px-3.5 py-1.5 text-[11.5px] ${bad ? "text-bad" : "text-[#4b56a8]"}`}>{bad ? "Can’t go here" : `Move to ${lessons.find((l) => l.id === moving.to)?.title}`}</span>
                  )}
                </div>
              );
            })()}
            {menu && "add" in menu && (
              <div className="pop absolute z-20 w-64 rounded-2xl border border-line bg-white p-2 shadow-[0_24px_60px_-20px_rgba(20,20,18,0.45)]" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
                <div className="px-2 pb-1.5 pt-0.5 text-[12px] font-medium text-ink">New card for everyone in {lessons.find((l) => l.id === menu.add)?.title}</div>
                <div className="grid grid-cols-2 gap-0.5">
                  {NEW_KINDS.map((t) => (
                    <button key={t} onClick={() => addCard(menu.add, t)} className="press flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-lane">
                      <span className="h-3 w-2 flex-none rounded-[3px]" style={{ background: suitOfKind(t).tint }} />{familyName(t)}
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
                    {isScore ? `Score ${band ? bandLabel(band) : ""}` : `Answer ${letter(menu.port.option)}${q?.options[menu.port.option]?.trim() ? ` · “${plainMath(q.options[menu.port.option].trim())}”` : ""}`}
                  </div>
                  <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">New card in</div>
                  <div className="mb-1.5 flex flex-wrap gap-1 px-1">
                    {later.map((l, k) => (
                      <button key={l.id} onClick={() => setMenuLesson(l.id)} aria-pressed={into === l.id}
                        className={`press h-6 rounded-full px-2.5 text-[11.5px] transition-colors ${into === l.id ? "bg-ink text-white" : "bg-lane text-ink-2 hover:bg-line"}`}>
                        {k === 0 ? "This lesson" : `${weekOf[l.id] ? `${weekOf[l.id]}: ` : ""}${l.title}`}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-0.5">
                    {NEW_KINDS.map((t) => (
                      <button key={t} onClick={() => newCard(menu.port, t, into)} className="press flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-lane">
                        <span className="h-3 w-2 flex-none rounded-[3px]" style={{ background: suitOfKind(t).tint }} />{familyName(t)}
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
              This course has no cards yet. Use <b>+ Card</b> on a lesson to put one down. Give a Question card some choices, then drag each answer to the card it deals.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A path through these points at right angles, each corner rounded. */
function elbow(pts: { x: number; y: number }[], r = 12) {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p, c, n] = [pts[i - 1], pts[i], pts[i + 1]];
    const k = Math.min(r, Math.hypot(c.x - p.x, c.y - p.y) / 2, Math.hypot(n.x - c.x, n.y - c.y) / 2);
    const u = (q: { x: number; y: number }) => { const l = Math.hypot(q.x - c.x, q.y - c.y) || 1; return { x: c.x + ((q.x - c.x) / l) * k, y: c.y + ((q.y - c.y) / l) * k }; };
    const a = u(p), b = u(n);
    d += ` L ${a.x} ${a.y} Q ${c.x} ${c.y}, ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/** The rest of a card below its head and answers: its picture (or drawing) and the start of what to do, like a playing card's face. */
function CardRest({ m, far, art, tint, cover }: { m: Module; far: boolean; art: boolean; tint: string; cover: string }) {
  const first = m.attachments?.[0];
  const body = m.body.trim();
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-2 overflow-hidden ${far ? "px-4 pb-4 pt-1" : "px-3.5 pb-3.5 pt-1.5"}`}>
      {art && (
        <div className="relative min-h-[3rem] flex-1 overflow-hidden rounded-[12px]" style={{ background: cover }}>
          {first?.kind === "image"
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={first.url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            : <KindArt id={m.id} face={faceOf(m)} tint={tint} cover={cover} />}
        </div>
      )}
      {!far && body && <p className={`flex-none text-[12px] leading-[1.45] text-ink-2 ${art ? "line-clamp-3" : "line-clamp-[8]"}`}><MathText text={body} /></p>}
      {/* Nothing more to say: the card's drawing fills the rest of its face, as on a playing card. */}
      {!far && !body && !art && (
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[12px] opacity-80" style={{ background: cover }}>
          <KindArt id={m.id} face={faceOf(m)} tint={tint} cover={cover} />
        </div>
      )}
    </div>
  );
}

function PortDot({ wired, readOnly, label, color = "#4b56a8", onPointerDown }: { wired: boolean; readOnly?: boolean; label: string; color?: string; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <button
      onPointerDown={onPointerDown}
      disabled={readOnly}
      aria-label={label}
      className={`tree-port absolute -right-[10px] top-1/2 z-10 flex h-[20px] w-[20px] -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 ${wired ? "" : "bg-white"} ${readOnly ? "cursor-default" : "cursor-crosshair"}`}
      style={{ borderColor: wired ? color : "#c4c6d0", background: wired ? color : undefined, boxShadow: wired ? `0 0 0 4px ${color}1f` : undefined, ["--port" as string]: color }}
    >
      {wired && <span className="block h-1.5 w-1.5 rounded-full bg-white" />}
    </button>
  );
}

/** A lesson's name on the map: click it to rename, Enter or click away to keep, Esc to undo. */
function LessonName({ title, onRename }: { title: string; onRename: (t: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const done = (keep: boolean) => {
    const t = draft?.trim();
    if (keep && t && t !== title) onRename(t);
    setDraft(null);
  };
  if (draft === null) {
    return (
      <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setDraft(title); }} title="Rename this lesson"
        className="-mx-1 min-w-0 truncate rounded-md px-1 font-semibold text-ink hover:bg-white/80">{title}</button>
    );
  }
  return (
    <input autoFocus value={draft} aria-label="Lesson name" maxLength={80}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)} onBlur={() => done(true)}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); }}
      className="-mx-1 min-w-0 flex-1 rounded-md border border-line-strong bg-white px-1 font-semibold text-ink outline-none" />
  );
}

/**
 * The trash bin at the end of the map's toolbar: drag a card onto it to delete it (with its follow-ups); click it to see
 * what was deleted and put cards back.
 */
function TrashBin({ entries, hot, dragging, onRestore, onForget }: { entries: TrashEntry[]; hot: boolean; dragging: boolean; onRestore?: (e: TrashEntry) => void; onForget?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as globalThis.Node)) setOpen(false); };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);
  const list = [...entries].reverse();
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  return (
    <div ref={box} className="pointer-events-auto relative">
      <button data-trash="1" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`Trash${entries.length ? `, ${entries.length} deleted` : ""}`}
        title="Drag a card here to delete it. Click to see deleted cards and put them back."
        className={`press relative flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[12.5px] shadow-sm transition-[transform,background-color,border-color,color] duration-200 ${hot ? "scale-110 border-bad bg-bad text-white" : dragging ? "border-bad/40 bg-white text-bad" : "border-line bg-white/95 text-ink-2"}`}>
        <Icon name="trash" size={13} /> Trash
        {entries.length > 0 && !hot && <span className="mono rounded-full bg-lane px-1.5 text-[10.5px] text-ink-3">{entries.length}</span>}
      </button>
      {open && (
        <div className="pop absolute bottom-10 left-0 z-30 w-80 rounded-2xl border border-line bg-white p-2 shadow-[0_24px_60px_-20px_rgba(20,20,18,0.45)]">
          <div className="px-2 pb-1.5 pt-0.5 text-[12px] font-medium text-ink">Deleted cards</div>
          {!list.length && <div className="px-2 pb-2 text-[12px] text-ink-3">Nothing here. Drag a card onto the trash to delete it; it waits here in case you want it back.</div>}
          <div className="max-h-72 overflow-auto">
            {list.map((e) => {
              const n = e.lessons.reduce((k, l) => k + l.cards.filter((c) => c.m.type !== "group").length, 0);
              return (
                <div key={e.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-lane">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">{e.title}</span>
                    <span className="block truncate text-[11px] text-ink-3">{n > 1 ? `${n} cards · ` : ""}{e.lessons.map((l) => l.lessonTitle).join(", ")} · {ago(e.at)}</span>
                  </span>
                  {onRestore && <button onClick={() => { onRestore(e); setOpen(false); }} className="press h-7 flex-none rounded-lg bg-[#eef0fb] px-2 text-[12px] font-medium text-[#4b56a8] hover:bg-[#e3e6f8]">Restore</button>}
                  {onForget && <button onClick={() => onForget(e.id)} aria-label={`Delete “${e.title}” for good`} title="Delete for good" className="press flex h-7 w-7 flex-none items-center justify-center rounded-lg text-ink-3 hover:bg-white hover:text-bad"><Icon name="x" size={12} /></button>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
