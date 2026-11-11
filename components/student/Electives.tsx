"use client";

import { useState } from "react";
import { skillPicture } from "@/lib/coach";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { CourseState, Lesson } from "@/lib/types";
import { Icon } from "../Icon";

/**
 * The electives shelf: every elective module, how many classmates chose it, and which one
 * fits the student's weakest skill. Choosing one adds its cards to their weeks.
 */
export function Electives({ state, studentId, onChanged }: { state: CourseState; studentId: string; onChanged: () => void }) {
  const { course } = state;
  const all = course.weeks.flatMap((w) => w.lessons.map((l) => ({ w, l }))).filter((x) => x.l.elective);
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(true);
  if (!all.length) return null;
  const isChosen = (l: Lesson) => local[l.id] ?? !!l.chosen;
  const min = course.electiveMin ?? 2;
  const count = all.filter((x) => isChosen(x.l)).length;
  // Suggest electives that practice the weakest skills (teacher's view first, then self-check).
  const { self, teacher } = skillPicture(state.progress[studentId] ?? {});
  const level = (id: string) => teacher[id] ?? self[id] ?? 3;
  const skillsOf = (l: Lesson) => l.catalog?.skills ?? [...new Set(l.modules.flatMap((m) => m.skills ?? []))];
  const weakest = Math.min(...all.map((x) => Math.min(...(skillsOf(x.l).map(level).concat(4)))));
  const name = (id: string) => course.skills?.find((s) => s.id === id)?.name ?? id;

  async function choose(l: Lesson, on: boolean) {
    setLocal((x) => ({ ...x, [l.id]: on }));
    const r = await op<{ ok: boolean; error?: string }>(course.id, { op: "chooseElective", studentId, lessonId: l.id, on });
    if (r.ok === false) {
      setLocal((x) => ({ ...x, [l.id]: !on }));
      return toast(r.error ?? "Couldn’t update", { icon: "x", tone: "bad" });
    }
    onChanged();
    toast(on ? `Added “${l.title}” to your weeks` : `Dropped “${l.title}”`, { icon: on ? "plus" : "x", tone: on ? undefined : "plain" });
  }

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section id="electives" className="rise card mt-4 scroll-mt-4 overflow-hidden" aria-label="Electives">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#eef0fb] text-[#4b56a8]"><Icon name="layers" size={14} /></span>
          <span className="flex-1">
            <span className="block text-[14px] font-medium">Electives</span>
            <span className="block text-[12.5px] text-ink-3">Choose at least {min}. They add to the required weeks, at your own pace.</span>
          </span>
          <span className={`chip h-6 ${count >= min ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>{count}/{min} chosen</span>
          <Icon name="chevron" size={14} className={`text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <div className={`fold ${open ? "fold-open" : ""}`}>
          <div className="min-h-0 overflow-hidden">
            <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
              {all.map(({ l }, i) => {
                const on = isChosen(l);
                const skills = skillsOf(l);
                const fits = !on && skills.some((s) => level(s) === weakest && weakest <= 2);
                return (
                  <article key={l.id} className={`pop flex flex-col rounded-xl border p-3.5 ${on ? "border-ink" : "border-line"}`} style={{ "--i": i } as React.CSSProperties}>
                    <div className="flex items-start gap-2">
                      <h3 className="flex-1 text-[14px] font-medium leading-snug">{l.title}</h3>
                      {fits && <span className="chip h-5 flex-none bg-ok/10 text-[11px] text-ok">For you</span>}
                    </div>
                    {l.goal && <p className="mt-1 flex-1 text-[12.5px] leading-snug text-ink-2">{l.goal}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {skills.map((s) => <span key={s} className="chip h-5 bg-[#eef3f7] text-[11px] text-[#3d6f91]">{name(s)}</span>)}
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-3">
                      <span>{l.catalog?.cards ?? l.modules.length} cards</span>·<span>{l.takenBy ?? 0} classmate{l.takenBy === 1 ? "" : "s"}</span>
                      <span className="flex-1" />
                      <button onClick={() => choose(l, !on)} className={`btn press h-8 ${on ? "btn-ghost" : "btn-dark"}`}>{on ? "Drop" : "Choose"}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
