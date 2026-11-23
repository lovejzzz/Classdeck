"use client";

import { useRef, useState } from "react";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { DocNote } from "@/lib/types";
import { RichText } from "../RichText";
import { DocNotes } from "../student/DocNotes";
import { Icon } from "../Icon";

/**
 * A student's own copy of a Text card, as the teacher reviews it: formatted as they wrote it. Select any words and
 * press Comment to leave a comment on that passage; comments and the student's replies are listed under it.
 */
export function DocReview({ doc, notes, courseId, studentId, moduleId, onChanged, names }: {
  doc: string; notes: DocNote[]; courseId: string; studentId: string; moduleId: string; onChanged: () => void | Promise<unknown>; names?: Record<string, string>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<{ quote: string; x: number; y: number } | null>(null);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  function onSelect() {
    const sel = window.getSelection();
    const el = box.current;
    if (!sel || sel.isCollapsed || !el || !sel.rangeCount || !el.contains(sel.getRangeAt(0).commonAncestorContainer)) { if (!writing) setPick(null); return; }
    const quote = sel.toString().replace(/\s+/g, " ").trim();
    if (quote.length < 2) return;
    const r = sel.getRangeAt(0).getBoundingClientRect(), host = el.getBoundingClientRect();
    setPick({ quote, x: Math.min(Math.max(r.left - host.left + r.width / 2, 60), host.width - 60), y: r.top - host.top });
    setWriting(false);
  }
  async function save() {
    const t = text.trim();
    if (!t || !pick || busy) return;
    setBusy(true);
    const r = await op<{ ok?: boolean; error?: string }>(courseId, { op: "docNote", studentId, moduleId, quote: pick.quote, text: t });
    setBusy(false);
    if (r.ok === false) return toast(r.error ?? "Couldn’t save the comment", { icon: "x", tone: "bad" });
    setText(""); setPick(null); setWriting(false);
    window.getSelection()?.removeAllRanges();
    await onChanged();
  }
  return (
    <div className="mt-3">
      <div ref={box} onMouseUp={onSelect} onKeyUp={onSelect} className="relative rounded-lg bg-lane px-3.5 py-3">
        <RichText text={doc} marks={notes.filter((n) => n.quote).map((n) => n.quote!)} className="text-[13.5px] leading-relaxed" />
        {pick && (
          <div className="absolute z-10 -translate-x-1/2 -translate-y-full" style={{ left: pick.x, top: pick.y - 6 }} onMouseUp={(e) => e.stopPropagation()}>
            {writing ? (
              <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="pop w-72 rounded-xl border border-line bg-white p-2 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]">
                <p className="mb-1.5 truncate border-l-2 border-[#e6b800] pl-2 text-[12px] italic text-ink-2">“{pick.quote}”</p>
                <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Your comment on these words…" aria-label="Comment"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } if (e.key === "Escape") { e.stopPropagation(); setPick(null); setWriting(false); } }}
                  className="field resize-none py-1.5 text-[13px]" />
                <div className="mt-1.5 flex justify-end gap-1.5">
                  <button type="button" onClick={() => { setPick(null); setWriting(false); }} className="btn btn-quiet press h-8 px-2.5 text-[12.5px]">Cancel</button>
                  <button disabled={busy || !text.trim()} className="btn btn-dark press h-8 px-3 text-[12.5px] disabled:opacity-50">Comment</button>
                </div>
              </form>
            ) : (
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => setWriting(true)} className="btn btn-dark press h-8 px-3 text-[12.5px] shadow-md">
                <Icon name="message" size={12} /> Comment
              </button>
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-[11.5px] text-ink-3">Select any words to comment on them.</p>
      <DocNotes notes={notes} me="teacher" courseId={courseId} studentId={studentId} moduleId={moduleId} onChanged={onChanged} names={names} />
    </div>
  );
}
