"use client";

import { useState } from "react";
import { skillPicture } from "@/lib/coach";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { CourseState, Lesson } from "@/lib/types";
import { Icon } from "../Icon";

/** Choose or drop an elective: its cards join (or leave) the student's weeks. */
export async function chooseElective(courseId: string, studentId: string, l: Lesson, on: boolean, onChanged: () => void) {
  const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "chooseElective", studentId, lessonId: l.id, on });
  if (r.ok === false) return toast(r.error ?? "Couldn’t update", { icon: "x", tone: "bad" });
  onChanged();
  toast(on ? `Added “${l.title}” to your weeks` : `Dropped “${l.title}”`, { icon: on ? "plus" : "x", tone: on ? undefined : "plain" });
}

/**
 * An elective the student hasn't chosen, in its own week where the lesson would be: what it is, how many cards and
 * classmates, the skills it works on (marked For you when it fits their weakest), and Choose. Its cards face down until
 * chosen.
 */
export function ElectiveRow({ state, studentId, lesson: l, size, onChanged }: {
  state: CourseState; studentId: string; lesson: Lesson; size: { w: number; h: number }; onChanged: () => void;
}) {
  const { course } = state;
  const [busy, setBusy] = useState(false);
  const all = course.weeks.flatMap((w) => w.lessons).filter((x) => x.elective);
  const min = course.electiveMin ?? 2;
  const chosen = all.filter((x) => x.chosen).length;
  const { self, teacher } = skillPicture(state.progress[studentId] ?? {});
  const level = (id: string) => teacher[id] ?? self[id] ?? 3;
  const skills = l.catalog?.skills ?? [];
  const weakest = Math.min(...all.flatMap((x) => (x.catalog?.skills ?? []).map(level)).concat(4));
  const fits = skills.some((s) => level(s) === weakest && weakest <= 2);
  const name = (id: string) => course.skills?.find((s) => s.id === id)?.name ?? id;
  const cards = l.catalog?.cards ?? 0;
  const h = Math.round(size.h * 0.62);
  return (
    <div id={`elective-${l.id}`} className="scroll-mt-24">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-medium">{l.title}</span>
        <span className="chip h-5 bg-[#eef0fb] text-[11px] text-[#4b56a8]"><Icon name="split" size={10} />Elective</span>
        {fits && <span className="chip h-5 bg-ok/10 text-[11px] text-ok">For you</span>}
        <span className="text-[12px] text-ink-3">{chosen < min ? `Choose at least ${min}` : `${chosen} chosen`}</span>
      </div>
      <div className="mt-2 flex items-center gap-6 rounded-[18px] border border-dashed border-[#4b56a8]/35 bg-[#eef0fb]/40 py-4 pl-6 pr-4" style={{ minHeight: h }}>
        {/* Its cards, face down until it's chosen. */}
        <span className="relative block flex-none" style={{ width: 70, height: 96 }} aria-hidden="true">
          {[2, 1, 0].map((i) => (
            <span key={i} className="absolute inset-0 rounded-[9px] border border-[#2c2c29] bg-ink"
              style={{ transform: `translate(${i * 5}px, ${i * -3}px) rotate(${(i - 1) * 5}deg)`, backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 7px)" }} />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          {l.goal && <span className="block max-w-xl text-[13px] leading-snug text-ink-2">{l.goal}</span>}
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
            {cards} card{cards === 1 ? "" : "s"} · {l.takenBy ?? 0} classmate{l.takenBy === 1 ? "" : "s"}
            {skills.map((s) => <span key={s} className="chip h-5 bg-white text-[11px] text-[#3d6f91]">{name(s)}</span>)}
          </span>
        </span>
        <button disabled={busy} onClick={async () => { setBusy(true); await chooseElective(course.id, studentId, l, true, onChanged); setBusy(false); }}
          className="btn btn-dark press h-9 flex-none px-4"><Icon name="plus" size={13} /> Choose</button>
      </div>
    </div>
  );
}
