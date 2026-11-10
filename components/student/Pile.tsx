"use client";

import { forwardRef } from "react";
import { CardBack, CardFace } from "../cards/CardFace";
import type { Module } from "@/lib/types";

/** The done pile: finished cards land here, stacked with a little scatter. */
export const Pile = forwardRef<HTMLButtonElement, { top?: Module; count: number; bump: number; onOpen: () => void; size: { w: number; h: number } }>(
  function Pile({ top, count, bump, onOpen, size }, ref) {
    const w = size.w * 0.68;
    const h = size.h * 0.68;
    return (
      <button
        ref={ref}
        onClick={onOpen}
        disabled={count === 0}
        className="group relative flex-none text-left disabled:cursor-default"
        style={{ width: w + 16, height: h + 46 }}
        aria-label={`Done pile, ${count} card${count === 1 ? "" : "s"}`}
      >
        <div className="relative" style={{ width: w, height: h }}>
          {count === 0 && <div className="hatch absolute inset-0 rounded-[12px]" />}
          {Array.from({ length: Math.min(Math.max(count - 1, 0), 3) }, (_, i) => (
            <div key={i} className="absolute inset-0 opacity-90" style={{ transform: `translate(${(i + 1) * 3}px, ${(i + 1) * 3}px) rotate(${(i % 2 ? 1 : -1) * (i + 1) * 2}deg)` }}>
              <CardBack />
            </div>
          ))}
          {top && (
            <div key={`${top.id}-${bump}`} className="pile-land absolute inset-0 transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[-2deg]">
              <div className="origin-top-left" style={{ width: size.w, height: size.h, transform: `scale(${w / size.w})` }}>
                <CardFace m={top} status="done" />
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-2">
          Done <span key={bump} className="pop font-mono text-ink">{count}</span>
        </div>
      </button>
    );
  },
);
