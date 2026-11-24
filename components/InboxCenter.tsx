"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ago } from "@/lib/time";
import { Avatar, Icon } from "./Icon";
import { ConversationBody, type ConversationRef, type InboxData, type Thread, type Contact } from "./MessageThread";
import type { Note, Section } from "./NotificationCenter";

/** The sections someone chose not to be told about, kept in this browser. */
function readMuted(key: string, fallback: string[]): Set<string> {
  try {
    const saved = localStorage.getItem(key);
    return new Set(saved === null ? fallback : (JSON.parse(saved) as string[]));
  } catch { return new Set(fallback); }
}

/** A note's text as words: an @mention ("@[Name](id)") reads as @Name, and markdown (headings, tables, bold) drops away. */
const plain = (s: string) => s.replace(/@\[([^\]]+)\]\([^)]*\)/g, "@$1").replace(/\|?\s*:?-{3,}:?\s*/g, " ").replace(/[#*_`>|]+/g, " ").replace(/\s+/g, " ").trim();
const roleLabel = (x: { role: "teacher" | "student"; me: string }) => (x.role === "teacher" ? "Teacher" : x.me === "teacher" ? "Your student" : "Classmate");
const refOf = (x: Thread | Contact): ConversationRef => ({ course: x.course, me: x.me, with: x.with, name: x.name, subtitle: `${roleLabel(x)} · ${x.courseTitle}` });

type View = { kind: "all" } | { kind: "messages" } | { kind: "section"; id: string } | { kind: "course"; id: string } | { kind: "settings" };

/**
 * The Inbox: one button in a course's top bar (in place of the bell), with everything that's new in one count. It
 * opens a drawer on the right: a rail of what to look at (All, Messages, each kind of notification, each course you
 * have conversations in, and what to be told about), and the list, or one conversation, beside it. Messages are the
 * account's conversations across all its courses; the notifications are this course's.
 */
export function InboxCenter({ notes: allNotes, sections, muteKey, courseId, courseTitle, onClear, onPick, emptyText = "You’re all caught up", noMessages = false, defaultOn }: {
  /** The kinds of notification that are on until someone chooses (the rest start off). Unset: all on. */
  defaultOn?: string[];
  /** Student View: the account's messages aren't this student's, so only the notifications show. */
  noMessages?: boolean;
  notes: Note[];
  sections: Section[];
  muteKey: string;
  /** This course: its notifications belong to it. */
  courseId: string;
  courseTitle: string;
  onClear: () => void;
  onPick?: (n: Note) => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "all" });
  const [talking, setTalking] = useState<ConversationRef | null>(null);
  const [picking, setPicking] = useState(false);
  const [find, setFind] = useState("");
  const [data, setData] = useState<InboxData | null>(null);
  const [muted, setMuted] = useState<Set<string>>(() => new Set());
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read from this browser's storage after hydration
  useEffect(() => setMuted(readMuted(muteKey, defaultOn ? sections.map((x) => x.id).filter((id) => !defaultOn.includes(id)) : [])), [muteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => { fetch("/api/inbox").then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d)).catch(() => {}); }, []);
  useEffect(() => {
    if (noMessages) return;
    const first = setTimeout(load, 0);
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load, noMessages]);

  const notes = allNotes.filter((n) => !n.cat || !muted.has(n.cat)).sort((a, b) => b.at - a.at);
  const threads = data?.threads ?? [];
  const unreadMsgs = threads.reduce((s, t) => s + t.unread, 0);
  const count = notes.length + unreadMsgs;
  const live = sections.filter((x) => !muted.has(x.id));
  const courses = [...new Map(threads.map((t) => [t.course, t.courseTitle])).entries()];
  if (!courses.some(([id]) => id === courseId)) courses.unshift([courseId, courseTitle]);

  // What the list shows: messages, notifications, or both (newest first).
  type Row = { at: number; thread?: Thread; note?: Note };
  const rows: Row[] = (() => {
    const t = (list: Thread[]) => list.map((x) => ({ at: x.last?.at ?? 0, thread: x }));
    const n = (list: Note[]) => list.map((x) => ({ at: x.at, note: x }));
    if (view.kind === "messages") return t(threads);
    if (view.kind === "section") return n(notes.filter((x) => x.cat === view.id));
    if (view.kind === "course") return [...t(threads.filter((x) => x.course === view.id)), ...(view.id === courseId ? n(notes) : [])].sort((a, b) => b.at - a.at);
    return [...t(threads.filter((x) => x.unread > 0 || x.course === courseId)), ...n(notes)].sort((a, b) => b.at - a.at);
  })();

  function toggleMute(id: string) {
    const next = new Set(muted);
    if (next.has(id)) next.delete(id); else next.add(id);
    setMuted(next);
    try { localStorage.setItem(muteKey, JSON.stringify([...next])); } catch {}
  }
  const close = () => { setOpen(false); setTalking(null); setPicking(false); load(); };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); if (talking || picking) { setTalking(null); setPicking(false); load(); } else close(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, talking, picking]);

  const railItem = (v: View, label: string, n: number, icon?: string) => {
    const on = JSON.stringify(v) === JSON.stringify(view) && !talking && !picking;
    return (
      <button key={label} onClick={() => { setView(v); setTalking(null); setPicking(false); }} aria-current={on ? "page" : undefined}
        className={`press flex w-full flex-none items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[13px] max-sm:w-auto ${on ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line,#e6e6e3)]" : "text-ink-2 hover:bg-black/[0.04] hover:text-ink"}`}>
        {icon && <Icon name={icon} size={13} className="flex-none text-ink-3" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {n > 0 && <span className="mono flex-none text-[11px] text-ink-3">{n}</span>}
      </button>
    );
  };
  const title = view.kind === "messages" ? "Messages" : view.kind === "section" ? sections.find((x) => x.id === view.id)?.label ?? "" : view.kind === "course" ? courses.find(([id]) => id === view.id)?.[1] ?? "" : view.kind === "settings" ? "Notify me about" : "All";
  const contacts = (data?.contacts ?? []).filter((x) => !find.trim() || `${x.name} ${x.courseTitle}`.toLowerCase().includes(find.trim().toLowerCase()));

  return (
    <>
      <button onClick={() => { setOpen(true); if (!noMessages) load(); }} aria-label={`Inbox, ${count} new`} aria-expanded={open}
        className={`btn press relative h-8 gap-1.5 px-2.5 text-[13px] ${open ? "bg-black/[0.06] text-ink" : "btn-quiet"}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1z" /></svg>
        <span className="max-sm:hidden">Inbox</span>
        {count > 0 && <span key={count} className="pop mono flex h-4 min-w-4 items-center justify-center rounded-full bg-[#4f7cf2] px-1 text-[10px] font-medium text-white">{count > 99 ? "99" : count}</span>}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/20" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <section role="dialog" aria-label="Inbox" className="flex h-full w-full max-w-[44rem] bg-white shadow-[-20px_0_60px_-30px_rgba(20,20,18,0.5)] max-sm:flex-col" style={{ animation: "panel-in 0.3s var(--ease-out) both" }}>
            {/* The rail: what to look at. On a phone, a row across the top. */}
            <nav aria-label="Inbox sections" className="flex w-48 flex-none flex-col gap-0.5 overflow-y-auto border-r border-line bg-[#fafaf9] p-2 max-sm:w-full max-sm:flex-row max-sm:overflow-x-auto max-sm:border-b max-sm:border-r-0">
              {railItem({ kind: "all" }, "All", count, "submit")}
              {!noMessages && railItem({ kind: "messages" }, "Messages", unreadMsgs, "message")}
              {live.map((x) => railItem({ kind: "section", id: x.id }, x.label, notes.filter((n) => n.cat === x.id).length))}
              {courses.length > 1 && <div className="px-2.5 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-3 max-sm:hidden">Courses</div>}
              {courses.length > 1 && courses.map(([id, name]) => railItem({ kind: "course", id }, name, threads.filter((t) => t.course === id).reduce((s, t) => s + t.unread, 0) + (id === courseId ? notes.length : 0)))}
              <span className="flex-1 max-sm:hidden" />
              {railItem({ kind: "settings" }, "Notify me about…", 0, "settings")}
            </nav>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {talking ? (
                <ConversationBody c={talking} onBack={() => { setTalking(null); load(); }} onChanged={load} />
              ) : (
                <>
                  <header className="flex items-center gap-2 border-b border-line px-4 py-3">
                    {picking && <button onClick={() => setPicking(false)} aria-label="Back" className="btn btn-quiet press -ml-1 h-8 w-8 justify-center px-0"><Icon name="back" size={15} /></button>}
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{picking ? "New message" : title}</span>
                    {!picking && view.kind !== "settings" && (data?.contacts.length ?? 0) > 0 && <button onClick={() => { setPicking(true); setFind(""); }} className="btn btn-dark press h-8 px-3 text-[12.5px]"><Icon name="plus" size={12} /> New message</button>}
                    <button onClick={close} aria-label="Close inbox" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={16} /></button>
                  </header>
                  {picking ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="p-3"><input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find someone…" aria-label="Find someone" className="field h-9" /></div>
                      <div className="flex-1 overflow-y-auto px-2 pb-3">
                        {contacts.length ? contacts.map((x) => (
                          <button key={`${x.course}:${x.me}:${x.with}`} onClick={() => { setPicking(false); setTalking(refOf(x)); }} className="press flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-lane">
                            <Avatar name={x.name} size={28} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium">{x.name}</span>
                              <span className="block truncate text-[12px] text-ink-3">{roleLabel(x)} · {x.courseTitle}</span>
                            </span>
                          </button>
                        )) : <p className="px-2 py-3 text-[13px] text-ink-3">No one to message here.</p>}
                      </div>
                    </div>
                  ) : view.kind === "settings" ? (
                    // Which kinds of notification to be told about: one turned off isn't counted or listed.
                    <div className="overflow-y-auto p-3">
                      <ul className="space-y-1">
                        {sections.map((x) => (
                          <li key={x.id}>
                            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-2 hover:bg-lane">
                              <input type="checkbox" checked={!muted.has(x.id)} onChange={() => toggleMute(x.id)} className="mt-0.5 h-4 w-4 flex-none accent-[#1b1b1a]" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-medium">{x.label}</span>
                                {x.hint && <span className="block text-[12px] text-ink-3">{x.hint}</span>}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 px-2 text-[11.5px] text-ink-3">Kept on this device. Messages are always counted. What you turn off still happens; it just isn’t counted or listed here.</p>
                    </div>
                  ) : (
                    <>
                      <div className="min-h-0 flex-1 overflow-y-auto py-1">
                        {rows.length === 0 && <p className="mt-14 px-6 text-center text-[13px] text-ink-3">{view.kind === "messages" ? "No messages yet. Press New message to write to someone." : emptyText}</p>}
                        {rows.map((r) => r.thread ? (
                          <button key={`t:${r.thread.key}`} onClick={() => setTalking(refOf(r.thread!))} className="press flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-[#fafaf9]">
                            <Avatar name={r.thread.name} size={30} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                <span className={`truncate text-[13.5px] ${r.thread.unread ? "font-semibold" : "font-medium"}`}>{r.thread.name}</span>
                                <span className="truncate text-[11.5px] text-ink-3">{r.thread.courseTitle}</span>
                                <span className="mono ml-auto flex-none text-[11px]">{r.thread.last ? ago(r.thread.last.at) : ""}</span>
                              </span>
                              <span className={`mt-0.5 block truncate text-[12.5px] ${r.thread.unread ? "text-ink" : "text-ink-3"}`}>{r.thread.last?.mine ? "You: " : ""}{r.thread.last?.text ?? "No messages yet"}</span>
                            </span>
                            {r.thread.unread > 0 && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-[#4f7cf2]" aria-label={`${r.thread.unread} unread`} />}
                          </button>
                        ) : (
                          <button key={`n:${r.note!.id}`} onClick={() => { onPick?.(r.note!); close(); }} className="press flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-[#fafaf9]">
                            <span className="mt-0.5 flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-[#f3f3f1]" style={{ color: r.note!.tint }}><Icon name={r.note!.icon} size={14} /></span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                <span className="truncate text-[13.5px] font-medium">{r.note!.title}</span>
                                <span className="truncate text-[11.5px] text-ink-3">{r.note!.source}</span>
                                <span className="mono ml-auto flex-none text-[11px]">{ago(r.note!.at)}</span>
                              </span>
                              <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">{plain(r.note!.text)}</span>
                            </span>
                            <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-[#4f7cf2]" />
                          </button>
                        ))}
                      </div>
                      {notes.length > 0 && view.kind !== "messages" && (
                        <footer className="flex items-center border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3">
                          <span className="flex-1"><span className="font-medium text-ink">{notes.length}</span> notification{notes.length === 1 ? "" : "s"}{unreadMsgs ? <> · <span className="font-medium text-ink">{unreadMsgs}</span> unread message{unreadMsgs === 1 ? "" : "s"}</> : null}</span>
                          <button onClick={onClear} className="btn press h-7 rounded-full bg-lane px-3 text-[12px] text-ink-2 hover:bg-[#e8e8e5] hover:text-ink">Clear notifications</button>
                        </footer>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
