"use client";

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/a11y";
import { createPortal } from "react-dom";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import { TYPE_META } from "@/lib/ui";
import type { Week } from "@/lib/types";
import { Icon } from "../Icon";

/**
 * Import weeks from a course plan document. Upload, look over the proposed weeks and cards,
 * untick anything you don't want, and add the rest after your current weeks.
 */
export function DocImport({ courseId, onDone, label = "Import from a document…" }: { courseId: string; onDone: () => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [weeks, setWeeks] = useState<Week[] | null>(null);
  const [method, setMethod] = useState<"ai" | "outline">("outline");
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  async function read(file: File) {
    setBusy(true);
    setError("");
    setWeeks(null);
    setName(file.name);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/course/${courseId}/import`, { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ ok: false, error: "Couldn’t reach the server" }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setWeeks(r.weeks);
    setMethod(r.method);
    setSkip(new Set());
  }

  async function add() {
    if (!weeks) return;
    const chosen = weeks.filter((w) => !skip.has(w.id));
    setBusy(true);
    for (const w of chosen) await op(courseId, { op: "insertWeek", week: w });
    setBusy(false);
    setOpen(false);
    setWeeks(null);
    onDone();
    toast(`Added ${chosen.length} week${chosen.length === 1 ? "" : "s"} from ${name}`, { icon: "upload" });
  }

  const cards = weeks?.filter((w) => !skip.has(w.id)).reduce((n, w) => n + w.lessons[0].modules.length, 0) ?? 0;

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-ghost press"><Icon name="file" size={13} /> {label}</button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 px-4 py-10 backdrop-blur-[2px]" onClick={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <div ref={box} className="pop w-full max-w-2xl rounded-2xl border border-line bg-white shadow-[0_30px_80px_-30px_rgba(20,20,18,0.5)]" role="dialog" aria-modal="true" aria-label="Import from a document">
            <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
              <Icon name="file" size={15} />
              <h2 className="flex-1 text-[14.5px] font-medium">Import weeks from a course plan</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="btn btn-quiet press h-8 w-8 justify-center px-0" autoFocus><Icon name="x" size={15} /></button>
            </div>
            <div className="p-5">
              <label className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center text-[13px] transition-colors ${busy ? "border-line" : "border-line-strong hover:border-ink"}`}>
                <Icon name="upload" size={18} className="text-ink-2" />
                <span className="font-medium">{busy && !weeks ? "Reading…" : name ? `Choose another file (now: ${name})` : "Choose a .docx, .md, or .txt file"}</span>
                <span className="text-ink-3">Headings like “Week 1: Topic” become weeks; sections and activity lists become cards.</span>
                <input type="file" accept=".docx,.md,.markdown,.txt" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f); }} />
              </label>
              {error && <p className="rise mt-3 text-[13px] text-bad" role="alert">{error}</p>}
              {weeks && (
                <div className="rise mt-5">
                  <p className="mb-2 text-[12.5px] text-ink-3">
                    {method === "ai" ? "Read by the AI." : "Read from the document’s headings."} {weeks.length} weeks found. Untick any you don’t want; you can edit every card after.
                  </p>
                  <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                    {weeks.map((w) => {
                      const l = w.lessons[0];
                      const on = !skip.has(w.id);
                      return (
                        <div key={w.id} className={`rounded-xl border p-3 transition-opacity ${on ? "border-line" : "border-line opacity-45"}`}>
                          <label className="flex cursor-pointer items-start gap-2.5">
                            <input type="checkbox" checked={on} onChange={() => setSkip((s) => { const n = new Set(s); if (on) n.add(w.id); else n.delete(w.id); return n; })} className="mt-1 accent-[#1b1b1a]" />
                            <span className="min-w-0 flex-1">
                              <span className="text-[13.5px] font-medium">{w.title} · {l.title}</span>
                              {l.goal && <span className="block truncate text-[12px] text-ink-3">{l.goal}</span>}
                            </span>
                            <span className="mono">{l.modules.length} cards</span>
                          </label>
                          <div className="mt-2 flex flex-wrap gap-1 pl-6">
                            {l.modules.map((m) => (
                              <span key={m.id} className="inline-flex items-center gap-1 rounded-md bg-lane px-1.5 py-0.5 text-[11.5px]" title={m.body.slice(0, 200)}>
                                <span style={{ color: TYPE_META[m.type].tint }}><Icon name={m.type} size={11} /></span>{m.title}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button onClick={add} disabled={busy || cards === 0} className="btn btn-dark press h-9 px-4">{busy ? "Adding…" : `Add ${weeks.length - skip.size} week${weeks.length - skip.size === 1 ? "" : "s"} (${cards} card${cards === 1 ? "" : "s"})`}</button>
                    <span className="text-[12px] text-ink-3">They go after your current weeks. Nothing is replaced.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
