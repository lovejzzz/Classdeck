"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import type { Course, Lesson, Progress } from "@/lib/types";

/**
 * The course as a route: each week a stretch of line, each lesson a stop on it. A finished lesson is filled, today's is
 * bigger with how much is done, and a lesson with cards to revise carries a small number. Three weeks show at a time
 * (the one before this week, this week, the next), scrolling sideways to the rest. Tapping a stop picks that lesson.
 */
export function CourseRoute({ course, mine, picked, onPick }: {
  course: Course;
  mine: Record<string, Progress>;
  picked: string | null;
  onPick: (lessonId: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Electives the student hasn't chosen aren't on their route.
  const weeks = course.weeks.map((w) => ({ ...w, lessons: w.lessons.filter((l) => !l.elective || l.chosen) })).filter((w) => w.lessons.length);
  const nowWeek = Math.max(0, weeks.findIndex((w) => w.lessons.some((l) => l.id === course.currentLessonId)));

  // Start with this week in the middle: the week before it at the left edge.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // On a phone a week fills the width: start at this week itself.
    const wk = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.clientWidth / 3;
    const one = wk > el.clientWidth * 0.6;
    el.scrollLeft = Math.max(0, nowWeek - (one ? 0 : 1)) * wk;
    // Only once, when the route first draws.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const step = (d: number) => box.current?.scrollBy({ left: d * ((box.current.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0), behavior: "smooth" });

  const countable = (l: Lesson) => l.modules.filter((m, i) => !m.choice || l.modules.findIndex((x) => x.choice?.slot === m.choice!.slot) === i);
  const stats = (l: Lesson) => {
    const ms = countable(l);
    const done = ms.filter((m) => mine[m.id]?.status === "done").length;
    const revise = l.modules.filter((m) => mine[m.id]?.review?.verdict === "revise" && mine[m.id]?.status !== "done").length;
    return { done, total: ms.length, revise };
  };

  return (
    <div className="relative">
      {/* Arrows when there are more weeks than fit: more than three, or (on a phone, a week at a time) more than one. */}
      {weeks.length > 1 && (
        <div className={weeks.length > 3 ? "" : "sm:hidden"}>
          <button onClick={() => step(-1)} aria-label="Earlier weeks" className="press absolute -left-3 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-ink-2 shadow-sm hover:text-ink">
            <Icon name="back" size={13} />
          </button>
          <button onClick={() => step(1)} aria-label="Later weeks" className="press absolute -right-3 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-ink-2 shadow-sm hover:text-ink">
            <Icon name="arrow" size={13} />
          </button>
        </div>
      )}
      <div ref={box} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto" role="list" aria-label="Your course, lesson by lesson">
        {weeks.map((w, wi) => {
          const [label, name] = [w.title.split(" · ")[0], w.title.split(" · ").slice(1).join(" · ")];
          return (
            <div key={w.id} role="listitem" className={`w-full min-w-0 flex-none snap-start px-1 pb-4 pt-1 ${weeks.length >= 3 ? "sm:w-1/3" : weeks.length === 2 ? "sm:w-1/2" : ""}`}>
              <div className={`truncate px-2 text-[12px] ${wi === nowWeek ? "font-medium text-ink" : "text-ink-3"}`}>{label}{name ? ` · ${name}` : ""}</div>
              {/* Each lesson an equal column: its stop on the line, its name under it (never over the next one's). */}
              <div className="mt-3 flex">
                {w.lessons.map((l, li) => {
                  const s = stats(l);
                  const isNow = l.id === course.currentLessonId;
                  const full = s.total > 0 && s.done === s.total;
                  const pct = s.total ? (s.done / s.total) * 100 : 0;
                  const size = isNow ? 22 : 16;
                  const first = wi === 0 && li === 0;
                  const last = wi === weeks.length - 1 && li === w.lessons.length - 1;
                  return (
                    <div key={l.id} className="relative min-w-0 flex-1">
                      {/* The line through the stop: in from the last lesson, out to the next. */}
                      <div className="absolute inset-x-0 top-[11px] flex h-[2px]" aria-hidden="true">
                        <span className={`flex-1 ${first ? "" : s.done ? "bg-ok" : "bg-line-strong"}`} />
                        <span className={`flex-1 ${last ? "" : full ? "bg-ok" : "bg-line-strong"}`} />
                      </div>
                      <button
                        onClick={() => onPick(picked === l.id ? null : l.id)}
                        aria-pressed={picked === l.id}
                        aria-label={`${l.title}: ${s.done} of ${s.total} cards done${s.revise ? `, ${s.revise} to revise` : ""}${isNow ? ", today" : ""}`}
                        className="press group relative flex w-full flex-col items-center rounded-lg px-1 outline-offset-2"
                      >
                        <span className="grid h-6 place-items-center">
                          <span className="relative block" style={{ width: size, height: size }}>
                            <span
                              className={`absolute inset-0 rounded-full border-2 transition-shadow ${s.done ? "border-ok" : "border-line-strong"} ${isNow ? "shadow-[0_0_0_5px_rgba(47,138,85,0.14)]" : ""} ${picked === l.id ? "!shadow-[0_0_0_3px_#fff,0_0_0_5px_#1b1b1a]" : "group-hover:shadow-[0_0_0_4px_rgba(0,0,0,0.07)]"}`}
                              style={{ background: full ? "#2f8a55" : s.done ? `conic-gradient(#2f8a55 0 ${pct}%, #fff 0)` : "#fff" }}
                            />
                            {s.revise > 0 && <span className="absolute -right-2.5 -top-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-warn px-1 text-[10px] font-semibold leading-none text-white">{s.revise}</span>}
                          </span>
                        </span>
                        <span className={`mt-1.5 line-clamp-2 text-center text-[11.5px] leading-tight ${isNow || picked === l.id ? "font-medium text-ink" : "text-ink-2 group-hover:text-ink"}`}>{l.title}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
