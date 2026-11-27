"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bandLabel, bandRight, bandsOf, branchBelow, scoreCount, snapBands, canBranch, DEFAULT_BANDS, mapSlot, picked, SCORE, sharedOnly, slotOf, targetsOf, wiresOf, type Wire, topOf, holdsGroups, leavesOf, cleanGroups } from "@/lib/branching";
import { MAP_ADD, bandTone, pathColor, suitOfCard } from "@/lib/ui";
import { FAMILIES, faceMeta, kindOf, newCard as makeCard, unfinished, blankContent, type CardKind } from "@/lib/kinds";
import { KindArt } from "../cards/KindArt";
import { MathText, plainMath } from "../MathText";
import { plainText } from "@/lib/markdown";
import { isAsked } from "@/lib/grading";
import { groupsOf, studentsOf } from "@/lib/profile";
import { heroOf } from "@/lib/cards";
import type { Attachment, Lesson, Module, ProgressMap, TrashEntry } from "@/lib/types";
import { videoEmbed } from "@/lib/media";
import { MediaLift } from "../cards/MediaLift";
import { PlayDot, Recording } from "../cards/PlayArt";
import { Icon } from "../Icon";
import { elbow } from "../mapPath";
import { toast } from "@/lib/toast";
import { reducedMotion } from "@/lib/spring";
import { ask } from "../Confirm";
import { loadLibrary, useLibrary } from "./NewCardFan";
import { KindPick, copyOfSaved } from "./KindPick";
import type { SavedCard } from "@/lib/store";

// Fixed sizes, so ports and wires are placed from numbers, not by measuring the page.
// A card on the map is a playing card: 5 wide by 7 tall. Only a card group (a stack) can grow taller.
const W = 230;
const CARD_H = Math.round((W * 7) / 5);
const HEAD = 72;
const FAR_H = 96; // a card zoomed out: its colour and a big title
const SEC = 28; // a question's (or the score's) title row
const ROW = 30; // one answer or one score band
const MEDIA = 112; // a question card's picture, video, recording or file, above its question
const PAD = 10;
const FAN = 70; // room above a card group for its cards, fanned out of its sleeve
const HGAP = 64; // gap between cards side by side (room for the wires leaving their right edge)
const VGAP = 84; // gap between a card and the cards it deals below it
const REGION_GAP = 56; // gap between lessons
const TOP = 64; // room for each lesson's header
// The two kinds of card you put down: Content, or a Question (it starts with choices; its form is set in the editor).
const familyName = (k: CardKind) => FAMILIES.find((f) => f.start === k)!.name;
const INK = "#4b56a8";

export type Level = "far" | "mid" | "near";
const levelOf = (z: number): Level => (z < 0.55 ? "far" : z >= 1.2 ? "near" : "mid");

// (A sign-up poll's answers make groups and can change; they don't deal cards.)
const branchQs = (m: Module) => (m.signup ? [] : (m.questions ?? []).filter((q) => canBranch(q)));
/** Questions asked that can't branch (put in order, short answer): shown on the card, without ports. */
// A sign-up poll's answers make groups rather than deal cards: its question shows here, without dots.
const otherQs = (m: Module) => (m.questions ?? []).filter((q) => (!!m.signup || !canBranch(q)) && isAsked(q));
/** Rows an unbranching question takes under its title: one per option to order, or the accepted answers. */
const otherRows = (q: { kind?: string; options: string[] }, m?: Module) => (q.kind === "order" || m?.signup ? Math.max(1, q.options.filter((o) => o.trim()).length) : 1);
const isRight = (q: { kind?: string; answer?: number; answerSet?: number[] }, i: number) => (q.kind === "multi" ? !!q.answerSet?.includes(i) : q.answer === i);
/** A card with a score that can deal cards: a card group with question cards in it (`cards`: its lesson's). */
const isQuiz = (m: Module, cards?: Module[]) => m.type === "group" && (!cards || scoreCount(m, cards) > 0);
const wantsQuestion = (m: Module) => kindOf(m) === "choice" && !branchQs(m).length && !otherQs(m).length;
/** Whether a card's node has anything under its head: answers, score ranges, its group's cards, or that invitation. */
const hasBody = (m: Module) => branchQs(m).length > 0 || otherQs(m).length > 0 || isQuiz(m) || wantsQuestion(m);
/** A card whose answers fill its face still shows its media, in a strip above them. */
const mediaStrip = (m: Module) => m.type !== "group" && !!m.attachments?.length && hasBody(m);
const letter = (i: number) => String.fromCharCode(65 + i);

/** The rows on a card at a zoom level: its head, (zoomed in) a preview, then each question's answers and the score bands. */
function rowsOf(m: Module, level: Level, readOnly: boolean, members: Module[] = [], cards: Module[] = members, open = false): { h: number; ports: Map<string, number>; clip?: number; more?: boolean } {
  const ports = new Map<string, number>();
  if (level === "far") return { h: Math.max(CARD_H, m.type === "group" ? FAR_H + members.length * 26 + PAD : 0), ports };
  let y = HEAD;
  if (mediaStrip(m)) y += MEDIA;
  // A card group: a row per card, with that card's answers (their ports keyed by the card), then the group's score.
  const cardRows = (c: Module) => {
    y += SEC;
    for (const q of branchQs(c)) q.options.forEach((_, i) => { ports.set(`${c.id}|${q.id}:${i}`, y + ROW / 2); y += ROW; });
  };
  const scoreRows = (g: Module, key: (i: number) => string) => {
    y += SEC;
    const bands = bandsOf(g);
    bands.forEach((_, i) => { ports.set(key(i), y + ROW / 2); y += ROW; });
    if (!bands.length && !readOnly) y += ROW;
  };
  if (m.type === "group") {
    for (const c of members) {
      if (c.type !== "group") { cardRows(c); continue; }
      // A group inside: its name, its cards, and its own score (it deals by score too).
      y += SEC;
      const inner = (c.members ?? []).map((id) => cards.find((x) => x.id === id)).filter((x): x is Module => !!x);
      inner.forEach(cardRows);
      if (isQuiz(c, cards)) scoreRows(c, (i) => `${c.id}|${SCORE}:${i}`);
    }
    // A card group is as tall as a card with its fan (its card rows cut off, the score kept at the bottom), until it's
    // opened to show them all (the tab on its bottom edge). Wires from the rows cut off leave from where the cut is.
    const memEnd = y;
    if (isQuiz(m, cards)) scoreRows(m, (i) => `${SCORE}:${i}`);
    const limit = CARD_H - FAN;
    if (y + PAD <= limit) return { h: limit, ports };
    const scoreH = y - memEnd;
    if (open) {
      return { h: y + PAD, ports, more: true };
    }
    // What room is left goes to the card rows (the last one fades out where it's cut; beside a long score that may be
    // little or none: the fan above still shows the cards).
    const clip = Math.max(0, limit - PAD - scoreH - HEAD);
    const cut = HEAD + clip;
    for (const [k, v] of ports) ports.set(k, v >= memEnd ? v - (memEnd - cut) : Math.min(v, cut - 6));
    return { h: cut + scoreH + PAD, ports, clip, more: true };
  }
  for (const q of branchQs(m)) {
    y += SEC;
    q.options.forEach((_, i) => { ports.set(`${q.id}:${i}`, y + ROW / 2); y += ROW; });
  }
  for (const q of otherQs(m)) y += SEC + otherRows(q, m) * ROW;
  if (isQuiz(m)) scoreRows(m, (i) => `${SCORE}:${i}`);
  // Only a Multiple choice or Poll card without its question yet gets a line inviting one; other kinds don't branch.
  if (wantsQuestion(m)) y += 34;
  return { h: Math.max(CARD_H, y + PAD), ports };
}

interface Node { m: Module; lessonId: string; li: number; x: number; y: number; h: number; ports: Map<string, number>; parent?: string; members?: Module[]; clip?: number; more?: boolean }
interface Region { lesson: Lesson; li: number; x: number; y: number; w: number; h: number }

/**
 * The whole course, top to bottom: each lesson a row, its cards side by side in their order (cards everyone gets on
 * its first line), and what their answers deal hanging below the card that deals them, wired into its top. A card dealt
 * from an earlier lesson starts its own lesson's row, with the wire coming down from above.
 */
function layout(lessons: Lesson[], wires: Wire[], level: Level, readOnly: boolean, weekOfLesson: Record<string, string> = {}, room?: string | null, opened: Set<string> = new Set()) {
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
    const eff = (id: string) => topOf(id, groupOf);
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
    const size = (id: string) => rowsOf(byId.get(id)!, level, readOnly, membersOf(id), lesson.modules, opened.has(id));
    // A card group (not zoomed far out) has its cards fanned out above it: its sleeve sits that much lower.
    const fanned = (id: string) => level !== "far" && byId.get(id)?.type === "group";
    // How wide each card's family is (the card, or what it deals side by side below it), and each card's depth.
    const span = new Map<string, number>();
    const depthOf = new Map<string, number>();
    const rowH: number[] = [];
    const measure = (id: string, d: number): number => {
      depthOf.set(id, d);
      rowH[d] = Math.max(rowH[d] ?? 0, size(id).h + (fanned(id) ? FAN : 0));
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
      const { h, ports, clip, more } = size(id);
      const s = span.get(id)!;
      const k = kids.get(id) ?? [];
      const below = k.reduce((n, c) => n + span.get(c)!, 0) + Math.max(0, k.length - 1) * HGAP;
      nodes.set(id, { m: byId.get(id)!, lessonId: lesson.id, li, x: left + (s - W) / 2, y: rowTop(depthOf.get(id)!) + (fanned(id) ? FAN : 0), h, ports, clip, more, parent: parent.get(id), members: byId.get(id)!.type === "group" ? membersOf(id) : undefined });
      let x = left + (s - below) / 2;
      for (const c of k) { place(c, x); x += span.get(c)! + HGAP; }
    };
    let x = x0;
    // The card being made into a group (or added to) has an empty place beside it for the next card.
    for (const r of order) { place(r.id, x); x += span.get(r.id)! + HGAP * (level === "far" ? 0.6 : 1) + (r.id === room ? W + HGAP : 0); }
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
  // Each lesson's band is as wide as its own cards (its + Card button sits right after them), not the widest lesson's.
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
  const ids = new Set([id, ...(card.type === "group" ? [...(card.members ?? []), ...leavesOf(card, from.modules).map((c) => c.id)] : [])]);
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
function useGlide(target: Map<string, { x: number; y: number }>, spawnAt: (id: string, now: Map<string, { x: number; y: number }>) => { x: number; y: number } | undefined) {
  const [pos, setPos] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = new Map<string, { x: number; y: number }>();
    for (const [id, p] of target) from.set(id, cur.current.get(id) ?? spawnAt(id, cur.current) ?? p);
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
/**
 * Keep a pop-up menu inside the map's visible area: once it's drawn, nudge it left or up by as much as it sticks out
 * past the map's edge (or the window's). Measured on screen, then turned back into the map's own units, since the
 * map may be zoomed.
 */
function keepInView(el: HTMLElement | null) {
  if (!el) return;
  el.style.translate = "";
  const r = el.getBoundingClientRect();
  const box = el.closest(".tree-canvas")?.getBoundingClientRect();
  const right = Math.min(box?.right ?? innerWidth, innerWidth) - 10, bottom = Math.min(box?.bottom ?? innerHeight, innerHeight) - 10;
  const left = Math.max(box?.left ?? 0, 0) + 10, top = Math.max(box?.top ?? 0, 0) + 10;
  const dx = r.right > right ? Math.max(right - r.right, left - r.left) : 0;
  const dy = r.bottom > bottom ? Math.max(bottom - r.bottom, top - r.top) : 0;
  if (!dx && !dy) return;
  const k = r.width / (el.offsetWidth || r.width);
  el.style.translate = `${dx / k}px ${dy / k}px`;
}

/** A menu that opens beside what it belongs to: scroll the map to show it, rather than move it over the cards. */
function scrollIntoMap(el: HTMLElement | null) {
  if (!el) return;
  const sc = el.closest(".tree-canvas") as HTMLElement | null;
  if (sc) {
    const over = el.getBoundingClientRect().right - (Math.min(sc.getBoundingClientRect().right, innerWidth) - 12);
    if (over > 0) sc.scrollBy({ left: over, behavior: reducedMotion() ? "auto" : "smooth" });
  }
  // Anything still out of view (below the map's bottom, or a map that can't scroll that far) is nudged as usual.
  setTimeout(() => keepInView(el), 400);
}

// `saved`: the menu is showing the teacher's saved cards instead of Content / Question.
type Menu = { port: Port; x: number; y: number; mode: "port" | "new" } | { add: string; x: number; y: number };

/**
 * The course map: every lesson's cards on one canvas, with the wires that deal follow-ups (by answer or score, within a
 * lesson or into a later one). Zoomed out, cards shrink to their titles; zoomed in, they show what to do. Drag from a
 * port onto a card to deal it, or into empty space for a new card. Click a card to edit it in the panel.
 */
export function CourseMap({ lessons, weekOf, todayId, students, live = true, onSaveGroup, progress, readOnly, busy, selected, onDeselect, focus, onChange, onChangeMany, onEdit, onAddLesson, addLessonLabel, onDelete, trash = [], onRestore, onForget, lessonBar, footer, weekNames = {}, onDeleteMany }: {
  /** Delete several picked cards at once (it asks first, and offers Undo). */
  onDeleteMany?: (ms: Module[]) => void;
  /** Lesson id → its week's full title, for the contents panel. */
  weekNames?: Record<string, string>;
  /** Beside a lesson's name: its date and a menu of lesson and week actions (the course page fills it in). */
  lessonBar?: (lessonId: string) => React.ReactNode;
  /** Below the last lesson, beside “+ Lesson”: adding a week. */
  footer?: React.ReactNode;
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
  /** Keep a card group (named, with its cards) in My cards. */
  onSaveGroup?: (g: Module) => void;
  /** Show students' paths: how many went down each answer, and the wires moving (the course's setting). */
  live?: boolean;
  progress: ProgressMap;
  readOnly?: boolean;
  /** Something is open over the map (the card editor): leave Escape to it. */
  busy?: boolean;
  /** The card being edited. */
  selected?: string | null;
  /** A click on the map's empty space: let go of the card that's open in the panel. */
  onDeselect?: () => void;
  /** A card or lesson to bring into view (changes when it should move there). */
  focus?: { id: string; at: number } | null;
  onChange: (l: Lesson) => void;
  onChangeMany: (ls: Lesson[]) => Promise<void>;
  onEdit: (lessonId: string, moduleId: string) => void;
  onAddLesson?: () => void;
  /** The "+ Lesson" button's words ("Lesson in Week 3"). */
  addLessonLabel?: string;
  /** Delete a card (it asks first, and offers Undo). Hold a card to show the delete buttons. */
  onDelete?: (m: Module) => void;
}) {
  const all = useMemo(() => lessons.flatMap((l, i) => l.modules.map((m) => ({ m, lessonId: l.id, at: i }))), [lessons]);
  const wires = useMemo(() => wiresOf(all.map((x) => x.m)), [all]);
  const scroller = useRef<HTMLDivElement>(null);
  // Playing-card sized cards are tall: start a little zoomed out so a lesson shows several at once.
  const [zoom, setZoom] = useState(1);
  const level = levelOf(zoom);
  // A card inside a group has its ports on the group's node.
  const groupOf = useMemo(() => new Map(all.flatMap((x) => (x.m.type === "group" ? (x.m.members ?? []).map((id) => [id, x.m.id] as const) : []))), [all]);
  const nodeOf = (id: string) => topOf(id, groupOf);
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
  const shownLessons = useMemo(() => (hidden.size ? lessons.map((l) => ({ ...l, modules: l.modules.filter((m) => !hidden.has(m.id) && !hidden.has(topOf(m.id, groupOf))) })) : lessons), [lessons, hidden]);
  // A card being dragged: where the pointer is, the lesson under it and the card it would go before (null: the end),
  // or the trash bin.
  const [moving, setMoving] = useState<{ id: string; x: number; y: number; to?: string; before?: string | null; trash?: boolean; join?: boolean; into?: string } | null>(null);
  // Grouping by hand: the card (or card group) with an empty place beside it, where other cards are dragged in.
  const [gather, setGather] = useState<string | null>(null);
  // The lesson → week names, kept the same object while they don't change (the caller builds a new one each time).
  const weekKey = JSON.stringify(weekOf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weeksOf = useMemo(() => weekOf, [weekKey]);
  // Card groups opened to show all their cards (a group is as tall as a card until then).
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const base = useMemo(() => layout(shownLessons, wires, level, !!readOnly, weeksOf, gather, opened), [shownLessons, wires, level, readOnly, weeksOf, gather, opened]);
  // While a card is dragged, the map shows it where it would land: the other cards slide aside to make room.
  const preview = useMemo(() => {
    if (!moving?.to || moving.trash || moving.before === undefined) return null;
    const changed = applyMove(shownLessons, moving.id, moving.to, moving.before);
    if (!changed.length) return null;
    const by = new Map(changed.map((l) => [l.id, l]));
    const next = shownLessons.map((l) => by.get(l.id) ?? l);
    // Cards from one answer sit in their lesson order, so a reorder among them shows in the wires' order too.
    return layout(next, wiresOf(next.flatMap((l) => l.modules)), level, !!readOnly, weeksOf, gather, opened);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving?.id, moving?.to, moving?.before, moving?.trash, shownLessons, wires, level, readOnly]);
  const { nodes, regions, width, height } = preview ?? base;
  /** Whether a card deals anything (so it can fold its follow-ups away). */
  const dealsSome = (id: string) => wires.some((w) => nodeOf(w.from) === id);
  const [drag, setDrag] = useState<{ port: Port; x: number; y: number; over?: string } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [searching, setSearching] = useState(false);
  // "/" opens the card search (when not typing somewhere).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      setSearching(true);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  // The teacher's saved cards, offered in a lesson's + Card menu (loaded when that menu opens).
  const savedAll = useLibrary(!readOnly && !!menu);
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
  // Space held down: dragging the map's background moves it (as in drawing apps), instead of drawing a box.
  const spaceDown = useRef(false);
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !typing(e.target)) { if (!spaceDown.current && scroller.current) scroller.current.style.cursor = "grab"; spaceDown.current = true; e.preventDefault(); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") { spaceDown.current = false; if (scroller.current) scroller.current.style.cursor = ""; } };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  // Hold a card (like an app on a phone's home screen): the cards jiggle and each shows a button to delete it.
  const [jiggle, setJiggle] = useState(false);
  // The jiggle runs as its own animation on each card's `rotate`, so it never touches the cards' CSS animation: ending
  // it doesn't replay their fade-in (the whole map used to flash on Done).
  useEffect(() => {
    if (!jiggle || reducedMotion()) return;
    const els = [...(scroller.current?.querySelectorAll<HTMLElement>(".tree-node") ?? [])];
    const runs = els.map((el, i) => el.animate([{ rotate: "-0.9deg" }, { rotate: "0.9deg" }], { duration: 260, iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: -(i % 5) * 70 }));
    return () => runs.forEach((a) => a.cancel());
  }, [jiggle, nodes.size]);
  // A card's video or picture, opened big from its thumbnail.
  const [viewing, setViewing] = useState<{ a: Attachment; title: string; from: DOMRect; open: boolean } | null>(null);
  const [born] = useState(() => new Map<string, { x: number; y: number }>());

  const targets = useMemo(() => new Map([...nodes].map(([id, n]) => [id, { x: n.x, y: n.y }])), [nodes]);
  // Cards that were in a group a moment ago (it was ungrouped) come out of where the group was.
  const wasIn = useRef(groupOf);
  // A follow-up shown again (its card unfolded) settles into its own place from a little above, so the wire into it
  // grows straight down instead of first reaching up to where the card above it is.
  const drop = (p?: { x: number; y: number }) => (p ? { x: p.x, y: p.y - 18 } : undefined);
  const pos = useGlide(targets, (id, now) => born.get(id) ?? (wasIn.current.has(id) ? now.get(topOf(id, wasIn.current)) : undefined) ?? (nodes.get(id)?.parent ? drop(targets.get(id)) : undefined));
  useEffect(() => { wasIn.current = groupOf; }, [groupOf]);
  const at = (id: string) => pos.get(id) ?? targets.get(id)!;
  const lessonIndex = (lid: string) => lessons.findIndex((l) => l.id === lid);

  // How many students each answer or score band sent down its wire.
  const took = (w: Wire) => students.filter((s) => picked(progress[s.id]?.[w.from]?.dealt?.[w.q], w)).length;
  /** With students' paths on: how many went down an answer's (or score range's) wire, shown in that row. */
  const wentBadge = (from: string, q: string, option: number) => {
    if (!live) return null;
    const w = wires.find((x) => x.from === from && x.q === q && x.option === option);
    const n = w ? took(w) : 0;
    return n ? <span className="chip h-5 flex-none bg-[#4b56a8] px-1.5 text-[10.5px] text-white" title={`${n} student${n === 1 ? "" : "s"} went this way`}><Icon name="users" size={10} />{n}</span> : null;
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menu && !busy && !document.querySelector("[data-confirm]")) setMenu(null);
      if (e.key === "Escape" && jiggle && !busy && !document.querySelector("[data-confirm]")) setJiggle(false);
      if (e.key === "Escape" && gather && !busy && !document.querySelector("[data-confirm]")) endGather();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, busy, jiggle, gather]);
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

  // As the panel slides in, the map makes room and, if the card being edited would end up under the panel, scrolls it
  // into view at the same time (worked out for the width the map is about to have), not after.
  const gapWas = useRef(0);
  useEffect(() => {
    const was = gapWas.current;
    gapWas.current = gap;
    if (!selected) return;
    const el = scroller.current, n = targets.get(selected);
    if (!el || !n) return;
    const room = el.clientWidth - (gap - was);
    const left = n.x * zoom - el.scrollLeft, right = (n.x + W) * zoom - el.scrollLeft;
    // Up or down too, for a card opened from somewhere else (a search, a link): one scroll, so neither cancels the other.
    const top = n.y * zoom - el.scrollTop, below = top + 120 * zoom > el.clientHeight;
    const across = left < 0 || right > room, upDown = top < 0 || below;
    if (across || upDown) el.scrollTo({
      left: across ? Math.max(0, (n.x + W / 2) * zoom - room / 2) : el.scrollLeft,
      top: upDown ? Math.max(0, n.y * zoom - el.clientHeight / 2.4) : el.scrollTop,
      behavior: "smooth",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gap, selected]);

  // The contents panel opens while the pointer is over the map's left edge or the panel (it closes a moment after).
  const [toc, setToc] = useState(false);
  // The contents panel goes into <body>, once the page is in the browser.
  const [portalReady, setPortalReady] = useState(false);
  // A tab's name, shown beside it in <body> (the map's scroll box and the cards around would cut a tip drawn in place).
  const [tip, setTip] = useState<{ text: string; x: number; y: number; side: "right" | "below" } | null>(null);
  const tipOn = (text: string, side: "right" | "below") => {
    const show = (el: HTMLElement) => { const r = el.getBoundingClientRect(); setTip(side === "right" ? { text, side, x: r.right + 8, y: r.top + r.height / 2 } : { text, side, x: r.left + r.width / 2, y: r.bottom + 8 }); };
    return {
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => show(e.currentTarget),
      onPointerLeave: () => setTip(null),
      onFocus: (e: React.FocusEvent<HTMLElement>) => show(e.currentTarget),
      onBlur: () => setTip(null),
    };
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- document.body exists only in the browser
  useEffect(() => setPortalReady(true), []);
  const tocTimer = useRef<number>(0);
  const openToc = () => { window.clearTimeout(tocTimer.current); setToc(true); };
  const closeToc = () => { window.clearTimeout(tocTimer.current); tocTimer.current = window.setTimeout(() => setToc(false), 280); };
  // The lesson in the middle of the view, for the contents panel.
  const [inView, setInView] = useState<string | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const look = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cx = (el.scrollLeft + el.clientWidth / 2) / zoom, cy = (el.scrollTop + el.clientHeight / 3) / zoom;
        let best: string | null = null, d = Infinity;
        for (const r of regions) {
          const dx = cx < r.x ? r.x - cx : cx > r.x + r.w ? cx - r.x - r.w : 0;
          const dy = cy < r.y ? r.y - cy : cy > r.y + r.h ? cy - r.y - r.h : 0;
          const k = dx * dx + dy * dy;
          if (k < d) { d = k; best = r.lesson.id; }
        }
        setInView(best);
      });
    };
    look();
    el.addEventListener("scroll", look, { passive: true });
    return () => { el.removeEventListener("scroll", look); cancelAnimationFrame(raf); };
  }, [regions, zoom]);

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
  function reveal(target: string) {
    const up = new Set<string>();
    const climb = (id: string) => { for (const w of wires) if (w.to === id) { const f = nodeOf(w.from); if (!up.has(f)) { up.add(f); climb(f); } } };
    climb(target);
    // Scroll to it once the map has redrawn with it in place.
    setGoing(target);
    setFolded((f) => new Set([...f].filter((x) => !up.has(x))));
  }
  useEffect(() => {
    if (!focus || !hidden.has(focus.id)) return;
    // Opening a card from elsewhere (a link, search) unfolds the branch it's on: the map follows an outside change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reveal(focus.id);
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
    const cards = all.map((x) => x.m);
    return all.filter((x) => from && x.at >= from.at && !above.has(x.m.id) && !sharedOnly(x.m, cards));
  }
  const canTarget = (port: Port, id: string) => targetsFor(port).some((x) => x.m.id === id);
  const lessonWith = (id: string) => lessons.find((l) => l.modules.some((m) => m.id === id))!;

  /**
   * A lesson with a port changed: `to` added to the cards an answer deals (a score range deals one, so it's replaced),
   * or, with `drop`, that one card taken off (null: all of them).
   */
  function withWire(l: Lesson, port: Port, to: string | null, drop = false): Lesson {
    return {
      ...l,
      modules: l.modules.map((m) => {
        if (m.id !== port.from) return m;
        if (port.q === SCORE) return { ...m, bands: bandsOf(m).map(({ min, next }, i) => ({ min, next: i !== port.option ? next : drop ? (to && next !== to ? next : null) : to })) };
        return {
          ...m,
          questions: m.questions?.map((q) => {
            if (q.id !== port.q) return q;
            const next = [...(q.next ?? [])];
            while (next.length < q.options.length) next.push(null);
            const had = targetsOf(q, port.option);
            next[port.option] = slotOf(drop ? (to ? had.filter((x) => x !== to) : []) : to ? [...had, to] : had);
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
    if (to && wires.some((w) => w.from === port.from && w.q === port.q && w.option === port.option && w.to === to)) return;
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
  /** Take one card (null: every card) off what a port deals; it goes back to everyone unless another answer deals it. */
  const unwire = (port: Port, to: string | null) => onChange(withWire(lessonWith(port.from), port, to, true));
  const setBands = (m: Module, bands: { min: number; next: string | null }[] | undefined) => {
    const l = lessonWith(m.id);
    onChange({ ...l, modules: l.modules.map((x) => (x.id === m.id ? { ...x, bands } : x)) });
  };

  const blank = (k: CardKind, title: string): Module => makeCard(k, title);

  /** A fresh copy of one of the teacher's saved cards, ready to put down. */
  // A copy remembers the saved card it came from, so changing it can offer to update that one too.
  const copyOf = copyOfSaved;
  /** Fresh copies of a saved set (a lesson, or a card group and its cards), wired to each other as they were saved. */
  const copiesOf = (sc: SavedCard): Module[] => {
    if (!sc.set) return [copyOf(sc)];
    const ids = new Map(sc.set.modules.map((m) => [m.id, makeCard("content", "").id]));
    const to = (x: string | null) => (x ? (ids.get(x) ?? null) : null);
    return structuredClone(sc.set.modules).map((m) => ({
      ...m,
      id: ids.get(m.id)!,
      audience: { kind: "all" },
      questions: m.questions?.map((q) => (q.next ? { ...q, next: q.next.map((x) => mapSlot(x, to)) } : q)),
      bands: m.bands?.map((b) => ({ ...b, next: to(b.next) })),
      members: m.members?.map((x) => ids.get(x) ?? x),
    }) as Module);
  };

  async function newCard(port: Port, type: CardKind, into: string, from?: SavedCard) {
    const lesson = lessonWith(port.from);
    const src = lesson.modules.find((m) => m.id === port.from)!;
    const what = port.q === SCORE ? `Score ${bandLabel(bandsOf(src)[port.option])}` : plainMath(src.questions?.find((x) => x.id === port.q)?.options[port.option]?.trim() ?? "");
    const card = from ? copyOf(from) : blank(type, what ? `If “${what.slice(0, 40)}”` : `New ${familyName(type)} card`);
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
  function addCard(lessonId: string, type: CardKind, from?: SavedCard) {
    const l = lessons.find((x) => x.id === lessonId)!;
    const cards = from ? copiesOf(from) : [blank(type, `New ${familyName(type)} card`)];
    const card = cards[0];
    const r = regions.find((x) => x.lesson.id === lessonId);
    if (r) cards.forEach((c, i) => born.set(c.id, { x: r.x + r.w - W + i * 12, y: r.y + TOP - 40 }));
    setMenu(null);
    onChange({ ...l, modules: [...l.modules, ...cards] });
    setFresh(card.id);
    onEdit(lessonId, card.id);
  }

  async function forgetSaved(sc: SavedCard) {
    const r = await fetch("/api/library", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sc.id }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (!r.ok) return toast(r.error ?? "Couldn’t remove it", { icon: "x", tone: "bad" });
    await loadLibrary(true);
    toast(`Removed “${sc.name}” from Saved cards`);
  }

  /** What a new card can be (Content, Question, or a Saved card). An answer deals one card, so its menu offers saved single cards only. */
  function kindPicker(onKind: (t: CardKind) => void, onSaved: (sc: SavedCard) => void, singles = false) {
    return <KindPick saved={singles ? savedAll.filter((x) => !x.set) : savedAll} onKind={onKind} onSaved={onSaved} onForget={forgetSaved} />;
  }

  /** Why the picked cards can't become a card group, or null if they can. */
  function whyNoGroup(ids: string[]): string | null {
    if (ids.length < 2) return "Pick at least two cards or groups (drag a box around them, or shift-click them).";
    const ls = new Set(ids.map((id) => lessonWith(id)?.id));
    if (ls.size > 1) return "A card group’s cards all come from one lesson.";
    for (const id of ids) { const why = whyNotInGroup(all.find((x) => x.m.id === id)!.m); if (why) return why; }
    return null;
  }
  /** Why one card can't go into a card group, or null if it can. */
  function whyNotInGroup(m: Module): string | null {
    if (groupOf.has(m.id)) return `“${m.title}” is already in a card group.`;
    // Two levels at most: a group with groups in it can't go inside another.
    if (m.type === "group" && holdsGroups(m, all.map((x) => x.m))) return `“${m.title}” already has groups in it, so it can’t go inside another group.`;
    if (wires.some((w) => w.to === m.id)) return `“${m.title}” is dealt by an answer. Group the cards first, then deal the group.`;
    // Everyone answers every card in a group, or its score never comes.
    if (m.audience.kind === "student") return `“${m.title}” is only for some students, so it can’t join a card group everyone answers.`;
    return null;
  }
  /** Why a card can't be dropped into this card group on the map, or null if it can. */
  function whyInto(id: string, gid: string): string | null {
    if (lessonWith(id)?.id !== lessonWith(gid)?.id) return "Only cards from the same lesson can go in.";
    return whyNotInGroup(all.find((x) => x.m.id === id)!.m);
  }
  /** A card dropped on a card group's sleeve: it goes in, at the end. */
  function dropInto(id: string, gid: string) {
    const why = whyInto(id, gid);
    if (why) { toast(why, { icon: "layers", tone: "plain" }); return; }
    const l = lessonWith(gid)!;
    const g = l.modules.find((m) => m.id === gid)!;
    const card = l.modules.find((m) => m.id === id)!;
    onChange(tidy({ ...l, modules: l.modules.map((m) => (m.id === gid ? { ...m, members: [...(m.members ?? []), id] } : m)) }));
    setFresh(gid);
    toast(`Added “${card.title || "the card"}” to ${g.title || "the group"}`, { icon: "layers" });
  }
  /** Why a card can't be dragged into the group being made (or added to), or null if it can. */
  function whyNoJoin(id: string): string | null {
    if (!gather || id === gather) return "";
    if (lessonWith(id)?.id !== lessonWith(gather)?.id) return "Only cards from the same lesson can go in.";
    return whyNotInGroup(all.find((x) => x.m.id === id)!.m);
  }
  /** A lesson with its groups put right (members after their group, in order, two levels at most), as saving does. */
  const tidy = (l: Lesson): Lesson => { const copy = structuredClone(l); cleanGroups([{ lessons: [copy] }]); return copy; };
  /** Start grouping by hand: the card gets a frame with an empty place beside it, and other cards are dragged in. */
  function startGather(m: Module) {
    const why = m.type === "group" ? null : whyNotInGroup(m);
    if (why) { toast(why, { icon: "layers", tone: "plain" }); return; }
    setJiggle(false);
    setPicks(new Set());
    setGather(m.id);
    setTimeout(() => bringIntoView(m.id), 420);
  }
  function endGather() {
    const id = gather;
    setGather(null);
    if (id && all.find((x) => x.m.id === id)?.m.type === "group") setFresh(id);
  }
  /** A card dropped in the empty place: the first one makes the group, the rest join it. */
  function joinGather(id: string, from: { x: number; y: number }) {
    const why = whyNoJoin(id);
    if (why !== null) { if (why) toast(why, { icon: "layers", tone: "plain" }); return; }
    const l = lessonWith(gather!)!;
    const anchor = l.modules.find((m) => m.id === gather)!;
    const card = l.modules.find((m) => m.id === id)!;
    const ap = at(gather!);
    fly([{ m: card, from, to: { x: ap.x, y: ap.y + (nodes.get(gather!)?.h ?? CARD_H) - SEC } }]);
    const mods = l.modules;
    // A group dropped on a group of cards: the two go together in a new group around them (a group of groups).
    const outer = anchor.type === "group" && card.type === "group" && !holdsGroups(anchor, mods);
    // The held group goes inside the new one, so it must be able to (not dealt by an answer, say).
    const whyAnchor = outer ? whyNotInGroup(anchor) : null;
    if (whyAnchor) { toast(whyAnchor, { icon: "layers", tone: "plain" }); return; }
    if (anchor.type === "group" && !outer) {
      // Into the group, at its end.
      onChange(tidy({ ...l, modules: mods.map((m) => (m.id === anchor.id ? { ...m, members: [...(m.members ?? []), id] } : m)) }));
      toast(`Added “${card.title || "the card"}” to ${anchor.title || "the group"}`, { icon: "layers" });
      return;
    }
    const g = newGroup(l, [anchor.id, id]);
    born.set(g.id, { x: ap.x, y: ap.y + FAN });
    setGather(g.id);
    // Its name is on its sleeve, ready to type.
    setTimeout(() => setTyping({ id: g.id, field: "title", value: g.title }), 450);
  }
  /** "Group 1", "Group 2"…: the first name not used by a group in this lesson. */
  function nextGroupName(l: Lesson) {
    const used = new Set(l.modules.filter((m) => m.type === "group").map((m) => m.title));
    let k = 1;
    while (used.has(`Group ${k}`)) k++;
    return `Group ${k}`;
  }
  /** A new card group of these cards (in this order), where the first of them was, saved. */
  function newGroup(l: Lesson, ordered: string[]): Module {
    const g: Module = { ...makeCard("content", "Card group"), type: "group", kind: "group", suit: "question", members: ordered, title: nextGroupName(l) };
    // The group goes where its first member was; tidying puts its members (and theirs) right after it.
    const at = l.modules.findIndex((m) => m.id === ordered[0]);
    onChange(tidy({ ...l, modules: [...l.modules.slice(0, at), g, ...l.modules.slice(at)] }));
    return g;
  }
  // Cards flying into a group (a picture of each, from where it was to the group): the grouping, seen.
  const [flying, setFlying] = useState<{ key: string; m: Module; from: { x: number; y: number }; to: { x: number; y: number } }[]>([]);
  function fly(list: { m: Module; from: { x: number; y: number }; to: { x: number; y: number } }[]) {
    if (reducedMotion()) return;
    const items = list.map((x) => ({ ...x, key: `${x.m.id}-${Date.now()}` }));
    setFlying((f) => [...f, ...items]);
    setTimeout(() => setFlying((f) => f.filter((x) => !items.includes(x))), 700);
  }
  /** Put the picked cards in a new card group, where the first of them was. */
  function makeGroup() {
    const ids = [...picks];
    const why = whyNoGroup(ids);
    if (why) { toast(why, { icon: "layers", tone: "plain" }); return; }
    const l = lessonWith(ids[0])!;
    const ordered = l.modules.filter((m) => ids.includes(m.id)).map((m) => m.id);
    // The group goes where its first card was, its cards right after it in their order; they fly into it.
    const first = at(ordered[0]);
    fly(ordered.slice(1).map((id) => ({ m: l.modules.find((m) => m.id === id)!, from: at(id), to: first })));
    const g = newGroup(l, ordered);
    born.set(g.id, { x: first.x, y: first.y + FAN });
    setPicks(new Set());
    setPicking(false);
    setFresh(g.id);
    onEdit(l.id, g.id);
    toast(`Made a card group of ${ordered.length} cards`, { icon: "layers" });
  }

  /** One card's row in a card group's node, with its answers (and their ports). */
  const memberRow = (c: Module, lessonId: string) => (

                        <div key={c.id}>
                          <button onClick={() => onEdit(lessonId, c.id)} className="flex w-full items-center gap-2 px-3.5 text-left hover:bg-lane" style={{ height: SEC }} title="Edit this card">
                            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md" style={{ color: suitOfCard(c).tint, background: "rgba(0,0,0,0.035)" }}><Icon name={faceMeta(c).icon} size={11} /></span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{c.title || "Untitled card"}</span>
                            <span className={`text-[10.5px] ${unfinished(c) ? "text-[#a0561f]" : "text-ink-3"}`}>{unfinished(c) ? (blankContent(c) ? "Empty card" : "No question yet") : faceMeta(c).name}</span>
                          </button>
                          {branchQs(c).map((q) => q.options.map((o, oi) => {
                            const to = targetsOf(q, oi).length > 0;
                            return (
                              <div key={`${q.id}-${oi}`} className="relative flex items-center gap-2 pl-9 pr-3.5" style={{ height: ROW }}>
                                <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[10.5px] font-semibold transition-colors ${to ? "text-white" : isRight(q, oi) ? "bg-ok/15 text-ok" : "bg-lane text-ink-3"}`} style={to ? { background: pathColor(oi) } : undefined}>{letter(oi)}</span>
                                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">{o.trim() ? <MathText text={o.trim()} /> : `Option ${oi + 1}`}</span>
                                {wentBadge(c.id, q.id, oi)}
                                <PortDot color={pathColor(oi)} wired={!!to} readOnly={readOnly} label={to ? `${c.title}: answer ${letter(oi)} deals ${targetsOf(q, oi).length > 1 ? `${targetsOf(q, oi).length} cards` : "a card"}. Add or change` : `${c.title}: deal a card for answer ${letter(oi)}`} onPointerDown={(e) => startDrag(e, { from: c.id, q: q.id, option: oi })} />
                              </div>
                            );
                          }))}
                        </div>
  );
  /** A quiz's or a card group's score ranges, each with the port that deals a card for it. */
  const scoreRows = (g: Module, nQ: number, label = g.type === "group" ? "Group score" : "Score (best try)") => {
    const bands = bandsOf(g);
    return (
                        <div>
                          <div className="flex items-center justify-between px-3.5 text-[11.5px] leading-[28px] text-ink-3" style={{ height: SEC }}>
                            <span>{label}</span>
                            {!readOnly && bands.length > 0 && (
                              <span className="flex gap-2">
                                {bands.length < 5 && bands[bands.length - 1].min < 99 && (
                                  <button onClick={() => { const top = bands[bands.length - 1]; setBands(g, [...bands.map(({ min, next }) => ({ min, next })), { min: Math.round((top.min + 100) / 2), next: null }]); }} className="hover:text-ink">+ Range</button>
                                )}
                                <button onClick={() => setBands(g, undefined)} className="hover:text-bad">Remove</button>
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
                                      setBands(g, bands.map(({ min, next }, k) => ({ min: k === bi ? v : min, next })));
                                    }}
                                    aria-label="Lowest score in this range"
                                    className="h-6 w-12 rounded-md border border-line bg-white px-1 text-center text-[12px] focus:border-line-strong focus:outline-none"
                                  />
                                  <span className="whitespace-nowrap">{b.max > 100 ? (b.min >= 100 ? "%" : "–100%") : `–${b.max - 1}%`}</span>
                                </span>
                              )}
                              {nQ > 0 && (() => { const r = bandRight(b, nQ); return <span className={`mono mr-2 flex-none whitespace-nowrap text-[10.5px] ${r ? "" : "text-bad"}`} title={r ?? "No score falls in this range"}>{r ? r.replace(/ of \d+ right$/, " right") : "never"}</span>; })()}
                              {wentBadge(g.id, SCORE, bi)}
                              <PortDot color={bandTone(bi, bands.length)} wired={!!b.next} readOnly={readOnly} label={b.next ? `Score ${bandLabel(b)} deals a card. Change it` : `Deal a card for score ${bandLabel(b)}`} onPointerDown={(e) => startDrag(e, { from: g.id, q: SCORE, option: bi })} />
                            </div>
                          ))}
                          {!bands.length && !readOnly && (
                            <div style={{ height: ROW }} className="px-3.5">
                              <button onClick={() => setBands(g, snapBands(DEFAULT_BANDS, nQ))} className="press flex h-6 items-center gap-1.5 rounded-md bg-[#eef0fb] px-2 text-[11.5px] font-medium text-[#4b56a8] hover:bg-[#e3e6f8]">
                                <Icon name="split" size={11} /> Branch by score
                              </button>
                            </div>
                          )}
                        </div>
    );
  };
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
      onFocus={(e) => e.target.select()}
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
  function dropAt(id: string, p: { x: number; y: number }, ev: PointerEvent): { to?: string; before?: string | null; trash?: boolean; join?: boolean; into?: string } {
    if ((document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest("[data-trash]")) return { trash: true };
    // A card held over a card group's sleeve (or its fan): into that group, at its end.
    if (!gather && all.find((x) => x.m.id === id)?.m.type !== "group") {
      const g = [...base.nodes.values()].find((n) => n.m.type === "group" && n.m.id !== id && p.x >= n.x && p.x <= n.x + W && p.y >= n.y - (level !== "far" ? FAN : 0) && p.y <= n.y + n.h);
      if (g) return { into: g.m.id };
    }
    // Over the empty place beside the card being grouped (or anywhere in its frame): into the group.
    const g = gather ? base.nodes.get(gather) : undefined;
    if (g && id !== gather && p.x >= g.x - 20 && p.x <= g.x + 2 * W + HGAP + 20 && p.y >= g.y - 20 && p.y <= g.y + Math.max(g.h, CARD_H) + 20) return { join: true };
    // Read from the map as it is without the drag, so the cards sliding aside don't move the target.
    const to = base.regions.find((r) => p.x >= r.x - REGION_GAP / 2 && p.x <= r.x + r.w + REGION_GAP / 2 && p.y >= r.y - REGION_GAP / 2 && p.y <= r.y + r.h + REGION_GAP / 2)?.lesson.id;
    if (!to) return {};
    const from = lessonWith(id);
    if (to !== from?.id && whyNot(id, to)) return { to };
    // A card an answer deals sits under that card. Beside other cards the same answer deals, it can trade places with
    // them; otherwise its place isn't its own to choose.
    if (to === from?.id && base.nodes.get(id)?.parent) {
      const w = wires.find((x) => x.to === id && nodeOf(x.from) === base.nodes.get(id)!.parent);
      const sibs = w ? wires.filter((x) => x.from === w.from && x.q === w.q && x.option === w.option && x.to !== id && base.nodes.get(x.to)?.lessonId === to).map((x) => base.nodes.get(x.to)!).sort((a, b) => a.x - b.x) : [];
      if (!sibs.length || !from) return { to };
      const next = sibs.find((n) => p.x < n.x + W / 2);
      if (next) return { to, before: next.m.id };
      // After the last of them: before whatever follows that card and what it deals in the lesson.
      const last = sibs[sibs.length - 1].m.id;
      const block = new Set([last, ...branchBelow(from.modules, last)]);
      const end = Math.max(...from.modules.map((m, k) => (block.has(m.id) ? k : -1)));
      const after = from.modules.slice(end + 1).find((m) => m.id !== id && !branchBelow(from.modules, id).includes(m.id));
      return { to, before: after ? after.id : null };
    }
    const row = [...base.nodes.values()].filter((n) => n.lessonId === to && !n.parent && n.m.id !== id).sort((a, b) => a.x - b.x);
    const next = row.find((n) => p.x < n.x + W / 2);
    return { to, before: next ? next.m.id : null };
  }
  /** Press on a card's head and move: drag it along its row to reorder, to another lesson, or into the trash. A press without moving is a click (opens it). */
  function startMove(e: React.PointerEvent, id: string) {
    if (readOnly || e.button !== 0) return;
    // A name being typed (a new group's, say) is kept, and the drag goes ahead.
    if (typing) commitTyping();
    const start = { x: e.clientX, y: e.clientY };
    let on = false;
    let last: ReturnType<typeof dropAt> = {};
    // Held still for a moment: show the delete buttons (and don't open the card on release).
    let held = false;
    const hold = onDelete && !gather ? window.setTimeout(() => { held = true; setJiggle(true); navigator.vibrate?.(10); }, 520) : 0;
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
      if (last.join) {
        setMoving(null);
        joinGather(id, toCanvas(ev.clientX, ev.clientY));
        return;
      }
      if (last.into) {
        setMoving(null);
        dropInto(id, last.into);
        return;
      }
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
    const row = [...nodes.values()].filter((o) => o.li === n.li && Math.abs(o.y - n.y) < 1);
    const rowBottom = Math.max(...row.map((o) => at(o.m.id).y + o.h));
    const gx = p.x + W + 18 + k * 7;
    // Below a card group's bottom tab, so the wires and their labels don't cover it.
    const under = rowBottom + (row.some((o) => o.more) ? 36 : 20) + k * 7;
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

  // The course's weeks, each with its lessons, for the contents panel on the left.
  const contents: { week: string; lessons: Lesson[] }[] = [];
  for (const l of lessons) {
    const w = weekNames[l.id] ?? weekOf[l.id] ?? "";
    const last = contents[contents.length - 1];
    if (last && last.week === w) last.lessons.push(l); else contents.push({ week: w, lessons: [l] });
  }
  return (
    <div className="flex items-start gap-3">
      {/* Contents: every week and its lessons. Click one to go there on the map. */}
      {/* Rendered into <body>: an animated ancestor would otherwise become what "fixed" is measured from. */}
      {portalReady && tip && createPortal(
        <span role="tooltip" className="map-tip pointer-events-none fixed z-[80] whitespace-nowrap rounded-[7px] bg-ink px-2 py-1 text-[11.5px] font-medium leading-[1.3] text-white"
          style={{ left: tip.x, top: tip.y, translate: tip.side === "right" ? "0 -50%" : "-50% 0" }}>{tip.text}</span>, document.body)}
      {portalReady && createPortal(<>
      {/* Fixed to the window's left edge (not the map's), under the page header: hidden until the pointer reaches the
          edge, then it slides out over the page. The pointer that opened it is already inside it, so it doesn't open
          and close over and over. */}
      <div className="group fixed bottom-0 left-0 top-[3.75rem] z-30 overflow-hidden" onMouseEnter={openToc} onMouseLeave={closeToc} onFocus={openToc} onBlur={closeToc}
        style={{ width: toc ? 300 : 22, transition: "width 0.42s cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {/* The marker: a short bar with a › in it, saying there's something to pull out from this edge. */}
        <span aria-hidden="true" className={`absolute left-[4px] top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 text-ink/45 transition-[opacity,color] duration-300 group-hover:text-ink/75 ${toc ? "opacity-0" : "opacity-100"}`}>
          <span className="h-9 w-[5px] rounded-full bg-current" />
          <Icon name="chevron" size={16} strokeWidth={3} className="-rotate-90" />
          <span className="h-9 w-[5px] rounded-full bg-current" />
        </span>
      <nav aria-label="Course contents" className="absolute bottom-3 left-2.5 top-2 w-[252px] overflow-y-auto overflow-x-hidden rounded-2xl bg-white/[0.97] py-2 pl-1 shadow-[0_0_0_1px_rgba(20,20,18,0.06),0_2px_4px_rgba(20,20,18,0.04),0_12px_28px_-6px_rgba(20,20,18,0.14),0_28px_56px_-20px_rgba(20,20,18,0.18)] backdrop-blur"
        style={{ opacity: toc ? 1 : 0, transform: toc ? "none" : "translateX(-28px)", transition: "opacity 0.3s ease, transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)", pointerEvents: toc ? "auto" : "none" }}>
        {contents.map((c, ci) => (
          <div key={ci} className="px-2 pb-2">
            {c.week && <div className="truncate px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3" title={c.week}>{c.week}</div>}
            {c.lessons.map((l) => {
              const n = lessons.indexOf(l) + 1;
              const on = inView === l.id;
              const cards = l.modules.filter((m) => m.type !== "group").length;
              return (
                <button key={l.id} onClick={() => goTo(l.id)} aria-current={on ? "location" : undefined}
                  className={`press flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors ${on ? "bg-[#eef0fb] text-ink" : "text-ink-2 hover:bg-lane hover:text-ink"}`}>
                  <span className={`mt-[1px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[10px] font-semibold ${l.id === todayId ? "bg-ok text-white" : on ? "bg-[#4b56a8] text-white" : "bg-lane text-ink-3"}`}>{n}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block leading-snug ${on ? "font-medium" : ""}`}>{l.title}</span>
                    <span className="mono block text-[10.5px] text-ink-3">{l.id === todayId ? "Today · " : ""}{cards} card{cards === 1 ? "" : "s"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      </div>
      </>, document.body)}
      <div className="relative min-w-0 flex-1">
      {viewing && (
        <MediaLift a={viewing.a} title={viewing.title} from={viewing.from} open={viewing.open}
          onClose={() => setViewing((v) => (v ? { ...v, open: false } : v))} onGone={() => setViewing(null)} />
      )}
      {jiggle && (
        // In the map's top-right corner, where it stays while the map scrolls under it.
        <div className="pop absolute top-2.5 z-30 flex items-center gap-3 rounded-2xl border border-line bg-white py-1.5 pl-4 pr-1.5 text-[13px] shadow-[0_16px_40px_-16px_rgba(20,20,18,0.4)]" style={{ right: gap + 10, transition: "right 0.45s cubic-bezier(0.22, 1, 0.36, 1)" }}>
          <span className="text-ink-2">Tap <span className="inline-flex h-4 w-4 -translate-y-[1px] align-middle items-center justify-center rounded-full bg-[#6f6f6c]"><span className="block h-[2px] w-2 rounded-full bg-white" /></span> to delete a card, <span className="inline-flex h-4 w-4 -translate-y-[1px] align-middle items-center justify-center rounded-full bg-[#4b56a8] text-white"><Icon name="layers" size={9} /></span> to group it with others</span>
          <button onClick={() => setJiggle(false)} className="btn btn-dark press h-8 px-4 text-[12.5px]">Done</button>
        </div>
      )}
      {gather && (
        <div className="pop absolute top-2.5 z-30 flex items-center gap-3 rounded-2xl border border-line bg-white py-1.5 pl-4 pr-1.5 text-[13px] shadow-[0_16px_40px_-16px_rgba(20,20,18,0.4)]" style={{ right: gap + 10, transition: "right 0.45s cubic-bezier(0.22, 1, 0.36, 1)" }}>
          <Icon name="layers" size={14} className="text-[#4b56a8]" />
          <span className="text-ink-2">Drag cards into the empty place to put them in the group</span>
          <button onClick={endGather} className="btn btn-dark press h-8 px-4 text-[12.5px]">Done</button>
        </div>
      )}
      {(picks.size > 0 || picking) && (
        <div className="pop absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-[13px] shadow-[0_16px_40px_-16px_rgba(20,20,18,0.4)]">
          <Icon name="layers" size={14} className="text-[#4b56a8]" />
          <span>{picks.size ? `${picks.size} card${picks.size === 1 ? "" : "s"} picked` : "Tap cards, or drag a box around them, to put them in a group"}</span>
          <button onClick={makeGroup} disabled={!!whyNoGroup([...picks])} title={whyNoGroup([...picks]) ?? "Put these cards in a card group"} className="btn btn-dark press h-8 px-3 text-[12.5px] disabled:opacity-40">Make a card group</button>
          {picks.size > 0 && onDeleteMany && (
            <button onClick={() => { const ms = [...picks].map((id) => all.find((x) => x.m.id === id)?.m).filter((m): m is Module => !!m); setPicks(new Set()); setPicking(false); onDeleteMany(ms); }}
              className="btn btn-ghost press h-8 px-3 text-[12.5px] hover:!text-bad"><Icon name="trash" size={13} /> Delete</button>
          )}
          <button onClick={() => { setPicks(new Set()); setPicking(false); }} className="btn btn-quiet press h-8 px-2 text-[12.5px]">Cancel</button>
        </div>
      )}
      {/* The map's tools, as one small bar of icons (each says its name on hover). Grouping is done by dragging a box
          around cards, or by holding a card; students' paths is the course's setting. */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-line bg-white/95 p-0.5 shadow-[0_1px_2px_rgba(20,20,18,0.05),0_8px_20px_-12px_rgba(20,20,18,0.3)] backdrop-blur">
          <button onClick={() => zoomTo(zoom - 0.15)} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom out" data-tip="Zoom out">−</button>
          <button onClick={fitAll} className="mono h-7 w-11 rounded-lg text-center text-[12px] text-ink-2 hover:bg-lane" aria-label="Fit the map" data-tip="Fit the map">{Math.round(zoom * 100)}%</button>
          <button onClick={() => zoomTo(zoom + 0.15)} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom in" data-tip="Zoom in">+</button>
          <span className="mx-0.5 h-4 w-px bg-line" />
          <MapSearch cards={all} lessons={lessons} open={searching} onOpen={setSearching} onPick={(lessonId, id) => {
            setSearching(false);
            // Open it first: the card panel makes room by moving the map, so the map goes to the card once that's done.
            onEdit(lessonId, id);
            setTimeout(() => {
              if (hidden.has(id)) reveal(id); else bringIntoView(id);
              setTimeout(() => {
                const el = document.querySelector(`[data-node="${CSS.escape(id)}"]`);
                el?.classList.add("dealt-glow");
                setTimeout(() => el?.classList.remove("dealt-glow"), 3600);
              }, 500);
            }, 480);
          }} />
          {wires.length > 0 && (
            <button
              onClick={() => {
                const all = [...new Set(wires.map((w) => nodeOf(w.from)))];
                setFolded(folded.size ? new Set<string>() : new Set(all));
              }}
              data-tip={folded.size ? "Unfold all" : "Fold all branches"}
              aria-label={folded.size ? "Unfold all" : "Fold all"}
              className={`press grid h-7 w-7 place-items-center rounded-lg hover:bg-lane ${folded.size ? "bg-[#eef0fb] text-[#4b56a8]" : "text-ink-2 hover:text-ink"}`}
            >
              <Icon name={folded.size ? "unfold" : "fold"} size={14} />
            </button>
          )}
          {!readOnly && onDelete && <TrashBin entries={trash} hot={!!moving?.trash} dragging={!!moving} onRestore={onRestore} onForget={onForget} />}
        </div>
      </div>

      <div
        ref={scroller}
        tabIndex={0}
        onKeyDown={onKey}
        aria-label="Course map"
        className="tree-canvas relative overscroll-contain h-[calc(100dvh-11.75rem)] sm:h-[calc(100dvh-9.5rem)] min-h-[30rem] overflow-auto rounded-2xl border border-line bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-[#4b56a8]/30"
        style={{ backgroundSize: `${22 * zoom}px ${22 * zoom}px`, height: fill ?? undefined, marginRight: gap, transition: "margin-right 0.5s var(--ease-out)" }}
        onPointerDown={(e) => {
          // Only empty space starts a box or a drag: the map's background, a lesson's band and the words in its header
          // (not a card, a button, a box to type in, or a menu).
          const t = e.target as HTMLElement;
          if (t !== e.currentTarget && !t.dataset.canvas && (t.closest("[data-node], button, input, textarea, select, a, label, [role=menu], .pop") || !t.closest("[data-canvas]"))) return;
          setMenu(null);
          if (jiggle) setJiggle(false);
          if (gather) { endGather(); return; }
          // With a mouse, dragging on empty space draws a box that picks every card it touches (Shift adds to what's
          // picked). Holding Space, the middle button, or a finger on a touch screen moves the map instead.
          if (!readOnly && e.pointerType === "mouse" && e.button === 0 && !spaceDown.current) {
            const a = toCanvas(e.clientX, e.clientY);
            const keep = e.shiftKey || picking;
            const start = { x: e.clientX, y: e.clientY };
            // Drawing a box mustn't select the words it passes over.
            e.preventDefault();
            window.getSelection()?.removeAllRanges();
            scroller.current?.focus({ preventScroll: true });
            setBox({ x0: a.x, y0: a.y, x1: a.x, y1: a.y });
            const mv = (ev: PointerEvent) => { const b = toCanvas(ev.clientX, ev.clientY); setBox({ x0: a.x, y0: a.y, x1: b.x, y1: b.y }); };
            const done = (ev: PointerEvent) => {
              window.removeEventListener("pointermove", mv);
              window.removeEventListener("pointerup", done);
              setBox(null);
              // A click on empty space (no box) lets go of what was picked.
              // A click on empty space (no box) lets go of what was picked, and of the card open in the panel.
              if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) { if (!keep) { setPicks(new Set()); onDeselect?.(); } return; }
              const b = toCanvas(ev.clientX, ev.clientY);
              const [l, r, t, bt] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
              const hit = [...nodes.values()].filter((n) => n.x < r && n.x + W > l && n.y < bt && n.y + n.h > t).map((n) => n.m.id);
              setPicks((s) => new Set([...(keep ? s : []), ...hit]));
            };
            window.addEventListener("pointermove", mv);
            window.addEventListener("pointerup", done);
            return;
          }
          // Drag the background to move around.
          const el = scroller.current!;
          const s = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
          el.style.cursor = "grabbing";
          const move = (ev: PointerEvent) => { el.scrollLeft = s.l - (ev.clientX - s.x); el.scrollTop = s.t - (ev.clientY - s.y); };
          // A tap that didn't move the map (a finger, or a read-only map) lets go of the card open in the panel too.
          const up = (ev: PointerEvent) => { el.style.cursor = ""; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (Math.hypot(ev.clientX - s.x, ev.clientY - s.y) < 5) onDeselect?.(); };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        {/* While Add a card is open beside the last card of the widest lesson, the map makes room for it on the right. */}
        {/* Room under the last row for the floating toolbar, so it never sits on the Lesson / week buttons. */}
        {/* While the card panel is open there's a panel's width of room past the last card, so even a card at the far
            right can scroll clear of the panel (the map narrows as the panel slides in, which would stop it short). */}
        <div data-canvas="1" style={{ width: Math.max(width, menu && "add" in menu ? menu.x + 320 : 0) * zoom + (gap > 0 ? PANEL : 0), height: (height + 170) * zoom }} className="relative">
          <div data-canvas="1" className="absolute left-0 top-0 origin-top-left" style={{ width: Math.max(width, menu && "add" in menu ? menu.x + 320 : 0), height: height + 170, transform: `scale(${zoom})` }}>
            {/* Lessons: a quiet band each, with its name and a way to add a card. */}
            {regions.map((r) => {
              const today = r.lesson.id === todayId;
              // The lesson as it really is (the drawn one leaves out folded-away cards).
              const full = lessons.find((l) => l.id === r.lesson.id) ?? r.lesson;
              return (
                <div key={r.lesson.id} data-canvas="1" className={`absolute rounded-[28px] transition-[background-color,box-shadow] duration-200 ${moving && moving.to === r.lesson.id && lessonWith(moving.id)?.id !== r.lesson.id ? (whyNot(moving.id, r.lesson.id) ? "bg-bad/[0.06] ring-2 ring-bad/30" : "bg-[#4b56a8]/[0.07] ring-2 ring-[#4b56a8]/40") : today ? "tree-lesson-today" : "tree-lesson"}`} style={{ left: r.x - 20, top: r.y, width: r.w + 40, height: r.h }}>
                  <div className="flex min-w-0 items-center gap-2 px-5 pt-3.5" style={{ fontSize: level === "far" ? 22 : 13 }}>
                    <span className={`flex flex-none items-center justify-center rounded-full font-semibold ${today ? "bg-ok text-white" : "bg-ink text-white"} ${level === "far" ? "h-9 w-9 text-[17px]" : "h-[22px] w-[22px] text-[11px]"}`}>{regions.indexOf(r) + 1}</span>
                    {readOnly || level === "far" ? <span className="min-w-0 truncate font-semibold text-ink" title={r.lesson.title}>{r.lesson.title}</span>
                      : <LessonName title={r.lesson.title} onRename={(title) => { const real = lessons.find((l) => l.id === r.lesson.id); if (real) onChange({ ...real, title }); }} />}
                    {weekOf[r.lesson.id] && <span className="flex-none text-ink-3">{weekOf[r.lesson.id]}</span>}
                    {lessonBar && level !== "far" ? lessonBar(r.lesson.id)
                      : today && <span className="chip h-5 flex-none bg-ok/10 text-[11px] text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Today</span>}
                    <span className="flex-1" />
                    {!readOnly && level !== "far" && (
                      <button onClick={(e) => { e.stopPropagation(); const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); const p = toCanvas(b.right + 8, b.top); setMenu({ add: r.lesson.id, x: p.x, y: p.y }); }}
                        className="press flex h-7 flex-none items-center gap-1 rounded-lg bg-white px-2 text-[12px] text-ink-2 shadow-sm hover:text-ink"><Icon name="plus" size={12} /> Card</button>
                    )}
                  </div>
                  {!full.modules.length && (
                    <div className="mx-5 mt-6 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[12.5px] text-ink-3">No cards yet</div>
                  )}
                </div>
              );
            })}
            {/* Under the lessons: "+ Lesson" belongs to the last week, so it sits with it; adding a week is a course
                thing, so it has its own row below a rule. */}
            {!readOnly && onAddLesson && (
              <div className="absolute" style={{ left: 40, top: height - 76 }}>
                <button onClick={onAddLesson} className={MAP_ADD}><Icon name="plus" size={13} /> {addLessonLabel ?? "Lesson"}</button>
              </div>
            )}
            {!readOnly && footer && (
              <div className="absolute flex items-center gap-4" style={{ left: 20, top: height + 4, width: Math.max(width - 40, 400) }}>
                <div className="absolute inset-x-0 -top-5 border-t border-line" />
                <div className="pl-5">{footer}</div>
              </div>
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

            {level !== "far" && !drag && (() => {
              // Answers that lead to the same card share a wire's last stretch: one label says them all ("B · Sand / C · Seawater").
              const shown = new Map<string, { w: Wire; mid: { x: number; y: number }; texts: string[] }>();
              for (const w of drawn.filter((x) => hot === x.from || hot === x.to || selected === x.from || selected === x.to)) {
                const { mid } = route(w);
                const key = `${nodeOf(w.from)}|${w.to}`;
                const had = shown.get(key);
                if (had) had.texts.push(whyOf(w)); else shown.set(key, { w, mid, texts: [whyOf(w)] });
              }
              return [...shown.values()].map(({ w, mid, texts }) => (
                <span key={`why-${w.from}-${w.q}-${w.option}-${w.to}`} title={texts.join(" / ")} className="pop pointer-events-none absolute z-20 max-w-[260px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border bg-white px-2.5 py-[3px] text-[11px] font-medium shadow-[0_6px_16px_-10px_rgba(20,20,18,0.4)]"
                  style={{ left: mid.x, top: mid.y, color: colorOf(w), borderColor: `${colorOf(w)}55` }}>{texts.join(" / ")}</span>
              ));
            })()}

            {/* Card groups' fans, drawn before the cards so each group's sleeve covers the bottom of its cards. */}
            {level !== "far" && [...nodes.values()].filter((nd) => nd.m.type === "group").map((nd) => {
              const p = at(nd.m.id);
              // A card held over this sleeve: it shows in the fan, at the end, as it would be once let go.
              const adding = moving?.into === nd.m.id ? all.find((x) => x.m.id === moving.id)?.m : undefined;
              return <Fan key={`fan-${nd.m.id}`} members={nd.members ?? []} x={p.x} y={p.y} open={hot === nd.m.id || !!adding} faded={moving?.id === nd.m.id} adding={adding} bad={!!adding && !!whyInto(adding.id, nd.m.id)}
                act={readOnly || moving || gather ? undefined : {
                  toCanvas,
                  onOpen: (id) => onEdit(nd.lessonId, id),
                  onReorder: (ids) => { const l = lessonWith(nd.m.id); if (l) onChange(tidy({ ...l, modules: l.modules.map((x) => (x.id === nd.m.id ? { ...x, members: ids } : x)) })); },
                  onDelete,
                  onHot: (on) => setHot((h) => (on ? nd.m.id : h === nd.m.id ? null : h)),
                }} />;
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
              const lessonCards = lessons.find((l) => l.id === nd.lessonId)?.modules ?? [];
              const scoring = isQuiz(m, lessonCards);
              const bands = scoring ? bandsOf(m) : [];
              const nQ = scoring ? scoreCount(m, lessonCards) : 0;
              const isSel = selected === m.id;
              // While its title is being typed, the head isn't a button (a text box can't sit inside one).
              const Head = typing?.id === m.id && typing.field === "title" ? "div" : "button";
              return (
                <div
                  key={m.id}
                  data-node={m.id}
                  onPointerEnter={() => setHot(m.id)}
                  onPointerLeave={() => setHot((h) => (h === m.id ? null : h))}
                  // A click anywhere on the card opens it (the head's button too); its own buttons and boxes keep their clicks.
                  onClick={(e: React.MouseEvent) => {
                    const t = e.target as HTMLElement;
                    const own = t.closest("button, a, input, textarea, select, label, [contenteditable], [role=button]") as HTMLElement | null;
                    // Picking cards for a group, or deleting, a click on the card's picture counts as a click on the card.
                    const passes = own?.dataset.art !== undefined && (e.shiftKey || picking || jiggle);
                    if (own && !own.classList.contains("tree-head") && !passes) return;
                    if (dragged || typing || jiggle || window.getSelection()?.toString()) return;
                    if ((e.shiftKey || picking) && !readOnly) { setPicks((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; }); return; }
                    onEdit(nd.lessonId, m.id);
                  }}
                  className={`tree-node absolute flex cursor-pointer flex-col rounded-[18px] border bg-white ${moving?.id === m.id ? "border-dashed !border-[#4b56a8] opacity-35" : ""} ${m.type === "group" ? `isolate ${level !== "far" ? "tree-sleeve" : ""}` : ""} ${fresh === m.id ? "tree-fresh" : ""} ${moving?.into === m.id ? (whyInto(moving.id, m.id) ? "border-bad" : "tree-target border-[#4b56a8]") : isSel || picks.has(m.id) ? "tree-picked border-[#4b56a8]" : drag?.over === m.id && targetable ? "tree-target border-[#4b56a8]" : drag && !targetable && m.id !== drag.port.from ? "border-line opacity-45" : hot === m.id ? "border-line-strong" : "border-line"}`}
                  style={{ left: p.x, top: p.y, width: W, height: nd.h, animationDelay: `${Math.min(i, 14) * 25}ms` }}
                >
                  {jiggle && onDelete && (
                    <button onClick={(e) => { e.stopPropagation(); onDelete(m); }} onPointerDown={(e) => e.stopPropagation()} aria-label={`Delete ${m.title || "this card"}`}
                      className="pop absolute -left-2.5 -top-2.5 z-30 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#6f6f6c] text-white shadow-md hover:bg-bad">
                      <span className="block h-[2.5px] w-3 rounded-full bg-white" />
                    </button>
                  )}
                  {jiggle && !readOnly && !groupOf.has(m.id) && (
                    <button onClick={(e) => { e.stopPropagation(); startGather(m); }} onPointerDown={(e) => e.stopPropagation()} aria-label={m.type === "group" ? `Add to ${m.title || "this group"}` : `Group ${m.title || "this card"} with other cards`}
                      title={m.type === "group" ? "Add cards or groups to this group" : "Group with other cards"}
                      className="pop absolute -right-2.5 -top-2.5 z-30 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#4b56a8] text-white shadow-md hover:bg-[#3c4690]">
                      <Icon name="layers" size={12} />
                    </button>
                  )}
                  {m.type === "group" && level !== "far" && !readOnly && (
                    // On the sleeve: rename it, and keep it (named, with its cards) in My cards.
                    <span className="absolute right-2 top-[11px] z-10 flex items-center gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); setTyping({ id: m.id, field: "title", value: m.title }); }} onPointerDown={(e) => e.stopPropagation()} aria-label={`Rename ${m.title}`} data-tip="Rename"
                        className="press grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:bg-black/[0.05] hover:text-ink"><Icon name="pencil" size={12} /></button>
                      {onSaveGroup && <button onClick={(e) => { e.stopPropagation(); onSaveGroup(m); }} onPointerDown={(e) => e.stopPropagation()} aria-label={`Save ${m.title} to My cards`} data-tip="Save to My cards"
                        className="press grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:bg-black/[0.05] hover:text-ink"><Icon name="star" size={12} /></button>}
                    </span>
                  )}
                  {inbound.length > 0 && <span className={`absolute left-1/2 z-10 -translate-x-1/2 rounded-full border-2 border-white shadow-[0_0_0_3px_rgba(255,255,255,0.6)] ${level === "far" ? "-top-[8px] h-3.5 w-3.5" : "-top-[7px] h-3 w-3"}`} style={{ background: colorOf(inbound[0]) }} />}
                  <Head onPointerDown={(e: React.PointerEvent) => startMove(e, m.id)} onContextMenu={(e: React.MouseEvent) => { if (!readOnly) e.preventDefault(); }} className={`tree-head block w-full flex-none select-none overflow-hidden rounded-t-[17px] text-left [-webkit-touch-callout:none] ${readOnly ? "" : "cursor-grab active:cursor-grabbing"}`} style={{ height: level === "far" ? FAR_H : HEAD }} aria-label={`Edit ${m.title}`} title={readOnly ? undefined : "Click to edit · double-click the title to rename · drag to another lesson"}>
                    {/* Clipped by the head's corners (the card's inner radius), so it follows the border's curve. */}
                    <span className="tree-bar block h-[5px]" style={(m.type === "group" && nd.members?.length ? { background: `linear-gradient(90deg, ${nd.members.map((c) => suitOfCard(c).tint).join(", ")})` } : { "--bar": suit.tint }) as React.CSSProperties} />
                    {level === "far" ? (
                      <span className="line-clamp-2 px-4 pt-3 text-[26px] font-semibold leading-[1.15] text-ink">{m.title || "Untitled card"}</span>
                    ) : (
                      <>
                        <span className="flex items-center gap-1.5 px-3.5 pt-2 text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: suit.tint }}>
                          <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px]" style={{ background: `${suit.tint}16` }}><Icon name={faceMeta(m).icon} size={11} /></span><span className="flex-none whitespace-nowrap">{m.type === "group" ? (() => { const gs = (nd.members ?? []).filter((c) => c.type === "group").length, n = leavesOf(m, lessonCards).length; return gs ? `${gs} group${gs === 1 ? "" : "s"} · ${n} cards` : `${n} cards`; })() : faceMeta(m).name}</span>
                          <span className={`truncate normal-case tracking-normal text-ink-3 ${m.type === "group" ? "pr-14" : ""}`}>
                            · {unfinished(m) ? <span className="text-[#a0561f]">{blankContent(m) ? "hidden until it has something in it" : "hidden until it has a question"}</span> : fromElsewhere ? `dealt in ${fromLesson?.title}` : inbound.length ? (inbound.some((w) => w.q !== SCORE) ? "dealt by an answer" : "dealt by a score") : m.audience.kind === "student" ? someOf(m) : "everyone"}{m.optional ? " · optional" : ""}
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
                      {mediaStrip(m) && (
                        <div className="px-3.5 pb-1 pt-2.5" style={{ height: MEDIA }}>
                          <div className="relative h-full overflow-hidden rounded-[10px]" style={{ background: suit.cover }}>
                            <MapArt m={m} tint={suit.tint} cover={suit.cover} onMedia={(a, el, e) => { if (e.shiftKey || picking || jiggle || dragged) return; e.stopPropagation(); setViewing({ a, title: m.title, from: el.getBoundingClientRect(), open: true }); }} />
                          </div>
                        </div>
                      )}
                      {nd.members && (
                      <div className={nd.clip !== undefined ? "relative overflow-hidden" : undefined} style={nd.clip !== undefined ? { maxHeight: nd.clip } : undefined}>
                      {nd.members.map((c) => c.type === "group" ? (
                        // A group inside this one: its name, its cards, and its own score.
                        <div key={c.id} className="bg-[#f6f6f9] shadow-[inset_3px_0_0_#c9cdee]">
                          <button onClick={() => onEdit(nd.lessonId, c.id)} className="flex w-full items-center gap-2 px-3.5 text-left hover:bg-lane" style={{ height: SEC }} title="Edit this group">
                            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-[#eef0fb] text-[#4b56a8]"><Icon name="layers" size={11} /></span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{c.title || "Card group"}</span>
                            <span className="text-[10.5px] text-ink-3">{c.members?.length ?? 0} cards</span>
                          </button>
                          {(c.members ?? []).map((id) => lessonCards.find((x) => x.id === id)).filter((x): x is Module => !!x).map((ic) => memberRow(ic, nd.lessonId))}
                          {isQuiz(c, lessonCards) && scoreRows(c, scoreCount(c, lessonCards))}
                        </div>
                      ) : memberRow(c, nd.lessonId))}
                      {nd.clip !== undefined && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-white/0" />}
                      </div>
                      )}
                      {qs.map((q) => (
                        <div key={q.id}>
                          {typing?.id === m.id && typing.field === `q:${q.id}`
                            ? <div className="flex items-center px-2" style={{ height: SEC }}>{typeBox("h-6 text-[11.5px]")}</div>
                            : <div onDoubleClick={startTyping(m.id, `q:${q.id}`, q.text)} className="truncate px-3.5 text-[11.5px] leading-[28px] text-ink-3" style={{ height: SEC }} title={readOnly ? undefined : "Double-click to edit"}><MathText text={q.text.trim() || m.title || "Question"} /></div>}
                          {q.options.map((o, oi) => {
                            const to = targetsOf(q, oi).length > 0;
                            return (
                              <div key={oi} className="relative flex items-center gap-2 px-3.5" style={{ height: ROW }}>
                                <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[10.5px] font-semibold transition-colors ${to ? "text-white" : isRight(q, oi) ? "bg-ok/15 text-ok" : "bg-lane text-ink-3"} ${q.kind === "multi" ? "!rounded-[4px]" : ""}`} style={to ? { background: pathColor(oi) } : undefined} title={isRight(q, oi) && !m.poll ? "A right answer" : undefined}>{letter(oi)}</span>
                                {typing?.id === m.id && typing.field === `o:${q.id}:${oi}`
                                  ? <span className="min-w-0 flex-1 pr-3">{typeBox("h-6 text-[12.5px]")}</span>
                                  : <span onDoubleClick={startTyping(m.id, `o:${q.id}:${oi}`, o)} className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2" title={readOnly ? undefined : "Double-click to edit"}>{o.trim() ? <MathText text={o.trim()} /> : `Option ${oi + 1}`}</span>}
                                {wentBadge(m.id, q.id, oi)}
                                <PortDot color={pathColor(oi)} wired={!!to} readOnly={readOnly} label={to ? `Answer ${letter(oi)} deals ${targetsOf(q, oi).length > 1 ? `${targetsOf(q, oi).length} cards` : "a card"}. Add or change` : `Deal a card for answer ${letter(oi)}`} onPointerDown={(e) => startDrag(e, { from: m.id, q: q.id, option: oi })} />
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {otherQs(m).map((q) => (
                        <div key={q.id}>
                          <div className="truncate px-3.5 text-[11.5px] leading-[28px] text-ink-3" style={{ height: SEC }}><MathText text={q.text.trim() || m.title || "Question"} /></div>
                          {m.signup ? q.options.filter((o) => o.trim()).map((o, oi) => (
                            // A sign-up poll: each option is a group students join.
                            <div key={oi} className="flex items-center gap-2 px-3.5" style={{ height: ROW }} title="A group students join by picking it">
                              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-lane text-[10.5px] font-semibold text-ink-2">{letter(oi)}</span>
                              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2"><MathText text={o.trim()} /></span>
                              <Icon name="users" size={12} className="flex-none text-ink-3/70" />
                            </div>
                          )) : q.kind === "order" ? q.options.filter((o) => o.trim()).map((o, oi) => (
                            <div key={oi} className="flex items-center gap-2 px-3.5" style={{ height: ROW }} title="The right order">
                              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-ok/15 text-[10.5px] font-semibold text-ok">{oi + 1}</span>
                              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2"><MathText text={o.trim()} /></span>
                              <Icon name="grip" size={12} className="flex-none text-ink-3/60" />
                            </div>
                          )) : (
                            <div className="flex items-center gap-2 px-3.5" style={{ height: ROW }}>
                              <span className="flex h-5 min-w-0 flex-1 items-center rounded-md border border-dashed border-line-strong px-2 text-[12px] text-ink-2">
                                <span className="truncate">{q.accept?.filter((a) => a.trim()).length ? q.accept.filter((a) => a.trim()).join(" · ") : <span className="text-ink-3">Students type an answer</span>}</span>
                              </span>
                              {!!q.accept?.some((a) => a.trim()) && <span className="flex-none text-[10.5px] text-ok">accepted</span>}
                            </div>
                          )}
                        </div>
                      ))}
                      {scoring && scoreRows(m, nQ)}
                      {wantsQuestion(m) && (
                        <div className="truncate px-3.5 text-[11.5px] leading-[34px] text-ink-3">
                          {readOnly ? "No question yet" : <button onClick={() => onEdit(nd.lessonId, m.id)} className="hover:text-ink">Add its question</button>}
                        </div>
                      )}
                    </div>
                  )}
                  {!nd.members && <CardRest m={m} far={level === "far"} art={level === "far" || !hasBody(m)} tint={suit.tint} cover={suit.cover}
                    onMedia={(a, el, e) => { if (e.shiftKey || picking || jiggle || dragged) return; e.stopPropagation(); setViewing({ a, title: m.title, from: el.getBoundingClientRect(), open: true }); }} />}
                  {dealsSome(m.id) && (() => {
                    // A paper tab at the top of the right edge, where the wires leave: fold the cards it deals away, or
                    // bring them back. White with an arrow: some are folded away; pale blue: they're showing.
                    const shut = folded.has(m.id);
                    const n = shut ? foldedUnder(m.id) : 0;
                    const say = shut ? `Show ${n} follow-up${n === 1 ? "" : "s"}` : "Hide follow-ups";
                    return (
                      <button onClick={(e) => { e.stopPropagation(); setTip(null); fold(m.id, !shut); }} onPointerDown={(e) => e.stopPropagation()}
                        aria-pressed={shut} aria-label={say} {...tipOn(say, "right")}
                        className={`paper-tab tab-r border-line ${shut ? "" : "is-open"}`}>
                        <Icon name="chevron" size={level === "far" ? 16 : 11} className={shut ? "-rotate-90" : "rotate-90"} />
                      </button>
                    );
                  })()}
                  {nd.more && (() => {
                    // A paper tab in the middle of the bottom edge: show all the group's cards, or cut it back to a card's height.
                    const shut = nd.clip !== undefined;
                    const say = shut ? "Expand group" : "Collapse group";
                    return (
                      <button onClick={(e) => { e.stopPropagation(); setTip(null); setOpened((o) => { const k = new Set(o); if (k.has(m.id)) k.delete(m.id); else k.add(m.id); return k; }); }}
                        onPointerDown={(e) => e.stopPropagation()} aria-expanded={!shut} aria-label={say} {...tipOn(say, "below")}
                        className={`paper-tab tab-b border-line ${shut ? "" : "is-open"}`}>
                        <Icon name="chevron" size={11} className={shut ? "" : "rotate-180"} />
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
            {gather && nodes.get(gather) && (() => {
              // The frame round the card being grouped, and the empty place beside it for the next card.
              const g = nodes.get(gather)!, p0 = at(gather), lift = g.m.type === "group" && level !== "far" ? FAN : 0;
              const p = { x: p0.x, y: p0.y - lift }, h = Math.max(g.h + lift, CARD_H);
              const over = !!moving?.join;
              const bad = over && moving ? whyNoJoin(moving.id) : null;
              return (
                <>
                  <div aria-hidden="true" className={`gather-frame pointer-events-none absolute rounded-[30px] border-2 border-dashed transition-colors duration-200 ${bad ? "border-bad/50 bg-bad/[0.04]" : over ? "border-[#4b56a8] bg-[#4b56a8]/[0.08]" : "border-[#4b56a8]/45 bg-[#4b56a8]/[0.035]"}`}
                    style={{ left: p.x - 18, top: p.y - 18, width: 2 * W + HGAP + 36, height: h + 36 }} />
                  <div className={`gather-slot pointer-events-none absolute z-10 flex flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed transition-[transform,background-color,border-color] duration-200 ${bad ? "border-bad/40 bg-white/70 text-bad" : over ? "scale-[1.03] border-[#4b56a8] bg-white text-[#4b56a8]" : "border-[#4b56a8]/35 bg-white/60 text-[#4b56a8]/70"}`}
                    style={{ left: p.x + W + HGAP, top: p.y, width: W, height: CARD_H }}>
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-[#4b56a8]/[0.08] text-[40px] font-light leading-none">+</span>
                    <span className="px-6 text-center text-[12px]">{bad || (over ? "Let go to add it" : "Drag a card here")}</span>
                  </div>
                </>
              );
            })()}
            {flying.map((f) => (
              <div key={f.key} aria-hidden="true" className="tree-fly pointer-events-none absolute z-30 overflow-hidden rounded-[18px] border border-[#4b56a8]/50 bg-white shadow-[0_24px_50px_-18px_rgba(20,20,18,0.55)]"
                style={{ left: f.from.x - W / 2, top: f.from.y - 20, width: W, "--fx": `${f.to.x - f.from.x + W / 2}px`, "--fy": `${f.to.y - f.from.y + 20}px` } as React.CSSProperties}>
                <span className="block h-1.5" style={{ background: suitOfCard(f.m).tint }} />
                <span className="block truncate px-3.5 pb-3 pt-2 text-[14px] font-semibold text-ink">{f.m.title || "Untitled card"}</span>
              </div>
            ))}
            {moving && (() => {
              const m = all.find((x) => x.m.id === moving.id)?.m;
              if (!m) return null;
              const bad = moving.to && moving.to !== lessonWith(moving.id)?.id ? whyNot(moving.id, moving.to) : null;
              // Over a sleeve: the card shows in that group's fan instead, so here only a word on what letting go does.
              if (moving.into) {
                const why = whyInto(moving.id, moving.into);
                const g = all.find((x) => x.m.id === moving.into)?.m;
                return (
                  <div className={`pointer-events-none absolute z-30 max-w-[260px] rounded-full border bg-white px-3 py-1 text-[11.5px] shadow-[0_12px_30px_-14px_rgba(20,20,18,0.5)] ${why ? "border-bad/40 text-bad" : "border-[#4b56a8]/40 text-[#4b56a8]"}`} style={{ left: moving.x + 14, top: moving.y + 16 }}>
                    {why ?? `Let go to add it to ${g?.title || "the group"}`}
                  </div>
                );
              }
              return (
                <div className="pointer-events-none absolute z-30 rotate-[2deg] overflow-hidden rounded-[18px] border border-[#4b56a8] bg-white shadow-[0_24px_50px_-18px_rgba(20,20,18,0.55)]" style={{ left: moving.x - W / 2, top: moving.y - 20, width: W }}>
                  <span className="block h-1.5" style={{ background: suitOfCard(m).tint }} />
                  <span className="block truncate px-3.5 pb-3 pt-2 text-[14px] font-semibold text-ink">{m.title || "Untitled card"}</span>
                  {moving.join ? (
                    <span className={`block border-t border-line px-3.5 py-1.5 text-[11.5px] ${whyNoJoin(moving.id) ? "text-bad" : "text-[#4b56a8]"}`}>{whyNoJoin(moving.id) ? "Can’t go in this group" : "Add to the group"}</span>
                  ) : moving.trash ? (
                    <span className="block border-t border-line px-3.5 py-1.5 text-[11.5px] text-bad">Drop to delete</span>
                  ) : moving.to && moving.to !== lessonWith(moving.id)?.id && (
                    <span className={`block border-t border-line px-3.5 py-1.5 text-[11.5px] ${bad ? "text-bad" : "text-[#4b56a8]"}`}>{bad ? "Can’t go here" : `Move to ${lessons.find((l) => l.id === moving.to)?.title}`}</span>
                  )}
                </div>
              );
            })()}
            {menu && "add" in menu && (
              <div ref={scrollIntoMap} className="pop absolute z-20 w-[296px] rounded-2xl border border-line bg-white p-3 shadow-[0_24px_60px_-20px_rgba(20,20,18,0.45)]" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
                <div className="px-1 pb-3">
                  <div className="text-[13.5px] font-semibold text-ink">Add a card</div>
                  <div className="truncate text-[11.5px] text-ink-3">to {lessons.find((l) => l.id === menu.add)?.title} · every student gets it</div>
                </div>
                {kindPicker((t) => addCard(menu.add, t), (sc) => addCard(menu.add, "content", sc))}
              </div>
            )}

            {menu && "port" in menu && (() => {
              const src = all.find((x) => x.m.id === menu.port.from)?.m;
              const isScore = menu.port.q === SCORE;
              const band = isScore && src ? bandsOf(src)[menu.port.option] : undefined;
              const q = !isScore ? src?.questions?.find((x) => x.id === menu.port.q) : undefined;
              const dealt = isScore ? (band?.next ? [band.next] : []) : q ? targetsOf(q, menu.port.option) : [];
              const others = targetsFor(menu.port).filter((x) => !dealt.includes(x.m.id));
              const fromLi = lessonIndex(lessonWith(menu.port.from).id);
              const later = lessons.slice(fromLi, fromLi + 4);
              const groups = lessons.map((l) => ({ l, cards: others.filter((x) => x.lessonId === l.id) })).filter((g) => g.cards.length);
              const into = menuLesson ?? lessons[fromLi].id;
              return (
                <div ref={keepInView} className="pop absolute z-20 w-72 rounded-2xl border border-line bg-white p-2 shadow-[0_24px_60px_-20px_rgba(20,20,18,0.45)]" style={{ left: menu.x + 14, top: Math.max(8, menu.y - 24) }} onPointerDown={(e) => e.stopPropagation()}>
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
                  {kindPicker((t) => newCard(menu.port, t, into), (sc) => newCard(menu.port, "content", into, sc), true)}
                  {menu.mode === "port" && dealt.length > 0 && (
                    <>
                      <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{isScore ? "Deals" : dealt.length > 1 ? `Deals ${dealt.length} cards` : "Deals"}</div>
                      {dealt.map((id) => {
                        const c = all.find((x) => x.m.id === id)?.m;
                        return (
                          <div key={id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-[12.5px]">
                            <span className="h-3 w-2 flex-none rounded-[3px]" style={{ background: c ? suitOfCard(c).tint : INK }} />
                            <span className="min-w-0 flex-1 truncate">{c?.title || "Untitled card"}</span>
                            <button onClick={() => { unwire(menu.port, id); if (dealt.length === 1) setMenu(null); }} title="Disconnect: students who pick this no longer get it" aria-label={`Disconnect “${c?.title || "this card"}”`}
                              className="press flex h-6 w-6 flex-none items-center justify-center rounded-md text-ink-3 hover:bg-lane hover:text-bad"><Icon name="x" size={12} /></button>
                          </div>
                        );
                      })}
                    </>
                  )}
                  {menu.mode === "port" && groups.length > 0 && (
                    <>
                      <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{isScore ? "Deal a card already made" : dealt.length ? "Also deal a card already made" : "Deal a card already made"}</div>
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
                  {menu.mode === "port" && dealt.length > 1 && (
                    <button onClick={() => { unwire(menu.port, null); setMenu(null); }} className="press mt-1 block w-full rounded-lg border-t border-line px-2 py-1.5 text-left text-[12.5px] text-bad hover:bg-lane">
                      Disconnect all (the cards go to everyone)
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        {/* Not while the + Card menu is open: the hint would cover it. */}
        {nothing && !menu && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl border border-line bg-white px-5 py-4 text-center text-[13px] text-ink-2 shadow-sm">
              This course has no cards yet. Use <b>+ Card</b> on a lesson to put one down. Give a Question card some choices, then drag each answer to the card it deals.
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

/** A path through these points at right angles, each corner rounded. */
/** The rest of a card below its head and answers: its picture (or drawing) and the start of what to do, like a playing card's face. */
/** A card's media on the map: its picture, video, recording or file (a video or a picture opens big), or its drawing. */
function MapArt({ m, tint, cover, onMedia }: { m: Module; tint: string; cover: string; onMedia?: (a: Attachment, el: HTMLElement, e: React.MouseEvent) => void }) {
  const first = heroOf(m);
  const yt = first?.kind === "link" ? videoEmbed(first.url)?.src.match(/youtube[^/]*\/embed\/([\w-]+)/)?.[1] : undefined;
  const open = (e: React.MouseEvent<HTMLElement>) => first && onMedia?.(first, e.currentTarget, e);
  if (first?.kind === "image") return (
    <button type="button" data-art onClick={open} aria-label={`Open the picture on “${m.title}”`} className="absolute inset-0 cursor-zoom-in">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={first.url} alt="" draggable={false} className="h-full w-full object-cover" />
    </button>
  );
  if (first?.kind === "video" || yt) return (
    <button type="button" data-art onClick={open} aria-label={`Play the video on “${m.title}”`} className="group absolute inset-0 bg-[#dfe6ec]">
      {first?.kind === "video"
        ? <video src={`${first.url}#t=1.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" draggable={false} className="h-full w-full object-cover" />}
      <span className="absolute inset-0 flex items-center justify-center"><PlayDot /></span>
    </button>
  );
  if (first?.kind === "audio") return <div className="absolute inset-0"><Recording a={first} cover={cover} /></div>;
  if (first?.kind === "file") return (
    <a href={first.url} target="_blank" rel="noreferrer" data-art onClick={(e) => e.stopPropagation()} aria-label={`Open ${first.name || "the file"} on “${m.title}”`} className="absolute inset-0">
      <KindArt m={m} tint={tint} />
    </a>
  );
  return <KindArt m={m} tint={tint} />;
}

function CardRest({ m, far, art, tint, cover, onMedia }: { m: Module; far: boolean; art: boolean; tint: string; cover: string; onMedia?: (a: Attachment, el: HTMLElement, e: React.MouseEvent) => void }) {
  // A table reads as noise in a few lines of preview: the drawing shows there is one.
  const body = plainText(m.body, { tables: false }).trim();
  return (
    // The padding sits inside the clipped box, so a card whose answers fill it hides the preview instead of spilling.
    <div className="min-h-0 flex-1 overflow-hidden">
    <div className={`flex h-full flex-col gap-2 ${far ? "px-4 pb-4 pt-1" : "px-3.5 pb-3.5 pt-1.5"}`}>
      {art && (
        <div className="relative min-h-[3rem] flex-1 overflow-hidden rounded-[12px]" style={{ background: cover }}>
          <MapArt m={m} tint={tint} cover={cover} onMedia={onMedia} />
        </div>
      )}
      {/* Line breaks kept (a heading, then its text), with blank lines between blocks closed up. */}
      {!far && body && <p className={`flex-none whitespace-pre-line text-[12px] leading-[1.45] text-ink-2 ${art ? "line-clamp-3" : "line-clamp-[8]"}`}><MathText text={body.replace(/\n{2,}/g, "\n")} /></p>}
      {/* Nothing more to say: the card's drawing fills the rest of its face, as on a playing card. */}
      {!far && !body && !art && (
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[12px] opacity-80" style={{ background: cover }}>
          <KindArt m={m} tint={tint} />
        </div>
      )}
    </div>
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
      <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setDraft(title); }} title={`${title} (click to rename)`}
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
  // "5 min ago" counts from when the list was opened, not from each render.
  const [now, setNow] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as globalThis.Node)) setOpen(false); };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);
  const list = [...entries].reverse();
  const ago = (t: number) => { const m = Math.round((now - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  return (
    <div ref={box} className="pointer-events-auto relative">
      <button data-trash="1" onClick={() => { setNow(Date.now()); setOpen((v) => !v); }} aria-expanded={open} aria-label={`Trash${entries.length ? `, ${entries.length} deleted` : ""}`}
        data-tip={dragging ? "Drop here to delete" : "Trash"}
        className={`press relative grid h-7 w-7 place-items-center rounded-lg transition-[transform,background-color,color] duration-200 ${hot ? "scale-125 bg-bad text-white" : dragging ? "bg-bad/10 text-bad" : open ? "bg-lane text-ink" : "text-ink-2 hover:bg-lane hover:text-ink"}`}>
        <Icon name="trash" size={14} />
        {entries.length > 0 && !hot && <span className="mono absolute -right-1 -top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-[#6f6f6c] px-1 text-[9px] font-medium text-white">{entries.length}</span>}
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

/** All the words on a card, for search: its title, text, questions, choices and explanations. */
function cardWords(m: Module): string {
  const qs = (m.questions ?? []).flatMap((q) => [q.text, ...(q.options ?? []), q.explain ?? "", ...(q.accept ?? [])]);
  return [m.title, plainText(m.body ?? ""), ...qs].join(" \n ");
}

/**
 * Find a card by any of its words. A box over the map's toolbar: type, then pick a result (or press Enter for the
 * first) to bring that card into view and open it. "/" opens it.
 */
function MapSearch({ cards, lessons, open, onOpen, onPick }: {
  cards: { m: Module; lessonId: string }[];
  lessons: Lesson[];
  open: boolean;
  onOpen: (v: boolean) => void;
  onPick: (lessonId: string, id: string) => void;
}) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? cards.map((c) => {
    const text = cardWords(c.m);
    const low = text.toLowerCase();
    if (!words.every((w) => low.includes(w))) return null;
    // A little of the text around the first word found, unless it's in the title.
    const inTitle = words.every((w) => c.m.title.toLowerCase().includes(w));
    const at = low.indexOf(words[0]);
    const snip = inTitle ? "" : `${at > 30 ? "…" : ""}${plainMath(text.slice(Math.max(0, at - 30), at + 60).replace(/\s+/g, " "))}…`;
    return { ...c, snip, score: inTitle ? 0 : 1 };
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.score - b.score).slice(0, 8) : [];
  const lessonTitle = (id: string) => lessons.find((l) => l.id === id)?.title ?? "";
  if (!open) return (
    <button onClick={() => onOpen(true)} data-tip="Search  /" aria-label="Search cards"
      className="press grid h-7 w-7 place-items-center rounded-lg text-ink-2 hover:bg-lane hover:text-ink">
      <Icon name="search" size={14} />
    </button>
  );
  return (
    <div className="pointer-events-auto relative">
      <div className="flex h-7 w-56 items-center gap-1.5 rounded-lg bg-lane px-2">
        <Icon name="search" size={13} className="text-ink-3" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a card…" aria-label="Find a card"
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setQ(""); onOpen(false); } if (e.key === "Enter" && hits[0]) { onPick(hits[0].lessonId, hits[0].m.id); setQ(""); } }}
          onBlur={() => setTimeout(() => { if (!q) onOpen(false); }, 150)}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" />
        <button onClick={() => { setQ(""); onOpen(false); }} aria-label="Close search" className="text-ink-3 hover:text-ink"><Icon name="x" size={11} /></button>
      </div>
      {words.length > 0 && (
        <div className="pop absolute bottom-10 left-0 w-80 rounded-2xl border border-line bg-white p-1.5 shadow-[0_24px_60px_-20px_rgba(20,20,18,0.45)]">
          {hits.length ? hits.map((h) => (
            <button key={h.m.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(h.lessonId, h.m.id); setQ(""); }}
              className="press flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-lane">
              <span className="mt-1 h-3 w-2 flex-none rounded-[3px]" style={{ background: suitOfCard(h.m).tint }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">{h.m.title || "Untitled card"}</span>
                <span className="block truncate text-[11.5px] text-ink-3">{lessonTitle(h.lessonId)}{h.snip ? ` · ${h.snip}` : ""}</span>
              </span>
            </button>
          )) : <p className="px-2 py-1.5 text-[12.5px] text-ink-3">No card has “{q.trim()}”.</p>}
        </div>
      )}
    </div>
  );
}

/** Who a some-students card goes to, in a few words: "2 groups and 1 student". */
function someOf(m: Module) {
  const g = groupsOf(m.audience).length, n = studentsOf(m.audience).length;
  const parts = [g ? `${g} group${g === 1 ? "" : "s"}` : "", n || !g ? `${n} student${n === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(" and ");
}

/**
 * A card group's cards, fanned out of the top of its sleeve like a hand of cards: a wider fan for more cards (up to
 * seven shown). They rise out of the sleeve when it's made, and spread a little more on hover. Each card can be
 * clicked (it opens in the panel), dragged along the fan to put it somewhere else in the group, or held: the fan's
 * own cards wiggle and each gets a delete button (holding a card on the map wiggles the map's cards, not these).
 */
function Fan({ members, x, y, open, faded, adding, bad, act }: {
  members: Module[]; x: number; y: number; open: boolean; faded: boolean; adding?: Module; bad?: boolean;
  /** What a teacher can do with the fan's cards (none while zoomed out, read only, or a card is being dragged). */
  act?: {
    toCanvas: (cx: number, cy: number) => { x: number; y: number };
    onOpen: (id: string) => void;
    onReorder: (ids: string[]) => void;
    onDelete?: (m: Module) => void;
    onHot: (on: boolean) => void;
  };
}) {
  // A card being dragged along the fan: which, and the place it would go.
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null);
  // Held: this fan's cards wiggle, each with a delete button, until a press anywhere else.
  const [jiggle, setJiggle] = useState(false);
  const fanRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!jiggle) return;
    const off = (e: PointerEvent) => { if (!(e.target as HTMLElement | null)?.closest("[data-fan-delete]")) setJiggle(false); };
    window.addEventListener("pointerdown", off, true);
    const els = [...(fanRef.current?.querySelectorAll<HTMLElement>("[data-fan-face]") ?? [])];
    const runs = reducedMotion() ? [] : els.map((el, i) => el.animate([{ rotate: "-2deg" }, { rotate: "2deg" }], { duration: 240, iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: -(i % 4) * 60 }));
    return () => { window.removeEventListener("pointerdown", off, true); runs.forEach((a) => a.cancel()); };
  }, [jiggle, members.length]);
  const order = (() => {
    const list = members.slice(0, 7);
    if (!drag) return list;
    const rest = list.filter((c) => c.id !== drag.id);
    rest.splice(drag.to, 0, list.find((c) => c.id === drag.id)!);
    return rest;
  })();
  // A card held over the sleeve joins the fan at its end; the group's own cards go see-through so it stands out.
  const shown = adding ? [...members.slice(0, 6), adding] : order;
  const n = shown.length;
  const spread = Math.min(9 * (n - 1), 42);
  const angle = (i: number) => (n === 1 ? 0 : -spread / 2 + (i * spread) / (n - 1));
  /** Press a card: a click opens it, a drag moves it along the fan, holding still shows the delete buttons. */
  function press(e: React.PointerEvent, id: string) {
    if (!act || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-fan-delete]")) return;
    e.stopPropagation();
    const list = members.slice(0, 7);
    const from = list.findIndex((c) => c.id === id);
    const start = { x: e.clientX, y: e.clientY };
    let moved = false, held = false, to = from;
    const hold = act.onDelete ? window.setTimeout(() => { held = true; setJiggle(true); navigator.vibrate?.(10); }, 520) : 0;
    // The cards turn about a point well below the fan (2.3 card heights under their tops), so the pointer's side
    // of the fan says which place it's over.
    const R = 128 * 2.3 * (open ? 1.3 : 1);
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      clearTimeout(hold);
      moved = true;
      const p = act.toCanvas(ev.clientX, ev.clientY);
      const a = (Math.asin(Math.max(-1, Math.min(1, (p.x - (x + W / 2)) / R))) * 180) / Math.PI;
      let best = 0, gap = Infinity;
      for (let k = 0; k < list.length; k++) { const g = Math.abs(angle(k) - a); if (g < gap) { gap = g; best = k; } }
      to = best;
      setDrag({ id, to });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      clearTimeout(hold);
      setDrag(null);
      if (ev.type !== "pointerup") return;
      if (moved) {
        if (to !== from) {
          const ids = members.map((c) => c.id).filter((x) => x !== id);
          ids.splice(to, 0, id);
          act.onReorder(ids);
        }
        return;
      }
      if (!held) act.onOpen(id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  const live = !!act && !adding && !faded;
  return (
    <span ref={fanRef} className={`absolute z-0 transition-opacity ${live ? "" : "pointer-events-none"} ${open || drag ? "fan-open" : ""} ${faded ? "opacity-35" : ""}`} style={{ left: x, top: y - FAN + 4, width: W, height: FAN + 70 }}
      onPointerEnter={() => act?.onHot(true)} onPointerLeave={() => act?.onHot(false)}>
      {shown.map((c, i) => {
        const a = angle(i);
        const suit = suitOfCard(c);
        const dragged = drag?.id === c.id;
        return (
          <span key={c.id} role={live ? "button" : undefined} aria-label={live ? `Open ${c.title || "this card"} (drag to move it in the group)` : undefined} aria-hidden={live ? undefined : true}
            data-fan-card={live ? c.id : undefined} onPointerDown={live ? (e) => press(e, c.id) : undefined}
            className={`fan-card absolute left-1/2 top-0 block rounded-[10px] border bg-white transition-opacity duration-200 ${live ? "cursor-pointer touch-none" : ""} ${dragged ? "!border-[#4b56a8] ring-2 ring-[#4b56a8]/25" : ""} ${adding ? (c === adding ? `${bad ? "!border-bad" : "!border-[#4b56a8] ring-2 ring-[#4b56a8]/25"}` : "opacity-30") : ""} ${c.type === "group" ? "border-[#c9cdee] shadow-[3px_-3px_0_-1px_#fff,3px_-3px_0_0_#d9dcf1,6px_-6px_0_-1px_#fff,6px_-6px_0_0_#e3e5f5,0_6px_14px_-8px_rgba(20,20,18,0.45)]" : "border-line shadow-[0_6px_14px_-8px_rgba(20,20,18,0.45)]"}`}
            style={{ width: 92, height: 128, marginLeft: -46, "--a": `${a}deg`, "--d": `${i * 55}ms`, zIndex: dragged ? 20 : i } as React.CSSProperties}>
            <span data-fan-face className="block overflow-hidden rounded-[9px] bg-white">
              <span className="block h-[4px]" style={{ background: c.type === "group" ? "#4b56a8" : suit.tint }} />
              <span className="block truncate px-2 pt-1 text-[7.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: c.type === "group" ? "#4b56a8" : suit.tint }}>{c.type === "group" ? `Group · ${c.members?.length ?? 0}` : faceMeta(c).name}</span>
              <span className="block truncate px-2 text-[9.5px] font-semibold leading-tight text-ink">{c.title || "Untitled card"}</span>
              <span className="mx-2 mt-1 block h-[46px] overflow-hidden rounded-[6px]">{c.type === "group" ? <span className="block h-full" style={{ background: suit.cover }} /> : <KindArt m={c} tint={suit.tint} />}</span>
            </span>
            {live && jiggle && act.onDelete && (
              <button type="button" data-fan-delete onClick={(e) => { e.stopPropagation(); act.onDelete!(c); }} onPointerDown={(e) => e.stopPropagation()} aria-label={`Delete ${c.title || "this card"}`}
                className="pop absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#6f6f6c] text-white shadow-md hover:bg-bad">
                <span className="block h-[2px] w-2.5 rounded-full bg-white" />
              </button>
            )}
          </span>
        );
      })}
      {!adding && members.length > n && <span className="pointer-events-none absolute -top-2 right-6 rounded-full bg-ink px-1.5 text-[10px] font-semibold text-white">+{members.length - n}</span>}
    </span>
  );
}
