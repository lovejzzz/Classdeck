"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { dismiss, serverSnapshot, snapshot, subscribe } from "@/lib/toast";
import { Icon } from "./Icon";

const H = 44;
const GAP = 8;

/** Toasts stacked at the bottom center; hovering fans them out and pauses dismissal. */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [hover, setHover] = useState(false);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const map = timers.current;
    if (hover) {
      map.forEach(clearTimeout);
      map.clear();
      return;
    }
    for (const t of toasts) {
      if (t.leaving || map.has(t.id)) continue;
      map.set(t.id, setTimeout(() => {
        map.delete(t.id);
        dismiss(t.id);
      }, t.action ? 6500 : 3200));
    }
  }, [toasts, hover]);

  const live = toasts.filter((t) => !t.leaving);
  const height = live.length === 0 ? 0 : hover ? live.length * (H + GAP) - GAP : H + Math.min(live.length - 1, 2) * 6;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4"
      aria-live="polite"
    >
      <div
        className="pointer-events-auto relative w-[22rem] max-w-full transition-[height] duration-400 ease-[var(--ease-out)]"
        style={{ height }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {toasts.map((t) => {
          const i = live.indexOf(t);
          const depth = Math.max(0, Math.min(i, 3));
          const y = t.leaving ? 12 : hover ? -i * (H + GAP) : -depth * 6;
          const scale = t.leaving ? 0.96 : hover ? 1 : 1 - depth * 0.05;
          const opacity = t.leaving || depth >= 3 ? 0 : hover ? 1 : 1 - depth * 0.15;
          return (
            <div
              key={t.id}
              className="toast-in absolute inset-x-0 bottom-0 origin-top transition-[transform,opacity] duration-400 ease-[var(--ease-out)]"
              style={{ height: H, transform: `translateY(${y}px) scale(${scale})`, opacity, zIndex: 100 - Math.max(i, 0) }}
            >
              <div className="flex h-full items-center gap-2.5 rounded-xl border border-line bg-white px-3.5 text-[13px] shadow-[0_10px_30px_-12px_rgba(20,20,18,0.28)]">
                <span className={t.tone === "ok" ? "text-ok" : t.tone === "bad" ? "text-bad" : "text-ink-2"}>
                  <Icon name={t.icon} size={15} strokeWidth={2} />
                </span>
                <span className={`flex-1 truncate transition-opacity duration-300 ${depth === 0 || hover ? "opacity-100" : "opacity-0"}`}>{t.text}</span>
                {t.action && (depth === 0 || hover) && (
                  <button onClick={() => { t.action!.run(); dismiss(t.id); }} className="press rounded-md px-2 py-1 text-[12.5px] font-medium text-ink hover:bg-lane">{t.action.label}</button>
                )}
                <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="press -mr-1 rounded p-1 text-ink-3 hover:text-ink">
                  <Icon name="x" size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
