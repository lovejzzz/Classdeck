"use client";

import { useEffect, useRef, useState } from "react";
import { op } from "@/lib/client";
import { recommend, todoList, type Rec } from "@/lib/coach";
import { isoDay } from "@/lib/grading";
import { DRILLS, FEEL, drillFor } from "@/lib/onboarding";
import { TYPE_META } from "@/lib/ui";
import type { CourseState } from "@/lib/types";
import { Icon } from "../Icon";

const KIND: Record<Rec["kind"], { icon: string; tint: string }> = {
  revise: { icon: "reset", tint: "var(--color-warn)" },
  overdue: { icon: "clock", tint: "var(--color-bad)" },
  soon: { icon: "clock", tint: "var(--color-warn)" },
  path: { icon: "split", tint: "#4b56a8" },
  focus: { icon: "selfcheck", tint: "#367195" },
  mismatch: { icon: "eye", tint: "#ae502f" },
  feedback: { icon: "message", tint: "#287670" },
  reflect: { icon: "reflect", tint: "#6c6976" },
};

/**
 * "For you": next steps worked out from the student's own self-checks, the teacher's reviews,
 * due dates, and feedback; their to-do list; and reminders from the teacher.
 */
export function ForYou({ state, studentId, onOpen, onBoard, onChanged }: {
  state: CourseState; studentId: string; onOpen: (lessonId: string, moduleId: string) => void; onBoard: () => void; onChanged?: () => void;
}) {
  const [now] = useState(() => Date.now());
  const [tab, setTab] = useState<"next" | "todo">("next");
  const recs = recommend(state, studentId, now);
  const mine = state.progress[studentId] ?? {};
  const todos = todoList(state.course, mine, now);
  const nudges = (state.nudges ?? []).filter((n) => n.studentId === studentId && now - n.at < 7 * 86400_000).sort((a, b) => b.at - a.at);
  const [canNotify, setCanNotify] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");
  const seen = useRef<number>(nudges[0]?.at ?? 0);

  // A reminder that arrives while this tab is in the background pops up as a system notification.
  useEffect(() => {
    const newest = nudges[0];
    if (!newest || newest.at <= seen.current) return;
    seen.current = newest.at;
    if (canNotify && document.hidden) new Notification("Reminder from your teacher", { body: newest.text });
  }, [nudges, canNotify]);

  const plan = state.plans?.[studentId];
  const today = isoDay(0);
  const dayNum = Math.floor(now / 86400_000);
  const drill = plan ? drillFor(plan.focus?.subskills ?? [], dayNum) : undefined;
  const doneToday = plan?.drills?.find((d) => d.day === today);
  const doneDrill = doneToday ? DRILLS.find((d) => d.id === doneToday.id) : undefined;
  const [openDrill, setOpenDrill] = useState(false);
  async function logDrill(id: string, feel?: number) {
    await op(state.course.id, { op: "drill", studentId, day: today, id, feel });
    onChanged?.();
  }

  if (!recs.length && !todos.length && !nudges.length && !drill) return null;

  return (
    <div className="mx-auto max-w-6xl px-4">
    <section className="rise card mt-4 overflow-hidden" aria-label="For you">
      {nudges.length > 0 && (
        <div className="flex items-start gap-2.5 border-b border-line bg-[#fbf3dd] px-4 py-2.5 text-[13px]">
          <Icon name="user" size={14} className="mt-0.5 text-[#8f630b]" />
          <span className="flex-1"><span className="font-medium">From your teacher:</span> {nudges[0].text}</span>
          {nudges[0].moduleId && (() => {
            const l = state.course.weeks.flatMap((w) => w.lessons).find((x) => x.modules.some((m) => m.id === nudges[0].moduleId));
            return l ? <button onClick={() => onOpen(l.id, nudges[0].moduleId!)} className="btn btn-quiet press h-7 px-2 text-[12px]">Open card</button> : null;
          })()}
        </div>
      )}
      {drill && (
        <div className="border-b border-line px-4 py-2.5 text-[13px]">
          {doneToday ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ok/10 text-ok"><Icon name="check" size={13} /></span>
              <span className="min-w-0 flex-1 basis-52"><span className="font-medium">Today’s drill done:</span> {doneDrill?.title ?? doneToday.id}</span>
              <span className="text-[12px] text-ink-3">How did it feel?</span>
              {FEEL.map((f, i) => (
                <button key={f} aria-pressed={doneToday.feel === i + 1} onClick={() => logDrill(doneToday.id, i + 1)}
                  className={`press chip h-6 ${doneToday.feel === i + 1 ? "bg-ink text-white" : ""}`}>{f}</button>
              ))}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lane text-[#367195]"><Icon name="timer" size={13} /></span>
                <span className="min-w-0 flex-1 basis-52"><span className="font-medium">Today’s 10-minute drill:</span> {drill.title} <span className="text-ink-3">· {drill.sub}</span></span>
                <button onClick={() => setOpenDrill(!openDrill)} aria-expanded={openDrill} className="btn btn-quiet press h-7 px-2 text-[12px]">{openDrill ? "Hide" : "How"}</button>
                <button onClick={() => logDrill(drill.id)} className="btn btn-ghost press h-7 px-2.5 text-[12px]"><Icon name="check" size={12} /> I did it</button>
              </div>
              {openDrill && <p className="mt-1.5 pl-8 leading-relaxed text-ink-2">{drill.steps}</p>}
            </>
          )}
        </div>
      )}
      <div className="flex items-center gap-1 border-b border-line px-2 pt-1.5">
        {([["next", "For you", recs.length], ["todo", "To-do", todos.length]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`press -mb-px flex h-9 items-center gap-1.5 border-b-2 px-3 text-[13px] ${tab === k ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {label}<span className="mono text-[11px]">{n}</span>
          </button>
        ))}
        <span className="flex-1" />
        {typeof Notification !== "undefined" && !canNotify && Notification.permission !== "denied" && (
          <button onClick={async () => setCanNotify((await Notification.requestPermission()) === "granted")} className="btn btn-quiet press h-7 px-2 text-[12px]" title="Get a notification when your teacher sends a reminder">
            <Icon name="clock" size={12} /> Turn on reminders
          </button>
        )}
        <button onClick={onBoard} className="btn btn-quiet press h-7 px-2 text-[12px]">My progress <Icon name="arrow" size={12} /></button>
      </div>

      {tab === "next" ? (
        recs.length === 0 ? <p className="px-4 py-4 text-[13px] text-ink-3">You’re on track. Nothing urgent right now.</p> : (
          <ul className="divide-y divide-line">
            {recs.map((r, i) => (
              <li key={r.id} className="rise" style={{ "--i": i } as React.CSSProperties}>
                <button disabled={!r.anchor && (!r.moduleId || !r.lessonId) && r.id !== "focus" && r.id !== "obj"} onClick={() => r.anchor ? document.getElementById(r.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }) : r.moduleId && r.lessonId ? onOpen(r.lessonId, r.moduleId) : onBoard()}
                  className="press flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#fafaf9] disabled:cursor-default disabled:hover:bg-transparent">
                  <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-lane" style={{ color: KIND[r.kind].tint }}><Icon name={KIND[r.kind].icon} size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">{r.title}</span>
                    <span className="block text-[12.5px] leading-snug text-ink-2">{r.text}</span>
                  </span>
                  {(r.moduleId || r.anchor || r.id === "focus" || r.id === "obj") && <Icon name="arrow" size={13} className="mt-1.5 flex-none text-ink-3" />}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="max-h-80 divide-y divide-line overflow-y-auto">
          {todos.map((t) => (
            <li key={t.m.id}>
              <button onClick={() => onOpen(t.lesson.id, t.m.id)} className="press flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#fafaf9]">
                <span style={{ color: TYPE_META[t.m.type].tint }}><Icon name={t.m.type} size={14} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{t.m.choice ? `${t.m.title.replace(/\s*\([^)]*\)\s*$/, "")} (pick a path)` : t.m.title}</span>
                  <span className="block text-[11.5px] text-ink-3">{t.week} · {t.status === "doing" ? "in progress" : "not started"}</span>
                </span>
                {t.revise && <span className="chip h-5 bg-warn/10 text-[11px] text-warn">Revise</span>}
                {t.due && <span className={`chip h-5 text-[11px] ${t.due.tone === "late" ? "bg-bad/10 text-bad" : t.due.tone === "soon" ? "bg-warn/10 text-warn" : ""}`}>{t.due.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
    </div>
  );
}
