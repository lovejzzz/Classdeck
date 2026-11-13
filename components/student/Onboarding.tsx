"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { AGREE, FACET_TEXT, PRCA_ITEMS, PURPOSES, SCENARIOS, prcaScore } from "@/lib/onboarding";
import { toast } from "@/lib/toast";
import type { Plan } from "@/lib/types";
import { Icon } from "../Icon";

const STEPS = ["Welcome", "Why you’re here", "Goals", "Confidence", "Skills", "Nerves check", "Summary"] as const;
type Obj = Plan["objectives"][number];

/**
 * The CaPS onboarding questionnaire: why you're here, what you want to get better at,
 * how confident you feel in real situations, your skill ratings, and an optional,
 * private public-speaking anxiety check (PRCA-24, items 19–24).
 */
export function Onboarding({ courseId, studentId, plan, skills, onDone, big }: {
  courseId: string; studentId: string; plan?: Plan; big: boolean;
  /** The six-skill self-rating, rendered as one step. */
  skills: (next: () => void) => React.ReactNode;
  onDone: () => void;
}) {
  const [step, setStep] = useState(plan ? STEPS.length - 1 : 0);
  const [purposes, setPurposes] = useState<string[]>(plan?.purposes ?? []);
  const [purposeNote, setPurposeNote] = useState(plan?.purposeNote ?? "");
  const [goal, setGoal] = useState(plan?.goal ?? "");
  const [objectives, setObjectives] = useState<Obj[]>(plan?.objectives?.length ? plan.objectives : [{ id: "lo-1", lo: "", lm: "" }]);
  const [confidence, setConfidence] = useState<Record<string, number>>(plan?.confidence ?? {});
  const [prca, setPrca] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const last = plan?.prca?.at(-1);
  const result = prca.length === 6 && prca.every(Boolean) ? prcaScore(prca) : last ? prcaScore(last.answers) : undefined;

  async function save(next: number, withPrca = false) {
    setBusy(true);
    const r = await op<{ ok: boolean; error?: string }>(courseId, {
      op: "savePlan", studentId,
      plan: { purposes, purposeNote, goal, objectives: objectives.filter((o) => o.lo.trim()), confidence, prca: withPrca ? prca : undefined },
    });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "Couldn’t save");
    setStep(next);
  }

  const text = big ? "text-[14.5px]" : "text-[13.5px]";
  const nav = (back: boolean, next: () => void, label = "Continue", disabled = false) => (
    <div className="mt-5 flex items-center gap-2">
      {back && <button onClick={() => setStep(step - 1)} className="btn btn-quiet press h-8 px-3 text-[13px]">Back</button>}
      <span className="flex-1" />
      <button onClick={next} disabled={busy || disabled} className="btn btn-dark press h-8 px-3.5 text-[13px]">{label} <Icon name="arrow" size={12} /></button>
    </div>
  );

  return (
    <section aria-label="Onboarding questionnaire" className="card p-4 sm:p-5">
      <ol className="mb-4 flex flex-wrap gap-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button onClick={() => plan && setStep(i)} disabled={!plan && i > step} aria-current={i === step ? "step" : undefined}
              aria-label={`Step ${i + 1}: ${s}`}
              className={`press h-6 min-w-6 rounded-full px-2 text-[11.5px] pointer-coarse:h-8 pointer-coarse:min-w-8 pointer-coarse:text-[13px] ${i === step ? "bg-ink text-white" : i < step ? "bg-lane text-ink" : "text-ink-3"}`}>
              {/* On a phone the steps are numbers only, so they stay on one line; the heading below names the step. */}
              {i + 1}<span className="max-sm:hidden">. {s}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className={`${text} leading-relaxed`}>
          <h3 className="text-[16px] font-medium">Welcome. Let’s find your starting point.</h3>
          <p className="mt-2 text-ink-2">Everyone starts this course in a different place. These questions help you set goals that matter to you and help your teacher plan sessions around what the group needs.</p>
          <ul className="mt-3 space-y-1.5 text-ink-2">
            <li className="flex gap-2"><Icon name="clock" size={14} className="mt-1 flex-none" />About 10 minutes. There are no right or wrong answers.</li>
            <li className="flex gap-2"><Icon name="reset" size={14} className="mt-1 flex-none" />You can change your answers any time; we’ll revisit them in Week 6.</li>
            <li className="flex gap-2"><Icon name="lock" size={14} className="mt-1 flex-none" />Only you and your teacher see your answers. Classmates never do.</li>
          </ul>
          {nav(false, () => setStep(1), "Start")}
        </div>
      )}

      {step === 1 && (
        <div className={text}>
          <h3 className="font-medium">What brings you to this course?</h3>
          <p className="mt-1 text-ink-3">Pick any that apply.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PURPOSES.map((x) => {
              const on = purposes.includes(x);
              return (
                <button key={x} aria-pressed={on} onClick={() => setPurposes(on ? purposes.filter((y) => y !== x) : [...purposes, x])}
                  className={`press chip h-8 px-3 text-[13px] ${on ? "bg-ink text-white" : ""}`}>{on && <Icon name="check" size={12} />}{x}</button>
              );
            })}
          </div>
          <label className="mt-4 block text-[12.5px] text-ink-2" htmlFor="ob-note">Anything else? (optional)</label>
          <textarea id="ob-note" value={purposeNote} onChange={(e) => setPurposeNote(e.target.value)} rows={2} className="field mt-1 w-full" placeholder="For example: I present my lab’s results every month and always rush." />
          {nav(true, () => setStep(2), "Continue", !purposes.length && !purposeNote.trim())}
        </div>
      )}

      {step === 2 && (
        <div className={text}>
          <h3 className="font-medium">Your goal for these seven weeks</h3>
          <label className="mt-2 block text-[12.5px] text-ink-2" htmlFor="ob-goal">In one or two sentences, what do you want to be able to do by the end?</label>
          <textarea id="ob-goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} className="field mt-1 w-full" placeholder="Give a 5-minute research talk without reading from my slides." />
          <h4 className="mt-5 font-medium">Learning objectives</h4>
          <p className="mt-0.5 text-[12.5px] text-ink-3">Break your goal into up to three things to learn, and how you’ll know you’ve got there.</p>
          <div className="mt-2 space-y-2.5">
            {objectives.map((o, i) => (
              <div key={o.id} className="rounded-lg border border-line p-2.5">
                <label className="block text-[12px] text-ink-2" htmlFor={`lo-${o.id}`}>I want to learn to…</label>
                <input id={`lo-${o.id}`} value={o.lo} onChange={(e) => setObjectives(objectives.map((x, j) => j === i ? { ...x, lo: e.target.value } : x))} className="field mt-1 w-full" placeholder="Open with a hook instead of “Hi, today I’ll talk about…”" />
                <label className="mt-2 block text-[12px] text-ink-2" htmlFor={`lm-${o.id}`}>I’ll know I’ve got there when…</label>
                <input id={`lm-${o.id}`} value={o.lm} onChange={(e) => setObjectives(objectives.map((x, j) => j === i ? { ...x, lm: e.target.value } : x))} className="field mt-1 w-full" placeholder="Two classmates can repeat my main point after my talk." />
                {objectives.length > 1 && <button onClick={() => setObjectives(objectives.filter((_, j) => j !== i))} className="btn btn-quiet press mt-1.5 h-7 px-2 text-[12px]">Remove</button>}
              </div>
            ))}
          </div>
          {objectives.length < 3 && <button onClick={() => setObjectives([...objectives, { id: `lo-${Date.now().toString(36)}`, lo: "", lm: "" }])} className="btn btn-quiet press mt-2 h-7 px-2 text-[12.5px]"><Icon name="plus" size={12} /> Add an objective</button>}
          {nav(true, () => save(3), "Save and continue", !goal.trim())}
        </div>
      )}

      {step === 3 && (
        <div className={text}>
          <h3 className="font-medium">How confident do you feel speaking in these situations?</h3>
          <p className="mt-1 text-[12.5px] text-ink-3">1 = not at all, 5 = very. Skip any that don’t apply to you.</p>
          <div className="mt-3 space-y-2">
            {SCENARIOS.map(([k, label]) => (
              <fieldset key={k} className="flex flex-wrap items-center gap-2">
                <legend className="sr-only">{label}</legend>
                <span className="min-w-0 flex-1 basis-56">{label}</span>
                <span className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} aria-pressed={confidence[k] === n} aria-label={`${label}: ${n} of 5`}
                      onClick={() => setConfidence((c) => ({ ...c, [k]: n }))}
                      className={`press h-8 w-8 rounded-lg border text-[13px] ${confidence[k] === n ? "border-ink bg-ink text-white" : "border-line hover:border-ink-3"}`}>{n}</button>
                  ))}
                </span>
              </fieldset>
            ))}
          </div>
          {nav(true, () => save(4), "Save and continue")}
        </div>
      )}

      {step === 4 && (
        <div className={text}>
          <h3 className="font-medium">Rate yourself on the six skills</h3>
          <p className="mt-1 text-[12.5px] text-ink-3">This is your baseline. You’ll compare against it in Week 6.</p>
          <div className="mt-3">{skills(() => setStep(5))}</div>
          <button onClick={() => setStep(3)} className="btn btn-quiet press mt-2 h-8 px-3 text-[13px]">Back</button>
        </div>
      )}

      {step === 5 && (
        <div className={text}>
          <h3 className="font-medium">A quick check on speaking nerves <span className="font-normal text-ink-3">(optional)</span></h3>
          <p className="mt-1 leading-relaxed text-ink-2">Six statements from a widely used research questionnaire on public speaking anxiety. Nerves are normal, and knowing where they show up (before you speak, in your body, or in your thinking) helps you pick practice that works for you. Your result is private to you and your teacher, and you can retake it later to see how it changes.</p>
          <div className="mt-4 space-y-3.5">
            {PRCA_ITEMS.map((it, i) => (
              <fieldset key={it.n}>
                <legend className="font-medium">{it.text}</legend>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {AGREE.map((label, j) => (
                    <button key={label} aria-pressed={prca[i] === j + 1} onClick={() => setPrca((cur) => { const next = [...cur]; next[i] = j + 1; return next; })}
                      className={`press h-7 rounded-full border px-2.5 text-[12px] ${prca[i] === j + 1 ? "border-ink bg-ink text-white" : "border-line hover:border-ink-3"}`}>{label}</button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2">
            <button onClick={() => setStep(4)} className="btn btn-quiet press h-8 px-3 text-[13px]">Back</button>
            <span className="flex-1" />
            <button onClick={() => setStep(6)} className="btn btn-quiet press h-8 px-3 text-[13px]">Skip</button>
            <button onClick={() => save(6, true)} disabled={busy || prca.filter(Boolean).length < 6} className="btn btn-dark press h-8 px-3.5 text-[13px]">See my result <Icon name="arrow" size={12} /></button>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className={text}>
          <h3 className="text-[16px] font-medium">Your starting point</h3>
          {goal && <p className="mt-2"><span className="text-ink-3">Goal:</span> {goal}</p>}
          {objectives.some((o) => o.lo.trim()) && (
            <ul className="mt-2 space-y-1">
              {objectives.filter((o) => o.lo.trim()).map((o) => <li key={o.id} className="flex gap-2"><Icon name="check" size={13} className="mt-1 flex-none text-ink-3" /><span>{o.lo}{o.lm && <span className="block text-[12.5px] text-ink-3">You’ll know when: {o.lm}</span>}</span></li>)}
            </ul>
          )}
          {result && (
            <div className="mt-4 rounded-lg bg-lane p-3">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">Speaking nerves</span>
                <span className="mono text-[12px] text-ink-2">{result.score} / 30 · {result.band}</span>
                <span className="flex-1" />
                <Icon name="lock" size={12} className="text-ink-3" /><span className="text-[11.5px] text-ink-3">You and your teacher</span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                {result.band === "high" ? "Speaking makes you quite nervous right now. That’s common, and it’s exactly what steady, low-stakes practice is for." :
                  result.band === "moderate" ? "You feel a moderate amount of nerves, like most people. Regular short practice will help them settle." :
                    "Nerves aren’t a big obstacle for you. Use that to stretch: try harder audiences and impromptu speaking."}
              </p>
              {result.top && <p className="mt-1.5 text-[13px] leading-relaxed"><span className="font-medium">{FACET_TEXT[result.top].name}:</span> <span className="text-ink-2">{FACET_TEXT[result.top].text}</span></p>}
            </div>
          )}
          <p className="mt-4 text-[12.5px] text-ink-3">Your plan now shows on “My progress”, where you can update it any week.</p>
          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => setStep(1)} className="btn btn-quiet press h-8 px-3 text-[13px]">Edit answers</button>
            <span className="flex-1" />
            <button onClick={onDone} className="btn btn-dark press h-8 px-3.5 text-[13px]"><Icon name="check" size={12} /> Done</button>
          </div>
        </div>
      )}
    </section>
  );
}
