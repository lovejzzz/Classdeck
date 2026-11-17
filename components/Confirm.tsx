"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * A confirmation in the site's own style, in place of the browser's confirm() box.
 *   if (await ask({ title: "Delete this card?", body: "…", confirm: "Delete", danger: true })) { … }
 */
type Ask = { title: string; body?: string; confirm?: string; cancel?: string; danger?: boolean };
type Pending = Ask & { resolve: (ok: boolean) => void };

let current: Pending | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function ask(q: Ask): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...q, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  const c = current;
  current = null;
  emit();
  c?.resolve(ok);
}

/** Mounted once, in the root layout. */
export function ConfirmHost() {
  const q = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current, () => null);
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!q) return;
    yes.current?.focus();
    // Esc and Enter belong to this box while it's open, not to the page under it (an open editor, delete mode).
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); settle(false); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [q]);
  if (!q) return null;
  return createPortal(
    <div data-confirm className="fixed inset-0 z-[80] flex items-start justify-center bg-ink/25 p-4 pt-[18vh]" onMouseDown={(e) => e.target === e.currentTarget && settle(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="pop w-full max-w-sm rounded-2xl bg-white p-5 shadow-[0_30px_80px_-24px_rgba(20,20,18,0.45)]">
        <h2 id="confirm-title" className="text-[16px] font-medium leading-snug">{q.title}</h2>
        {q.body && <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{q.body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => settle(false)} className="btn btn-quiet press h-9">{q.cancel ?? "Cancel"}</button>
          <button ref={yes} onClick={() => settle(true)} className={`btn press h-9 px-4 text-white ${q.danger ? "bg-bad hover:bg-bad/90" : "btn-dark"}`}>{q.confirm ?? "OK"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
