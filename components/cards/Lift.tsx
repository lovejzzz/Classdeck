"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFocusTrap } from "@/lib/a11y";
import { clamp, lerp, onFrame, reducedMotion, Spring } from "@/lib/spring";
import { quietly } from "@/lib/media";

// Opening: quick, with the faintest settle. Closing: no overshoot, so it lands in its slot and stays there.
const OPEN = { k: 300, c: 2 * 0.86 * Math.sqrt(300) };
const CLOSE = { k: 360, c: 2 * Math.sqrt(360) };
/** How far through the opening the card's copy is gone, and the panel's content has come in. */
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Grows a panel out of a card's rectangle, and shrinks it back into wherever the card should land when it closes (its
 * slot, or the done pile). The panel is never stretched: it scales evenly and its outline is a clip that goes from the
 * card's rectangle to the panel's, so text keeps its shape and corners stay round all the way.
 */
export function Lift({
  from, open, landing, onGone, children, label, onBackdrop, z = 40, wide = "max-w-5xl", source,
}: {
  /** The card it opens from: a copy of it rides along and fades into the panel (and back out on close), so the card
   *  turns into the panel instead of a blank sheet growing out of it. */
  source?: HTMLElement | null;
  /** Stacking order (above an editor panel, say). */
  z?: number;
  /** The panel's widest. */
  wide?: string;
  from: DOMRect;
  open: boolean;
  /** Where to land on close. Called at close time so it reflects the latest layout. */
  landing: () => DOMRect | null;
  onGone: () => void;
  children: React.ReactNode;
  label: string;
  onBackdrop: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const ghostBox = useRef<HTMLDivElement>(null);
  // The white sheet with the shadow (behind the panel), and its hairline edge (in front): the clip on the panel would
  // cut both off, so they're drawn on their own at the same rectangle.
  const sheet = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  // The card's own corner, which the outline starts from.
  const cardRadius = useRef(14);
  // A still copy of the card, made once as it opens.
  useLayoutEffect(() => {
    const box = ghostBox.current;
    if (!box || !source) return;
    cardRadius.current = parseFloat(getComputedStyle(source).borderTopLeftRadius) || 14;
    const copy = source.cloneNode(true) as HTMLElement;
    copy.removeAttribute("id");
    copy.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id"));
    copy.style.cssText += ";position:absolute;inset:0;width:100%;height:100%;margin:0;transform:none;transition:none;animation:none;opacity:1;visibility:visible";
    box.appendChild(copy);
    return () => { copy.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const spring = useRef(new Spring(0, OPEN.k, OPEN.c));
  const target = useRef(from);
  const gone = useRef(false);
  // Open and settled: nothing moves, so nothing is measured or written until it closes.
  const still = useRef(false);
  // Centred as it opens; once nearly open its top stays put, so content that arrives later (a worksheet's copy, a
  // picture) makes it longer downwards instead of moving the whole panel up and down.
  const pinned = useRef(false);
  useFocusTrap(panel, open);

  /** Where the panel rests on screen (its layout box, without our transform). Read from layout every frame, so content
   *  that arrives while it opens (and moves it, until its top is pinned) is followed; it never forces a reflow. */
  function restOf(el: HTMLElement) {
    const box = el.parentElement;
    return { left: el.offsetLeft - (box?.scrollLeft ?? 0), top: el.offsetTop - (box?.scrollTop ?? 0), width: el.offsetWidth || 1 };
  }

  /** Draw the in-between state: p = 0 is the card, 1 the open panel. */
  // Where the panel is drawn as resting: it follows the layout, eased (content arriving while it opens can re-centre it
  // by tens of pixels, which would otherwise show as a jump).
  const shown = useRef<{ left: number; top: number } | null>(null);
  function draw(p: number, dt = 0) {
    const el = panel.current;
    if (!el) return;
    const P = restOf(el);
    const e = shown.current ?? (shown.current = { left: P.left, top: P.top });
    const a = dt ? 1 - Math.exp(-dt / 0.08) : 0;
    e.left += (P.left - e.left) * a; e.top += (P.top - e.top) * a;
    const ph = el.offsetHeight || 1;
    const C = target.current;
    const q = clamp(p, 0, 1.04);
    // The rectangle on screen right now, between the card's and the panel's.
    const w = lerp(C.width, P.width, q), h = lerp(C.height, ph, q);
    const left = lerp(C.left, e.left, q), top = lerp(C.top, e.top, q);
    // Even scale that covers that rectangle; the clip trims the rest from the right and the bottom, so the panel's top
    // left (its kind, title and first lines, where reading starts) is what shows first.
    const s = Math.max(w / P.width, h / ph);
    const ir = Math.max(0, P.width - w / s), ib = Math.max(0, ph - h / s);
    const r = lerp(cardRadius.current, 22, clamp(q, 0, 1));
    el.style.transformOrigin = "0 0";
    el.style.transform = `translate3d(${left - P.left}px, ${top - P.top}px, 0) scale(${s})`;
    el.style.clipPath = `inset(0px ${ir}px ${ib}px 0px round ${r / s}px)`;
    el.style.borderRadius = `${r / s}px`;
    // With the card's copy riding along, the sheet comes in under it as it goes: the card's own box can be bigger than
    // the card (a hand's stack of cards behind it), and a bare white box that size would show round the copy.
    const solid = String(source ? smooth(0.02, 0.3, p) : 1);
    el.style.opacity = solid;
    for (const b of [sheet.current, edge.current]) {
      if (!b) continue;
      b.style.display = "block";
      b.style.opacity = solid;
      b.style.width = `${w}px`;
      b.style.height = `${h}px`;
      b.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      b.style.borderRadius = `${r}px`;
    }
    // The card's copy, kept to its own shape, sits in the middle of the rectangle and fades as the panel comes in.
    const g = ghostBox.current;
    if (g && source) {
      const k = Math.min(w / from.width, h / from.height);
      g.style.transform = `translate3d(${left + w / 2 - (from.left + from.width / 2)}px, ${top + h / 2 - (from.top + from.height / 2)}px, 0) scale(${k})`;
      g.style.opacity = String(1 - smooth(0.12, 0.46, p));
    }
    if (content.current) content.current.style.opacity = String(smooth(source ? 0.14 : 0.3, source ? 0.5 : 0.7, p));
    if (scrim.current) scrim.current.style.opacity = String(smooth(0, 0.85, p));
  }

  /** Settled open: the panel as itself, with its own shadow and edge; the stand-ins go. */
  function rested() {
    const el = panel.current;
    if (el) { el.style.transform = "none"; el.style.clipPath = "none"; el.style.borderRadius = "22px"; el.style.opacity = "1"; }
    for (const b of [sheet.current, edge.current]) if (b) b.style.display = "none";
    if (ghostBox.current) ghostBox.current.style.opacity = "0";
    if (content.current) content.current.style.opacity = "1";
    if (scrim.current) scrim.current.style.opacity = "1";
  }

  useLayoutEffect(() => {
    document.body.style.overflow = "hidden";
    // Drawn as the card before the first frame, so nothing flashes at full size.
    draw(0);
    return () => {
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBackdrop();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBackdrop]);

  useEffect(() => {
    const s = spring.current;
    // A video or sound playing in it fades out as it closes (stopped at once, it pops).
    if (!open) { quietly(panel.current); target.current = landing() ?? from; }
    Object.assign(s, open ? OPEN : CLOSE);
    s.target = open ? 1 : 0;
    if (reducedMotion()) s.snap(open ? 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    still.current = false;
    let lastT = -1;
    return onFrame((dt, t) => {
      if (still.current) return;
      const s = spring.current;
      s.step(dt);
      // The clock steps twice a frame; draw once, on the second.
      if (t !== lastT) { lastT = t; return; }
      if (open && !pinned.current && s.x > 0.9 && panel.current) {
        const el = panel.current, box = el.parentElement;
        const pad = box ? parseFloat(getComputedStyle(box).paddingTop) || 0 : 0;
        el.style.marginTop = `${Math.max(0, el.offsetTop - pad)}px`;
        el.style.marginBottom = "0px";
        pinned.current = true;
      }
      // Settled open: land exactly on it, and stop drawing (a spring only ever gets closer, and the last frames would be
      // redrawn for nothing, for as long as the card is open).
      const caught = !panel.current || !shown.current || Math.abs(restOf(panel.current).top - shown.current.top) < 0.5;
      if (open && caught && Math.abs(s.v) < 0.05 && Math.abs(s.x - 1) < 0.0015) {
        s.snap(1);
        rested();
        still.current = true;
        return;
      }
      draw(s.x, dt * 2);
      if (!open && s.x < 0.003 && !gone.current) {
        gone.current = true;
        onGone();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onGone]);

  return (
    <div className="fixed inset-0" style={{ zIndex: z }}>
      <div ref={scrim} className="absolute inset-0 bg-[rgba(24,24,22,0.28)] opacity-0 backdrop-blur-[3px]" onClick={onBackdrop} />
      <div ref={sheet} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 hidden bg-white shadow-[0_30px_80px_-24px_rgba(20,20,18,0.45)] will-change-transform" />
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-8">
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={`pointer-events-auto relative my-auto w-full ${wide} overflow-clip border border-line bg-white shadow-[0_30px_80px_-24px_rgba(20,20,18,0.45)] will-change-transform`}
          style={{ clipPath: "inset(50%)", borderRadius: 22 }}
        >
          <div ref={content} style={{ opacity: 0 }}>{children}</div>
        </div>
      </div>
      <div ref={edge} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 hidden border border-line will-change-transform" />
      {source && (
        <div ref={ghostBox} aria-hidden="true" className="pointer-events-none fixed z-10 origin-center will-change-transform"
          style={{ left: from.left, top: from.top, width: from.width, height: from.height }} />
      )}
    </div>
  );
}
