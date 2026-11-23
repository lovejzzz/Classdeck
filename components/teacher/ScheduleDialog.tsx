"use client";

import { useState } from "react";
import { localDay, scheduleDates, shortDate, weekday } from "@/lib/dates";
import type { Lesson } from "@/lib/types";
import { Icon } from "../Icon";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Date a lesson and every lesson after it from a timetable: the first class, the weekdays class meets, and days with
 * no class. Electives aren't dated (students take them at their own pace). Shows the dates before setting them.
 */
export function ScheduleDialog({ lessons, start: startAt, onApply, onClose }: {
  /** This lesson and every later one, in order. */
  lessons: Lesson[];
  start?: string;
  onApply: (dated: Lesson[]) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(startAt ?? localDay());
  const [days, setDays] = useState<number[]>(() => [weekday(startAt ?? localDay())]);
  const [skip, setSkip] = useState<string[]>([]);
  const [off, setOff] = useState("");
  const dated = lessons.filter((l) => !l.elective);
  const dates = scheduleDates(dated.length, start, days, skip);
  const ok = dates.length === dated.length && dated.length > 0;
  return (
    <div className="pop mt-2 max-h-[calc(100dvh-8rem)] w-[30rem] max-w-[92vw] overflow-y-auto rounded-xl border border-line bg-white p-4 shadow-[0_16px_40px_-20px_rgba(20,20,18,0.35)]" role="dialog" aria-label="Schedule lessons">
      <div className="mb-3 flex items-center">
        <span className="flex-1 text-[14px] font-semibold">Schedule {dated.length === 1 ? "this lesson" : `${dated.length} lessons`}</span>
        <button onClick={onClose} aria-label="Close" className="btn btn-quiet press h-7 w-7 justify-center px-0"><Icon name="x" size={13} /></button>
      </div>
      <label className="block text-[12.5px] font-medium text-ink-2">First class
        <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className="field mt-1 h-9 w-full" />
      </label>
      <div className="mt-3 text-[12.5px] font-medium text-ink-2">Class meets on</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {DAYS.map((d, i) => (
          <button key={d} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())} aria-pressed={days.includes(i)}
            className={`press h-8 w-12 rounded-lg text-[12.5px] transition-colors ${days.includes(i) ? "bg-ink text-white" : "bg-lane text-ink-2 hover:bg-line"}`}>{d}</button>
        ))}
      </div>
      <div className="mt-3 text-[12.5px] font-medium text-ink-2">No class on <span className="font-normal text-ink-3">(holidays, optional)</span></div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {skip.map((d) => (
          <span key={d} className="chip h-7 gap-1 bg-lane text-[12px]">{shortDate(d)}
            <button onClick={() => setSkip(skip.filter((x) => x !== d))} aria-label={`Class on ${shortDate(d)} after all`} className="text-ink-3 hover:text-ink"><Icon name="x" size={10} /></button>
          </span>
        ))}
        <input type="date" value={off} onChange={(e) => setOff(e.target.value)} aria-label="A day with no class" className="field h-8 w-40 py-0" />
        <button disabled={!off || skip.includes(off)} onClick={() => { setSkip([...skip, off].sort()); setOff(""); }} className="btn btn-ghost press h-8 px-2.5 text-[12px] disabled:opacity-50"><Icon name="plus" size={11} /> Add</button>
      </div>
      <div className="mt-4 max-h-44 overflow-y-auto rounded-lg bg-lane/60 p-2 text-[12.5px]">
        {!days.length ? <p className="px-1 text-ink-3">Pick at least one day class meets.</p> : dated.map((l, i) => (
          <div key={l.id} className="flex gap-3 px-1 py-0.5">
            <span className="mono w-28 flex-none text-ink-2">{dates[i] ? shortDate(dates[i]) : "—"}</span>
            <span className="min-w-0 truncate">{l.title}</span>
          </div>
        ))}
      </div>
      {lessons.length > dated.length && <p className="mt-2 text-[12px] text-ink-3">Electives keep no date: students take them at their own pace.</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-quiet press h-9">Cancel</button>
        <button disabled={!ok} onClick={() => onApply(dated.map((l, i) => ({ ...l, date: dates[i] })))} className="btn btn-dark press h-9 disabled:opacity-50">Set {dated.length} date{dated.length === 1 ? "" : "s"}</button>
      </div>
    </div>
  );
}
