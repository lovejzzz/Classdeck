"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { faceMeta, unfinished } from "@/lib/kinds";
import { suitOfCard } from "@/lib/ui";
import type { Module } from "@/lib/types";

const W = 96, H = 126;

/**
 * A card group's cards as a hand, fanned like in a card game. Pointing at a card lifts it and nudges its neighbours
 * aside; clicking one raises it out of the hand (the panel under the hand edits it). The dashed card at the end adds
 * one. Arrow keys move between the cards.
 */
export function GroupHand({ cards, selected, onSelect, onAdd }: {
  cards: Module[];
  selected: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(416);
  const [hover, setHover] = useState<number | null>(null);
  // The hand opens out from a neat stack when it first shows.
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { const t = requestAnimationFrame(() => setOpen(true)); return () => cancelAnimationFrame(t); }, []);

  const n = cards.length + 1; // the add card is the last in the hand
  const mid = (n - 1) / 2;
  const step = n > 1 ? Math.min(88, (width - W - 24) / (n - 1)) : 0;
  const tilt = n > 1 ? Math.min(9, 34 / (n - 1)) : 0;
  const sel = cards.findIndex((c) => c.id === selected);

  return (
    <div ref={box} className="group-hand relative" style={{ height: H + 52 }} onPointerLeave={() => setHover(null)}
      role="listbox" aria-label="Cards in this group" aria-orientation="horizontal"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const i = Math.max(0, Math.min(cards.length - 1, (sel < 0 ? 0 : sel) + (e.key === "ArrowRight" ? 1 : -1)));
        onSelect(cards[i].id);
        (box.current?.querySelectorAll<HTMLElement>("[data-hand-card]")[i])?.focus();
      }}>
      {Array.from({ length: n }, (_, i) => {
        const add = i === n - 1;
        const c = cards[i];
        const d = i - mid;
        // Pointed at: lifted, straighter; its neighbours lean away. Picked: raised out of the hand, upright.
        const picked = !add && i === sel;
        const lifted = hover === i && !picked;
        const push = hover !== null && hover !== i ? Math.sign(i - hover) * 14 / (1 + Math.abs(i - hover) * 0.6) : 0;
        const x = open ? d * step + push : d * 2;
        const y = open ? (picked ? -26 : lifted ? -14 : Math.abs(d) * Math.abs(d) * 2.6) : 6;
        const r = open ? (picked ? 0 : lifted ? d * tilt * 0.45 : d * tilt) : d * 1.5;
        const s = picked ? 1.07 : lifted ? 1.04 : 1;
        const z = picked ? 50 : lifted ? 40 : 10 + i;
        const style = {
          width: W, height: H, left: `calc(50% - ${W / 2}px)`, bottom: 18, zIndex: z,
          transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`,
          transitionDelay: open ? "0ms" : `${i * 30}ms`,
        } as React.CSSProperties;
        if (add) {
          return (
            <button key="add" type="button" onClick={onAdd} onPointerEnter={() => setHover(i)} aria-label="Add a question to the group" title="Add a question"
              className="hand-card absolute flex flex-col items-center justify-center gap-1 rounded-[12px] border-[1.5px] border-dashed border-line-strong bg-white/60 text-[12px] text-ink-2 hover:border-ink-3 hover:text-ink" style={style}>
              <span className="text-[22px] leading-none">+</span>Add a question
            </button>
          );
        }
        const tint = suitOfCard(c).tint;
        const q = c.questions?.[0];
        const right = (k: number) => (q?.kind === "multi" ? !!q.answerSet?.includes(k) : q?.answer === k);
        const rows = q && q.kind !== "short" ? q.options.slice(0, 4) : [];
        const ok = !unfinished(c);
        return (
          <button key={c.id} type="button" data-hand-card role="option" aria-selected={picked} tabIndex={picked || (sel < 0 && i === 0) ? 0 : -1}
            onClick={() => onSelect(c.id)} onPointerEnter={() => setHover(i)} onFocus={() => setHover(null)}
            aria-label={`${i + 1}. ${c.title || "Untitled card"}${ok ? "" : ", not finished"}`}
            className={`hand-card absolute flex flex-col items-stretch justify-start overflow-hidden rounded-[12px] border bg-white text-left ${picked ? "hand-picked border-[#4b56a8]" : "border-line"}`} style={style}>
            <span className="block h-[4px] flex-none" style={{ background: tint }} />
            <span className="block truncate px-2 pt-1.5 text-[9.5px] font-medium" style={{ color: tint }}>{faceMeta(c).name}</span>
            <span className="line-clamp-2 block px-2 text-[11.5px] font-semibold leading-tight">{c.title || "Untitled card"}</span>
            <span className="mt-1.5 grid gap-[3px] px-2">
              {rows.length ? rows.map((_, k) => <span key={k} className={`block h-[10px] rounded-[3px] ${right(k) ? "bg-ok/25" : "bg-lane"}`} />)
                : [0, 1, 2].map((k) => <span key={k} className="block h-[5px] rounded-full bg-lane" style={{ width: `${[92, 78, 60][k]}%` }} />)}
            </span>
            <span className="absolute bottom-1.5 left-2 font-mono text-[10px] text-ink-3">{i + 1}</span>
            <span className={`absolute bottom-2 right-2 h-[7px] w-[7px] rounded-full ${ok ? "bg-ok" : "bg-warn"}`} title={ok ? "Ready" : "Not finished yet"} />
          </button>
        );
      })}
    </div>
  );
}
