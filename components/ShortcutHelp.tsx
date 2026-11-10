"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { displayKeys, useShortcuts, type Shortcut } from "@/lib/shortcuts";
import { Icon } from "./Icon";

/** "?" opens a sheet listing this page's shortcuts. Also registers them. */
export function Shortcuts({ list, extra = [] }: { list: Shortcut[]; extra?: { keys: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  useShortcuts([
    { keys: "?", label: "Show shortcuts", run: () => setOpen((o) => !o) },
    { keys: "escape", label: "Close", run: () => setOpen(false), enabled: open },
    ...list.map((s) => ({ ...s, enabled: s.enabled !== false && !open })),
  ]);
  const rows = [...list.filter((s) => s.enabled !== false), ...extra, { keys: "?", label: "Show this list" }];
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" className="btn btn-quiet press hidden h-8 w-8 justify-center px-0 sm:inline-flex">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>
      </button>
      {open && createPortal(
        <div className="fade fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(24,24,22,0.25)] p-4 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div className="pop w-full max-w-sm rounded-2xl border border-line bg-white p-5 shadow-[0_30px_80px_-24px_rgba(20,20,18,0.45)]" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center">
              <h2 className="flex-1 text-[15px] font-medium">Keyboard shortcuts</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={15} /></button>
            </div>
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.keys + r.label} className="flex items-center justify-between py-2 text-[13.5px]">
                  <span className="text-ink-2">{r.label}</span>
                  <span className="flex gap-1">{displayKeys(r.keys).map((k, i) => <kbd key={i} className="min-w-6 rounded-md border border-line bg-[#fafaf9] px-1.5 py-0.5 text-center font-mono text-[12px] shadow-[0_1px_0_#e6e6e3]">{k}</kbd>)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
