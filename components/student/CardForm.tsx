"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { Level, Module, Progress, Skill } from "@/lib/types";
import { Icon } from "../Icon";
import { formQuestions } from "../teacher/ActivityForm";

/** The form the teacher put on this card, for the student to fill in and send. */
export function CardForm({ courseId, studentId, m, progress, skills, levels, big, onChanged }: {
  courseId: string; studentId: string; m: Module; progress?: Progress; skills: Skill[]; levels: Level[]; big: boolean; onChanged: () => void;
}) {
  const form = m.form!;
  const qs = formQuestions(form);
  const sent = progress?.form;
  const cardSkills = form.parts.includes("levels") ? (m.skills?.length ? skills.filter((s) => m.skills!.includes(s.id)) : skills) : [];
  const [answers, setAnswers] = useState<Record<string, string>>(sent?.answers ?? {});
  const [lv, setLv] = useState<Record<string, number>>(progress?.ratings ?? {});
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!sent);
  const text = big ? "text-[16px]" : "text-[14px]";

  async function send() {
    setBusy(true);
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "fillForm", studentId, moduleId: m.id, answers, levels: lv, links });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "Couldn’t send", { tone: "plain" });
    toast(sent ? "Your changes were sent" : "Sent to your teacher", { icon: "check", tone: "ok" });
    setLinks("");
    setEditing(false);
    onChanged();
  }

  return (
    <section aria-label={form.title || "Form"} className={`rounded-xl border border-[#c9d8e4] bg-[#f5f8fb] p-4 sm:p-5 ${text}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="text" size={15} className="text-[#3d6f91]" />
        <h3 className="min-w-0 flex-1 font-medium">{form.title || "Your answers"}</h3>
        {sent && <span className="text-[12.5px] text-ink-3">Sent {new Date(sent.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
      </div>

      {!editing && sent ? (
        <>
          <dl className="mt-3 space-y-2.5">
            {qs.map((q) => (
              <div key={q.id}>
                <dt className="text-ink-2">{q.text}</dt>
                <dd className={`mt-0.5 whitespace-pre-wrap ${sent.answers[q.id] ? "" : "text-ink-3"}`}>{sent.answers[q.id] || "No answer"}</dd>
              </div>
            ))}
            {cardSkills.some((sk) => progress?.ratings?.[sk.id]) && (
              <div>
                <dt className="text-ink-2">How you rated yourself</dt>
                <dd className="mt-0.5">{cardSkills.filter((sk) => progress?.ratings?.[sk.id]).map((sk) => `${sk.name}: ${levels.find((l) => l.n === progress!.ratings![sk.id])?.name ?? progress!.ratings![sk.id]}`).join(" · ")}</dd>
              </div>
            )}
          </dl>
          <button onClick={() => setEditing(true)} className="btn btn-ghost press mt-4 h-9">Change my answers</button>
        </>
      ) : (
        <>
          <div className="mt-3 space-y-4">
            {qs.map((q, i) => (
              <div key={q.id} className="grid gap-1.5">
                <label htmlFor={`cf-${q.id}`} className="text-ink-2"><span className="mono mr-1.5 text-ink-3">{i + 1}</span>{q.text}</label>
                {q.options.length ? (
                  <div id={`cf-${q.id}`} role="group" aria-label={q.text} className="flex flex-wrap gap-1.5">
                    {q.options.map((o) => (
                      <button key={o} onClick={() => setAnswers((a) => ({ ...a, [q.id]: a[q.id] === o ? "" : o }))} aria-pressed={answers[q.id] === o}
                        className={`press rounded-full border px-3 ${big ? "h-10" : "h-8"} ${answers[q.id] === o ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-line-strong"}`}>{o}</button>
                    ))}
                  </div>
                ) : (
                  <textarea id={`cf-${q.id}`} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} rows={2}
                    className={`field resize-y bg-white leading-relaxed ${text}`} />
                )}
              </div>
            ))}
            {cardSkills.length > 0 && (
              <div className="space-y-2">
                <div className="text-ink-2">Rate yourself</div>
                {cardSkills.map((sk) => (
                  <div key={sk.id} className="flex flex-wrap items-center gap-2">
                    <span className="w-full truncate sm:w-40">{sk.name}</span>
                    <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-line" role="group" aria-label={`Rate yourself: ${sk.name}`}>
                      {[1, 2, 3, 4].map((n) => (
                        <button key={n} onClick={() => setLv((x) => (x[sk.id] === n ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== sk.id)) : { ...x, [sk.id]: n }))} aria-pressed={lv[sk.id] === n}
                          title={levels.find((l) => l.n === n)?.name} className={`press w-9 rounded-md font-mono text-[12.5px] ${big ? "h-9" : "h-7"} ${lv[sk.id] === n ? "bg-ink text-white" : "text-ink-2 hover:bg-lane"}`}>{n}</button>
                      ))}
                    </div>
                    {lv[sk.id] ? <span className="text-[12.5px] text-ink-3">{levels.find((l) => l.n === lv[sk.id])?.name}</span> : null}
                  </div>
                ))}
              </div>
            )}
            {form.parts.includes("links") && (
              <label className="grid gap-1.5">
                <span className="text-ink-2">Links <span className="text-ink-3">· https, one per line. They’re added to your work on this card.</span></span>
                <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={2} placeholder="https://…" className="field resize-y bg-white font-mono text-[12.5px]" />
              </label>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={send} disabled={busy} className={`btn btn-dark press ${big ? "h-11 px-5" : "h-9 px-4"}`}><Icon name="check" size={14} /> {sent ? "Send changes" : "Send"}</button>
            {sent && <button onClick={() => { setAnswers(sent.answers); setLv(progress?.ratings ?? {}); setEditing(false); }} className="btn btn-quiet press h-9">Cancel</button>}
            <span className="text-[12.5px] text-ink-3">{form.finish && progress?.status !== "done" ? "Sending it finishes this card. " : ""}Only your teacher sees your answers.</span>
          </div>
        </>
      )}
    </section>
  );
}
