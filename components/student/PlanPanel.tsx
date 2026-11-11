"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { isoDay } from "@/lib/grading";
import { DRILLS, FACET_TEXT, FEEL, SCENARIOS, SUBSKILLS, prcaScore, streak } from "@/lib/onboarding";
import { toast } from "@/lib/toast";
import type { Course, Plan } from "@/lib/types";
import { Icon } from "../Icon";

const STATUS: [NonNullable<Plan["objectives"][number]["status"]>, string, string][] = [
  ["notyet", "Not yet", "bg-[#f3f3f1] text-ink-2"],
  ["getting", "Getting there", "bg-warn/10 text-warn"],
  ["achieved", "Achieved", "bg-ok/10 text-ok"],
];

/**
 * A learner's plan, from onboarding onward: why they're here, their goal and objectives with
 * progress, confidence then and now, their (private) nerves check, this week's focus, and
 * their practice streak. Read-only for the teacher.
 */
export function PlanPanel({ courseId, studentId, course, plan, readOnly = false, onChanged, onStart }: {
  courseId: string; studentId: string; course: Course; plan?: Plan; readOnly?: boolean; onChanged?: () => void; onStart?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [focus, setFocus] = useState<string[]>(plan?.focus?.subskills ?? []);

  if (!plan) {
    return (
      <div className="card p-5 text-[13.5px]">
        <h3 className="font-medium">No plan yet</h3>
        <p className="mt-1 text-ink-2">{readOnly ? "This student hasn’t filled in the Week 0 questionnaire yet." : "Fill in the Week 0 “My starting point” questionnaire to set your goal, objectives, and focus."}</p>
        {onStart && <button onClick={onStart} className="btn btn-dark press mt-3 h-8 px-3 text-[13px]">Open the questionnaire <Icon name="arrow" size={12} /></button>}
      </div>
    );
  }

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "savePlan", studentId, plan: { ...plan, ...patch } });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "Couldn’t save");
    onChanged?.();
  }

  const today = isoDay(0);
  const days = [...new Set((plan.drills ?? []).map((d) => d.day))];
  const run = streak(days, today);
  const last14 = Array.from({ length: 14 }, (_, i) => isoDay(i - 13));
  const feels = (plan.drills ?? []).filter((d) => d.feel);
  const prca = plan.prca ?? [];
  const lastPrca = prca.at(-1);
  const result = lastPrca ? prcaScore(lastPrca.answers) : undefined;
  const skillName = (k: string) => course.skills?.find((s) => s.id === k)?.name ?? k;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="eyebrow">Goal</div>
        <p className="mt-1 text-[15px] font-medium leading-snug">{plan.goal || "No goal written yet."}</p>
        {plan.purposes.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1">{plan.purposes.map((x) => <span key={x} className="chip">{x}</span>)}</div>}
        {plan.purposeNote && <p className="mt-2 text-[13px] text-ink-2">{plan.purposeNote}</p>}

        {plan.objectives.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {plan.objectives.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1 basis-64 text-[13.5px]">
                  <div className="font-medium">{o.lo}</div>
                  {o.lm && <div className="text-[12.5px] text-ink-3">You’ll know when: {o.lm}</div>}
                </div>
                <div className="flex gap-1" role="group" aria-label={`Progress on “${o.lo}”`}>
                  {STATUS.map(([k, label, tone]) => {
                    const on = (o.status ?? "notyet") === k;
                    return readOnly ? (on ? <span key={k} className={`chip ${tone}`}>{label}</span> : null) : (
                      <button key={k} aria-pressed={on} disabled={busy}
                        onClick={() => save({ objectives: plan.objectives.map((x) => x.id === o.id ? { ...x, status: k } : x) })}
                        className={`press chip h-7 px-2.5 ${on ? tone : "bg-transparent text-ink-3 hover:text-ink"}`}>{label}</button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 text-[14px] font-medium">Practice streak</h3>
            <span className="font-mono text-[22px]">{run}</span><span className="text-[12px] text-ink-3">day{run === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-3 flex gap-1" aria-label={`Drills in the last 14 days: ${last14.filter((d) => days.includes(d)).length}`}>
            {last14.map((d) => (
              <span key={d} title={d} className={`h-6 flex-1 rounded ${days.includes(d) ? "bg-ok/70" : d === today ? "border border-dashed border-line-strong" : "bg-[#f3f3f1]"}`} />
            ))}
          </div>
          <p className="mt-2 text-[12px] text-ink-3">One 10-minute drill a day. Today’s drill is in “For you” on your cards page.</p>
          {feels.length > 0 && (
            <ul className="mt-3 space-y-1 text-[12.5px]">
              {feels.slice(-4).reverse().map((d) => (
                <li key={`${d.day}-${d.id}`} className="flex gap-2"><span className="w-20 flex-none font-mono text-ink-3">{d.day.slice(5)}</span><span className="flex-1 truncate">{DRILLS.find((x) => x.id === d.id)?.title ?? d.id}</span><span className="text-ink-2">{FEEL[d.feel! - 1]}</span></li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 text-[14px] font-medium">This week’s focus</h3>
            {!readOnly && <button onClick={() => setPicking(!picking)} className="btn btn-quiet press h-7 px-2 text-[12px]">{picking ? "Close" : plan.focus?.subskills.length ? "Change" : "Choose"}</button>}
          </div>
          {!picking && (plan.focus?.subskills.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">{plan.focus.subskills.map((s) => <span key={s} className="chip h-7 px-2.5 text-[12.5px]"><Icon name="selfcheck" size={12} />{s}</span>)}</div>
          ) : <p className="mt-2 text-[13px] text-ink-3">Pick one or two sub-skills to work on this week. Your daily drills follow them.</p>)}
          {picking && (
            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
              {Object.entries(SUBSKILLS).map(([k, subs]) => (
                <div key={k}>
                  <div className="text-[11.5px] text-ink-3">{skillName(k)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {subs.map((s) => {
                      const on = focus.includes(s);
                      return <button key={s} aria-pressed={on} onClick={() => setFocus(on ? focus.filter((x) => x !== s) : [...focus, s].slice(-2))}
                        className={`press chip h-7 px-2.5 text-[12px] ${on ? "bg-ink text-white" : ""}`}>{s}</button>;
                    })}
                  </div>
                </div>
              ))}
              <button disabled={busy || !focus.length} onClick={async () => { await save({ focus }); setPicking(false); }} className="btn btn-dark press h-8 px-3 text-[13px]">Save focus</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h3 className="text-[14px] font-medium">Confidence in real situations</h3>
          <p className="mt-0.5 text-[12px] text-ink-3">Outline: when you started. Filled: now.{!readOnly && " Click to update."}</p>
          <div className="mt-3 space-y-2">
            {SCENARIOS.filter(([k]) => plan.confidence[k] || plan.confidenceStart?.[k]).map(([k, label]) => {
              const now = plan.confidence[k] ?? 0;
              const start = plan.confidenceStart?.[k] ?? 0;
              return (
                <div key={k} className="text-[12.5px]">
                  <div className="flex items-center gap-2"><span className="flex-1 truncate">{label}</span>{now > start && start > 0 && <span className="text-ok">+{now - start}</span>}</div>
                  <div className="mt-1 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} disabled={readOnly || busy} aria-label={`${label}: ${n} of 5`} aria-pressed={now === n}
                        onClick={() => save({ confidence: { ...plan.confidence, [k]: n } })}
                        className={`h-3 flex-1 rounded-sm ${n <= now ? "bg-ink" : "bg-[#efefec]"} ${n === start ? "ring-2 ring-[#367195] ring-offset-1" : ""} disabled:cursor-default`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 text-[14px] font-medium">Speaking nerves</h3>
            <span className="flex items-center gap-1 text-[11.5px] text-ink-3"><Icon name="lock" size={11} />{readOnly ? "Private to you and the student" : "Only you and your teacher"}</span>
          </div>
          {result ? (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-[22px]">{result.score}</span><span className="text-[12px] text-ink-3">/ 30 · {result.band}</span>
                {prca.length > 1 && (() => {
                  const d = result.score - prca[0].score;
                  return <span className={`text-[12px] ${d < 0 ? "text-ok" : d > 0 ? "text-warn" : "text-ink-3"}`}>{d < 0 ? `${-d} lower` : d > 0 ? `${d} higher` : "no change"} than at the start</span>;
                })()}
              </div>
              {result.top && <p className="mt-2 text-[12.5px] leading-relaxed"><span className="font-medium">{FACET_TEXT[result.top].name}:</span> <span className="text-ink-2">{FACET_TEXT[result.top].text}</span></p>}
              <p className="mt-2 text-[11.5px] text-ink-3">Lower is calmer (6–30). Retake it from the Week 0 card whenever you like.</p>
            </>
          ) : <p className="mt-2 text-[13px] text-ink-3">Not taken. It’s optional, in the Week 0 questionnaire.</p>}
        </div>
      </div>
    </div>
  );
}
