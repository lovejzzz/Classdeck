"use client";

import { isMeeting } from "@/lib/grading";
import { useEffect, useRef, useState } from "react";
import { todoList, type Todo } from "@/lib/coach";
import { suitOfCard } from "@/lib/ui";
import { faceMeta } from "@/lib/kinds";
import type { CourseState } from "@/lib/types";
import { Icon } from "../Icon";

type Kind = "revise" | "late" | "meeting" | "soon" | "behind" | "electives";
const LOOK: Record<Kind, { icon: string; cls: string }> = {
  revise: { icon: "reset", cls: "bg-warn/10 text-warn hover:bg-warn/15" },
  late: { icon: "clock", cls: "bg-bad/10 text-bad hover:bg-bad/15" },
  meeting: { icon: "video", cls: "bg-[#eef0fb] text-[#4b56a8] hover:bg-[#e3e6f8]" },
  soon: { icon: "clock", cls: "bg-warn/10 text-warn hover:bg-warn/15" },
  behind: { icon: "layers", cls: "bg-lane text-ink-2 hover:bg-black/[0.06]" },
  electives: { icon: "split", cls: "bg-[#eef0fb] text-[#4b56a8] hover:bg-[#e3e6f8]" },
};

/**
 * What needs the student, as a few small chips under today's progress: cards to revise, overdue, due soon, left in
 * earlier lessons, and electives to choose. Only what applies shows; nothing at all when they're on track. A chip opens
 * its cards (or, for electives, goes to them in their week). A reminder from the teacher that arrives while the tab is
 * in the background pops up as a system notification (if the student turned reminders on).
 */
export function NeedsYou({ state, studentId, onOpen, onElectives, heading, skip }: {
  state: CourseState; studentId: string;
  /** A card already shown on its own (the next card to play), left out here. */
  skip?: string;
  /** A small heading above the chips, when there are any. */
  heading?: string;
  onOpen: (lessonId: string, moduleId: string) => void;
  /** Go to the first elective not chosen yet, in its week. */
  onElectives: () => void;
}) {
  const [now] = useState(() => Date.now());
  const [open, setOpen] = useState<Kind | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const mine = state.progress[studentId] ?? {};
  const todos = todoList(state.course, mine, now).filter((t) => t.m.id !== skip);
  const order = state.course.weeks.flatMap((w) => w.lessons);
  const cur = Math.max(0, order.findIndex((l) => l.id === state.course.currentLessonId));
  const late = (t: Todo) => t.due?.tone === "late";
  const groups: { kind: Kind; label: string; items: Todo[] }[] = [];
  const revise = todos.filter((t) => t.revise);
  const overdue = todos.filter((t) => !t.revise && late(t));
  // Meetings coming up get their own chip: they're a time to join, not work due.
  const soonAll = todos.filter((t) => !t.revise && t.due?.tone === "soon");
  const meetings = soonAll.filter((t) => isMeeting(t.m));
  const soon = soonAll.filter((t) => !isMeeting(t.m));
  const behind = todos.filter((t) => !t.revise && !late(t) && !t.lesson.elective && order.indexOf(t.lesson) < cur);
  if (revise.length) groups.push({ kind: "revise", label: `${revise.length} to revise`, items: revise });
  if (overdue.length) groups.push({ kind: "late", label: `${overdue.length} overdue`, items: overdue });
  if (meetings.length) groups.push({ kind: "meeting", label: meetings.length === 1 ? meetings[0].due!.label : `${meetings.length} meetings soon`, items: meetings });
  if (soon.length) groups.push({ kind: "soon", label: `${soon.length} due soon`, items: soon });
  if (behind.length) groups.push({ kind: "behind", label: `${behind.length} to catch up`, items: behind });
  const electives = order.filter((l) => l.elective);
  // No more than the course has: one elective and a minimum of 2 still means choose that one.
  const need = Math.min(state.course.electiveMin ?? 1, electives.length) - electives.filter((l) => l.chosen).length;
  if (need > 0) groups.push({ kind: "electives", label: `Choose ${need} elective${need === 1 ? "" : "s"}`, items: [] });

  // A reminder from the teacher while this tab is in the background: a system notification.
  const nudges = (state.nudges ?? []).filter((n) => n.studentId === studentId && !n.from && now - n.at < 7 * 86400_000).sort((a, b) => b.at - a.at);
  const seen = useRef<number>(nudges[0]?.at ?? 0);
  useEffect(() => {
    const newest = nudges[0];
    if (!newest || newest.at <= seen.current) return;
    seen.current = newest.at;
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) new Notification("Reminder from your teacher", { body: newest.text });
  }, [nudges]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [open]);

  if (!groups.length) return null;
  const shown = groups.find((g) => g.kind === open);
  return (
    <div ref={box} className={`relative flex flex-wrap items-center gap-1.5 ${heading ? "mt-8" : "mt-3"}`} aria-label={heading ?? "Needs you"}>
      {heading && <div className="mb-0.5 w-full text-[12.5px] font-medium text-ink-3">{heading}</div>}
      {groups.map((g) => (
        <button key={g.kind} onClick={() => (g.kind === "electives" ? onElectives() : g.items.length === 1 ? onOpen(g.items[0].lesson.id, g.items[0].m.id) : setOpen(open === g.kind ? null : g.kind))}
          aria-expanded={g.items.length > 1 ? open === g.kind : undefined}
          className={`press chip h-7 gap-1.5 px-2.5 text-[12.5px] font-medium ${LOOK[g.kind].cls}`}>
          <Icon name={LOOK[g.kind].icon} size={12} />{g.label}
          {g.items.length > 1 && <Icon name="chevron" size={11} className={`transition-transform ${open === g.kind ? "rotate-180" : ""}`} />}
        </button>
      ))}
      {shown && (
        <div role="menu" className={`pop absolute left-0 ${heading ? "top-[3.4rem]" : "top-9"} z-30 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white p-1.5 shadow-[0_20px_50px_-18px_rgba(20,20,18,0.3)]`}>
          <ul className="max-h-72 overflow-y-auto">
            {shown.items.map((t) => (
              <li key={t.m.id}>
                <button role="menuitem" onClick={() => { setOpen(null); onOpen(t.lesson.id, t.m.id); }} className="press flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-lane">
                  <span style={{ color: suitOfCard(t.m).tint }}><Icon name={faceMeta(t.m).icon} size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{t.m.title}</span>
                    <span className="block truncate text-[11.5px] text-ink-3">{t.week.split(" · ")[0]} · {t.lesson.title}</span>
                  </span>
                  {t.due && <span className={`chip h-5 flex-none text-[11px] ${t.due.tone === "late" ? "bg-bad/10 text-bad" : t.due.tone === "soon" ? "bg-warn/10 text-warn" : ""}`}>{t.due.label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
