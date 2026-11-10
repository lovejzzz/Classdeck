"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { reducedMotion } from "@/lib/spring";

/** A short burst of confetti from a point: the little reward for finishing a card. */
export function Burst({ x, y, colors, seed, onDone }: { x: number; y: number; colors: string[]; seed: number; onDone: () => void }) {
  const bits = useMemo(() => {
    // Seeded so the burst is stable across re-renders.
    const state = { v: seed % 2147483647 || 1 };
    const rand = () => {
      state.v = (state.v * 16807) % 2147483647;
      return state.v / 2147483647;
    };
    return Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2 + rand() * 0.4;
        const d = 60 + rand() * 70;
        return {
          dx: Math.cos(a) * d,
          dy: Math.sin(a) * d - 30,
          r: (rand() - 0.5) * 540,
          c: colors[i % colors.length],
          w: 5 + rand() * 5,
          h: 3 + rand() * 4,
          delay: rand() * 60,
        };
    });
  }, [colors, seed]);
  useEffect(() => {
    const t = setTimeout(onDone, reducedMotion() ? 0 : 900);
    return () => clearTimeout(t);
  }, [onDone]);
  if (reducedMotion()) return null;
  return createPortal(
    <div className="pointer-events-none fixed z-[60]" style={{ left: x, top: y }} aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          className="burst-bit absolute rounded-[2px]"
          style={{ width: b.w, height: b.h, background: b.c, "--dx": `${b.dx}px`, "--dy": `${b.dy}px`, "--r": `${b.r}deg`, animationDelay: `${b.delay}ms` } as React.CSSProperties}
        />
      ))}
    </div>,
    document.body,
  );
}
