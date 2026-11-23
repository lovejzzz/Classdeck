"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFocusTrap } from "@/lib/a11y";
import { clamp, lerp, onFrame, reducedMotion, Spring } from "@/lib/spring";

/**
 * Grows a panel out of a card's rectangle with a springy overshoot, and shrinks it back
 * into wherever the card should land when it closes (its slot, or the done pile).
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
  // A still copy of the card, made once as it opens.
  useLayoutEffect(() => {
    const box = ghostBox.current;
    if (!box || !source) return;
    const copy = source.cloneNode(true) as HTMLElement;
    copy.removeAttribute("id");
    copy.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id"));
    copy.style.cssText += ";position:absolute;inset:0;width:100%;height:100%;margin:0;transform:none;transition:none;animation:none;opacity:1;visibility:visible";
    box.appendChild(copy);
    return () => { copy.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const spring = useRef(new Spring(0, 170, 19));
  const target = useRef(from);
  const gone = useRef(false);
  useFocusTrap(panel, open);

  useLayoutEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBackdrop();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBackdrop]);

  useEffect(() => {
    if (!open) target.current = landing() ?? from;
    spring.current.target = open ? 1 : 0;
    if (reducedMotion()) spring.current.snap(open ? 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return onFrame((dt) => {
      const s = spring.current;
      s.step(dt);
      const el = panel.current;
      if (!el) return;
      // Measure the panel's resting box (without our transform) to map the card rect onto it.
      const prev = el.style.transform;
      el.style.transform = "none";
      const P = el.getBoundingClientRect();
      el.style.transform = prev;
      const C = target.current;
      const p = s.x;
      const inv = 1 - p;
      const sx = lerp(C.width / P.width, 1, p);
      const sy = lerp(C.height / P.height, 1, p);
      const dx = (C.left + C.width / 2 - (P.left + P.width / 2)) * inv;
      const dy = (C.top + C.height / 2 - (P.top + P.height / 2)) * inv;
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy}) rotate(${inv * -2}deg)`;
      el.style.borderRadius = `${lerp(14 / Math.min(sx, sy), 22, clamp(p, 0, 1))}px`;
      // With the card's copy riding along, the panel fades in under it as the copy fades out: no bare white sheet.
      const g = ghostBox.current;
      if (g && source) {
        const w = P.width * sx, h = P.height * sy;
        const cx = P.left + P.width / 2 + dx, cy = P.top + P.height / 2 + dy;
        const k = Math.min(w / from.width, h / from.height);
        g.style.transform = `translate3d(${cx - (from.left + from.width / 2)}px, ${cy - (from.top + from.height / 2)}px, 0) scale(${k}) rotate(${inv * -2}deg)`;
        g.style.opacity = String(clamp(1 - (p - 0.08) / 0.32, 0, 1));
        el.style.opacity = String(clamp(p / 0.28, 0, 1));
      }
      if (content.current) content.current.style.opacity = String(clamp((p - (source ? 0.3 : 0.45)) * 2.4, 0, 1));
      if (scrim.current) scrim.current.style.opacity = String(clamp(p, 0, 1));
      if (!open && p < 0.015 && Math.abs(s.v) < 0.5 && !gone.current) {
        gone.current = true;
        onGone();
      }
    });
  }, [open, onGone]);

  return (
    <div className="fixed inset-0" style={{ zIndex: z }}>
      <div ref={scrim} className="absolute inset-0 bg-[rgba(24,24,22,0.28)] opacity-0 backdrop-blur-[3px]" onClick={onBackdrop} />
      {source && (
        <div ref={ghostBox} aria-hidden="true" className="pointer-events-none fixed z-10 origin-center will-change-transform"
          style={{ left: from.left, top: from.top, width: from.width, height: from.height }} />
      )}
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-8">
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={`pointer-events-auto relative my-auto w-full ${wide} origin-center overflow-clip border border-line bg-white shadow-[0_30px_80px_-24px_rgba(20,20,18,0.45)] will-change-transform`}
          style={{ transform: "scale(0.2)", borderRadius: 22 }}
        >
          <div ref={content} style={{ opacity: 0 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
