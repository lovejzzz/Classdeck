"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CARD_SIZE } from "@/lib/cards";
import type { SavedCard } from "@/lib/store";
import { SUITS, type Suit } from "@/lib/ui";
import { kindMeta } from "@/lib/kinds";
import { Icon } from "../Icon";

/** The teacher's saved cards, shared by the editor's kind cards and every New card slot on the page. */
let library: SavedCard[] | null = null;
const listeners = new Set<(c: SavedCard[]) => void>();
export async function loadLibrary(force = false) {
  if (library && !force) return library;
  const r = await fetch("/api/library").then((x) => (x.ok ? x.json() : null)).catch(() => null);
  // A failed load (signed out, offline) isn't remembered, so the next look tries again.
  const cards = (r?.cards ?? []) as SavedCard[];
  library = r ? cards : null;
  listeners.forEach((f) => f(cards));
  return cards;
}
export function useLibrary(active = true) {
  const [cards, setCards] = useState<SavedCard[]>(library ?? []);
  useEffect(() => {
    listeners.add(setCards);
    if (active) loadLibrary();
    return () => { listeners.delete(setCards); };
  }, [active]);
  return cards;
}

/** What gets put down: a card of one suit (its kind is chosen in the editor), or a blank card. */
export type NewCardChoice = { kind: "suit"; suit: Suit } | { kind: "blank" };

type Slot = Suit | "blank";
const ORDER: Slot[] = ["content", "question", "blank"];
const FULL = CARD_SIZE.deck;

/** A suit card at any size: the suit's colour, the icons of its kinds, and its name. */
function SuitFace({ id, w, h }: { id: Slot; w: number; h: number }) {
  const k = w / FULL.w;
  if (id === "blank") {
    return (
      <span className="flex flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-line-strong bg-white text-ink-2" style={{ width: w, height: h }}>
        <Icon name="plus" size={Math.max(12, Math.round(24 * k))} />
        <span className="font-semibold" style={{ fontSize: Math.max(10, 18 * k) }}>Blank</span>
      </span>
    );
  }
  const s = SUITS.find((x) => x.id === id)!;
  return (
    <span className="relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-white" style={{ width: w, height: h }}>
      <span className="absolute inset-0" style={{ background: s.cover }} />
      <span className="pointer-events-none absolute inset-[5px] rounded-[10px] border border-white/70" />
      <span className="relative flex items-center gap-1.5 px-3 pt-2.5 font-semibold uppercase tracking-[0.12em]" style={{ color: s.tint, fontSize: 10.5 * k }}>
        <span className="rounded-full" style={{ background: s.tint, width: 6 * k, height: 6 * k }} />{s.name}
      </span>
      <span className="relative flex flex-1 flex-wrap content-center items-center justify-center px-4" style={{ color: s.tint, gap: 10 * k }}>
        {s.kinds.map((t) => <Icon key={t} name={kindMeta(t).icon} size={Math.round(19 * k)} />)}
      </span>
      <span className="relative px-3 text-center font-medium leading-snug" style={{ color: s.tint, fontSize: 11 * k, opacity: 0.85 }}>{s.rule}</span>
      <span className="relative pb-3 pt-1 text-center font-semibold tracking-tight" style={{ color: s.tint, fontSize: 26 * k }}>{s.name}</span>
    </span>
  );
}

const TILT = 0.15;

/**
 * Lay the four cards down a curve around the slot's side. Each card is measured as it is drawn (tilted), and the cards
 * are stacked top to bottom with the same gap between every pair of edges, so none overlap. Their sideways position
 * follows a circle, far enough out that every card clears the slot. Positions are relative to the curve's centre;
 * k is the card scale (1 = the deck's full card size).
 */
function arc(k: number, slotW: number) {
  const H = FULL.h * k, W = FULL.w * k, gap = 14 * k;
  const size = (i: number) => (ORDER[i] === "blank" ? { w: W / 2, h: H / 2 } : { w: W, h: H });
  // The box a card takes up when turned by deg.
  const box = (i: number, deg: number) => {
    const r = (deg * Math.PI) / 180, { w, h } = size(i);
    return { bw: Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r)), bh: Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r)) };
  };
  let degs = ORDER.map(() => 0), ys: number[] = [], R = 0;
  // Tilt depends on where a card sits and where it sits depends on its tilt, so settle the two over a few rounds.
  for (let round = 0; round < 4; round++) {
    const boxes = ORDER.map((_, i) => box(i, degs[i]));
    const total = boxes.reduce((t, b) => t + b.bh, 0) + gap * (ORDER.length - 1);
    let y = -total / 2;
    ys = boxes.map((b) => { const c = y + b.bh / 2; y += b.bh + gap; return c; });
    R = Math.max(...boxes.map((b, i) => Math.hypot(slotW / 2 + b.bw / 2 + 16, ys[i])));
    degs = ys.map((yy) => ((Math.asin(Math.max(-1, Math.min(1, yy / R))) * 180) / Math.PI) * TILT);
  }
  const pos = ORDER.map((_, i) => {
    const b = box(i, degs[i]);
    return { x: Math.sqrt(R * R - ys[i] * ys[i]), y: ys[i], deg: degs[i], ...size(i), bw: b.bw, bh: b.bh };
  });
  const top = Math.min(...pos.map((p) => p.y - p.bh / 2)), bottom = Math.max(...pos.map((p) => p.y + p.bh / 2));
  const reach = Math.max(...pos.map((p) => p.x + p.bw / 2));
  const near = Math.min(...pos.map((p) => p.x - p.bw / 2));
  return { pos, top, bottom, reach, near, R };
}

/**
 * The New card slot. Clicking it fans the two families, Content and Question (full-size cards), and a small blank card out in a half circle
 * around it. Picking one flies it into the slot at full size; the editor then opens to choose the kind.
 */
export function NewCardFan({ onChoose }: { onChoose: (c: NewCardChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [spread, setSpread] = useState(false);
  const [landing, setLanding] = useState<Slot | null>(null);
  const [view, setView] = useState({ ox: 0, oy: 0, tx: 0, ty: 0, dir: 1, k: 1, lay: arc(1, FULL.w) });
  const ref = useRef<HTMLDivElement>(null);
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  useLibrary(open);

  function show() {
    const b = ref.current!.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, m = 12;
    const tx = b.left + b.width / 2, ty = b.top + b.height / 2;
    // Full size if it fits; otherwise every card shrinks by the same amount.
    let k = 1, lay = arc(1, b.width), dir = 1, ox = tx, fit = false;
    for (; k >= 0.6; k -= 0.01) {
      lay = arc(k, b.width);
      if (lay.bottom - lay.top > vh - 2 * m) continue;
      if (tx + lay.reach <= vw - m) { dir = 1; fit = true; break; }
      if (tx - lay.reach >= m) { dir = -1; fit = true; break; }
    }
    if (!fit) {
      // A phone: no room beside the slot, so centre the curve on the screen instead (it may cover the slot).
      k = 1;
      for (; k >= 0.3; k -= 0.01) {
        lay = arc(k, 0);
        // Room for the tilt too: a turned card is wider than it stands.
        if (lay.bottom - lay.top <= vh - 2 * m && lay.reach - lay.near <= vw - 2 * m) break;
      }
      dir = 1;
      ox = vw / 2 - (lay.reach + lay.near) / 2;
    }
    const oy = Math.max(m - lay.top, Math.min(ty, vh - m - lay.bottom));
    clearTimeout(closing.current);
    setView({ ox, oy, tx, ty, dir, k, lay });
    setLanding(null);
    setOpen(true);
    setSpread(false);
    setTimeout(() => setSpread(true), 20);
  }
  function close() {
    setSpread(false);
    closing.current = setTimeout(() => setOpen(false), 200);
  }
  function pick(id: Slot) {
    if (landing) return;
    setLanding(id);
    // Let the card fly into the slot, then put it down for real.
    setTimeout(() => {
      setOpen(false);
      setSpread(false);
      setLanding(null);
      onChoose(id === "blank" ? { kind: "blank" } : { kind: "suit", suit: id });
    }, 380);
  }

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    const away = () => close();
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", away);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  const { ox, oy, tx, ty, dir, k, lay } = view;
  return (
    <div ref={ref} className="relative h-full w-full">
      <button
        onClick={() => (open ? close() : show())}
        className={`press flex h-full w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed text-[13px] transition-colors ${open ? "border-ink text-ink" : "border-line-strong text-ink-3 hover:border-ink-3 hover:text-ink-2"}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon name="plus" size={18} className={`transition-transform duration-300 ${open ? "rotate-45" : ""}`} />
        New card
      </button>
      {open && createPortal(
        <div role="dialog" aria-label="New card" data-scale={k.toFixed(2)} className="fixed inset-0 z-50">
          <button aria-label="Close" onClick={close} className={`absolute inset-0 cursor-default bg-ink/10 transition-opacity duration-200 ${spread && !landing ? "opacity-100" : "opacity-0"}`} />
          {ORDER.map((id, i) => {
            const p = lay.pos[i];
            const flying = landing === id;
            const gone = landing !== null && !flying;
            // Fanned out on the arc; the picked card flies into the slot and grows to the full card size.
            const x = flying || !spread ? tx - ox : dir * p.x;
            const y = flying || !spread ? ty - oy : p.y;
            const rot = flying || !spread ? 0 : dir * p.deg;
            const scale = flying ? FULL.w / p.w : spread ? 1 : 0.4;
            const delay = spread && !landing ? i * 50 : 0;
            const suit = SUITS.find((s) => s.id === id);
            return (
              <button
                key={id}
                onClick={() => pick(id)}
                aria-label={suit ? `${suit.name} card` : "Blank card"}
                title={suit ? suit.rule : "An empty card"}
                className={`group absolute rounded-[14px] outline-offset-2 focus-visible:outline-2 ${flying ? "z-10" : "hover:z-10"}`}
                style={{
                  left: ox - p.w / 2,
                  top: oy - p.h / 2,
                  width: p.w,
                  height: p.h,
                  transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`,
                  opacity: spread && !gone ? 1 : 0,
                  pointerEvents: gone ? "none" : undefined,
                  transition: `transform ${flying ? 360 : 440}ms cubic-bezier(.2,${flying ? 1 : 1.2},.4,1) ${delay}ms, opacity 200ms ease ${delay}ms`,
                }}
              >
                <span className={`block rounded-[14px] shadow-[0_14px_30px_-14px_rgba(20,20,18,0.5)] transition-transform duration-200 ${landing ? "" : "group-hover:-translate-y-1.5"}`}>
                  <SuitFace id={id} w={p.w} h={p.h} />
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
