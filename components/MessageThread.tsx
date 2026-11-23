"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Nudge } from "@/lib/types";
import { Avatar, Icon } from "./Icon";

/**
 * The conversation between the teacher and one student, as a panel on the right: messages oldest first (reminders
 * from the teacher included), and a box to write the next one. Opening it marks the other side's messages read.
 */
export function MessageThread({ me, title, subtitle, messages, onSend, onRead, onClose }: {
  /** Who is reading: their own messages sit on the right. */
  me: "teacher" | "student";
  title: string;
  subtitle?: string;
  messages: Nudge[];
  onSend: (text: string) => Promise<boolean>;
  onRead: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const sorted = [...messages].sort((a, b) => a.at - b.at);
  const mine = (n: Nudge) => (me === "student" ? n.from === "student" : !n.from);
  const unread = sorted.filter((n) => !mine(n) && !n.read).length;
  // Mark read once it's open (and again when new ones arrive while it's open).
  useEffect(() => { if (unread) onRead(); }, [unread]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [sorted.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    if (await onSend(t)) setText("");
    setBusy(false);
  }
  const day = (at: number) => new Date(at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/20" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-label={`Messages: ${title}`} className="flex h-full w-full max-w-md flex-col bg-white shadow-[-20px_0_60px_-30px_rgba(20,20,18,0.5)]" style={{ animation: "panel-in 0.3s var(--ease-out) both" }}>
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Avatar name={title} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-semibold">{title}</span>
            {subtitle && <span className="block truncate text-[12px] text-ink-3">{subtitle}</span>}
          </span>
          <button onClick={onClose} aria-label="Close messages" className="btn btn-quiet press h-9 w-9 justify-center px-0"><Icon name="x" size={16} /></button>
        </header>
        <div ref={list} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {!sorted.length && <p className="mt-10 text-center text-[13px] text-ink-3">{me === "teacher" ? "No messages yet. Only this student sees what you write here." : "No messages yet. Write to your teacher here; only they see it."}</p>}
          {sorted.map((n, i) => {
            const newDay = i === 0 || day(sorted[i - 1].at) !== day(n.at);
            const own = mine(n);
            return (
              <div key={n.id}>
                {newDay && <div className="my-2 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{day(n.at)}</div>}
                <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13.5px] leading-snug ${own ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-lane text-ink"}`}>
                    {n.text}
                    <span className={`mt-0.5 block text-right text-[10.5px] ${own ? "text-white/60" : "text-ink-3"}`}>{time(n.at)}{own && n.read ? " · Read" : ""}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2 border-t border-line p-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a message…" aria-label="Message"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
            className="field min-h-[2.75rem] flex-1 resize-none py-2" />
          <button disabled={busy || !text.trim()} className="btn btn-dark press h-10 px-4 disabled:opacity-50">Send</button>
        </form>
      </section>
    </div>,
    document.body,
  );
}
