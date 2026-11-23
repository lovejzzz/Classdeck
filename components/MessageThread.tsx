"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "@/lib/toast";
import { Avatar, Icon } from "./Icon";

/** One message, from the reader's side. */
export type ThreadMessage = { id: string; text: string; at: number; mine: boolean; read: boolean };
/** A conversation: in a course, the reader (`me`: "teacher" or their student id) and the other side (`with`). */
export type ConversationRef = { course: string; me: string; with: string; name: string; subtitle?: string };

/** A side panel on the right, over the page. */
function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/20" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-label={label} className="flex h-full w-full max-w-md flex-col bg-white shadow-[-20px_0_60px_-30px_rgba(20,20,18,0.5)]" style={{ animation: "panel-in 0.3s var(--ease-out) both" }}>
        {children}
      </section>
    </div>,
    document.body,
  );
}

const day = (at: number) => new Date(at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const time = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * One conversation: messages oldest first, and a box to write the next one. It loads from the inbox, checks for new
 * messages while open, and marks the other side's messages read. `onBack` (from the inbox) shows a back arrow.
 */
export function Conversation({ c, onClose, onBack, onChanged }: { c: ConversationRef; onClose: () => void; onBack?: () => void; onChanged?: () => void }) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const q = `course=${encodeURIComponent(c.course)}&me=${encodeURIComponent(c.me)}&with=${encodeURIComponent(c.with)}`;
  const post = (body: object) => fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course: c.course, me: c.me, with: c.with, ...body }) }).then((r) => r.json()).catch(() => ({ ok: false }));
  const load = useCallback(async () => {
    const r = await fetch(`/api/inbox?${q}`).then((x) => x.json()).catch(() => null);
    if (!r?.messages) return;
    setMessages(r.messages);
    // Read now: the other side's unread ones.
    if (r.messages.some((m: ThreadMessage) => !m.mine && !m.read)) { await post({ action: "read" }); onChanged?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages?.length]);
  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await post({ action: "send", text: t });
    if (r.ok) { setText(""); await load(); onChanged?.(); } else toast(r.error ?? "Couldn’t send it", { icon: "x", tone: "bad" });
    setBusy(false);
  }
  const toTeacher = c.with === "teacher", asTeacher = c.me === "teacher";
  return (
    <Drawer label={`Messages: ${c.name}`} onClose={onClose}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        {onBack && <button onClick={onBack} aria-label="Back to your inbox" className="btn btn-quiet press -ml-1 h-9 w-9 justify-center px-0"><Icon name="back" size={16} /></button>}
        <Avatar name={c.name} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold">{c.name}</span>
          {c.subtitle && <span className="block truncate text-[12px] text-ink-3">{c.subtitle}</span>}
        </span>
        <button onClick={onClose} aria-label="Close messages" className="btn btn-quiet press h-9 w-9 justify-center px-0"><Icon name="x" size={16} /></button>
      </header>
      <div ref={list} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages && !messages.length && (
          <p className="mt-10 text-center text-[13px] text-ink-3">
            {asTeacher ? "No messages yet. Only this student sees what you write here." : toTeacher ? "No messages yet. Write to your teacher here; only they see it." : `No messages yet. Only ${c.name} sees what you write here.`}
          </p>
        )}
        {(messages ?? []).map((n, i, all) => (
          <div key={n.id}>
            {(i === 0 || day(all[i - 1].at) !== day(n.at)) && <div className="my-2 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{day(n.at)}</div>}
            <div className={`flex ${n.mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13.5px] leading-snug ${n.mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-lane text-ink"}`}>
                {n.text}
                <span className={`mt-0.5 block text-right text-[10.5px] ${n.mine ? "text-white/60" : "text-ink-3"}`}>{time(n.at)}{n.mine && n.read ? " · Read" : ""}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2 border-t border-line p-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a message…" aria-label="Message"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
          className="field min-h-[2.75rem] flex-1 resize-none py-2" />
        <button disabled={busy || !text.trim()} className="btn btn-dark press h-10 px-4 disabled:opacity-50">Send</button>
      </form>
    </Drawer>
  );
}

type Thread = { key: string; course: string; courseTitle: string; me: string; with: string; name: string; role: "teacher" | "student"; last?: ThreadMessage; unread: number };
type Contact = { course: string; courseTitle: string; me: string; with: string; name: string; role: "teacher" | "student" };
export type InboxData = { threads: Thread[]; contacts: Contact[]; unread: number };

/**
 * The inbox (from the account menu): every conversation, newest first, across all your courses, as a teacher and as
 * a student. New message picks someone: your students, your teacher, or (if the teacher allows it) a classmate.
 */
export function Inbox({ data, onClose, onChanged }: { data: InboxData | null; onClose: () => void; onChanged: () => void }) {
  const [open, setOpen] = useState<ConversationRef | null>(null);
  const [picking, setPicking] = useState(false);
  const [find, setFind] = useState("");
  const [now] = useState(() => Date.now());
  const ref = (x: Contact | Thread): ConversationRef => ({ course: x.course, me: x.me, with: x.with, name: x.name, subtitle: `${x.role === "teacher" ? "Teacher" : x.me === "teacher" ? "Your student" : "Classmate"} · ${x.courseTitle}` });
  if (open) return <Conversation c={open} onClose={onClose} onBack={() => { setOpen(null); onChanged(); }} onChanged={onChanged} />;
  const contacts = (data?.contacts ?? []).filter((x) => !find.trim() || `${x.name} ${x.courseTitle}`.toLowerCase().includes(find.trim().toLowerCase()));
  return (
    <Drawer label="Inbox" onClose={onClose}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        {picking && <button onClick={() => setPicking(false)} aria-label="Back to your inbox" className="btn btn-quiet press -ml-1 h-9 w-9 justify-center px-0"><Icon name="back" size={16} /></button>}
        <span className="flex-1 text-[15px] font-semibold">{picking ? "New message" : "Inbox"}</span>
        {!picking && (data?.contacts.length ?? 0) > 0 && <button onClick={() => setPicking(true)} className="btn btn-dark press h-8 px-3 text-[12.5px]"><Icon name="plus" size={12} /> New message</button>}
        <button onClick={onClose} aria-label="Close inbox" className="btn btn-quiet press h-9 w-9 justify-center px-0"><Icon name="x" size={16} /></button>
      </header>
      {picking ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="p-3"><input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find someone…" aria-label="Find someone" className="field h-9" /></div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {contacts.length ? contacts.map((x) => (
              <button key={`${x.course}:${x.me}:${x.with}`} onClick={() => { setPicking(false); setOpen(ref(x)); }} className="press flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-lane">
                <Avatar name={x.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{x.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">{x.role === "teacher" ? "Teacher" : x.me === "teacher" ? "Your student" : "Classmate"} · {x.courseTitle}</span>
                </span>
              </button>
            )) : <p className="px-2 py-3 text-[13px] text-ink-3">No one to message here.</p>}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {!data && <p className="px-2 py-3 text-[13px] text-ink-3">Loading…</p>}
          {data && !data.threads.length && <p className="mt-10 px-6 text-center text-[13px] text-ink-3">No messages yet. Press New message to write to {data.contacts.some((x) => x.me === "teacher") ? "a student" : "your teacher"}.</p>}
          {data?.threads.map((t) => (
            <button key={t.key} onClick={() => setOpen(ref(t))} className="press flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-lane">
              <Avatar name={t.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={`truncate text-[13.5px] ${t.unread ? "font-semibold" : "font-medium"}`}>{t.name}</span>
                  <span className="truncate text-[11.5px] text-ink-3">{t.courseTitle}</span>
                  <span className="ml-auto flex-none text-[11px] text-ink-3">{t.last ? (now - t.last.at < 86400_000 ? time(t.last.at) : day(t.last.at)) : ""}</span>
                </span>
                <span className={`mt-0.5 flex items-center gap-2 text-[12.5px] ${t.unread ? "text-ink" : "text-ink-3"}`}>
                  <span className="min-w-0 flex-1 truncate">{t.last?.mine ? "You: " : ""}{t.last?.text}</span>
                  {t.unread > 0 && <span className="mono flex-none rounded-full bg-[#4b56a8] px-1.5 text-[10.5px] text-white">{t.unread}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Drawer>
  );
}
