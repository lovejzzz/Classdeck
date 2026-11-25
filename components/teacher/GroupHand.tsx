"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { faceMeta, unfinished } from "@/lib/kinds";
import { suitOfCard } from "@/lib/ui";
import { reducedMotion } from "@/lib/spring";
import type { Module } from "@/lib/types";

const W = 96, H = 126;

/**
 * A card group's cards as a hand, fanned like in a card game. Pointing at a card lifts it and nudges its neighbours
 * aside; clicking one raises it out of the hand (the panel under the hand edits it). Drag a card along the hand to
 * put it somewhere else. Hold one and the cards jiggle, each with a button to delete it; Delete (or Backspace) on a
 * card deletes it too. The dashed card at the end adds one. Arrow keys move between the cards.
 */
export function GroupHand({ cards, selected, onSelect, onAdd, onReorder, onDelete, adding = false }: {
  cards: Module[];
  selected: string | null;
  onSelect: (id: string) => void;
  /** The dashed card at the end: what kind of card to add is picked under the hand (as + Card does on the map). */
  onAdd: () => void;
  onReorder?: (ids: string[]) => void;
  onDelete?: (id: string) => void;
  /** The add card is open (its picker shows). */
  adding?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(416);
  const [hover, setHover] = useState<number | null>(null);
  // The hand opens out from a neat stack when it first shows.
  const [open, setOpen] = useState(false);
  // A card being dragged along the hand: which, how far it's moved, and where it would go.
  const [drag, setDrag] = useState<{ id: string; dx: number; to: number } | null>(null);
  // Held: the cards jiggle, each with a button to delete it, until a click somewhere else.
  const [jiggle, setJiggle] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { const t = requestAnimationFrame(() => setOpen(true)); return () => cancelAnimationFrame(t); }, []);
  useEffect(() => {
    if (!jiggle) return;
    const off = (e: PointerEvent) => { if (!(e.target as HTMLElement | null)?.closest("[data-hand-card]")) setJiggle(false); };
    window.addEventListener("pointerdown", off, true);
    const els = [...(box.current?.querySelectorAll<HTMLElement>("[data-hand-face]") ?? [])];
    const runs = reducedMotion() ? [] : els.map((el, i) => el.animate([{ rotate: "-1.4deg" }, { rotate: "1.4deg" }], { duration: 240, iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: -(i % 4) * 60 }));
    return () => { window.removeEventListener("pointerdown", off, true); runs.forEach((a) => a.cancel()); };
  }, [jiggle, cards.length]);

  const n = cards.length + 1; // the add card is the last in the hand
  const mid = (n - 1) / 2;
  const step = n > 1 ? Math.min(88, (width - W - 24) / (n - 1)) : 0;
  // A gentle arc: the whole hand turns through only a few degrees, a little more as it holds more cards (at most 16°),
  // and the cards sit on a circle that turn implies, so each card's tilt and its drop match.
  const arc = n > 1 ? Math.min(4 + n * 1.6, 16) : 0;
  const tilt = n > 1 ? arc / (n - 1) : 0;
  const radius = tilt ? step / ((tilt * Math.PI) / 180) : 0;
  const onArc = (d: number) => {
    const t = (d * tilt * Math.PI) / 180;
    return radius ? { x: radius * Math.sin(t), y: radius * (1 - Math.cos(t)) } : { x: d * step, y: 0 };
  };
  // While a card is dragged, the others make room where it would go.
  const order = (() => {
    const ids = cards.map((c) => c.id);
    if (!drag) return ids;
    const rest = ids.filter((x) => x !== drag.id);
    rest.splice(drag.to, 0, drag.id);
    return rest;
  })();
  const shown = order.map((id) => cards.find((c) => c.id === id)!);
  const sel = shown.findIndex((c) => c.id === selected);

  /** Press a card: a click picks it, a drag moves it along the hand, holding still shows the delete buttons. */
  function press(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-hand-delete]")) return;
    const from = cards.findIndex((c) => c.id === id);
    const startX = e.clientX, startY = e.clientY;
    let moved = false, held = false, to = from;
    const hold = onDelete ? window.setTimeout(() => { held = true; setJiggle(true); navigator.vibrate?.(10); }, 520) : 0;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.hypot(dx, ev.clientY - startY) < 6) return;
      if (!moved && !onReorder) return;
      clearTimeout(hold);
      moved = true;
      // The place nearest where the card is now.
      const x = onArc(from - mid).x + dx;
      let best = 0, gap = Infinity;
      for (let k = 0; k < cards.length; k++) { const g = Math.abs(onArc(k - mid).x - x); if (g < gap) { gap = g; best = k; } }
      to = best;
      setDrag({ id, dx, to });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      clearTimeout(hold);
      setDrag(null);
      if (moved) {
        if (ev.type === "pointerup" && to !== from && onReorder) {
          const ids = cards.map((c) => c.id).filter((x) => x !== id);
          ids.splice(to, 0, id);
          onReorder(ids);
        }
        return;
      }
      if (!held && ev.type === "pointerup") onSelect(id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  return (
    <div ref={box} className={`group-hand relative select-none ${drag ? "cursor-grabbing" : ""}`} style={{ height: H + 52 }} onPointerLeave={() => setHover(null)}
      role="listbox" aria-label="Cards in this group" aria-orientation="horizontal"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-hand-card]") && (e.key === "Delete" || e.key === "Backspace") && onDelete) {
          const id = (e.target as HTMLElement).closest<HTMLElement>("[data-hand-card]")!.dataset.handCard!;
          e.preventDefault();
          onDelete(id);
          return;
        }
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        if (!cards.length) return;
        e.preventDefault();
        const i = Math.max(0, Math.min(cards.length - 1, (sel < 0 ? 0 : sel) + (e.key === "ArrowRight" ? 1 : -1)));
        onSelect(shown[i].id);
        (box.current?.querySelectorAll<HTMLElement>("[data-hand-card]")[i])?.focus();
      }}>
      {Array.from({ length: n }, (_, i) => {
        const add = i === n - 1;
        const c = shown[i];
        const d = i - mid;
        const dragged = !!drag && !add && c.id === drag.id;
        // Pointed at: lifted, straighter; its neighbours lean away. Picked: raised out of the hand, upright.
        const picked = !add && i === sel && !drag;
        const lifted = (hover === i && !picked && !drag) || dragged || (add && adding);
        const push = hover !== null && hover !== i && !drag ? Math.sign(i - hover) * 14 / (1 + Math.abs(i - hover) * 0.6) : 0;
        const at = onArc(d);
        // The dragged card follows the pointer from where it started.
        const x = dragged ? onArc(cards.findIndex((k) => k.id === drag!.id) - mid).x + drag!.dx : open ? at.x + push : d * 2;
        const y = open ? (picked ? -26 : lifted ? at.y - 14 : at.y) : 6;
        const r = dragged ? 0 : open ? (picked ? 0 : lifted ? d * tilt * 0.3 : d * tilt) : d * 1;
        const s = picked ? 1.07 : dragged ? 1.08 : lifted ? 1.04 : 1;
        const z = dragged ? 60 : picked ? 50 : lifted ? 40 : 10 + i;
        const style = {
          width: W, height: H, left: `calc(50% - ${W / 2}px)`, bottom: 18, zIndex: z,
          transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`,
          transitionDelay: open ? "0ms" : `${i * 30}ms`,
          ...(dragged ? { transitionDuration: "0s" } : {}),
        } as React.CSSProperties;
        if (add) {
          return (
            <button key="add" type="button" onClick={onAdd} onPointerEnter={() => !drag && setHover(i)} aria-label="Add a card to the group" aria-expanded={adding} title="Add a card"
              className={`hand-card absolute flex flex-col items-center justify-center gap-1 rounded-[12px] border-[1.5px] border-dashed bg-white/60 text-[12px] hover:border-ink-3 hover:text-ink ${adding ? "border-[#4b56a8] text-[#4b56a8]" : "border-line-strong text-ink-2"}`} style={style}>
              <span className="text-[22px] leading-none">+</span>Add a card
            </button>
          );
        }
        const tint = suitOfCard(c).tint;
        const q = c.questions?.[0];
        const right = (k: number) => (q?.kind === "multi" ? !!q.answerSet?.includes(k) : q?.answer === k);
        const rows = q && q.kind !== "short" ? q.options.slice(0, 4) : [];
        const ok = !unfinished(c);
        return (
          <div key={c.id} data-hand-card={c.id} role="option" aria-selected={i === sel} tabIndex={i === sel || (sel < 0 && i === 0) ? 0 : -1}
            onPointerDown={(e) => press(e, c.id)} onPointerEnter={() => !drag && setHover(i)} onFocus={() => setHover(null)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c.id); } }}
            aria-label={`${i + 1}. ${c.title || "Untitled card"}${ok ? "" : ", not finished"}`}
            className={`hand-card absolute cursor-pointer touch-none rounded-[12px] ${picked ? "hand-picked" : ""} ${dragged ? "cursor-grabbing" : ""}`} style={style}>
            <span data-hand-face className={`flex h-full w-full flex-col items-stretch justify-start overflow-hidden rounded-[12px] border bg-white text-left ${picked ? "border-[#4b56a8]" : "border-line"}`}>
              <span className="block h-[4px] flex-none" style={{ background: tint }} />
              <span className="block truncate px-2 pt-1.5 text-[9.5px] font-medium" style={{ color: tint }}>{faceMeta(c).name}</span>
              <span className="line-clamp-2 block px-2 text-[11.5px] font-semibold leading-tight">{c.title || "Untitled card"}</span>
              <span className="mt-1.5 grid gap-[3px] px-2">
                {rows.length ? rows.map((_, k) => <span key={k} className={`block h-[10px] rounded-[3px] ${right(k) ? "bg-ok/25" : "bg-lane"}`} />)
                  : [0, 1, 2].map((k) => <span key={k} className="block h-[5px] rounded-full bg-lane" style={{ width: `${[92, 78, 60][k]}%` }} />)}
              </span>
              <span className="absolute bottom-1.5 left-2 font-mono text-[10px] text-ink-3">{i + 1}</span>
              <span className={`absolute bottom-2 right-2 h-[7px] w-[7px] rounded-full ${ok ? "bg-ok" : "bg-warn"}`} title={ok ? "Ready" : "Not finished yet"} />
            </span>
            {jiggle && onDelete && cards.length > 0 && (
              <button type="button" data-hand-delete onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} aria-label={`Delete ${c.title || "this card"}`}
                className="pop absolute -left-2.5 -top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#6f6f6c] text-white shadow-md hover:bg-bad">
                <span className="block h-[2.5px] w-3 rounded-full bg-white" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
