"use client";

import { useRef } from "react";

/**
 * Wraps a text field and shows a small × on its right while it's focused and has text. Pressing it empties the field
 * the same way typing would (so the field's own onChange or onBlur saves it), and keeps the focus in the field.
 */
export function Clearable({ children, className = "", multiline = false, inline = false }: { children: React.ReactNode; className?: string; multiline?: boolean; inline?: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  function clear() {
    const el = box.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (!el || el.readOnly || el.disabled) return;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }
  return (
    <span ref={box} className={`group/clear relative ${inline ? "inline-block" : "block"} [&>input]:pr-7 [&>textarea]:pr-7 ${className}`}>
      {children}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Clear"
        // Keep the focus in the field: losing it would save early and hide this button.
        onMouseDown={(e) => e.preventDefault()}
        onClick={clear}
        className={`absolute right-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-lane text-ink-3 hover:bg-line hover:text-ink group-focus-within/clear:flex group-has-[:placeholder-shown]/clear:!hidden group-has-[[readonly]]/clear:!hidden ${multiline ? "top-2" : "top-1/2 -translate-y-1/2"}`}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </span>
  );
}
