"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { hash } from "@/lib/cards";
import { PhysicsCard, type Slot } from "./PhysicsCard";

export interface TableCard {
  id: string;
  label: string;
  front: React.ReactNode;
  back?: React.ReactNode;
  faceDown?: boolean;
  locked?: boolean;
  holo?: boolean;
}

/**
 * Lays cards out on a table and lets the physics do the rest.
 * "fan" holds them in an arc like a hand of cards; neighbours slide apart around the hovered one.
 * "grid" lays them in rows with a little natural jitter. A fan that would be too cramped becomes a grid.
 * Cards can be dragged to reorder, and (optionally) flicked upward out of the hand to play them.
 */
export function CardTable({
  cards, layout, size, gap = 18, idle = true, draggable = true, hiddenId, deal = true,
  onActivate, onLockedTap, onReorder, onPlay, register, after, ariaLabel,
}: {
  cards: TableCard[];
  layout: "fan" | "grid" | "row";
  size: { w: number; h: number };
  gap?: number;
  idle?: boolean;
  draggable?: boolean;
  hiddenId?: string | null;
  deal?: boolean;
  onActivate?: (id: string, el: HTMLElement) => void;
  onLockedTap?: (id: string) => void;
  onReorder?: (ids: string[]) => void;
  onPlay?: (id: string, el: HTMLElement) => void;
  register?: (id: string, el: HTMLElement | null) => void;
  /** Something static (like an "add card" tile) placed in the slot after the last card. Grid only. */
  after?: React.ReactNode;
  ariaLabel?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const byId = new Map(cards.map((c) => [c.id, c]));
  const ids = (dragOrder ?? cards.map((c) => c.id)).filter((id) => byId.has(id));
  const n = ids.length;
  const { w, h } = size;

  // —— layout ——
  let mode: "fan" | "grid" | "row" = layout;
  let step = 0;
  if (mode === "fan") {
    step = n > 1 ? Math.min(w * 0.94, (width - w - 40) / (n - 1)) : 0;
    if (width < 640 || (n > 1 && step < w * 0.42)) mode = "grid";
  }
  const slots = new Map<string, Slot>();
  let height = 0;
  const totalSlots = n + (after && mode !== "fan" ? 1 : 0);
  const rowWidth = Math.max(totalSlots, 1) * (w + gap) - gap;
  const cols = Math.max(2, Math.floor((width + gap) / (w + gap)));
  const gridLeft = Math.max(0, (width - (Math.min(cols, Math.max(totalSlots, 1)) * (w + gap) - gap)) / 2);
  const gridPos = (i: number) =>
    mode === "row" ? { x: i * (w + gap), y: 22 } : { x: gridLeft + (i % cols) * (w + gap), y: 20 + Math.floor(i / cols) * (h + gap) };

  if (mode === "fan") {
    const mid = (n - 1) / 2;
    const angle = Math.min(4.5, 22 / Math.max(n, 1));
    const hi = hover ? ids.indexOf(hover) : -1;
    const push = Math.max(0, w * 0.78 - step);
    ids.forEach((id, i) => {
      const off = i - mid;
      let x = width / 2 - w / 2 + off * step;
      if (hi >= 0 && i !== hi) x += Math.sign(i - hi) * push / (1 + Math.abs(i - hi) * 0.45);
      // Playable cards sit above face-down ones so the next card to play is never buried.
      slots.set(id, { x, y: 46 + off * off * 2.6, rot: off * angle, scale: 1, z: i + 1 + (byId.get(id)!.locked ? 0 : 100) });
    });
    height = h + 46 + mid * mid * 2.6 + 40;
  } else if (mode === "row") {
    ids.forEach((id, i) => {
      const { x, y } = gridPos(i);
      slots.set(id, { x, y, rot: (hash(id) - 0.5) * 1.4, scale: 1, z: i + 1 });
    });
    height = h + 44;
  } else {
    ids.forEach((id, i) => {
      const { x, y } = gridPos(i);
      const j = hash(id);
      slots.set(id, { x, y, rot: (j - 0.5) * 1.6, scale: 1, z: i + 1 });
    });
    height = 20 + Math.ceil(Math.max(totalSlots, 1) / cols) * (h + gap) + 10;
  }

  function nearest(p: { x: number; y: number }) {
    let best = 0;
    let bd = Infinity;
    ids.forEach((id, i) => {
      const s = slots.get(id)!;
      const d = Math.hypot(s.x + w / 2 - p.x, (s.y + h / 2 - p.y) * (mode === "fan" ? 0.2 : 1));
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  return (
    <div
      ref={box}
      className={`relative ${mode === "row" ? "flex-none" : "w-full"}`}
      style={{ height: Math.max(height, h + 40), width: mode === "row" ? rowWidth : undefined }}
      aria-label={ariaLabel}
      role="list"
    >
      {(width > 0 || mode === "row") &&
        ids.map((id, i) => {
          const c = byId.get(id)!;
          return (
            <PhysicsCard
              key={id}
              slot={slots.get(id)!}
              w={w}
              h={h}
              seed={hash(id)}
              label={c.label}
              front={c.front}
              back={c.back}
              faceDown={c.faceDown}
              locked={c.locked}
              holo={c.holo}
              idle={idle}
              hidden={hiddenId === id}
              draggable={draggable}
              deal={deal ? { from: { x: (mode === "row" ? rowWidth : width) / 2 - w / 2, y: height + 160 }, delay: 80 + i * 70 } : null}
              container={box}
              register={(el) => {
                if (el) els.current.set(id, el);
                else els.current.delete(id);
                register?.(id, el);
              }}
              onActivate={(el) => onActivate?.(id, el)}
              onLockedTap={() => onLockedTap?.(id)}
              onHover={(on) => setHover((cur) => (on ? id : cur === id ? null : cur))}
              onDragStart={() => {
                setDragging(id);
                setHover(null);
                setDragOrder(ids);
              }}
              onDragMove={(p) => {
                const cur = (dragOrder ?? ids).filter((x) => x !== id);
                const to = nearest(p);
                const next = [...cur.slice(0, to), id, ...cur.slice(to)];
                if (next.join() !== (dragOrder ?? ids).join()) setDragOrder(next);
              }}
              onDragEnd={(p) => {
                const final = dragOrder ?? ids;
                setDragging(null);
                setDragOrder(null);
                if (onPlay && p.y < -10) {
                  const el = els.current.get(id);
                  if (el) onPlay(id, el);
                }
                if (final.join() !== cards.map((x) => x.id).join()) onReorder?.(final);
              }}
            />
          );
        })}
      {(width > 0 || mode === "row") && after && mode !== "fan" && (
        <div className="absolute left-0 top-0" style={{ width: w, height: h, transform: `translate(${gridPos(n).x}px, ${gridPos(n).y}px)`, transition: "transform 0.45s var(--ease-spring)" }}>
          {after}
        </div>
      )}
      {dragging && onPlay && (
        <div className="pointer-events-none absolute inset-x-0 -top-14 flex justify-center">
          <span className="fade rounded-full bg-ink px-3 py-1 text-[12px] text-white">Drag up to play this card</span>
        </div>
      )}
    </div>
  );
}
