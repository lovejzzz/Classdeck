"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { Level, Skill } from "@/lib/types";

/**
 * Rate each skill on the four-level rubric. If there's an earlier self-check,
 * its rating shows as a ring so progress is visible at a glance.
 */
export function SelfCheck({
  courseId, studentId, moduleId, skills, levels, ratings, earlier, onChanged, onDone, big,
}: {
  courseId: string; studentId: string; moduleId: string; skills: Skill[]; levels: Level[];
  ratings: Record<string, number>; earlier?: { label: string; ratings: Record<string, number> };
  onChanged: () => void; onDone: () => void; big: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, number>>(ratings);
  const [hover, setHover] = useState<{ skill: string; n: number } | null>(null);
  const complete = skills.every((s) => draft[s.id]);
  const shown = hover ? levels.find((l) => l.n === hover.n) : undefined;

  async function set(skill: string, n: number) {
    const next = { ...draft, [skill]: n };
    setDraft(next);
    await op(courseId, { op: "rate", studentId, moduleId, ratings: next });
    onChanged();
  }

  return (
    <div>
      <div className="grid grid-cols-[1fr_repeat(4,minmax(0,4.5rem))] items-center gap-y-1 text-[12px] text-ink-3">
        <span />
        {levels.map((l) => <span key={l.n} className="text-center leading-tight">{l.n} · {l.name}</span>)}
      </div>
      <div className="mt-2 divide-y divide-line rounded-xl border border-line">
        {skills.map((s) => {
          const was = earlier?.ratings[s.id];
          return (
            <div key={s.id} className="grid grid-cols-[1fr_repeat(4,minmax(0,4.5rem))] items-center px-3 py-2.5" role="radiogroup" aria-label={s.name}>
              <span className={`font-medium ${big ? "text-[15px]" : "text-[13.5px]"}`}>
                {s.name}
                {was && draft[s.id] && draft[s.id] > was && <span className="pop ml-2 font-mono text-[11px] text-ok">+{draft[s.id] - was}</span>}
              </span>
              {levels.map((l) => {
                const on = draft[s.id] === l.n;
                const ghost = was === l.n;
                return (
                  <span key={l.n} className="flex justify-center">
                    <button
                      role="radio"
                      aria-checked={on}
                      aria-label={`${s.name}: ${l.name}`}
                      onClick={() => set(s.id, l.n)}
                      onPointerEnter={() => setHover({ skill: s.id, n: l.n })}
                      onPointerLeave={() => setHover(null)}
                      className={`press relative flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${on ? "border-ink bg-ink text-white" : "border-line-strong hover:border-ink-3"}`}
                    >
                      {on && <span className="pop h-2 w-2 rounded-full bg-white" />}
                      {ghost && !on && <span className="absolute -inset-1 rounded-full border-2 border-dashed border-[#367195]/50" title={`${earlier?.label}`} />}
                    </button>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="mt-2 min-h-5 text-[12.5px] text-ink-3">
        {shown ? <><span className="font-medium text-ink-2">{shown.name}:</span> {shown.description}</> : earlier ? <>Dashed rings show your {earlier.label}.</> : "Hover a circle to see what each level means."}
      </p>
      <button
        onClick={() => {
          if (!complete) return toast("Rate all six skills first", { icon: "selfcheck", tone: "plain" });
          onDone();
        }}
        className={`btn btn-dark press mt-3 ${big ? "h-11 px-5 text-[15px]" : "h-9 px-4"}`}
      >
        Save my self-check
      </button>
    </div>
  );
}
