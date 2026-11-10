"use client";

import { Icon } from "./Icon";

export interface WeekChip {
  id: string;
  label: string;
  done: number;
  total: number;
  current: boolean;
}

/** A sticky strip of weeks with progress; tapping one scrolls to that week's row. */
export function WeekNav({ weeks, onPick, className = "" }: { weeks: WeekChip[]; onPick: (id: string) => void; className?: string }) {
  return (
    <nav className={`sticky z-20 border-y border-line bg-canvas/85 backdrop-blur ${className}`} aria-label="Weeks">
      <div className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2">
        {weeks.map((w) => (
          <button
            key={w.id}
            onClick={() => onPick(w.id)}
            aria-current={w.current ? "step" : undefined}
            className={`press flex flex-none flex-col gap-1 rounded-lg px-3 py-1.5 text-left ${w.current ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-line" : "hover:bg-black/[0.03]"}`}
          >
            <span className={`flex items-center gap-1.5 text-[12px] ${w.current ? "font-medium text-ink" : "text-ink-2"}`}>
              {w.label}
              {w.total > 0 && w.done === w.total && <Icon name="check" size={11} strokeWidth={2.4} className="text-ok" />}
            </span>
            <span className="flex h-1 w-16 overflow-hidden rounded-full bg-line">
              <span className="h-full rounded-full bg-ok transition-[width] duration-700" style={{ width: `${w.total ? (w.done / w.total) * 100 : 0}%` }} />
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Scroll smoothly to a week's section, leaving room for sticky bars above it. */
export function scrollToWeek(id: string) {
  requestAnimationFrame(() => document.getElementById(`week-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}
