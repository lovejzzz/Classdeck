"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bandLabel, bandsOf, branchBelow, canBranch, DEFAULT_BANDS, SCORE, SHARED_ONLY, wiresOf, type Wire } from "@/lib/branching";
import { uid } from "@/lib/profile";
import { SUITS, suitOf, suitOfCard, TYPE_META } from "@/lib/ui";
import type { AnswerValue, Lesson, Module, ModuleType, ProgressMap } from "@/lib/types";
import { Icon } from "../Icon";

// Fixed sizes, so ports and wires are placed from numbers, not by measuring the page.
const W = 256;
const HEAD = 72;
const SEC = 28; // a question's (or the score's) title row
const ROW = 30; // one answer or one score band
const PAD = 10;
const COL = 132; // gap between columns
const GAP = 22; // gap between cards in a column
const NEW_TYPES: ModuleType[] = SUITS.flatMap((s) => s.types).filter((t) => !SHARED_ONLY.has(t));
const INK = "#4b56a8";
const SOFT = "#a3a8cf";

const branchQs = (m: Module) => (m.questions ?? []).filter((q) => canBranch(q));
const isQuiz = (m: Module) => m.type === "quiz";
const letter = (i: number) => String.fromCharCode(65 + i);
const picked = (v: AnswerValue | undefined, w: Wire) =>
  w.score ? typeof v === "number" && v >= w.score.min && v < w.score.max : Array.isArray(v) ? (v as number[]).includes(w.option) : v === w.option;

/** The rows on a card, top to bottom: each question with its answers, then the score bands (quiz cards). */
function rowsOf(m: Module, local: boolean, readOnly: boolean) {
  const ports = new Map<string, number>();
  if (!local) return { h: HEAD + 30, ports };
  let y = HEAD;
  for (const q of branchQs(m)) {
    y += SEC;
    q.options.forEach((_, i) => { ports.set(`${q.id}:${i}`, y + ROW / 2); y += ROW; });
  }
  if (isQuiz(m)) {
    y += SEC;
    const bands = bandsOf(m);
    bands.forEach((_, i) => { ports.set(`${SCORE}:${i}`, y + ROW / 2); y += ROW; });
    if (!bands.length && !readOnly) y += ROW;
  }
  if (!branchQs(m).length && !isQuiz(m)) y += 34;
  return { h: y + PAD, ports };
}

interface Node { m: Module; lessonId: string; local: boolean; x: number; y: number; h: number; ports: Map<string, number>; parent?: string }

/**
 * Lay out one lesson's tree, left to right: cards everyone gets (and cards dealt in from an earlier lesson) in the
 * first column, what their answers and scores deal to the right. Cards in later lessons show as end points.
 */
function layout(lesson: Lesson, all: { m: Module; lessonId: string }[], wires: Wire[], readOnly: boolean) {
  const byId = new Map(all.map((x) => [x.m.id, x]));
  const local = new Set(lesson.modules.map((m) => m.id));
  const dealtFromHere = new Set(wires.filter((w) => local.has(w.from)).map((w) => w.to));
  const roots = lesson.modules.filter((m) => !dealtFromHere.has(m.id));
  const kids = new Map<string, string[]>();
  const parent = new Map<string, string>();
  const seen = new Set<string>();
  const walk = (id: string) => {
    seen.add(id);
    const list: string[] = [];
    if (local.has(id))
      for (const w of wires.filter((x) => x.from === id)) {
        if (seen.has(w.to) || list.includes(w.to) || !byId.has(w.to)) continue;
        list.push(w.to);
        parent.set(w.to, id);
        seen.add(w.to);
      }
    kids.set(id, list);
    list.forEach(walk);
  };
  roots.forEach((r) => walk(r.id));
  const loose = lesson.modules.filter((m) => !seen.has(m.id));
  loose.forEach((m) => walk(m.id));

  const size = (id: string) => rowsOf(byId.get(id)!.m, local.has(id), readOnly);
  const span = new Map<string, number>();
  const measure = (id: string): number => {
    const k = kids.get(id) ?? [];
    const below = k.reduce((n, c) => n + measure(c), 0) + Math.max(0, k.length - 1) * GAP;
    const s = Math.max(size(id).h, below);
    span.set(id, s);
    return s;
  };
  const nodes = new Map<string, Node>();
  const place = (id: string, depth: number, top: number) => {
    const { h, ports } = size(id);
    const s = span.get(id)!;
    const k = kids.get(id) ?? [];
    const below = k.reduce((n, c) => n + span.get(c)!, 0) + Math.max(0, k.length - 1) * GAP;
    const x = byId.get(id)!;
    nodes.set(id, { m: x.m, lessonId: x.lessonId, local: local.has(id), x: 40 + depth * (W + COL), y: top + (s - h) / 2, h, ports, parent: parent.get(id) });
    let y = top + (s - below) / 2;
    for (const c of k) { place(c, depth + 1, y); y += span.get(c)! + GAP; }
  };
  let top = 36;
  for (const r of [...roots, ...loose]) { measure(r.id); place(r.id, 0, top); top += span.get(r.id)! + GAP * 1.6; }
  const list = [...nodes.values()];
  return { nodes, width: Math.max(...list.map((n) => n.x + W), 640) + 80, height: Math.max(top, 420) + 40 };
}

/** Positions that glide to their new place when the tree changes (nodes and wires read the same numbers). */
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
type Menu = { port: Port; x: number; y: number; mode: "port" | "new" };

/**
 * A lesson's card tree, drawn as nodes. Each choice question lists its answers with a port on the right, and a quiz
 * can also branch by score. Drag a port onto a card to deal that card, or into empty space for a new one (in this
 * lesson or a later one). Click a card to edit it.
 */
export function CardTree({ lessons, lessonId, progress, students, readOnly, busy, onChange, onAddCard, onEdit, onLesson, onClose }: {
  /** Every lesson in the course, in order (with unsaved edits). */
  lessons: Lesson[];
  lessonId: string;
  progress: ProgressMap; students: { id: string }[]; readOnly?: boolean;
  /** Something is open over the tree (the card editor): leave Escape to it. */
  busy?: boolean;
  onChange: (l: Lesson) => void;
  /** Put a new card in a lesson and save it right away (so a wire from another lesson can point at it). */
  onAddCard: (lessonId: string, card: Module) => Promise<void>;
  onEdit: (lessonId: string, moduleId: string) => void;
  onLesson: (lessonId: string) => void;
  onClose: () => void;
}) {
  const li = lessons.findIndex((l) => l.id === lessonId);
  const lesson = lessons[li];
  const all = useMemo(() => lessons.flatMap((l, i) => l.modules.map((m) => ({ m, lessonId: l.id, at: i }))), [lessons]);
  const wires = useMemo(() => wiresOf(all.map((x) => x.m)), [all]);
  const { nodes, width, height } = useMemo(() => layout(lesson, all, wires, !!readOnly), [lesson, all, wires, readOnly]);
  const lessonOf = (id: string) => lessons.find((l) => l.id === all.find((x) => x.m.id === id)?.lessonId);
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ port: Port; x: number; y: number; over?: string } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuLesson, setMenuLesson] = useState(lessonId);
  const [hot, setHot] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  // Where a just-made card starts its glide from (next to the port it came from).
  const [born] = useState(() => new Map<string, { x: number; y: number }>());

  const targets = useMemo(() => new Map([...nodes].map(([id, n]) => [id, { x: n.x, y: n.y }])), [nodes]);
  const pos = useGlide(targets, (id) => born.get(id) ?? (nodes.get(id)?.parent ? targets.get(nodes.get(id)!.parent!) : undefined));
  const at = (id: string) => pos.get(id) ?? targets.get(id)!;

  // How many students each answer or score band sent down its wire.
  const took = (w: Wire) => students.filter((s) => picked(progress[s.id]?.[w.from]?.dealt?.[w.q], w)).length;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy || document.querySelector("[data-confirm]")) return;
      if (menu) setMenu(null);
      else onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [menu, onClose, busy]);

  const fit = () => {
    const el = scroller.current;
    if (!el) return;
    setZoom(Math.max(0.45, Math.min(1, (el.clientWidth - 24) / width, (el.clientHeight - 24) / height)));
  };
  // Fit when it opens and when switching lessons.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(fit, [lessonId]);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 1600);
    return () => clearTimeout(t);
  }, [fresh]);

  const toCanvas = (cx: number, cy: number) => {
    const r = scroller.current!.getBoundingClientRect();
    return { x: (cx - r.left + scroller.current!.scrollLeft) / zoom, y: (cy - r.top + scroller.current!.scrollTop) / zoom };
  };
  const portPos = (port: Port) => {
    const n = nodes.get(port.from)!, p = at(port.from);
    return { x: p.x + W, y: p.y + (n.ports.get(`${port.q}:${port.option}`) ?? HEAD / 2) };
  };
  const inPos = (id: string) => { const p = at(id); return { x: p.x, y: p.y + HEAD / 2 }; };

  /** Cards a port may deal: in this lesson or a later one, not the card itself, not class-wide, and no loops. */
  function targetsFor(port: Port) {
    const above = new Set<string>([port.from]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const w of wires) if (above.has(w.to) && !above.has(w.from)) { above.add(w.from); grew = true; }
    }
    return all.filter((x) => x.at >= li && !above.has(x.m.id) && !SHARED_ONLY.has(x.m.type));
  }
  const canTarget = (port: Port, id: string) => targetsFor(port).some((x) => x.m.id === id);

  /** The lesson with one port pointed at `to`. */
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
  const wire = (port: Port, to: string | null) => onChange(withWire(lesson, port, to));
  const setBands = (m: Module, bands: { min: number; next: string | null }[] | undefined) =>
    onChange({ ...lesson, modules: lesson.modules.map((x) => (x.id === m.id ? { ...x, bands } : x)) });

  async function newCard(port: Port, type: ModuleType, into: string) {
    const src = lesson.modules.find((m) => m.id === port.from)!;
    const what = port.q === SCORE ? `Score ${bandLabel(bandsOf(src)[port.option])}` : src.questions?.find((x) => x.id === port.q)?.options[port.option]?.trim();
    const card: Module = {
      id: uid("m-"), type, suit: suitOf(type).id, title: what ? `If “${what.slice(0, 40)}”` : `New ${TYPE_META[type].name} card`,
      body: "", audience: { kind: "all" }, tools: [], attachments: [],
      questions: type === "quiz" ? [{ id: uid("q-"), text: "", options: ["", ""], answer: 0 }] : undefined,
    };
    const p = portPos(port);
    born.set(card.id, { x: p.x + 40, y: p.y - HEAD / 2 });
    setMenu(null);
    if (into === lessonId) {
      // Put it after the card that deals it and that card's other follow-ups, so the deck reads in order.
      const below = new Set(branchBelow(lesson, port.from));
      let i = lesson.modules.findIndex((m) => m.id === port.from);
      while (i + 1 < lesson.modules.length && below.has(lesson.modules[i + 1].id)) i++;
      const modules = [...lesson.modules];
      modules.splice(i + 1, 0, card);
      onChange(withWire({ ...lesson, modules }, port, card.id));
    } else {
      // The card goes in the other lesson first (saved), then the wire that points at it.
      await onAddCard(into, card);
      onChange(withWire(lesson, port, card.id));
    }
    setFresh(card.id);
    onEdit(into, card.id);
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
      setMenuLesson(lessonId);
      if (!moved) return setMenu({ port, ...portPos(port), mode: "port" });
      const over = overAt(ev);
      if (over) { if (canTarget(port, over)) wire(port, over); return; }
      if (ev.type === "pointerup") { const p = toCanvas(ev.clientX, ev.clientY); setMenu({ port, x: p.x, y: p.y, mode: "new" }); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(48, (b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };

  const localWires = wires.filter((w) => nodes.get(w.from)?.local && nodes.has(w.to));
  const anyPorts = lesson.modules.some((m) => branchQs(m).length || isQuiz(m));
  const later = lessons.slice(li, li + 4);
  const snap = drag?.over && canTarget(drag.port, drag.over) ? inPos(drag.over) : null;

  return createPortal(
    <div className="fade fixed inset-0 z-[35] flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label={`Card tree for ${lesson.title}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white/85 px-4 py-3 backdrop-blur">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef0fb] text-[#4b56a8]"><Icon name="split" size={17} /></span>
        <div className="flex min-w-0 items-center gap-1">
          <button onClick={() => li > 0 && onLesson(lessons[li - 1].id)} disabled={li === 0} className="btn btn-quiet press h-8 w-8 justify-center px-0 text-[18px] disabled:opacity-30" aria-label="Previous lesson">‹</button>
          <div className="min-w-0">
            <h2 key={lessonId} className="rise truncate text-[15px] font-semibold tracking-tight">Card tree · {lesson.title}</h2>
            <p className="hidden truncate text-[12px] text-ink-3 sm:block">
              {readOnly ? "How answers and scores deal cards." : "Drag from an answer or a score onto a card, or into empty space for a new one, here or in a later lesson."}
            </p>
          </div>
          <button onClick={() => li < lessons.length - 1 && onLesson(lessons[li + 1].id)} disabled={li >= lessons.length - 1} className="btn btn-quiet press h-8 w-8 justify-center px-0 text-[18px] disabled:opacity-30" aria-label="Next lesson">›</button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 rounded-xl border border-line bg-white p-0.5">
          <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom out">−</button>
          <button onClick={fit} className="mono h-7 w-12 rounded-lg text-center hover:bg-lane" title="Fit the tree">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom in">+</button>
        </div>
        <button onClick={onClose} className="btn btn-dark press h-8 px-3 text-[13px]">Done</button>
      </header>

      {!anyPorts && (
        <div className="rise mx-4 mt-3 rounded-xl border border-line bg-white px-4 py-3 text-[13px] text-ink-2">
          Give a card a question with choices, or make it a quiz. Each answer (and each score range on a quiz) gets a port here, and you can deal a different card for each one.
        </div>
      )}

      <div
        ref={scroller}
        className="tree-canvas relative min-h-0 flex-1 overflow-auto"
        style={{ backgroundSize: `${22 * zoom}px ${22 * zoom}px` }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvas) return;
          setMenu(null);
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
          setZoom((z) => Math.min(1.4, Math.max(0.4, +(z - e.deltaY * 0.002).toFixed(2))));
        }}
      >
        <div data-canvas="1" style={{ width: width * zoom, height: height * zoom }} className="relative">
          <div key={lessonId} data-canvas="1" className="tree-zoom absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${zoom})` }}>
            <svg width={width} height={height} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
              <defs>
                <marker id="tree-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={INK} /></marker>
              </defs>
              {localWires.map((w) => {
                const d = curve(portPos(w), inPos(w.to));
                const on = hot === w.from || hot === w.to;
                const n = took(w);
                return (
                  <g key={`${w.from}-${w.q}-${w.option}-${w.to}`}>
                    <path d={d} fill="none" stroke={on ? INK : SOFT} strokeWidth={on ? 2.6 : 2} pathLength={1} className="tree-wire" />
                    {n > 0 && <path d={d} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" className="tree-flow" />}
                  </g>
                );
              })}
              {drag && <path d={curve(portPos(drag.port), snap ?? drag)} fill="none" stroke={INK} strokeWidth={2.2} strokeDasharray={snap ? undefined : "6 6"} markerEnd="url(#tree-arrow)" className={snap ? "" : "tree-dash"} />}
              {menu?.mode === "new" && <path d={curve(portPos(menu.port), menu)} fill="none" stroke={INK} strokeWidth={2.2} strokeDasharray="6 6" markerEnd="url(#tree-arrow)" className="tree-dash" />}
            </svg>

            {localWires.map((w) => {
              const n = took(w);
              if (!n) return null;
              const a = portPos(w);
              return (
                <span key={`n-${w.from}-${w.q}-${w.option}`} className="chip pop absolute h-5 -translate-y-1/2 bg-[#4b56a8] px-1.5 text-[10.5px] text-white shadow-[0_4px_10px_-4px_rgba(75,86,168,0.8)]" style={{ left: a.x + 16, top: a.y - 13 }}
                  title={`${n} student${n === 1 ? "" : "s"} went this way`}>
                  {n}
                </span>
              );
            })}

            {[...nodes.values()].map((nd, i) => {
              const { m, local } = nd;
              const p = at(m.id);
              const suit = suitOfCard(m);
              const qs = local ? branchQs(m) : [];
              const inbound = wires.filter((w) => w.to === m.id);
              const fromElsewhere = inbound.length > 0 && !inbound.some((w) => lesson.modules.some((x) => x.id === w.from));
              const targetable = drag ? canTarget(drag.port, m.id) : false;
              const nodeLesson = lessons.find((l) => l.id === nd.lessonId);
              const bands = local && isQuiz(m) ? bandsOf(m) : [];
              return (
                <div
                  key={m.id}
                  data-node={m.id}
                  onPointerEnter={() => setHot(m.id)}
                  onPointerLeave={() => setHot((h) => (h === m.id ? null : h))}
                  className={`tree-node absolute rounded-[18px] border bg-white ${fresh === m.id ? "tree-fresh" : ""} ${drag?.over === m.id && targetable ? "tree-target border-[#4b56a8]" : drag && !targetable && m.id !== drag.port.from ? "border-line opacity-45" : "border-line"} ${local ? "" : "border-dashed"}`}
                  style={{ left: p.x, top: p.y, width: W, animationDelay: `${Math.min(i, 12) * 35}ms` }}
                >
                  {inbound.length > 0 && <span className={`absolute -left-[5px] top-[31px] h-2.5 w-2.5 rounded-full border-2 border-white ${local ? "bg-[#4b56a8]" : "bg-[#a3a8cf]"}`} />}
                  <button onClick={() => onEdit(nd.lessonId, m.id)} className="tree-head block w-full rounded-t-[18px] text-left" style={{ height: HEAD }} aria-label={`Edit ${m.title}`}>
                    <span className="block h-1.5 rounded-t-[18px]" style={{ background: suit.tint }} />
                    <span className="flex items-center gap-1.5 px-3.5 pt-2 text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: suit.tint }}>
                      {TYPE_META[m.type].label}
                      <span className="truncate normal-case tracking-normal text-ink-3">
                        · {!local ? nodeLesson?.title : fromElsewhere ? `dealt in ${lessonOf(inbound[0].from)?.title ?? "another lesson"}` : inbound.length ? "dealt by an answer" : "everyone"}
                      </span>
                    </span>
                    <span className="block truncate px-3.5 pt-1 text-[14px] font-semibold leading-snug text-ink">{m.title || "Untitled card"}</span>
                  </button>
                  {!local ? (
                    <button onClick={() => onLesson(nd.lessonId)} className="flex h-[30px] w-full items-center gap-1.5 border-t border-dashed border-line px-3.5 text-[11.5px] text-ink-3 hover:text-ink">
                      <Icon name="split" size={11} /> Open {nodeLesson?.title}’s tree
                    </button>
                  ) : (
                    <div className="border-t border-line pb-[10px]">
                      {qs.map((q) => (
                        <div key={q.id}>
                          <div className="truncate px-3.5 text-[11.5px] leading-[28px] text-ink-3" style={{ height: SEC }}>{q.text.trim() || "Question"}</div>
                          {q.options.map((o, oi) => {
                            const to = q.next?.[oi];
                            return (
                              <div key={oi} className="relative flex items-center gap-2 px-3.5" style={{ height: ROW }}>
                                <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[10.5px] font-semibold transition-colors ${to ? "bg-[#4b56a8] text-white" : "bg-lane text-ink-3"}`}>{letter(oi)}</span>
                                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{o.trim() || `Option ${oi + 1}`}</span>
                                <PortDot wired={!!to} readOnly={readOnly} label={to ? `Answer ${letter(oi)} deals a card. Change it` : `Deal a card for answer ${letter(oi)}`} onPointerDown={(e) => startDrag(e, { from: m.id, q: q.id, option: oi })} />
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {local && isQuiz(m) && (
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
                      {!qs.length && !isQuiz(m) && (
                        <div className="px-3.5 text-[11.5px] leading-[34px] text-ink-3">
                          {readOnly ? "No questions" : <button onClick={() => onEdit(nd.lessonId, m.id)} className="hover:text-ink">Add a question to branch from here</button>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {menu && (() => {
              const src = lesson.modules.find((m) => m.id === menu.port.from);
              const isScore = menu.port.q === SCORE;
              const band = isScore && src ? bandsOf(src)[menu.port.option] : undefined;
              const q = !isScore ? src?.questions?.find((x) => x.id === menu.port.q) : undefined;
              const to = isScore ? band?.next : q?.next?.[menu.port.option];
              const others = targetsFor(menu.port).filter((x) => x.m.id !== to);
              const groups = lessons.map((l) => ({ l, cards: others.filter((x) => x.lessonId === l.id) })).filter((g) => g.cards.length);
              return (
                <div className="pop absolute z-20 w-72 rounded-2xl border border-line bg-white p-2 shadow-[0_24px_60px_-20px_rgba(20,20,18,0.45)]" style={{ left: menu.x + 14, top: Math.max(8, menu.y - 24) }} onPointerDown={(e) => e.stopPropagation()}>
                  <div className="px-2 pb-1.5 pt-0.5 text-[12px] font-medium text-ink">
                    {isScore ? `Score ${band ? bandLabel(band) : ""}` : `Answer ${letter(menu.port.option)}${q?.options[menu.port.option]?.trim() ? ` · “${q.options[menu.port.option].trim()}”` : ""}`}
                  </div>
                  <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">New card in</div>
                  <div className="mb-1.5 flex flex-wrap gap-1 px-1">
                    {later.map((l) => (
                      <button key={l.id} onClick={() => setMenuLesson(l.id)} aria-pressed={menuLesson === l.id}
                        className={`press h-6 rounded-full px-2.5 text-[11.5px] transition-colors ${menuLesson === l.id ? "bg-ink text-white" : "bg-lane text-ink-2 hover:bg-line"}`}>
                        {l.id === lessonId ? "This lesson" : l.title}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-0.5">
                    {NEW_TYPES.map((t) => (
                      <button key={t} onClick={() => newCard(menu.port, t, menuLesson)} className="press flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-lane">
                        <span className="h-3 w-2 flex-none rounded-[3px]" style={{ background: suitOf(t).tint }} />{TYPE_META[t].name}
                      </button>
                    ))}
                  </div>
                  {menu.mode === "port" && groups.length > 0 && (
                    <>
                      <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">Deal a card already made</div>
                      <div className="max-h-44 overflow-auto">
                        {groups.map((g) => (
                          <div key={g.l.id}>
                            {g.l.id !== lessonId && <div className="px-2 pt-1 text-[11px] text-ink-3">{g.l.title}</div>}
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
      </div>
      {!localWires.length && anyPorts && !readOnly && !drag && !menu && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
          <span className="rise rounded-full bg-ink px-4 py-2 text-[13px] text-white shadow-lg">Drag a ○ to the right to deal a card for that answer</span>
        </div>
      )}
    </div>,
    document.body,
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
