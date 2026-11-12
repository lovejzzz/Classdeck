"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { download, toCsv } from "@/lib/download";
import { uid } from "@/lib/profile";
import { toast } from "@/lib/toast";
import type { ActivityForm, ExternalUpdate, FormPart, Level, Module, Progress, Skill, Student } from "@/lib/types";
import { Icon } from "../Icon";

const PARTS: [FormPart, string, string][] = [
  ["feedback", "Feedback", "What you observed"],
  ["next", "Try next", "One thing to try next"],
  ["levels", "Skill levels", "1–4 on the card’s skills"],
  ["score", "Score", "A number, out of a total"],
  ["links", "Links", "Recording, slides…"],
  ["status", "Done / revise", "Moves the card"],
];

const STUDENT_PARTS: [FormPart, string, string][] = [
  ["levels", "Rate themselves", "1–4 on the card’s skills"],
  ["links", "Links", "Recording, slides…"],
];

export const newForm = (m: Module): ActivityForm => ({ title: `${m.title} feedback`, parts: ["feedback", "next", "levels", "status"] });

/** In the card editor: who fills in this card's form, and what it asks. */
export function FormEditor({ form, onChange }: { form: ActivityForm; onChange: (f: ActivityForm | undefined) => void }) {
  const set = (patch: Partial<ActivityForm>) => onChange({ ...form, ...patch });
  const qs = form.questions ?? [];
  const student = form.by === "student";
  const parts = student ? STUDENT_PARTS : PARTS;
  function setBy(next: "teacher" | "student") {
    if (next === "student") onChange({ ...form, by: "student", finish: true, title: form.title.replace(/ feedback$/, ""), max: undefined, parts: form.parts.filter((x) => x === "levels" || x === "links"), questions: qs.length ? qs : [{ id: uid("fq-"), text: "" }] });
    else onChange({ ...form, by: undefined, finish: undefined, parts: form.parts.length ? form.parts : ["feedback", "next", "levels", "status"] });
  }
  const setQ = (id: string, patch: { text?: string; options?: string[] }) => set({ questions: qs.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
  return (
    <div className="space-y-3 text-[13px]">
      <div>
        <div className="mb-1.5 text-ink-2">Who fills it in</div>
        <div className="inline-flex rounded-lg bg-lane p-0.5" role="group" aria-label="Who fills it in">
          {([["teacher", "Me, for each student"], ["student", "Each student"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setBy(v)} aria-pressed={(v === "student") === student}
              className={`press h-7 rounded-md px-2.5 text-[12px] ${(v === "student") === student ? "bg-white text-ink shadow-sm" : "text-ink-2"}`}>{label}</button>
          ))}
        </div>
      </div>
      <label className="grid gap-1"><span className="text-ink-2">{student ? "Title" : "Shown to students as"}</span>
        <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder={student ? "e.g. After the workshop" : "e.g. Workshop 2 feedback"} className="field h-8 py-0" />
      </label>
      <div>
        <div className="mb-1.5 text-ink-2">Asks for</div>
        <div className="flex flex-wrap gap-1.5">
          {parts.map(([p, label, hint]) => {
            const on = form.parts.includes(p);
            return (
              <button key={p} title={hint} aria-pressed={on} onClick={() => set({ parts: on ? form.parts.filter((x) => x !== p) : parts.map(([x]) => x).filter((x) => x === p || form.parts.includes(x)) })}
                className={`press h-7 rounded-full border px-2.5 text-[12px] ${on ? "border-[#3d6f91] bg-[#eef3f7] text-[#3d6f91]" : "border-line text-ink-2 hover:border-line-strong"}`}>{label}</button>
            );
          })}
        </div>
        {!student && form.parts.includes("score") && (
          <label className="mt-2 flex items-center gap-2 text-ink-2">Score out of
            <input type="number" min={1} max={1000} value={form.max ?? ""} onChange={(e) => set({ max: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} aria-label="Score out of" className="field h-8 w-20 py-0" />
          </label>
        )}
      </div>
      <div>
        <div className="mb-1.5 text-ink-2">{student ? "Questions" : "Your own questions"}</div>
        <div className="space-y-2">
          {qs.map((q, i) => (
            <div key={q.id} className="rounded-lg border border-line p-2">
              <div className="flex items-center gap-2">
                <span className="mono w-5 text-ink-3">{i + 1}</span>
                <input value={q.text} onChange={(e) => setQ(q.id, { text: e.target.value })} placeholder={student ? "e.g. What will you try differently next time?" : "e.g. Which role did they take?"} aria-label={`Question ${i + 1}`} className="field h-8 min-w-0 flex-1 py-0" />
                <button onClick={() => set({ questions: qs.filter((x) => x.id !== q.id) })} aria-label={`Remove question ${i + 1}`} className="btn btn-quiet press h-7 w-7 justify-center px-0"><Icon name="x" size={12} /></button>
              </div>
              <input value={(q.options ?? []).join(", ")} onChange={(e) => setQ(q.id, { options: e.target.value ? e.target.value.split(",").map((x) => x.trimStart()) : undefined })}
                placeholder="Choices, separated by commas. Leave empty for a written answer." aria-label={`Choices for question ${i + 1}`} className="field mt-1.5 h-8 w-full py-0 text-[12.5px]" />
            </div>
          ))}
        </div>
        <button onClick={() => set({ questions: [...qs, { id: uid("fq-"), text: "" }] })} disabled={qs.length >= 12} className="btn btn-quiet press mt-1.5 h-7 px-2 text-[12px]"><Icon name="plus" size={12} /> Add a question</button>
      </div>
      {student && (
        <label className="flex items-start gap-2 text-ink-2">
          <input type="checkbox" checked={!!form.finish} onChange={(e) => set({ finish: e.target.checked || undefined })} className="mt-0.5 accent-[#1b1b1a]" />
          <span>Sending it finishes the card</span>
        </label>
      )}
      <p className="text-[12px] leading-relaxed text-ink-3">{student
        ? "Students fill it in on this card and can change their answers later. Everyone’s answers are in the Class tab, under this lesson, with a CSV download."
        : "Fill it in for each student from the Class tab: open a student’s cell for this card, then use “Save and next”. Students see your answers on this card and in their feedback."}</p>
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

/** A student form's questions that have text, with their choices cleaned. */
export const formQuestions = (form: ActivityForm) =>
  (form.questions ?? []).filter((q) => q.text.trim()).map((q) => ({ ...q, text: q.text.trim(), options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) }));

const when = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** In the class view: one student's answers to a card's student form. */
export function FormAnswers({ m, progress, skills, levels }: { m: Module; progress?: Progress; skills: Skill[]; levels: Level[] }) {
  const form = m.form!;
  const sent = progress?.form;
  const rated = form.parts.includes("levels") ? skills.filter((sk) => progress?.ratings?.[sk.id]) : [];
  return (
    <section aria-label={form.title || "Student form"} className="mt-5 rounded-xl border border-[#c9d8e4] bg-[#f5f8fb] p-4 text-[13px]">
      <div className="flex items-center gap-2">
        <Icon name="text" size={13} className="text-[#3d6f91]" />
        <h4 className="min-w-0 flex-1 font-medium">{form.title || m.title}</h4>
        <span className="text-[12px] text-ink-3">{sent ? `Sent ${when(sent.at)}` : "Not sent yet"}</span>
      </div>
      {sent && (
        <dl className="mt-3 space-y-2.5">
          {formQuestions(form).map((q) => (
            <div key={q.id}>
              <dt className="text-ink-2">{q.text}</dt>
              <dd className={`mt-0.5 whitespace-pre-wrap ${sent.answers[q.id] ? "" : "text-ink-3"}`}>{sent.answers[q.id] || "No answer"}</dd>
            </div>
          ))}
          {rated.length > 0 && (
            <div>
              <dt className="text-ink-2">Rated themselves</dt>
              <dd className="mt-0.5">{rated.map((sk) => `${sk.name} ${progress!.ratings![sk.id]} (${levels.find((l) => l.n === progress!.ratings![sk.id])?.name ?? ""})`).join(" · ")}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

/** In the class view: everyone's answers to a card's student form, as a table with a CSV download. */
export function FormTable({ m, students, progress, skills, canSee }: {
  m: Module; students: Student[]; progress: Record<string, Record<string, Progress>>; skills: Skill[]; canSee: (studentId: string) => boolean;
}) {
  const form = m.form!;
  const qs = formQuestions(form);
  const rate = form.parts.includes("levels") ? skills.filter((sk) => !m.skills?.length || m.skills.includes(sk.id)) : [];
  const links = form.parts.includes("links");
  const who = students.filter((s) => canSee(s.id));
  const sent = who.filter((s) => progress[s.id]?.[m.id]?.form);
  const linkList = (sid: string) => (progress[sid]?.[m.id]?.work ?? []).filter((w) => w.kind === "link").map((w) => w.url);
  function exportCsv() {
    const head = ["Student", "Sent", ...qs.map((q) => q.text), ...rate.map((sk) => `Self-rating: ${sk.name}`), ...(links ? ["Links"] : [])];
    const rows = who.map((s) => {
      const p = progress[s.id]?.[m.id];
      return [s.name, p?.form ? new Date(p.form.at).toISOString() : "", ...qs.map((q) => p?.form?.answers[q.id] ?? ""), ...rate.map((sk) => String(p?.ratings?.[sk.id] ?? "")), ...(links ? [linkList(s.id).join(" ")] : [])];
    });
    download(`${form.title || m.title} - answers.csv`, toCsv([head, ...rows]), "text/csv");
  }
  return (
    <section className="card p-5" aria-label={`Answers to ${form.title || m.title}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="text" size={14} className="text-[#3d6f91]" />
        <h3 className="text-[14px] font-medium">{form.title || m.title}</h3>
        <span className="text-[13px] text-ink-3">· {sent.length} of {who.length} sent</span>
        <span className="flex-1" />
        <button onClick={exportCsv} disabled={!who.length} className="btn btn-ghost press h-8"><Icon name="download" size={13} /> Download CSV</button>
      </div>
      {sent.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-ink-2">
                <th scope="col" className="py-2 pr-3 font-medium">Student</th>
                {qs.map((q) => <th key={q.id} scope="col" className="max-w-[16rem] py-2 pr-3 font-medium">{q.text}</th>)}
                {rate.length > 0 && <th scope="col" className="py-2 pr-3 font-medium">Rated themselves</th>}
                {links && <th scope="col" className="py-2 pr-3 font-medium">Links</th>}
              </tr>
            </thead>
            <tbody>
              {who.map((s) => {
                const p = progress[s.id]?.[m.id];
                return (
                  <tr key={s.id} className="border-b border-line/70 align-top last:border-0">
                    <th scope="row" className="whitespace-nowrap py-2 pr-3 font-medium">{s.name}</th>
                    {p?.form ? (
                      <>
                        {qs.map((q) => <td key={q.id} className="max-w-[16rem] whitespace-pre-wrap py-2 pr-3">{p.form!.answers[q.id] ?? <span className="text-ink-3">–</span>}</td>)}
                        {rate.length > 0 && <td className="py-2 pr-3 font-mono text-[12px]">{rate.map((sk) => p.ratings?.[sk.id] ? `${sk.name.split(" ")[0]} ${p.ratings[sk.id]}` : null).filter(Boolean).join(" · ") || "–"}</td>}
                        {links && <td className="py-2 pr-3">{linkList(s.id).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="block max-w-[12rem] truncate text-[#3d6f91] underline">{u.replace(/^https:\/\//, "")}</a>)}</td>}
                      </>
                    ) : <td colSpan={qs.length + (rate.length ? 1 : 0) + (links ? 1 : 0)} className="py-2 pr-3 text-ink-3">Not sent yet</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-3 text-[13px] text-ink-3">No answers yet. Students fill this in on the card.</p>}
    </section>
  );
}
