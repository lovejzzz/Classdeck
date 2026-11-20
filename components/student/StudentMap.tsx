"use client";

import { useEffect, useMemo, useRef } from "react";
import { suitOfCard, suitOf } from "@/lib/ui";
import { kindMeta, kindOf } from "@/lib/kinds";
import type { Lesson, Module, Status } from "@/lib/types";
import { Icon } from "../Icon";

const W = 212;
const H = 84;
const MH = 62; // a card inside a card group's frame
const FRAME_TOP = 34;
const COL = 84;
const GAP = 18;
const REGION_GAP = 72;
const TOP = 64;

type Stub = { id: string; title?: string; type?: Module["type"]; why?: string };
type Deck = NonNullable<Lesson["decks"]>[number];
type N = { id: string; lessonId: string; x: number; y: number; w: number; h: number; m?: Module; stub?: Stub; why?: string; deck?: Deck; inDeck?: boolean };

/**
 * A student's quest map: their lessons left to right, the cards on their board, the paths their answers took (and why),
 * and a card back for every path they haven't taken (its title only if the teacher shows every path). A card group is a
 * frame holding its cards; the paths its score deals leave from the frame.
 */
export function StudentMap({ lessons, weekOf, todayId, statusOf, onOpen }: {
  lessons: Lesson[];
  weekOf: Record<string, string>;
  todayId?: string;
  statusOf: (id: string) => Status;
  onOpen: (lessonId: string, id: string, el: HTMLElement) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { nodes, edges, regions, width, height } = useMemo(() => {
    const nodes = new Map<string, N>();
    const edges: { from: string; to: string; fog: boolean }[] = [];
    const regions: { lesson: Lesson; x: number; w: number }[] = [];
    const whyOf = new Map<string, string>();
    for (const l of lessons) {
      for (const m of l.modules) for (const p of m.paths ?? []) if (p.to) whyOf.set(p.to, p.why ?? "");
      for (const d of l.decks ?? []) for (const p of d.paths ?? []) if (p.to) whyOf.set(p.to, p.why ?? "");
    }
    let x = 32, height = 0;
    for (const l of lessons) {
      const local = new Set(l.modules.map((m) => m.id));
      const decks = l.decks ?? [];
      const deckOf = new Map(decks.flatMap((d) => d.members.map((id) => [id, d] as const)));
      const unit = (id: string) => (deckOf.has(id) ? `deck:${deckOf.get(id)!.id}` : id);
      const kids = new Map<string, string[]>();
      const stubs = new Map<string, Stub>();
      const dealtHere = new Set<string>();
      const addPaths = (from: string, at: string, paths: Module["paths"]) => {
        const list = kids.get(at) ?? [];
        (paths ?? []).forEach((p, i) => {
          if (p.to && local.has(p.to)) { if (!list.includes(p.to)) list.push(p.to); dealtHere.add(p.to); edges.push({ from, to: p.to, fog: false }); }
          else if (p.to) edges.push({ from, to: p.to, fog: false });
          else { const id = `${from}~${i}`; stubs.set(id, { id, ...p }); list.push(id); edges.push({ from, to: id, fog: true }); }
        });
        kids.set(at, list);
      };
      for (const m of l.modules) addPaths(m.id, unit(m.id), m.paths);
      for (const d of decks) addPaths(`deck:${d.id}`, `deck:${d.id}`, d.paths);
      const frameH = (d: Deck) => FRAME_TOP + d.members.length * (MH + 8) + 4;
      // A group's own key, exactly (a card back dealt by a group's score has an id that starts the same way).
      const deckByKey = new Map<string, Deck>(decks.map((d) => [`deck:${d.id}`, d]));
      const sizeOf = (id: string) => (deckByKey.has(id) ? frameH(deckByKey.get(id)!) : H);
      const span = new Map<string, number>(), depth = new Map<string, number>();
      const measure = (id: string, dd: number): number => {
        depth.set(id, dd);
        const k = kids.get(id) ?? [];
        const sp = Math.max(sizeOf(id), k.reduce((n, c) => n + measure(c, dd + 1), 0) + Math.max(0, k.length - 1) * GAP);
        span.set(id, sp);
        return sp;
      };
      const place = (id: string, y0: number) => {
        const k = kids.get(id) ?? [];
        const sp = span.get(id)!, h = sizeOf(id);
        const below = k.reduce((n, c) => n + span.get(c)!, 0) + Math.max(0, k.length - 1) * GAP;
        const nx = x + depth.get(id)! * (W + COL), ny = y0 + (sp - h) / 2;
        if (deckByKey.has(id)) {
          const d = deckByKey.get(id)!;
          nodes.set(id, { id, lessonId: l.id, x: nx, y: ny, w: W, h, deck: d });
          d.members.forEach((mid, i) => {
            const m = l.modules.find((v) => v.id === mid);
            if (m) nodes.set(mid, { id: mid, lessonId: l.id, x: nx + 10, y: ny + FRAME_TOP + i * (MH + 8), w: W - 20, h: MH, m, inDeck: true, why: whyOf.get(mid) });
          });
        } else {
          const m = l.modules.find((v) => v.id === id);
          nodes.set(id, { id, lessonId: l.id, x: nx, y: ny, w: W, h: H, m, stub: stubs.get(id), why: whyOf.get(id) });
        }
        let y = y0 + (sp - below) / 2;
        for (const c of k) { place(c, y); y += span.get(c)! + GAP; }
      };
      let y = TOP;
      const tops: string[] = [];
      for (const m of l.modules) { const u = unit(m.id); if (!dealtHere.has(m.id) && !tops.includes(u)) tops.push(u); }
      for (const u of tops) { measure(u, 0); place(u, y); y += span.get(u)! + GAP * 1.4; }
      const w = Math.max(W, (Math.max(0, ...depth.values()) + 1) * (W + COL) - COL);
      regions.push({ lesson: l, x, w });
      height = Math.max(height, y + 24);
      x += w + REGION_GAP;
    }
    return { nodes, edges: edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)), regions, width: x, height: Math.max(height, 360) };
  }, [lessons]);

  // Start at today's lesson.
  useEffect(() => {
    const r = regions.find((x) => x.lesson.id === todayId);
    if (r && box.current) box.current.scrollTo({ left: Math.max(0, r.x - 32), behavior: "smooth" });
  }, [regions, todayId]);

  const curve = (a: N, b: N) => {
    const x1 = a.x + a.w, y1 = a.y + (a.deck ? 18 : a.h / 2), x2 = b.x, y2 = b.y + (b.deck ? 18 : b.h / 2), dx = Math.max(36, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div ref={box} className="tree-canvas relative mx-auto max-w-6xl overflow-auto rounded-2xl border border-line" style={{ height: Math.min(height + 24, 640), backgroundSize: "22px 22px" }} aria-label="Your map">
      <div className="relative" style={{ width, height }}>
        {regions.map((r) => (
          <div key={r.lesson.id} className={`absolute rounded-[24px] ${r.lesson.id === todayId ? "bg-ok/[0.05]" : "bg-black/[0.018]"}`} style={{ left: r.x - 16, top: 12, width: r.w + 32, height: height - 24 }}>
            <div className="flex items-center gap-2 px-4 pt-3 text-[12.5px]">
              <span className="font-semibold text-ink">{r.lesson.title}</span>
              {weekOf[r.lesson.id] && <span className="text-ink-3">{weekOf[r.lesson.id]}</span>}
              {r.lesson.id === todayId && <span className="chip h-5 bg-ok/10 text-[11px] text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Today</span>}
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
            return <path key={`${e.from}-${e.to}`} d={curve(a, b)} fill="none" stroke={e.fog ? "#c9ccdf" : "#4b56a8"} strokeWidth={e.fog ? 1.6 : 2.2} strokeDasharray={e.fog || cross ? "6 5" : undefined} pathLength={e.fog || cross ? undefined : 1} className={e.fog || cross ? "" : "tree-wire"} />;
          })}
        </svg>
        {[...nodes.values()].filter((n) => !n.deck).map((n, i) => {
          if (n.stub) {
            const known = n.stub.title;
            const src = n.id.split("~")[0];
            const answered = src.startsWith("deck:") ? !!nodes.get(src)?.deck?.done : statusOf(src) === "done";
            return (
              <div key={n.id} className="tree-node absolute flex flex-col justify-center rounded-[16px] border border-dashed border-[#c9ccdf] px-3.5" style={{ left: n.x, top: n.y, width: n.w, height: n.h, animationDelay: `${Math.min(i, 14) * 25}ms`, background: known ? "#fff" : "repeating-linear-gradient(135deg, #f2f3f9 0 8px, #e9ebf5 8px 16px)" }}>
                {known ? (
                  <>
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.06em]" style={{ color: suitOf(n.stub.type ?? "read").tint }}>Another path</span>
                    <span className="mt-0.5 truncate text-[13px] font-semibold text-ink-2">{n.stub.title}</span>
                    {n.stub.why && <span className="mt-0.5 truncate text-[11px] text-ink-3">{n.stub.why}</span>}
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#7b80a8]"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[14px]">?</span>{answered ? "A path you didn’t take" : "Answer to see where this leads"}</span>
                )}
              </div>
            );
          }
          const m = n.m!;
          const s = statusOf(m.id);
          const suit = suitOfCard(m);
          return (
            <button
              key={n.id}
              onClick={(e) => onOpen(n.lessonId, m.id, e.currentTarget)}
              className={`tree-node press absolute rounded-[16px] border bg-white text-left ${m.dealtFor ? "border-[#4b56a8]/50" : "border-line"} ${s === "done" ? "opacity-80" : ""}`}
              style={{ left: n.x, top: n.y, width: n.w, height: n.h, animationDelay: `${Math.min(i, 14) * 25}ms` }}
              aria-label={`${m.title}${s === "done" ? ", done" : ""}`}
            >
              <span className="block h-1.5 rounded-t-[16px]" style={{ background: suit.tint }} />
              <span className={`flex items-center gap-1.5 px-3.5 text-[10.5px] font-medium uppercase tracking-[0.06em] ${n.inDeck ? "pt-1.5" : "pt-2"}`} style={{ color: suit.tint }}>
                {kindMeta(kindOf(m)).name}
                {m.dealtFor && <span className="rounded-full bg-[#eef0fb] px-1.5 normal-case tracking-normal text-[#4b56a8]">For you</span>}
                <span className="flex-1" />
                {s === "done" && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ok text-white"><Icon name="check" size={10} strokeWidth={3} /></span>}
                {s === "doing" && <span className="h-2 w-2 rounded-full bg-warn" />}
              </span>
              <span className="block truncate px-3.5 pt-0.5 text-[13.5px] font-semibold text-ink">{m.title || "Untitled card"}</span>
              {n.why && !n.inDeck && <span className="block truncate px-3.5 pt-0.5 text-[11px] text-[#4b56a8]">{n.why}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
