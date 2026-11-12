"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { uid } from "@/lib/profile";
import { toast } from "@/lib/toast";
import type { ActivityForm, ExternalUpdate, FormPart, Level, Module, Skill } from "@/lib/types";
import { Icon } from "../Icon";

const PARTS: [FormPart, string, string][] = [
  ["feedback", "Feedback", "What you observed"],
  ["next", "Try next", "One thing to try next"],
  ["levels", "Skill levels", "1–4 on the card’s skills"],
  ["score", "Score", "A number, out of a total"],
  ["links", "Links", "Recording, slides…"],
  ["status", "Done / revise", "Moves the card"],
];

export const newForm = (m: Module): ActivityForm => ({ title: `${m.title} feedback`, parts: ["feedback", "next", "levels", "status"] });

/** In the card editor: what the teacher's form for this card asks. */
export function FormEditor({ form, onChange }: { form: ActivityForm; onChange: (f: ActivityForm | undefined) => void }) {
  const set = (patch: Partial<ActivityForm>) => onChange({ ...form, ...patch });
  const qs = form.questions ?? [];
  const setQ = (id: string, patch: { text?: string; options?: string[] }) => set({ questions: qs.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
  return (
    <div className="space-y-3 text-[13px]">
      <label className="grid gap-1"><span className="text-ink-2">Shown to students as</span>
        <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Workshop 2 feedback" className="field h-8 py-0" />
      </label>
      <div>
        <div className="mb-1.5 text-ink-2">Asks for</div>
        <div className="flex flex-wrap gap-1.5">
          {PARTS.map(([p, label, hint]) => {
            const on = form.parts.includes(p);
            return (
              <button key={p} title={hint} aria-pressed={on} onClick={() => set({ parts: on ? form.parts.filter((x) => x !== p) : PARTS.map(([x]) => x).filter((x) => x === p || form.parts.includes(x)) })}
                className={`press h-7 rounded-full border px-2.5 text-[12px] ${on ? "border-[#3d6f91] bg-[#eef3f7] text-[#3d6f91]" : "border-line text-ink-2 hover:border-line-strong"}`}>{label}</button>
            );
          })}
        </div>
        {form.parts.includes("score") && (
          <label className="mt-2 flex items-center gap-2 text-ink-2">Score out of
            <input type="number" min={1} max={1000} value={form.max ?? ""} onChange={(e) => set({ max: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} aria-label="Score out of" className="field h-8 w-20 py-0" />
          </label>
        )}
      </div>
      <div>
        <div className="mb-1.5 text-ink-2">Your own questions</div>
        <div className="space-y-2">
          {qs.map((q, i) => (
            <div key={q.id} className="rounded-lg border border-line p-2">
              <div className="flex items-center gap-2">
                <span className="mono w-5 text-ink-3">{i + 1}</span>
                <input value={q.text} onChange={(e) => setQ(q.id, { text: e.target.value })} placeholder="e.g. Which role did they take?" aria-label={`Question ${i + 1}`} className="field h-8 min-w-0 flex-1 py-0" />
                <button onClick={() => set({ questions: qs.filter((x) => x.id !== q.id) })} aria-label={`Remove question ${i + 1}`} className="btn btn-quiet press h-7 w-7 justify-center px-0"><Icon name="x" size={12} /></button>
              </div>
              <input value={(q.options ?? []).join(", ")} onChange={(e) => setQ(q.id, { options: e.target.value ? e.target.value.split(",").map((x) => x.trimStart()) : undefined })}
                placeholder="Choices, separated by commas. Leave empty for a written answer." aria-label={`Choices for question ${i + 1}`} className="field mt-1.5 h-8 w-full py-0 text-[12.5px]" />
            </div>
          ))}
        </div>
        <button onClick={() => set({ questions: [...qs, { id: uid("fq-"), text: "" }] })} disabled={qs.length >= 12} className="btn btn-quiet press mt-1.5 h-7 px-2 text-[12px]"><Icon name="plus" size={12} /> Add a question</button>
      </div>
      <p className="text-[12px] leading-relaxed text-ink-3">Fill it in for each student from the Class tab: open a student’s cell for this card, then use “Save and next”. Students see your answers on this card and in their feedback.</p>
      <button onClick={() => onChange(undefined)} className="btn btn-quiet press h-7 px-2 text-[12px] hover:!text-bad">Remove form</button>
    </div>
  );
}

/** In the class view: the teacher fills in a card's form for one student. */
export function FormFill({ courseId, studentId, name, m, skills, levels, prev, onNext }: {
  courseId: string; studentId: string; name: string; m: Module; skills: Skill[]; levels: Level[]; prev?: ExternalUpdate; onNext?: () => void;
}) {
  const form = m.form!;
  const has = (p: FormPart) => form.parts.includes(p);
  const cardSkills = m.skills?.length ? skills.filter((s) => m.skills!.includes(s.id)) : skills;
  const [feedback, setFeedback] = useState(prev?.text ?? "");
  const [next, setNext] = useState(prev?.next ?? "");
  const [lv, setLv] = useState<Record<string, number>>(prev?.levels ?? {});
  const [score, setScore] = useState(prev?.score ? String(prev.score.value) : "");
  const [links, setLinks] = useState((prev?.links ?? []).map((l) => l.url).join("\n"));
  const [status, setStatus] = useState<"" | "done" | "revise">("");
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries((form.questions ?? []).map((q) => [q.id, prev?.answers?.find((a) => a.q === q.text.trim())?.a ?? ""])));
  const [busy, setBusy] = useState(false);
  const questions = (form.questions ?? []).filter((q) => q.text.trim());

  async function save(goNext: boolean) {
    setBusy(true);
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "formResponse", moduleId: m.id, studentId, answers: { feedback, next, levels: lv, score, links, status, questions: answers } });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "Couldn’t save", { tone: "plain" });
    toast(`Saved for ${name}`, { icon: "check", tone: "ok" });
    if (goNext) onNext?.();
  }

  return (
    <section aria-label={form.title || "Activity form"} className="mt-5 rounded-xl border border-[#c9d8e4] bg-[#f5f8fb] p-4 text-[13px]">
      <div className="flex items-center gap-2">
        <Icon name="text" size={13} className="text-[#3d6f91]" />
        <h4 className="min-w-0 flex-1 font-medium">{form.title || `${m.title} feedback`}</h4>
        {prev && <span className="text-[12px] text-ink-3">Sent {new Date(prev.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · editing</span>}
      </div>
      <div className="mt-3 space-y-3">
        {has("feedback") && <label className="grid gap-1"><span className="text-ink-2">Feedback</span><textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="What you saw and how it landed" className="field resize-y bg-white" /></label>}
        {has("next") && <label className="grid gap-1"><span className="text-ink-2">Try next</span><input value={next} onChange={(e) => setNext(e.target.value)} placeholder="One thing to try next time" className="field h-8 bg-white py-0" /></label>}
        {has("levels") && cardSkills.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-ink-2">Skill levels</span>
            {cardSkills.map((sk) => (
              <div key={sk.id} className="flex flex-wrap items-center gap-2">
                <span className="w-full truncate text-[12.5px] sm:w-36">{sk.name}</span>
                <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-line">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} onClick={() => setLv((x) => (x[sk.id] === n ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== sk.id)) : { ...x, [sk.id]: n }))} aria-pressed={lv[sk.id] === n}
                      title={levels.find((l) => l.n === n)?.name} className={`press h-7 w-8 rounded-md font-mono text-[12px] ${lv[sk.id] === n ? "bg-ink text-white" : "text-ink-2 hover:bg-lane"}`}>{n}</button>
                  ))}
                </div>
                {lv[sk.id] && <span className="text-[12px] text-ink-3">{levels.find((l) => l.n === lv[sk.id])?.name}</span>}
              </div>
            ))}
          </div>
        )}
        {has("score") && (
          <label className="flex items-center gap-2 text-ink-2">Score
            <input value={score} onChange={(e) => setScore(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} inputMode="decimal" aria-label="Score" className="field h-8 w-20 bg-white py-0" />
            {form.max && <span>/ {form.max}</span>}
          </label>
        )}
        {has("links") && <label className="grid gap-1"><span className="text-ink-2">Links <span className="text-ink-3">· https, one per line</span></span><textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={2} placeholder="https://…" className="field resize-y bg-white font-mono text-[12px]" /></label>}
        {questions.map((q) => {
          const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
          return (
            <div key={q.id} className="grid gap-1">
              <span className="text-ink-2">{q.text}</span>
              {opts.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {opts.map((o) => (
                    <button key={o} onClick={() => setAnswers((a) => ({ ...a, [q.id]: a[q.id] === o ? "" : o }))} aria-pressed={answers[q.id] === o}
                      className={`press h-7 rounded-full border px-2.5 text-[12px] ${answers[q.id] === o ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-line-strong"}`}>{o}</button>
                  ))}
                </div>
              ) : (
                <input value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} aria-label={q.text} className="field h-8 bg-white py-0" />
              )}
            </div>
          );
        })}
        {has("status") && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-2">Card</span>
            <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-line">
              {([["", "Leave as is"], ["done", "Mark done"], ["revise", "Ask to revise"]] as const).map(([v, label]) => (
                <button key={label} onClick={() => setStatus(v)} aria-pressed={status === v}
                  className={`press h-7 rounded-md px-2.5 text-[12px] ${status === v ? "bg-ink text-white" : "text-ink-2 hover:bg-lane"}`}>{label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {onNext && <button onClick={() => save(true)} disabled={busy} className="btn btn-dark press h-8">Save and next <Icon name="arrow" size={12} /></button>}
        <button onClick={() => save(false)} disabled={busy} className={`btn press h-8 ${onNext ? "btn-ghost" : "btn-dark"}`}>Save</button>
      </div>
    </section>
  );
}
