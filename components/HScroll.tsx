"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A horizontal scroller with round previous/next buttons that appear only when there is
 * more to see in that direction (and only for mouse users; touch users swipe).
 */
export function HScroll({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [can, setCan] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCan({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update]);

  const go = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.75, behavior: "smooth" });
  const btn = "press absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white/95 text-ink shadow-[0_6px_18px_-8px_rgba(20,20,18,0.35)] transition-opacity duration-300 hover:bg-white [@media(hover:hover)]:flex";

  return (
    <div className={`group/hs relative ${className}`} style={style}>
      <div ref={ref} className="no-scrollbar fade-x overflow-x-auto overflow-y-hidden">{children}</div>
      <button onClick={() => go(-1)} aria-label="Scroll left" tabIndex={-1} className={`${btn} left-3 ${can.left ? "opacity-0 group-hover/hs:opacity-100" : "pointer-events-none opacity-0"}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <button onClick={() => go(1)} aria-label="Scroll right" tabIndex={-1} className={`${btn} right-3 ${can.right ? "opacity-0 group-hover/hs:opacity-100" : "pointer-events-none opacity-0"}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </div>
  );
}
