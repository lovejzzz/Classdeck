"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { Avatar, Icon } from "./Icon";
import { TemplatePreview } from "./TemplatePreview";
import type { TemplateInfo } from "@/lib/mytemplates";

/** One message, from the reader's side: which course it was written in (if any), and a template it carries. */
export type ThreadMessage = { id: string; text: string; at: number; mine: boolean; read: boolean; course?: { id: string; title: string }; share?: TemplateInfo | null; added?: string | null; letter?: string };
/**
 * A conversation: with a person (`person`, their account), or, for someone without an account yet, one course
 * conversation (`course`, the reader `me`: "teacher" or their student id, and the other side `with`).
 */
export type ConversationRef = { person?: string; course?: string; me?: string; with?: string; name: string; subtitle?: string };

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
  return <Drawer label={`Messages: ${c.name}`} onClose={onClose}><ConversationBody c={c} onClose={onClose} onBack={onBack} onChanged={onChanged} /></Drawer>;
}

/** A conversation's header, messages and reply box, to sit in a drawer of its own or inside the Inbox. */
export function ConversationBody({ c, onClose, onBack, onChanged }: { c: ConversationRef; onClose?: () => void; onBack?: () => void; onChanged?: () => void }) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const q = c.person ? `person=${encodeURIComponent(c.person)}` : `course=${encodeURIComponent(c.course ?? "")}&me=${encodeURIComponent(c.me ?? "")}&with=${encodeURIComponent(c.with ?? "")}`;
  const who = c.person ? { person: c.person } : { course: c.course, me: c.me, with: c.with };
  const post = (body: object) => fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...who, ...body }) }).then((r) => r.json()).catch(() => ({ ok: false }));
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
  async function addTemplate(letter: string) {
    const r = await post({ action: "addTemplate", letter });
    if (r.ok) { toast(`Added “${r.name ?? "the template"}” to your templates`, { icon: "star" }); await load(); }
    else toast(r.error ?? "Couldn’t add it", { icon: "x", tone: "bad" });
  }
  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        {onBack && <button onClick={onBack} aria-label="Back to your inbox" className="btn btn-quiet press -ml-1 h-9 w-9 justify-center px-0"><Icon name="back" size={16} /></button>}
        <Avatar name={c.name} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold">{c.name}</span>
          {c.subtitle && <span className="block truncate text-[12px] text-ink-3">{c.subtitle}</span>}
        </span>
        {onClose && <button onClick={onClose} aria-label="Close messages" className="btn btn-quiet press h-9 w-9 justify-center px-0"><Icon name="x" size={16} /></button>}
      </header>
      <div ref={list} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages && !messages.length && (
          <p className="mt-10 text-center text-[13px] text-ink-3">
            {c.person ? `No messages yet. Only ${c.name} sees what you write here.` : asTeacher ? "No messages yet. Only this student sees what you write here." : toTeacher ? "No messages yet. Write to your teacher here; only they see it." : `No messages yet. Only ${c.name} sees what you write here.`}
          </p>
        )}
        {(messages ?? []).map((n, i, all) => (
          <div key={n.id}>
            {(i === 0 || day(all[i - 1].at) !== day(n.at)) && <div className="my-2 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{day(n.at)}</div>}
            {/* Written inside a course: which one (a thread with a person can hold several). */}
            {n.course && (i === 0 || all[i - 1].course?.id !== n.course.id) && <div className={`mb-1 flex ${n.mine ? "justify-end" : "justify-start"}`}><span className="rounded-full bg-[#f3f3f1] px-2 py-0.5 text-[10.5px] text-ink-3">In {n.course.title}</span></div>}
            {n.share !== undefined && (
              // A template sent in the message: drawn small, and (for the reader) added to their own templates with one press.
              <div className={`mb-1.5 flex ${n.mine ? "justify-end" : "justify-start"}`}>
                <div className="w-full max-w-[22rem]">
                  {n.share ? <TemplatePreview t={n.share} rows={5} /> : <p className="rounded-xl border border-line px-3 py-2.5 text-[12.5px] text-ink-3">This template is no longer there.</p>}
                  {n.share && !n.mine && (
                    <div className="mt-1.5 flex items-center gap-2">
                      {n.added
                        ? <><span className="flex items-center gap-1 text-[12.5px] text-ok"><Icon name="check" size={12} /> In your templates</span><Link href={`/?new=${encodeURIComponent(n.added)}`} onClick={() => onClose?.()} className="btn btn-ghost press ml-auto h-8 px-3 text-[12.5px]">Start a course from it</Link></>
                        : <button onClick={() => n.letter && void addTemplate(n.letter)} className="btn btn-dark press h-8 px-3 text-[12.5px]"><Icon name="plus" size={12} /> Add to my templates</button>}
                    </div>
                  )}
                  {n.share && n.mine && <p className="mt-1 text-right text-[11.5px] text-ink-3">You sent this template</p>}
                </div>
              </div>
            )}
            {n.text && (
              <div className={`flex ${n.mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13.5px] leading-snug ${n.mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-lane text-ink"}`}>
                  {n.text}
                  <span className={`mt-0.5 block text-right text-[10.5px] ${n.mine ? "text-white/60" : "text-ink-3"}`}>{time(n.at)}{n.mine && n.read ? " · Read" : ""}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2 border-t border-line p-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a message…" aria-label="Message"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
          className="field min-h-[2.75rem] flex-1 resize-none py-2" />
        <button disabled={busy || !text.trim()} className="btn btn-dark press h-10 px-4 disabled:opacity-50">Send</button>
      </form>
    </>
  );
}

/** A conversation in the list: with a person (all your courses together, and letters), or a course one (no account yet). */
export type Thread = {
  key: string; kind: "person" | "course"; name: string; context: string; courses: { id: string; title: string }[]; last?: ThreadMessage; unread: number;
  person?: string; email?: string; course?: string; me?: string; with?: string;
};
export type Contact = Omit<Thread, "last" | "unread">;
export type InboxData = { threads: Thread[]; contacts: Contact[]; unread: number; verified?: boolean };

/** How a conversation opens: with a person, or the course conversation. Its subtitle: how you know them, and their email. */
export const refOf = (x: Thread | Contact): ConversationRef => x.person
  ? { person: x.person, name: x.name, subtitle: [x.context, x.email].filter(Boolean).join(" · ") }
  : { course: x.course, me: x.me, with: x.with, name: x.name, subtitle: x.context };

/**
 * Pick who to write to: people you share a course with, by name (their email under it), or anyone with a confirmed
 * account, by typing their whole email address. Two people with the same name get a line saying so: the email is
 * what tells them apart. `picked` (for sending to several) shows a tick on the ones chosen.
 */
export function PeoplePicker({ contacts, onPick, picked, autoFocus = true }: { contacts: Contact[]; onPick: (c: Contact) => void; picked?: Set<string>; autoFocus?: boolean }) {
  const [find, setFind] = useState("");
  // The account found by a whole email address (kept with the address it answers).
  const [lookup, setLookup] = useState<{ term: string; person: Contact | null; error?: string } | null>(null);
  const term = find.trim().toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(term);
  const shown = contacts.filter((x) => !term || `${x.name} ${x.email ?? ""} ${x.context}`.toLowerCase().includes(term));
  const exact = isEmail && shown.some((x) => x.email?.toLowerCase() === term);
  useEffect(() => {
    if (!isEmail || exact) return;
    const t = setTimeout(() => {
      fetch(`/api/inbox?find=${encodeURIComponent(term)}`).then(async (r) => {
        const j = await r.json().catch(() => ({}));
        setLookup(r.ok ? { term, person: j.person ? { key: `p:${j.person.person}`, kind: "person", person: j.person.person, name: j.person.name, email: j.person.email, context: "", courses: [] } : null } : { term, person: null, error: j.error });
      }).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [term, isEmail, exact]);
  const found = isEmail && !exact && lookup?.term === term ? lookup : null;
  const list = found?.person && !shown.some((x) => x.person === found.person!.person) ? [...shown, found.person] : shown;
  // Names shared by more than one person in what's listed.
  const counts = new Map<string, number>();
  for (const x of list) counts.set(x.name.trim().toLowerCase(), (counts.get(x.name.trim().toLowerCase()) ?? 0) + 1);
  const twins = [...counts.entries()].filter(([, n]) => n > 1);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3 pb-1"><input autoFocus={autoFocus} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Name or email…" aria-label="Name or email" className="field h-9" /></div>
      {twins.length > 0 && (
        <p className="mx-3 mt-1 flex items-start gap-1.5 rounded-lg bg-[#fff6e5] px-2.5 py-1.5 text-[12px] text-[#7a5a00]" role="note">
          <Icon name="info" size={12} className="mt-0.5 flex-none" />
          <span>{twins.length === 1 ? `${twins[0][1]} people are called ${list.find((x) => x.name.trim().toLowerCase() === twins[0][0])!.name}.` : "Some people here have the same name."} Check the email under the name before you pick.</span>
        </p>
      )}
      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {list.map((x) => (
          <button key={x.key} onClick={() => onPick(x)} aria-pressed={picked ? picked.has(x.key) : undefined} className="press flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-lane">
            <Avatar name={x.name} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">{x.name}</span>
              <span className="block truncate text-[12px] text-ink-3">{[x.email, x.context].filter(Boolean).join(" · ") || "No email yet"}</span>
            </span>
            {picked?.has(x.key) && <Icon name="check" size={14} className="flex-none text-ok" />}
          </button>
        ))}
        {!list.length && (
          <p className="px-2 py-3 text-[13px] text-ink-3">
            {found?.error ?? (isEmail ? (found ? "No one with a confirmed account has that email." : "Looking…") : term ? "No one by that name in your courses. To write to someone else, type their whole email address." : "No one to write to yet. Type someone’s whole email address to find them.")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The inbox (from the account menu): every conversation, newest first, one per person. New message picks someone in
 * your courses by name, or anyone with a confirmed account by their email.
 */
export function Inbox({ data, onClose, onChanged }: { data: InboxData | null; onClose: () => void; onChanged: () => void }) {
  const [open, setOpen] = useState<ConversationRef | null>(null);
  const [picking, setPicking] = useState(false);
  const [now] = useState(() => Date.now());
  if (open) return <Conversation c={open} onClose={onClose} onBack={() => { setOpen(null); onChanged(); }} onChanged={onChanged} />;
  return (
    <Drawer label="Inbox" onClose={onClose}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        {picking && <button onClick={() => setPicking(false)} aria-label="Back to your inbox" className="btn btn-quiet press -ml-1 h-9 w-9 justify-center px-0"><Icon name="back" size={16} /></button>}
        <span className="flex-1 text-[15px] font-semibold">{picking ? "New message" : "Inbox"}</span>
        {!picking && data && <button onClick={() => setPicking(true)} className="btn btn-dark press h-8 px-3 text-[12.5px]"><Icon name="plus" size={12} /> New message</button>}
        <button onClick={onClose} aria-label="Close inbox" className="btn btn-quiet press h-9 w-9 justify-center px-0"><Icon name="x" size={16} /></button>
      </header>
      {picking ? (
        <PeoplePicker contacts={data?.contacts ?? []} onPick={(x) => { setPicking(false); setOpen(refOf(x)); }} />
      ) : (
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {!data && <p className="px-2 py-3 text-[13px] text-ink-3">Loading…</p>}
          {data && !data.threads.length && <p className="mt-10 px-6 text-center text-[13px] text-ink-3">No messages yet. Press New message to write to someone in your courses, or to anyone by their email.</p>}
          {data?.threads.map((t) => (
            <button key={t.key} onClick={() => setOpen(refOf(t))} className="press flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-lane">
              <Avatar name={t.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={`truncate text-[13.5px] ${t.unread ? "font-semibold" : "font-medium"}`}>{t.name}</span>
                  <span className="truncate text-[11.5px] text-ink-3">{t.context || t.email}</span>
                  <span className="ml-auto flex-none text-[11px] text-ink-3">{t.last ? (now - t.last.at < 86400_000 ? time(t.last.at) : day(t.last.at)) : ""}</span>
                </span>
                <span className={`mt-0.5 flex items-center gap-2 text-[12.5px] ${t.unread ? "text-ink" : "text-ink-3"}`}>
                  <span className="min-w-0 flex-1 truncate">{t.last?.mine ? "You: " : ""}{t.last?.text || (t.last?.share ? `Template: ${t.last.share.name}` : "")}</span>
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
