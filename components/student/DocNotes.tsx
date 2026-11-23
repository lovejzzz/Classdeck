"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { DocNote } from "@/lib/types";
import { Icon } from "../Icon";

const when = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The teacher's comments on a student's writing (each on a passage, quoted), with the replies under each. Both sides
 * reply; the teacher can also remove a comment. Nothing shows for a student until there's a comment.
 */
export function DocNotes({ notes, me, courseId, studentId, moduleId, onChanged, names = {} }: {
  /** Students' names, for replies on a group's worksheet. */
  names?: Record<string, string>;
  notes: DocNote[];
  me: "teacher" | "student";
  courseId: string;
  studentId: string;
  moduleId: string;
  onChanged: () => void | Promise<unknown>;
}) {
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const top = notes.filter((n) => !n.replyTo).sort((a, b) => a.at - b.at);
  if (!top.length) return null;
  async function reply(to: string) {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await op<{ ok?: boolean; error?: string }>(courseId, { op: me === "teacher" ? "docNote" : "docReply", studentId, moduleId, replyTo: to, text: t });
    setBusy(false);
    if (r.ok === false) return toast(r.error ?? "Couldn’t send it", { icon: "x", tone: "bad" });
    setText("");
    setReplying(null);
    await onChanged();
  }
  return (
    <div className="mt-4 space-y-2.5">
      <div className="eyebrow">{me === "teacher" ? "Your comments" : "Comments from your teacher"}</div>
      {top.map((n) => {
        const replies = notes.filter((x) => x.replyTo === n.id).sort((a, b) => a.at - b.at);
        return (
          <div key={n.id} className="rounded-xl border border-[#f0cf62]/60 bg-[#fffbea] px-3.5 py-2.5 text-[13.5px]">
            {n.quote && <p className="mb-1.5 border-l-2 border-[#e6b800] pl-2.5 text-[12.5px] italic text-ink-2">“{n.quote.length > 160 ? `${n.quote.slice(0, 160)}…` : n.quote}”</p>}
            <div className="flex items-start gap-2">
              <p className="flex-1 whitespace-pre-wrap leading-snug">{n.text}</p>
              {me === "teacher" && (
                <button onClick={async () => { await op(courseId, { op: "docNoteDelete", studentId, moduleId, noteId: n.id }); await onChanged(); }} aria-label="Remove this comment" title="Remove"
                  className="press -mr-1 flex h-6 w-6 flex-none items-center justify-center rounded-md text-ink-3 hover:bg-white hover:text-bad"><Icon name="x" size={11} /></button>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-ink-3">{me === "teacher" ? "You" : "Your teacher"} · {when(n.at)}</p>
            {replies.map((r) => (
              <div key={r.id} className="mt-2 border-t border-[#f0cf62]/50 pt-2">
                <p className="whitespace-pre-wrap leading-snug">{r.text}</p>
                <p className="mt-0.5 text-[11px] text-ink-3">{r.by === "teacher" ? (me === "teacher" ? "You" : "Your teacher") : me === "student" && (!r.from || r.from === studentId) ? "You" : (r.from && names[r.from]) || "The student"} · {when(r.at)}</p>
              </div>
            ))}
            {replying === n.id ? (
              <form onSubmit={(e) => { e.preventDefault(); void reply(n.id); }} className="mt-2 flex items-end gap-2">
                <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Reply…" aria-label="Reply"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void reply(n.id); } if (e.key === "Escape") { e.stopPropagation(); setReplying(null); } }}
                  className="field min-h-[2.5rem] flex-1 resize-none bg-white py-1.5 text-[13px]" />
                <button disabled={busy || !text.trim()} className="btn btn-dark press h-9 px-3 text-[12.5px] disabled:opacity-50">Reply</button>
              </form>
            ) : (
              <button onClick={() => { setReplying(n.id); setText(""); }} className="mt-1.5 text-[12px] font-medium text-[#4b56a8] hover:text-ink">Reply</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
