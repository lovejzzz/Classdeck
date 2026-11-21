"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pathColor, suitOfCard, suitOf } from "@/lib/ui";
import { faceMeta, faceOf } from "@/lib/kinds";
import { KindArt } from "../cards/KindArt";
import type { Lesson, Module, Status } from "@/lib/types";
import { Icon } from "../Icon";
import { elbow } from "../mapPath";

// Each card is a playing card, 5 wide by 7 tall (a card group is a frame holding its cards as rows).
const W = 180;
const H = Math.round((W * 7) / 5);
const MH = 62; // a card inside a card group's frame
const FRAME_TOP = 34;
const HGAP = 40; // between cards side by side
const VGAP = 64; // between a card and the cards it deals below it
const REGION_GAP = 44; // between lessons
const TOP = 58; // room for a lesson's header
const FAR = 0.55; // zoomed out past this, each week is a column

type Stub = { id: string; title?: string; type?: Module["type"]; why?: string };
type Deck = NonNullable<Lesson["decks"]>[number];
type N = { id: string; lessonId: string; x: number; y: number; w: number; h: number; m?: Module; stub?: Stub; why?: string; deck?: Deck; frame?: string };
type Region = { lesson: Lesson; x: number; y: number; w: number; h: number };
type Edge = { from: string; to: string; fog: boolean; i: number };

/**
 * Lays out a student's map like the teacher's: every lesson is a row, one under another, its cards side by side and
 * the cards an answer dealt hanging below the card that dealt them. Zoomed far out, each week is a column with its
 * lessons stacked, so the whole course fits on one screen.
 */
function layout(lessons: Lesson[], weekOf: Record<string, string>, columns: boolean) {
  const nodes = new Map<string, N>();
  const edges: Edge[] = [];
  const regions: Region[] = [];
  const whyOf = new Map<string, string>();
  for (const l of lessons) {
    for (const m of l.modules) for (const p of m.paths ?? []) if (p.to) whyOf.set(p.to, p.why ?? "");
    for (const d of l.decks ?? []) for (const p of d.paths ?? []) if (p.to) whyOf.set(p.to, p.why ?? "");
  }
  let x0 = 24, y0 = 12, width = 0, height = 0;
  let col: Region[] = [];
  const endColumn = () => {
    if (!col.length) return;
    const cw = Math.max(...col.map((r) => r.w));
    for (const r of col) r.w = cw;
    x0 += cw + REGION_GAP;
    col = [];
  };
  lessons.forEach((l, li) => {
    if (columns && li > 0 && weekOf[l.id] !== weekOf[lessons[li - 1].id]) { endColumn(); y0 = 12; }
    const local = new Set(l.modules.map((m) => m.id));
    const decks = l.decks ?? [];
    const deckOf = new Map(decks.flatMap((d) => d.members.map((id) => [id, d] as const)));
    const unit = (id: string) => (deckOf.has(id) ? `deck:${deckOf.get(id)!.id}` : id);
    const deckByKey = new Map<string, Deck>(decks.map((d) => [`deck:${d.id}`, d]));
    const kids = new Map<string, string[]>();
    const stubs = new Map<string, Stub>();
    const dealtHere = new Set<string>();
    const addPaths = (from: string, at: string, paths: Module["paths"]) => {
      const list = kids.get(at) ?? [];
      (paths ?? []).forEach((p, i) => {
        if (p.to) {
          edges.push({ from, to: p.to, fog: false, i });
          if (local.has(p.to) && !deckOf.has(p.to)) { if (!list.includes(p.to)) list.push(p.to); dealtHere.add(p.to); }
        } else { const id = `${from}~${i}`; stubs.set(id, { id, ...p }); list.push(id); edges.push({ from, to: id, fog: true, i }); }
      });
      kids.set(at, list);
    };
    for (const m of l.modules) addPaths(m.id, unit(m.id), m.paths);
    for (const d of decks) addPaths(`deck:${d.id}`, `deck:${d.id}`, d.paths);
    const sizeOf = (id: string) => (deckByKey.has(id) ? FRAME_TOP + deckByKey.get(id)!.members.length * (MH + 8) + 4 : H);
    // Each card under the first card that deals it (a card dealt twice in a lesson is drawn once).
    const tree = new Map<string, string[]>();
    const seen = new Set<string>();
    const walk = (id: string) => {
      seen.add(id);
      const list = (kids.get(id) ?? []).filter((c) => !seen.has(c));
      list.forEach((c) => seen.add(c));
      tree.set(id, list);
      list.forEach(walk);
    };
    const tops: string[] = [];
    for (const m of l.modules) { const u = unit(m.id); if (!dealtHere.has(m.id) && !tops.includes(u)) tops.push(u); }
    tops.forEach(walk);
    for (const m of l.modules) { const u = unit(m.id); if (!seen.has(u)) { tops.push(u); walk(u); } }
    const span = new Map<string, number>(), depth = new Map<string, number>(), rowH: number[] = [];
    const measure = (id: string, d: number): number => {
      depth.set(id, d);
      rowH[d] = Math.max(rowH[d] ?? 0, sizeOf(id));
      const k = tree.get(id) ?? [];
      const below = k.reduce((n, c) => n + measure(c, d + 1), 0) + Math.max(0, k.length - 1) * HGAP;
      const s = Math.max(W, below);
      span.set(id, s);
      return s;
    };
    for (const u of tops) measure(u, 0);
    const top = y0 + TOP;
    const rowTop = (d: number) => top + rowH.slice(0, d).reduce((n, h) => n + h, 0) + d * VGAP;
    const place = (id: string, left: number) => {
      const s = span.get(id)!, h = sizeOf(id);
      const k = tree.get(id) ?? [];
      const below = k.reduce((n, c) => n + span.get(c)!, 0) + Math.max(0, k.length - 1) * HGAP;
      const nx = left + (s - W) / 2, ny = rowTop(depth.get(id)!);
      if (deckByKey.has(id)) {
        const d = deckByKey.get(id)!;
        nodes.set(id, { id, lessonId: l.id, x: nx, y: ny, w: W, h, deck: d });
        d.members.forEach((mid, i) => {
          const m = l.modules.find((v) => v.id === mid);
          if (m) nodes.set(mid, { id: mid, lessonId: l.id, x: nx + 10, y: ny + FRAME_TOP + i * (MH + 8), w: W - 20, h: MH, m, frame: id, why: whyOf.get(mid) });
        });
      } else {
        const m = l.modules.find((v) => v.id === id);
        nodes.set(id, { id, lessonId: l.id, x: nx, y: ny, w: W, h: H, m, stub: stubs.get(id), why: whyOf.get(id) });
      }
      let x = left + (s - below) / 2;
      for (const c of k) { place(c, x); x += span.get(c)! + HGAP; }
    };
    let x = x0 + 16;
    for (const u of tops) { place(u, x); x += span.get(u)! + HGAP * 1.4; }
    const w = Math.max(W + 32, x - HGAP * 1.4 - x0 + 16);
    const h = (rowH.length ? rowTop(rowH.length) - VGAP : top + 80) - y0 + 22;
    const r = { lesson: l, x: x0, y: y0, w, h };
    regions.push(r);
    if (columns) col.push(r);
    width = Math.max(width, w);
    y0 += h + REGION_GAP;
    height = Math.max(height, y0);
  });
  const kept = edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));
  if (columns) {
    endColumn();
    return { nodes, edges: kept, regions, width: x0 - REGION_GAP + 24, height: Math.max(height, 360) };
  }
  // Every lesson's row is as wide as the widest, so they line up like shelves.
  for (const r of regions) r.w = width;
  return { nodes, edges: kept, regions, width: x0 + width + 24, height: Math.max(y0, 360) };
}

/**
 * A student's quest map: their lessons as rows, the cards on their board, the paths their answers took (and why), and
 * a card back for every path they haven't taken (its title only if the teacher shows every path). A card group is a
 * frame holding its cards; the paths its score deals leave from the frame.
 */
export function StudentMap({ lessons, weekOf: weekOfProp, todayId, statusOf, onOpen }: {
  lessons: Lesson[];
  weekOf: Record<string, string>;
  todayId?: string;
  statusOf: (id: string) => Status;
  onOpen: (lessonId: string, id: string, el: HTMLElement) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // The page builds this every render: keep it stable so the layout isn't redone each time.
  const weekKey = JSON.stringify(weekOfProp);
  const weekOf = useMemo(() => JSON.parse(weekKey) as Record<string, string>, [weekKey]);
  const [zoom, setZoom] = useState(0.8);
  const far = zoom < FAR;
  const { nodes, edges, regions, width, height } = useMemo(() => layout(lessons, weekOf, far), [lessons, weekOf, far]);

  // Start at today's lesson.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    const r = regions.find((x) => x.lesson.id === todayId);
    if (!r || !box.current) return;
    started.current = true;
    box.current.scrollTo({ left: Math.max(0, r.x * zoom - 16), top: Math.max(0, r.y * zoom - 8), behavior: "smooth" });
  }, [regions, todayId, zoom]);

  /** Zoom keeping the middle of the view still (from far out into rows, keep today's lesson in view instead). */
  function zoomTo(z: number) {
    const el = box.current;
    const nz = Math.min(1.4, Math.max(0.12, +z.toFixed(2)));
    if (!el) return setZoom(nz);
    const cx = (el.scrollLeft + el.clientWidth / 2) / zoom, cy = (el.scrollTop + el.clientHeight / 2) / zoom;
    const switching = (zoom < FAR) !== (nz < FAR);
    setZoom(nz);
    requestAnimationFrame(() => {
      if (switching) {
        const r = layout(lessons, weekOf, nz < FAR).regions.find((x) => x.lesson.id === todayId);
        el.scrollLeft = r ? Math.max(0, r.x * nz - 16) : 0;
        el.scrollTop = r ? Math.max(0, r.y * nz - 8) : 0;
      } else {
        el.scrollLeft = cx * nz - el.clientWidth / 2;
        el.scrollTop = cy * nz - el.clientHeight / 2;
      }
    });
  }
  // Pinch on a trackpad (or ctrl/⌘ + scroll) zooms the map, never the page.
  const zoomer = useRef({ zoom, zoomTo: (z: number) => { void z; } });
  useEffect(() => { zoomer.current.zoom = zoom; zoomer.current.zoomTo = zoomTo; });
  useEffect(() => {
    const el = box.current;
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
  /** First a lesson's row fills the width; pressed again, the whole course fits (weeks as columns). */
  const fit = () => {
    const el = box.current;
    if (!el) return;
    const rows = layout(lessons, weekOf, false), cols = layout(lessons, weekOf, true);
    const byWidth = Math.max(0.12, Math.min(1, (el.clientWidth - 16) / rows.width));
    let whole = Math.max(0.12, Math.min(1, (el.clientWidth - 16) / cols.width, (el.clientHeight - 16) / cols.height));
    if (whole >= FAR) whole = Math.max(0.12, Math.min(1, (el.clientWidth - 16) / rows.width, (el.clientHeight - 16) / rows.height));
    setZoom(Math.abs(zoom - byWidth) < 0.01 ? whole : byWidth);
    requestAnimationFrame(() => el.scrollTo({ left: 0, top: 0, behavior: "smooth" }));
  };

  // A path leaves the bottom of its card (or of the card group holding it) and comes into the top of the next.
  const out = (n: N) => (n.frame ? nodes.get(n.frame)! : n);
  const wire = (e: Edge) => {
    const a = out(nodes.get(e.from)!), b = nodes.get(e.to)!;
    const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y;
    if (a.lessonId === b.lessonId && y2 > y1 + 12) {
      const mid = y2 - VGAP / 2;
      return elbow([{ x: x1, y: y1 }, { x: x1, y: mid }, { x: x2, y: mid }, { x: x2, y: y2 }]);
    }
    // Into a lesson further down, a long S; back up to one above (or beside it, zoomed out), come in just over the card
    // so the line stays on the map.
    const dy = Math.max(60, Math.abs(y2 - y1) / 2), up = y2 < y1 + 12 ? 44 : dy;
    return `M ${x1} ${y1} C ${x1} ${y1 + Math.min(dy, 120)}, ${x2} ${y2 - up}, ${x2} ${y2}`;
  };
  const tall = height * zoom + 8 > 720;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-2 flex items-center justify-end gap-1 text-[12px] text-ink-2">
        <button onClick={() => zoomTo(zoom - 0.15)} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom out">−</button>
        <button onClick={fit} className="mono h-7 w-12 rounded-lg text-center hover:bg-lane" title="Fit the map’s width (press again to see the whole course)">{Math.round(zoom * 100)}%</button>
        <button onClick={() => zoomTo(zoom + 0.15)} className="btn btn-quiet press h-7 w-7 justify-center px-0" aria-label="Zoom in">+</button>
      </div>
      <div ref={box} className="tree-canvas relative overflow-auto overscroll-contain rounded-2xl border border-line" style={{ height: tall ? "min(72vh, 720px)" : height * zoom + 8, backgroundSize: `${22 * zoom}px ${22 * zoom}px` }} aria-label="Your map">
        <div className="relative" style={{ width: width * zoom, height: height * zoom }}>
          <div className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${zoom})` }}>
            {regions.map((r) => (
              <div key={r.lesson.id} className={`absolute rounded-[24px] ${r.lesson.id === todayId ? "tree-lesson-today" : "tree-lesson"}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
                <div className="flex min-w-0 items-center gap-2 whitespace-nowrap px-4 pt-3.5 text-[12.5px]" style={far ? { fontSize: 22 } : undefined}>
                  <span className={`flex flex-none items-center justify-center rounded-full font-semibold text-white ${far ? "h-8 w-8 text-[16px]" : "h-5 w-5 text-[10.5px]"} ${r.lesson.id === todayId ? "bg-ok" : "bg-ink"}`}>{regions.indexOf(r) + 1}</span>
                  <span className="min-w-0 truncate font-semibold text-ink" title={r.lesson.title}>{r.lesson.title}</span>
                  {weekOf[r.lesson.id] && <span className="flex-none text-ink-3">{weekOf[r.lesson.id]}</span>}
                  {r.lesson.id === todayId && <span className="chip h-[18px] flex-none bg-ok/10 text-[10.5px] text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Today</span>}
                </div>
              </div>
            ))}
            {[...nodes.values()].filter((n) => n.deck).map((n) => (
              <div key={n.id} className="tree-node absolute rounded-[20px] border border-[#4b56a8]/30 bg-[#eef0fb]/80" style={{ left: n.x, top: n.y, width: n.w, height: n.h }}>
                <div className="flex items-center gap-1.5 px-3 pt-2 text-[11.5px]">
                  <Icon name="layers" size={12} className="text-[#4b56a8]" />
                  <span className="truncate font-semibold text-ink">{n.deck!.title}</span>
                  <span className="flex-1" />
                  {n.deck!.done && n.deck!.score !== undefined && <span className="chip h-5 bg-white text-[10.5px] text-[#4b56a8]">{n.deck!.score}%</span>}
                </div>
              </div>
            ))}
            <svg width={width} height={height} className="pointer-events-none absolute inset-0" aria-hidden="true">
              {edges.map((e) => {
                const a = nodes.get(e.from)!, b = nodes.get(e.to)!;
                const cross = a.lessonId !== b.lessonId;
                const d = wire(e);
                if (e.fog) return <path key={`${e.from}-${e.to}`} d={d} fill="none" stroke="#c9ccdf" strokeWidth={1.6} strokeDasharray="5 6" strokeLinecap="round" />;
                const c = pathColor(e.i);
                // A path this student took: a soft halo, the line, and a slow flow along it.
                return (
                  <g key={`${e.from}-${e.to}`}>
                    <path d={d} fill="none" stroke={c} strokeOpacity={0.12} strokeWidth={9} strokeLinecap="round" />
                    <path d={d} fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeDasharray={cross ? "7 6" : undefined} pathLength={cross ? undefined : 1} className={cross ? "" : "tree-wire"} />
                    <path d={d} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={1.4} strokeLinecap="round" className="tree-flow" />
                  </g>
                );
              })}
            </svg>
            {[...nodes.values()].filter((n) => !n.deck).map((n, i) => {
              if (n.stub) {
                const known = n.stub.title;
                const src = n.id.split("~")[0];
                const answered = src.startsWith("deck:") ? !!nodes.get(src)?.deck?.done : statusOf(src) === "done";
                return (
                  <div key={n.id} className="tree-node absolute flex flex-col justify-center rounded-[16px] border border-dashed border-[#c9ccdf] px-4 text-center" style={{ left: n.x, top: n.y, width: n.w, height: n.h, animationDelay: `${Math.min(i, 14) * 25}ms`, background: known ? "#fff" : "repeating-linear-gradient(135deg, #f2f3f9 0 8px, #e9ebf5 8px 16px)" }}>
                    {known ? (
                      <>
                        <span className="text-[10.5px] font-medium uppercase tracking-[0.06em]" style={{ color: suitOf(n.stub.type ?? "read").tint }}>Another path</span>
                        <span className="mt-1 line-clamp-3 text-[14px] font-semibold text-ink-2">{n.stub.title}</span>
                        {n.stub.why && <span className="mt-1 line-clamp-2 text-[11px] text-ink-3">{n.stub.why}</span>}
                      </>
                    ) : (
                      <span className="flex flex-col items-center gap-2.5 text-[12.5px] font-medium text-[#7b80a8]"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-[20px]">?</span>{answered ? "A path you didn’t take" : "Answer to see where this leads"}</span>
                    )}
                  </div>
                );
              }
              const m = n.m!;
              const s = statusOf(m.id);
              const into = edges.find((e) => e.to === n.id && !e.fog);
              const tone = into ? pathColor(into.i) : "#4b56a8";
              const suit = suitOfCard(m);
              const inDeck = !!n.frame;
              return (
                <button
                  key={n.id}
                  onClick={(e) => onOpen(n.lessonId, m.id, e.currentTarget)}
                  className={`tree-node press absolute flex flex-col rounded-[16px] border border-line bg-white text-left ${s === "done" ? "opacity-80" : ""}`}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h, animationDelay: `${Math.min(i, 14) * 25}ms`, borderColor: m.dealtFor ? `${tone}80` : undefined }}
                  aria-label={`${m.title}${s === "done" ? ", done" : ""}`}
                >
                  {into && !inDeck && <span className="absolute -top-[6px] left-1/2 z-[1] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white" style={{ background: tone }} />}
                  <span className="tree-bar block h-[5px] flex-none rounded-t-[16px]" style={{ "--bar": suit.tint } as React.CSSProperties} />
                  <span className={`flex flex-none items-center gap-1.5 px-3.5 text-[10.5px] font-medium uppercase tracking-[0.06em] ${inDeck ? "pt-1.5" : "pt-2"}`} style={{ color: suit.tint }}>
                    {faceMeta(m).name}
                    {m.dealtFor && <span className="whitespace-nowrap rounded-full px-1.5 normal-case tracking-normal" style={{ background: `${tone}14`, color: tone }}>For you</span>}
                    <span className="flex-1" />
                    {s === "done" && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ok text-white"><Icon name="check" size={10} strokeWidth={3} /></span>}
                    {s === "doing" && <span className="h-2 w-2 rounded-full bg-warn" />}
                  </span>
                  <span className={`block flex-none px-3.5 pt-0.5 font-semibold leading-snug text-ink ${inDeck ? "truncate text-[13.5px]" : far ? "line-clamp-3 text-[19px]" : "line-clamp-2 text-[13.5px]"}`}>{m.title || "Untitled card"}</span>
                  {!inDeck && (
                    // The card's picture (or a drawing of what it is), like the face of a playing card.
                    <span className="relative mx-3 mb-3 mt-2 block min-h-0 flex-1 overflow-hidden rounded-[10px]" style={{ background: suit.cover }}>
                      {m.attachments?.[0]?.kind === "image"
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={m.attachments[0].url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                        : <KindArt id={m.id} face={faceOf(m)} tint={suit.tint} cover={suit.cover} />}
                    </span>
                  )}
                  {n.why && !inDeck && <span className="-mt-1.5 block flex-none truncate px-3.5 pb-2.5 text-[11px]" style={{ color: tone }}>{n.why}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
