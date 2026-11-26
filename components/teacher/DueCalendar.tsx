"use client";

import { meetingOf } from "@/lib/media";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { addDays, lessonDates, localDay } from "@/lib/dates";
import type { Course } from "@/lib/types";

type Item = { date: string; kind: "lesson" | "due"; title: string; lesson: string; lessonId: string; moduleId?: string; planned?: boolean; meeting?: boolean; time?: string };
type Cal = { id: string; title: string; items: Item[] };

/** Colours for courses when all of them show at once (this course is always the first). */
const TINTS = ["#4b56a8", "#a0561f", "#287670", "#8a4a9c", "#b7791f", "#3d6fa8", "#9c4a5b", "#5b7a2e"];

/** This course's dated things, from the copy being edited (so a change not saved yet shows too). */
function itemsOf(course: Course): Item[] {
  const dates = lessonDates(course);
  const out: Item[] = [];
  for (const w of course.weeks) for (const l of w.lessons) {
    const ld = dates.get(l.id);
    if (ld) out.push({ date: ld.date, kind: "lesson", title: l.title, lesson: l.title, lessonId: l.id, planned: !ld.own || undefined });
    for (const m of l.modules) if (m.due) out.push({ date: m.due, kind: "due", title: m.title, lesson: l.title, lessonId: l.id, moduleId: m.id, meeting: (m.attachments ?? []).some((a) => a.kind === "link" && !!meetingOf(a.url)) || undefined, time: m.dueTime });
  }
  return out;
}

const monthOf = (day: string) => day.slice(0, 7);
const monthStart = (ym: string) => `${ym}-01`;
const shiftMonth = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString("en-CA").slice(0, 7);
};

/**
 * A whole-screen calendar for a card's due date: the month, with every lesson day and every due date in the course (or
 * another course of the teacher's, or all of them). Tap a day to make it this card's due date.
 */
export function DueCalendar({ course, moduleId, cardTitle, due, onPick, onClose }: {
  course: Course;
  moduleId: string;
  cardTitle: string;
  due?: string;
  onPick: (day: string | undefined) => void;
  onClose: () => void;
}) {
  const today = localDay();
  const [others, setOthers] = useState<Cal[] | null>(null);
  const [scope, setScope] = useState<string>("this");
  // Open on the due date's month; without one, on this month.
  const [ym, setYm] = useState(monthOf(due ?? today));

  useEffect(() => {
    fetch(`/api/courses?calendar=1&course=${encodeURIComponent(course.id)}`).then((r) => r.json()).then((d: { calendars?: Cal[] }) => setOthers((d.calendars ?? []).filter((c) => c.id !== course.id))).catch(() => setOthers([]));
  }, [course.id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);

  const cals: Cal[] = useMemo(() => {
    // This card's due date is the one being picked: from what's set now, not the saved copy.
    const mine = itemsOf(course).filter((x) => x.moduleId !== moduleId);
    if (due) mine.push({ date: due, kind: "due", title: cardTitle, lesson: "", lessonId: "", moduleId });
    const here = { id: course.id, title: course.title, items: mine };
    if (scope === "this") return [here];
    if (scope === "all") return [here, ...(others ?? [])];
    return (others ?? []).filter((c) => c.id === scope);
  }, [course, moduleId, cardTitle, due, scope, others]);
  const tint = (id: string) => TINTS[Math.max(0, [course.id, ...(others ?? []).map((c) => c.id)].indexOf(id)) % TINTS.length];

  // The weeks of the month, Sunday first, with the days before and after it to fill them.
  const first = monthStart(ym);
  const lead = new Date(`${first}T12:00:00`).getDay();
  const days: string[] = [];
  for (let d = addDays(first, -lead); days.length < 42; d = addDays(d, 1)) days.push(d);
  while (days.length > 35 && days.slice(-7).every((x) => monthOf(x) !== ym)) days.splice(-7);
  const byDay = new Map<string, { cal: Cal; item: Item }[]>();
  for (const cal of cals) for (const item of cal.items) byDay.set(item.date, [...(byDay.get(item.date) ?? []), { cal, item }]);
  const label = new Date(`${first}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const many = scope === "all";

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-3 sm:p-6" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Pick a due date" className="pop flex h-full max-h-[52rem] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-30px_rgba(20,20,18,0.5)]">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-ink-3">Due date for</div>
            <div className="truncate text-[15px] font-medium">{cardTitle || "This card"}</div>
          </div>
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Whose dates to show" className="field h-9 w-auto py-0 pr-8 text-[13px]">
            <option value="this">This course: {course.title}</option>
            {(others ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            {(others?.length ?? 0) > 0 && <option value="all">All my courses</option>}
          </select>
          <button onClick={onClose} aria-label="Close" className="press grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-lane hover:text-ink"><Icon name="x" size={15} /></button>
        </header>

        <div className="flex items-center gap-2 px-5 pb-2 pt-3">
          <h2 className="min-w-[10rem] text-[18px] font-semibold tracking-tight">{label}</h2>
          <button onClick={() => setYm(shiftMonth(ym, -1))} aria-label="Previous month" className="press grid h-8 w-8 place-items-center rounded-lg border border-line hover:border-line-strong"><Icon name="back" size={13} /></button>
          <button onClick={() => setYm(monthOf(today))} className="btn btn-ghost press h-8 px-3 text-[12.5px]">Today</button>
          <button onClick={() => setYm(shiftMonth(ym, 1))} aria-label="Next month" className="press grid h-8 w-8 place-items-center rounded-lg border border-line hover:border-line-strong"><Icon name="arrow" size={13} /></button>
          <span className="flex-1" />
          <span className="hidden items-center gap-3 text-[12px] text-ink-3 sm:flex">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ok/25 ring-1 ring-ok/40" />Lesson</span>
            <span className="flex items-center gap-1.5"><Icon name="clock" size={11} />Due</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" />This card</span>
          </span>
        </div>

        <div className="grid grid-cols-7 border-b border-line px-5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-3">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="px-1.5 pb-1.5">{d}</div>)}
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-y-auto px-5 pb-3">
          {days.map((day) => {
            const list = byDay.get(day) ?? [];
            const isDue = day === due;
            const out = monthOf(day) !== ym;
            const shown = list.slice(0, 4);
            return (
              <button key={day} onClick={() => onPick(day)} aria-pressed={isDue}
                aria-label={`${new Date(`${day}T12:00:00`).toDateString()}${list.length ? `: ${list.map((x) => (x.item.kind === "lesson" ? `lesson ${x.item.title}` : `${x.item.title} due`)).join(", ")}` : ""}. Make it the due date`}
                className={`group relative flex min-h-[5.5rem] flex-col items-stretch gap-0.5 border-b border-r border-line p-1.5 text-left transition-colors first:border-l [&:nth-child(7n+1)]:border-l ${isDue ? "bg-ink/[0.04] ring-2 ring-inset ring-ink" : "hover:bg-[#f4f5fb]"} ${out ? "bg-[#fafaf9]" : ""}`}>
                <span className={`mb-0.5 flex items-center gap-1 text-[12px] ${day === today ? "font-semibold text-ok" : out ? "text-ink-3/60" : "text-ink-2"}`}>
                  {day === today ? <span className="rounded-full bg-ok px-1.5 text-white">{Number(day.slice(8))}</span> : Number(day.slice(8))}
                  <span className="ml-auto hidden text-[10.5px] font-medium text-[#4b56a8] group-hover:inline">{isDue ? "" : "Set due"}</span>
                </span>
                {shown.map(({ cal, item }, k) => {
                  const mineCard = item.moduleId === moduleId && cal.id === course.id;
                  return item.kind === "lesson" ? (
                    <span key={k} className={`truncate rounded px-1 text-[11px] leading-[1.45] ${item.planned ? "bg-ok/[0.07] text-ok/80" : "bg-ok/[0.13] text-[#256e44]"}`} title={`${many ? `${cal.title} · ` : ""}Lesson: ${item.title}`}>
                      {many && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: tint(cal.id) }} />}{item.title}
                    </span>
                  ) : (
                    <span key={k} className={`flex items-center gap-1 truncate rounded px-1 text-[11px] leading-[1.45] ${mineCard ? "bg-ink font-medium text-white" : "text-ink-2"}`} title={`${many ? `${cal.title} · ` : ""}${item.title} ${item.meeting ? `meeting${item.time ? ` at ${item.time}` : ""}` : "due"}${item.lesson ? ` (${item.lesson})` : ""}`}>
                      {many && !mineCard ? <span className="inline-block h-1.5 w-1.5 flex-none rounded-full" style={{ background: tint(cal.id) }} /> : <Icon name={item.meeting ? "video" : "clock"} size={10} className="flex-none" />}
                      <span className="truncate">{item.time ? <span className="font-mono">{item.time} </span> : null}{item.title}</span>
                    </span>
                  );
                })}
                {list.length > shown.length && <span className="px-1 text-[10.5px] text-ink-3">+{list.length - shown.length} more</span>}
              </button>
            );
          })}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 text-[13px]">
          <span className="text-ink-2">{due ? <>Due <span className="font-medium text-ink">{new Date(`${due}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span></> : "No due date"}</span>
          <span className="text-ink-3">· Tap a day to change it.</span>
          <span className="flex-1" />
          {due && <button onClick={() => onPick(undefined)} className="btn btn-ghost press h-9">No due date</button>}
          <button onClick={onClose} className="btn btn-dark press h-9 px-4">Done</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
