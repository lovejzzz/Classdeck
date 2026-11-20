"use client";

import { useEffect, useMemo, useRef } from "react";
import { suitOfCard, TYPE_META, suitOf } from "@/lib/ui";
import type { Lesson, Module, Status } from "@/lib/types";
import { Icon } from "../Icon";

const W = 212;
const H = 84;
const COL = 84;
const GAP = 18;
const REGION_GAP = 72;
const TOP = 64;

type Stub = { id: string; title?: string; type?: Module["type"]; why?: string };
type N = { id: string; lessonId: string; x: number; y: number; m?: Module; stub?: Stub; why?: string };

/**
 * A student's quest map: their lessons left to right, the cards on their board, the paths their answers took (and why),
 * and a card back for every path they haven't taken (its title only if the teacher shows every path).
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
    for (const l of lessons) for (const m of l.modules) for (const p of m.paths ?? []) if (p.to) whyOf.set(p.to, p.why ?? "");
    let x = 32, height = 0;
    for (const l of lessons) {
      const local = new Set(l.modules.map((m) => m.id));
      const kids = new Map<string, string[]>();
      const stubs = new Map<string, Stub>();
      const dealtHere = new Set<string>();
      for (const m of l.modules) {
        const list: string[] = [];
        (m.paths ?? []).forEach((p, i) => {
          if (p.to && local.has(p.to)) { list.push(p.to); dealtHere.add(p.to); edges.push({ from: m.id, to: p.to, fog: false }); }
          else if (p.to) edges.push({ from: m.id, to: p.to, fog: false });
          else { const id = `${m.id}~${i}`; stubs.set(id, { id, ...p }); list.push(id); edges.push({ from: m.id, to: id, fog: true }); }
        });
        kids.set(m.id, list);
      }
      const span = new Map<string, number>(), depth = new Map<string, number>();
      const measure = (id: string, d: number): number => {
        depth.set(id, d);
        const k = kids.get(id) ?? [];
        const s = Math.max(H, k.reduce((n, c) => n + measure(c, d + 1), 0) + Math.max(0, k.length - 1) * GAP);
        span.set(id, s);
        return s;
      };
      const place = (id: string, y0: number) => {
        const k = kids.get(id) ?? [];
        const s = span.get(id)!;
        const below = k.reduce((n, c) => n + span.get(c)!, 0) + Math.max(0, k.length - 1) * GAP;
        const m = l.modules.find((v) => v.id === id);
        nodes.set(id, { id, lessonId: l.id, x: x + depth.get(id)! * (W + COL), y: y0 + (s - H) / 2, m, stub: stubs.get(id), why: whyOf.get(id) });
        let y = y0 + (s - below) / 2;
        for (const c of k) { place(c, y); y += span.get(c)! + GAP; }
      };
      let y = TOP;
      for (const m of l.modules.filter((v) => !dealtHere.has(v.id))) { measure(m.id, 0); place(m.id, y); y += span.get(m.id)! + GAP * 1.4; }
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
    const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, dx = Math.max(36, Math.abs(x2 - x1) / 2);
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
        <svg width={width} height={height} className="pointer-events-none absolute inset-0" aria-hidden="true">
          {edges.map((e) => {
            const a = nodes.get(e.from)!, b = nodes.get(e.to)!;
            const cross = a.lessonId !== b.lessonId;
            return <path key={`${e.from}-${e.to}`} d={curve(a, b)} fill="none" stroke={e.fog ? "#c9ccdf" : "#4b56a8"} strokeWidth={e.fog ? 1.6 : 2.2} strokeDasharray={e.fog || cross ? "6 5" : undefined} pathLength={e.fog || cross ? undefined : 1} className={e.fog || cross ? "" : "tree-wire"} />;
          })}
        </svg>
        {[...nodes.values()].map((n, i) => {
          if (n.stub) {
            const known = n.stub.title;
            return (
              <div key={n.id} className="tree-node absolute flex flex-col justify-center rounded-[16px] border border-dashed border-[#c9ccdf] px-3.5" style={{ left: n.x, top: n.y, width: W, height: H, animationDelay: `${Math.min(i, 14) * 25}ms`, background: known ? "#fff" : "repeating-linear-gradient(135deg, #f2f3f9 0 8px, #e9ebf5 8px 16px)" }}>
                {known ? (
                  <>
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.06em]" style={{ color: suitOf(n.stub.type ?? "read").tint }}>{TYPE_META[n.stub.type ?? "read"].label} · another path</span>
                    <span className="mt-0.5 truncate text-[13px] font-semibold text-ink-2">{n.stub.title}</span>
                    {n.stub.why && <span className="mt-0.5 truncate text-[11px] text-ink-3">{n.stub.why}</span>}
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#7b80a8]"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[14px]">?</span>A path you didn’t take</span>
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
              style={{ left: n.x, top: n.y, width: W, height: H, animationDelay: `${Math.min(i, 14) * 25}ms` }}
              aria-label={`${m.title}${s === "done" ? ", done" : ""}`}
            >
              <span className="block h-1.5 rounded-t-[16px]" style={{ background: suit.tint }} />
              <span className="flex items-center gap-1.5 px-3.5 pt-2 text-[10.5px] font-medium uppercase tracking-[0.06em]" style={{ color: suit.tint }}>
                {TYPE_META[m.type].label}
                {m.dealtFor && <span className="rounded-full bg-[#eef0fb] px-1.5 normal-case tracking-normal text-[#4b56a8]">For you</span>}
                <span className="flex-1" />
                {s === "done" && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ok text-white"><Icon name="check" size={10} strokeWidth={3} /></span>}
                {s === "doing" && <span className="h-2 w-2 rounded-full bg-warn" />}
              </span>
              <span className="block truncate px-3.5 pt-1 text-[13.5px] font-semibold text-ink">{m.title || "Untitled card"}</span>
              {n.why && <span className="block truncate px-3.5 pt-0.5 text-[11px] text-[#4b56a8]">{n.why}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
