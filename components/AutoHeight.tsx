"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Animates the box height smoothly as its content grows or shrinks. */
export function AutoHeight({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={`overflow-hidden transition-[height] duration-500 ease-[var(--ease-out)] ${className}`} style={{ height: h }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
