"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { branchBelow, canBranch, SHARED_ONLY, wiresOf, type Wire } from "@/lib/branching";
import { uid } from "@/lib/profile";
import { SUITS, suitOf, suitOfCard, TYPE_META } from "@/lib/ui";
import type { AnswerValue, Lesson, Module, ModuleType, ProgressMap } from "@/lib/types";
import { Icon } from "../Icon";

// Fixed sizes, so ports and wires can be placed without measuring the page.
const W = 248;
const HEAD = 70;
const Q_ROW = 28;
const OPT_ROW = 30;
const PAD = 10;
const COL = 120; // gap between columns
const GAP = 22; // gap between cards in a column
const NEW_TYPES: ModuleType[] = SUITS.flatMap((s) => s.types).filter((t) => !SHARED_ONLY.has(t));

const branchQs = (m: Module) => (m.questions ?? []).filter((q) => canBranch(q));
const nodeH = (m: Module) => {
  const qs = branchQs(m);
  return HEAD + (qs.length ? qs.reduce((n, q) => n + Q_ROW + q.options.length * OPT_ROW, 0) + PAD : 34);
};
const letter = (i: number) => String.fromCharCode(65 + i);
const picked = (v: AnswerValue | undefined, i: number) => (Array.isArray(v) ? (v as number[]).includes(i) : v === i);

interface Placed { m: Module; x: number; y: number; h: number; depth: number }

/** Lay the lesson out as a tree, left to right: cards everyone gets in the first column, what they deal to the right. */
function layout(lesson: Lesson) {
  const wires = wiresOf(lesson);
  const byId = new Map(lesson.modules.map((m) => [m.id, m]));
  const dealt = new Set(wires.map((w) => w.to));
  const roots = lesson.modules.filter((m) => !dealt.has(m.id));
  const owner = new Map<string, string>(); // child → the card it's drawn under
  const kids = new Map<string, string[]>();
  const seen = new Set<string>();
  const walk = (id: string) => {
    seen.add(id);
    const list: string[] = [];
    for (const w of wires.filter((x) => x.from === id)) {
      if (seen.has(w.to) || list.includes(w.to)) continue;
      owner.set(w.to, id);
      list.push(w.to);
      seen.add(w.to);
    }
    kids.set(id, list);
    list.forEach(walk);
  };
  roots.forEach((r) => walk(r.id));
  // Anything left (a loop that slipped in) goes in the first column so it can still be reached.
  const loose = lesson.modules.filter((m) => !seen.has(m.id));
  loose.forEach((m) => walk(m.id));

  const span = new Map<string, number>();
  const measure = (id: string): number => {
    const own = nodeH(byId.get(id)!);
    const k = kids.get(id) ?? [];
    const below = k.reduce((n, c) => n + measure(c), 0) + Math.max(0, k.length - 1) * GAP;
    const s = Math.max(own, below);
    span.set(id, s);
    return s;
  };
  const placed = new Map<string, Placed>();
  const place = (id: string, depth: number, top: number) => {
    const m = byId.get(id)!;
    const h = nodeH(m), s = span.get(id)!;
    const k = kids.get(id) ?? [];
    const below = k.reduce((n, c) => n + span.get(c)!, 0) + Math.max(0, k.length - 1) * GAP;
    placed.set(id, { m, x: 32 + depth * (W + COL), y: top + (s - h) / 2, h, depth });
    let y = top + (s - below) / 2;
    for (const c of k) {
      place(c, depth + 1, y);
      y += span.get(c)! + GAP;
    }
  };
  let top = 32;
  for (const r of [...roots, ...loose]) {
    measure(r.id);
    place(r.id, 0, top);
    top += span.get(r.id)! + GAP * 1.6;
  }
  const nodes = [...placed.values()];
  const width = Math.max(...nodes.map((n) => n.x + W), 600) + 64;
  const height = Math.max(top, 400) + 32;
  return { nodes, placed, wires, width, height, owner };
}

/** Where an answer's port sits on its card, relative to the card's top. */
function portY(m: Module, qid: string, option: number) {
  let y = HEAD;
  for (const q of branchQs(m)) {
    if (q.id === qid) return y + Q_ROW + option * OPT_ROW + OPT_ROW / 2;
    y += Q_ROW + q.options.length * OPT_ROW;
  }
  return HEAD / 2;
}

type Port = { from: string; q: string; option: number };
type Menu = { port: Port; x: number; y: number; mode: "port" | "new" };

/**
 * The lesson's card tree, drawn as nodes. Each choice question lists its answers with a port on the right; drag a port
 * onto a card to deal that card to students who pick the answer, or into empty space for a new card. Click a card to
 * edit it.
 */
export function CardTree({ lesson, progress, students, readOnly, busy, onChange, onEdit, onClose }: {
  lesson: Lesson; progress: ProgressMap; students: { id: string }[]; readOnly?: boolean;
  /** Something is open over the tree (the card editor): leave Escape to it. */
  busy?: boolean;
  onChange: (l: Lesson) => void; onEdit: (moduleId: string) => void; onClose: () => void;
}) {
  const { nodes, placed, wires, width, height } = useMemo(() => layout(lesson), [lesson]);
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ port: Port; x: number; y: number; over?: string } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [hot, setHot] = useState<string | null>(null);

  // How many students each answer sent down its wire.
  const took = (w: Pick<Wire, "from" | "q" | "option">) => students.filter((s) => picked(progress[s.id]?.[w.from]?.dealt?.[w.q], w.option)).length;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy || document.querySelector("[data-confirm]")) return;
      if (menu) setMenu(null);
      else onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [menu, onClose, busy]);

  // Fit the tree to the window when it opens.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    setZoom(Math.max(0.5, Math.min(1, (el.clientWidth - 16) / width, 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toCanvas = (cx: number, cy: number) => {
    const r = scroller.current!.getBoundingClientRect();
    return { x: (cx - r.left + scroller.current!.scrollLeft) / zoom, y: (cy - r.top + scroller.current!.scrollTop) / zoom };
  };

  /** Cards an answer may deal: not the card itself, not class-wide activities, and nothing that would make a loop. */
  function targetsFor(port: Port) {
    const above = new Set<string>([port.from]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const w of wires) if (above.has(w.to) && !above.has(w.from)) { above.add(w.from); grew = true; }
    }
    return lesson.modules.filter((m) => !above.has(m.id) && !SHARED_ONLY.has(m.type));
  }

  function wire(port: Port, to: string | null, modules = lesson.modules) {
    onChange({
      ...lesson,
      modules: modules.map((m) => m.id !== port.from ? m : {
        ...m,
        questions: m.questions?.map((q) => {
          if (q.id !== port.q) return q;
          const next = [...(q.next ?? [])];
          while (next.length < q.options.length) next.push(null);
          next[port.option] = to;
          return { ...q, next: next.some(Boolean) ? next : undefined };
        }),
      }),
    });
  }

  function newCard(port: Port, type: ModuleType) {
    const src = lesson.modules.find((m) => m.id === port.from)!;
    const q = src.questions?.find((x) => x.id === port.q);
    const opt = q?.options[port.option]?.trim();
    const card: Module = {
      id: uid("m-"), type, suit: suitOf(type).id, title: opt ? `If “${opt.slice(0, 40)}”` : `New ${TYPE_META[type].name} card`,
      body: "", audience: { kind: "all" }, tools: [], attachments: [],
      questions: type === "quiz" ? [{ id: uid("q-"), text: "", options: ["", ""], answer: 0 }] : undefined,
    };
    // Put it after the card that deals it and that card's other follow-ups, so the deck reads in order.
    const below = new Set(branchBelow(lesson, port.from));
    let at = lesson.modules.findIndex((m) => m.id === port.from);
    while (at + 1 < lesson.modules.length && below.has(lesson.modules[at + 1].id)) at++;
    const modules = [...lesson.modules];
    modules.splice(at + 1, 0, card);
    wire(port, card.id, modules);
    setMenu(null);
    onEdit(card.id);
  }

  function startDrag(e: React.PointerEvent, port: Port) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      moved = true;
      const p = toCanvas(ev.clientX, ev.clientY);
      const over = (document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-node]") as HTMLElement | null)?.dataset.node;
      setDrag({ port, x: p.x, y: p.y, over });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
      const p = toCanvas(ev.clientX, ev.clientY);
      if (!moved) return setMenu({ port, ...portPos(port), mode: "port" });
      const over = (document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-node]") as HTMLElement | null)?.dataset.node;
      if (over) {
        if (targetsFor(port).some((m) => m.id === over)) wire(port, over);
        return;
      }
      if (ev.type === "pointerup") setMenu({ port, x: p.x, y: p.y, mode: "new" });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  const portPos = (port: Port) => {
    const n = placed.get(port.from)!;
    return { x: n.x + W, y: n.y + portY(n.m, port.q, port.option) };
  };

  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(40, (b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };

  const branching = wires.length > 0;
  const anyQs = lesson.modules.some((m) => branchQs(m).length);

  return createPortal(
    <div className="fade fixed inset-0 z-[35] flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label={`Card tree for ${lesson.title}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white/80 px-4 py-3 backdrop-blur">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef0fb] text-[#4b56a8]"><Icon name="split" size={16} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold tracking-tight">Card tree · {lesson.title}</h2>
          <p className="truncate text-[12.5px] text-ink-3">
            {readOnly ? "How answers deal cards in this lesson." : "Drag from an answer onto a card, or into empty space for a new one. Students only get the cards their answers deal."}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-white p-0.5">
          <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom out">−</button>
          <span className="mono w-11 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom in">+</button>
        </div>
        <button onClick={onClose} className="btn btn-dark press h-8 px-3 text-[13px]">Done</button>
      </header>

      {!anyQs && (
        <div className="mx-4 mt-3 rounded-xl border border-line bg-white px-4 py-3 text-[13px] text-ink-2">
          Give a card a question with choices (in What comes back → Questions). Each answer gets a port here, and you can deal a different card for each one.
        </div>
      )}

      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-auto"
        style={{ backgroundImage: "radial-gradient(rgba(27,27,26,0.09) 1px, transparent 1px)", backgroundSize: `${22 * zoom}px ${22 * zoom}px` }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvas) return;
          setMenu(null);
          // Drag the background to move around.
          const el = scroller.current!;
          const s = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
          const move = (ev: PointerEvent) => { el.scrollLeft = s.l - (ev.clientX - s.x); el.scrollTop = s.t - (ev.clientY - s.y); };
          const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
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
          <div data-canvas="1" className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${zoom})` }}>
            <svg width={width} height={height} className="pointer-events-none absolute inset-0" aria-hidden="true">
              {wires.map((w) => {
                const a = portPos(w), t = placed.get(w.to);
                if (!t) return null;
                const b = { x: t.x, y: t.y + HEAD / 2 };
                const on = hot === w.from || hot === w.to;
                return <path key={`${w.from}-${w.q}-${w.option}`} d={curve(a, b)} fill="none" stroke={on ? "#4b56a8" : "#9aa0c8"} strokeWidth={on ? 2.5 : 1.8} />;
              })}
              {drag && <path d={curve(portPos(drag.port), drag)} fill="none" stroke="#4b56a8" strokeWidth={2} strokeDasharray="5 5" />}
              {menu?.mode === "new" && <path d={curve(portPos(menu.port), menu)} fill="none" stroke="#4b56a8" strokeWidth={2} strokeDasharray="5 5" />}
            </svg>

            {wires.map((w) => {
              const n = took(w);
              if (!n || !placed.get(w.to)) return null;
              const a = portPos(w);
              return (
                <span key={`n-${w.from}-${w.q}-${w.option}`} className="chip absolute h-5 -translate-y-1/2 bg-[#4b56a8] px-1.5 text-[10.5px] text-white" style={{ left: a.x + 16, top: a.y - 12 }}
                  title={`${n} student${n === 1 ? "" : "s"} got this card from that answer`}>
                  {n}
                </span>
              );
            })}

            {nodes.map(({ m, x, y }) => {
              const suit = suitOfCard(m);
              const qs = branchQs(m);
              const targetable = drag ? targetsFor(drag.port).some((c) => c.id === m.id) : false;
              const dealtBy = wires.filter((w) => w.to === m.id);
              return (
                <div
                  key={m.id}
                  data-node={m.id}
                  onPointerEnter={() => setHot(m.id)}
                  onPointerLeave={() => setHot((h) => (h === m.id ? null : h))}
                  className={`absolute rounded-2xl border bg-white shadow-[0_10px_30px_-18px_rgba(20,20,18,0.45)] transition-[box-shadow,border-color] ${drag?.over === m.id && targetable ? "border-[#4b56a8] ring-4 ring-[#4b56a8]/15" : drag && !targetable && m.id !== drag.port.from ? "border-line opacity-60" : "border-line"}`}
                  style={{ left: x, top: y, width: W }}
                >
                  <button onClick={() => onEdit(m.id)} className="press block w-full rounded-t-2xl text-left" style={{ height: HEAD }} aria-label={`Edit ${m.title}`}>
                    <span className="block h-1.5 rounded-t-2xl" style={{ background: suit.tint }} />
                    <span className="flex items-center gap-1.5 px-3 pt-2 text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: suit.tint }}>
                      {TYPE_META[m.type].label}
                      {dealtBy.length > 0 && <span className="normal-case tracking-normal text-ink-3">· dealt by an answer</span>}
                      {!dealtBy.length && <span className="normal-case tracking-normal text-ink-3">· everyone</span>}
                    </span>
                    <span className="block truncate px-3 pt-1 text-[14px] font-semibold leading-snug text-ink">{m.title || "Untitled card"}</span>
                  </button>
                  {qs.length ? (
                    <div className="border-t border-line pb-[10px]">
                      {qs.map((q) => (
                        <div key={q.id}>
                          <div className="truncate px-3 text-[11.5px] leading-[28px] text-ink-3" style={{ height: Q_ROW }}>{q.text.trim() || "Question"}</div>
                          {q.options.map((o, i) => {
                            const to = q.next?.[i];
                            const port = { from: m.id, q: q.id, option: i };
                            return (
                              <div key={i} className="relative flex items-center gap-2 px-3" style={{ height: OPT_ROW }}>
                                <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[10.5px] font-semibold ${to ? "bg-[#4b56a8] text-white" : "bg-lane text-ink-3"}`}>{letter(i)}</span>
                                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{o.trim() || `Option ${i + 1}`}</span>
                                <button
                                  onPointerDown={(e) => startDrag(e, port)}
                                  disabled={readOnly}
                                  aria-label={to ? `Answer ${letter(i)} deals a card. Change it` : `Deal a card for answer ${letter(i)}`}
                                  className={`absolute -right-[9px] top-1/2 z-10 flex h-[18px] w-[18px] -translate-y-1/2 touch-none rounded-full border-2 transition-transform hover:scale-125 ${to ? "border-[#4b56a8] bg-[#4b56a8]" : "border-[#9aa0c8] bg-white"} ${readOnly ? "cursor-default" : "cursor-crosshair"}`}
                                >{to && <span className="m-auto block h-1.5 w-1.5 rounded-full bg-white" />}</button>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border-t border-line px-3 text-[11.5px] leading-[33px] text-ink-3">
                      {readOnly ? "No questions" : <button onClick={() => onEdit(m.id)} className="hover:text-ink">Add a question to branch from here</button>}
                    </div>
                  )}
                </div>
              );
            })}

            {menu && (() => {
              const src = lesson.modules.find((m) => m.id === menu.port.from);
              const q = src?.questions?.find((x) => x.id === menu.port.q);
              const to = q?.next?.[menu.port.option];
              const others = targetsFor(menu.port).filter((m) => m.id !== to);
              return (
                <div className="pop absolute z-20 w-64 rounded-xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.4)]" style={{ left: menu.x + 12, top: Math.max(8, menu.y - 20) }} onPointerDown={(e) => e.stopPropagation()}>
                  <div className="px-2 pb-1 pt-1 text-[11.5px] text-ink-3">
                    Answer {letter(menu.port.option)}{q?.options[menu.port.option]?.trim() ? ` · “${q.options[menu.port.option].trim()}”` : ""}
                  </div>
                  <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">New card</div>
                  <div className="grid grid-cols-2 gap-1">
                    {NEW_TYPES.map((t) => (
                      <button key={t} onClick={() => newCard(menu.port, t)} className="press flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-lane">
                        <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: suitOf(t).tint }} />{TYPE_META[t].name}
                      </button>
                    ))}
                  </div>
                  {menu.mode === "port" && others.length > 0 && (
                    <>
                      <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">Deal a card already here</div>
                      <div className="max-h-40 overflow-auto">
                        {others.map((m) => (
                          <button key={m.id} onClick={() => { wire(menu.port, m.id); setMenu(null); }} className="press block w-full truncate rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-lane">{m.title || "Untitled card"}</button>
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
      {!branching && anyQs && !readOnly && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
          <span className="rounded-full bg-ink px-4 py-2 text-[13px] text-white shadow-lg">Tip: drag the ○ next to an answer to the right</span>
        </div>
      )}
    </div>,
    document.body,
  );
}
