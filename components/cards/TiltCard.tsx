"use client";

import { forwardRef, useRef } from "react";

/** A single card that tilts toward the pointer and lifts on hover. Used outside the card table. */
export const TiltCard = forwardRef<HTMLDivElement, { w: number; h: number; children: React.ReactNode; onClick?: () => void; label: string; hidden?: boolean }>(
  function TiltCard({ w, h, children, onClick, label, hidden }, ref) {
    const inner = useRef<HTMLDivElement>(null);
    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={onClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick?.())}
        className="group relative cursor-pointer outline-none [perspective:900px]"
        style={{ width: w, height: h, visibility: hidden ? "hidden" : "visible" }}
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          if (inner.current) {
            inner.current.style.transform = `translateY(-10px) rotateX(${-y * 16}deg) rotateY(${x * 16}deg) scale(1.03)`;
            inner.current.style.setProperty("--mx", `${(x + 0.5) * 100}%`);
            inner.current.style.setProperty("--my", `${(y + 0.5) * 100}%`);
          }
        }}
        onPointerLeave={() => {
          if (inner.current) inner.current.style.transform = "";
        }}
      >
        <div className="pointer-events-none absolute inset-x-3 bottom-0 top-4 rounded-[14px] bg-[rgba(20,20,18,0.5)] blur-[14px] transition-opacity duration-300 group-hover:opacity-80" style={{ opacity: 0.35 }} />
        <div ref={inner} className="relative h-full w-full rounded-[14px] transition-transform duration-500 ease-[var(--ease-spring)] group-focus-visible:-translate-y-2.5 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-4">
          {children}
          <div className="card-sheen !opacity-0 group-hover:!opacity-100" />
        </div>
      </div>
    );
  },
);
