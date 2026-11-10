"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CARD_SIZE, formatSize, hostOf } from "@/lib/cards";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { slotVariants, uid, wallOf } from "@/lib/profile";
import { fmtTime, parseTime, videoEmbed } from "@/lib/media";
import { useShortcuts } from "@/lib/shortcuts";
import { toast } from "@/lib/toast";
import { TYPE_META, TYPE_ORDER } from "@/lib/ui";
import type { Attachment, Audience, Lesson, Module, ModuleType, Question, Skill, Student, WallSettings } from "@/lib/types";
import { CardFace } from "../cards/CardFace";
import { Avatar, CONNECTOR_ICON, Icon } from "../Icon";
import { AttachMenu } from "../AttachMenu";

/** A card preview that tilts toward the pointer, so teachers see exactly what students will hold. */
function TiltPreview({ m }: { m: Module }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = CARD_SIZE.deck;
  return (
    <div
      className="mx-auto [perspective:900px]"
      style={{ width: w, height: h }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        if (ref.current) ref.current.style.transform = `rotateX(${-y * 18}deg) rotateY(${x * 18}deg) translateY(-6px) scale(1.03)`;
      }}
      onPointerLeave={() => {
        if (ref.current) ref.current.style.transform = "";
      }}
    >
      <div ref={ref} className="h-full w-full rounded-[14px] shadow-[0_18px_36px_-16px_rgba(20,20,18,0.35)] transition-transform duration-300 ease-[var(--ease-spring)]">
        <CardFace m={m} index={0} />
      </div>
    </div>
  );
}

/** A compact segmented control. */
function Seg({ value, options, onPick }: { value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <div className="inline-flex w-fit rounded-lg bg-lane p-0.5">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onPick(v)} aria-pressed={value === v}
          className={`press h-7 rounded-md px-2.5 text-[12.5px] ${value === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"}`}>{label}</button>
      ))}
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <div className="mb-2.5 flex items-center"><h3 className="flex-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">{title}</h3>{aside}</div>
      {children}
    </section>
  );
}

export function CardEditor({
  lesson, module: m, students, connectors, enabled, open, onChange, onClose, onDelete, onBranchOut, onDuplicate, skills = [],
}: {
  onDuplicate: () => void;
  skills?: Skill[];
  lesson: Lesson;
  module: Module;
  students: Student[];
  connectors: ConnectorInfo[];
  enabled: string[];
  open: boolean;
  onChange: (lesson: Lesson) => void;
  onClose: () => void;
  onDelete: () => void;
  onBranchOut: () => void;
}) {

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useShortcuts([{ keys: "mod+d", label: "Duplicate card", run: onDuplicate, enabled: open }]);
  const set = (patch: Partial<Module>) => onChange({ ...lesson, modules: lesson.modules.map((x) => (x.id === m.id ? { ...x, ...patch } : x)) });
  const attachments = m.attachments ?? [];
  const addAttachment = (a: Omit<Attachment, "id">) => set({ attachments: [...attachments, { ...a, id: uid("a-") }] });

  const wall = wallOf(m);
  const setWall = (patch: Partial<WallSettings>) => set({ wall: { ...wall, ...patch } });

  const available = connectors
    .filter((c) => enabled.includes(c.id))
    .flatMap((c) => c.actions.filter((a) => !a.teacherOnly).map((a) => ({ c, a })));
  const a = m.audience;
  const slots = slotVariants(lesson);
  const variants = a.kind === "branch" ? slots[a.slot] ?? [a.variant] : [];

  // Rendered into <body> so no animated ancestor can become its positioning box.
  return createPortal(
    <aside
      className={`fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-[30rem] flex-col border-l border-line bg-white shadow-[-24px_0_60px_-30px_rgba(20,20,18,0.35)] transition-transform duration-500 ease-[var(--ease-out)] ${open ? "translate-x-0" : "translate-x-[105%]"}`}
      aria-label="Edit card"
      aria-hidden={!open}
    >
      <div className="flex h-14 flex-none items-center gap-2 border-b border-line px-5">
        <span className="flex-1 text-[14px] font-medium">Edit card</span>
        <button onClick={onDuplicate} className="btn btn-quiet press h-8"><Icon name="layers" size={13} /> Duplicate</button>
        <button onClick={onDelete} className="btn btn-quiet press h-8 hover:!text-bad"><Icon name="trash" size={13} /> Delete</button>
        <button onClick={onClose} aria-label="Close editor" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="bg-[#f7f7f5] px-5 py-7"><TiltPreview m={m} /></div>

        <Section title="Card type">
          <div className="grid grid-cols-4 gap-1.5">
            {TYPE_ORDER.map((t) => (
              <button
                key={t}
                onClick={() => set({ type: t as ModuleType, questions: (t === "practice" || t === "quiz") && !m.questions?.length ? [{ id: uid("q-"), text: "", options: ["", ""], answer: 0 }] : m.questions })}
                aria-pressed={m.type === t}
                className={`press flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[11.5px] ${m.type === t ? "border-ink bg-white text-ink" : "border-line text-ink-2 hover:border-line-strong"}`}
              >
                <span style={{ color: TYPE_META[t].tint }}><Icon name={t} size={15} /></span>
                {TYPE_META[t].name}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Text">
          <input value={m.title} onChange={(e) => set({ title: e.target.value })} placeholder="Title" aria-label="Title" className="field text-[14px] font-medium" />
          <textarea value={m.body} onChange={(e) => set({ body: e.target.value })} rows={5} placeholder="What students should read or do" aria-label="Body" className="field mt-2 resize-y leading-relaxed" />
        </Section>

        <Section title="Activity details">
          <div className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2.5 text-[13px]">
            <span className="text-ink-2">Time</span>
            <label className="flex items-center gap-2">
              <input type="number" min={1} max={240} value={m.minutes ?? ""} onChange={(e) => set({ minutes: e.target.value ? Math.max(1, Math.min(240, Number(e.target.value))) : undefined })} aria-label="Minutes" className="field h-8 w-20 py-0" />
              <span className="text-ink-3">minutes, shown on the card</span>
            </label>
            <span className="text-ink-2">Hand in to</span>
            <div className="inline-flex w-fit rounded-lg bg-lane p-0.5">
              {([[undefined, "Not set"], ["personal", "Personal board"], ["studio", "Collab Studio"]] as const).map(([v, label]) => (
                <button key={label} onClick={() => set({ submitTo: v })} aria-pressed={m.submitTo === v}
                  className={`press h-7 rounded-md px-2.5 text-[12.5px] ${m.submitTo === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"}`}>{label}</button>
              ))}
            </div>
            <span className="self-start pt-1.5 text-ink-2">Done when</span>
            <textarea value={m.criteria ?? ""} onChange={(e) => set({ criteria: e.target.value || undefined })} rows={2} placeholder="What counts as finished" aria-label="Completion criteria" className="field resize-none" />
            {skills.length > 0 && (
              <>
                <span className="self-start pt-1 text-ink-2">Skills</span>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((sk) => {
                    const on = m.skills?.includes(sk.id);
                    return (
                      <button key={sk.id} onClick={() => set({ skills: on ? m.skills!.filter((x) => x !== sk.id) : [...(m.skills ?? []), sk.id] })} aria-pressed={on}
                        className={`press h-7 rounded-full border px-2.5 text-[12px] ${on ? "border-[#3d6f91] bg-[#eef3f7] text-[#3d6f91]" : "border-line text-ink-2 hover:border-line-strong"}`}>{sk.name}</button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </Section>

        <Section title="Media">
          <div className="space-y-1.5">
            {attachments.map((x, i) => {
              const timed = x.kind === "video" || (x.kind === "link" && !!videoEmbed(x.url));
              return (
                <div key={x.id} className="pop rounded-lg border border-line px-2.5 py-2" style={{ "--i": i } as React.CSSProperties}>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-lane text-ink-2"><Icon name={x.kind} size={13} /></span>
                    <span className="min-w-0 flex-1">
                      <input defaultValue={x.name ?? ""} placeholder={x.kind === "link" ? hostOf(x.url) : "Label"} aria-label="Label"
                        onBlur={(e) => e.target.value !== (x.name ?? "") && set({ attachments: attachments.map((y) => (y.id === x.id ? { ...y, name: e.target.value || undefined } : y)) })}
                        className="block w-full truncate rounded border border-transparent bg-transparent px-1 text-[13px] hover:border-line focus:border-line-strong focus:bg-white focus:outline-none" />
                      <span className="mono block truncate px-1 text-[11px]">{x.kind}{x.size ? ` · ${formatSize(x.size)}` : ""}{i === 0 ? " · cover" : ""}</span>
                    </span>
                    {i > 0 && (
                      <button onClick={() => set({ attachments: [x, ...attachments.filter((y) => y.id !== x.id)] })} className="btn btn-quiet press h-7 px-2 text-[11.5px]" title="Use as the card's artwork">Make cover</button>
                    )}
                    <button onClick={() => set({ attachments: attachments.filter((y) => y.id !== x.id) })} aria-label={`Remove ${x.name ?? x.kind}`} className="btn btn-quiet press h-7 w-7 justify-center px-0"><Icon name="x" size={13} /></button>
                  </div>
                  {timed && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-9 text-[12px] text-ink-2">
                      Watch from
                      <input defaultValue={fmtTime(x.start)} placeholder="0:00" aria-label="Start time" className="field h-7 w-16 px-2 py-0 font-mono text-[12px]"
                        onBlur={(e) => set({ attachments: attachments.map((y) => (y.id === x.id ? { ...y, start: parseTime(e.target.value) } : y)) })} />
                      to
                      <input defaultValue={fmtTime(x.end)} placeholder="end" aria-label="End time" className="field h-7 w-16 px-2 py-0 font-mono text-[12px]"
                        onBlur={(e) => set({ attachments: attachments.map((y) => (y.id === x.id ? { ...y, end: parseTime(e.target.value) } : y)) })} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2">
            <AttachMenu compact onAdd={(a) => { addAttachment(a); toast(`Added ${a.name ?? a.kind}`, { icon: "upload" }); }} />
          </div>
          <p className="mt-2 text-[12px] text-ink-3">The first item is the card’s artwork. YouTube and Vimeo links play on the card; set a start and end to point students at one segment.</p>
        </Section>

        {m.type === "wall" && (
          <Section title="Wall settings">
            <div className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2.5 text-[13px]">
              <span className="text-ink-2">Who posts</span>
              <Seg value={wall.posting} options={[["students", "Students"], ["teacher", "Only me"]]} onPick={(v) => setWall({ posting: v as WallSettings["posting"] })} />
              <span className="text-ink-2">Reactions</span>
              <Seg value={wall.reactions} options={[["likes", "Likes"], ["votes", "Votes"], ["both", "Both"], ["none", "Off"]]} onPick={(v) => setWall({ reactions: v as WallSettings["reactions"] })} />
              <span className="text-ink-2">Comments</span>
              <Seg value={wall.comments ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onPick={(v) => setWall({ comments: v === "on" })} />
              <span className="self-start pt-1 text-ink-2">Moderation</span>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-ink-2"><input type="checkbox" checked={wall.approval} onChange={(e) => setWall({ approval: e.target.checked })} className="accent-[#1b1b1a]" />Approve posts before others see them</label>
                <label className="flex items-center gap-2 text-ink-2"><input type="checkbox" checked={wall.anonymous} onChange={(e) => setWall({ anonymous: e.target.checked })} className="accent-[#1b1b1a]" />Hide names from classmates (you still see them)</label>
              </div>
            </div>
          </Section>
        )}

        {(m.type === "practice" || m.type === "quiz") && (
          <Section title="Questions">
            <QuestionsEditor questions={m.questions ?? []} onChange={(questions) => set({ questions })} />
          </Section>
        )}

        <Section title="Who gets this card">
          <div className="inline-flex rounded-lg bg-lane p-0.5">
            {([["all", "Whole class", "users"], ["branch", "Versions", "split"], ["student", "One student", "user"]] as const).map(([k, label, icon]) => (
              <button
                key={k}
                onClick={() => {
                  const next: Audience = k === "all" ? { kind: "all" } : k === "branch" ? { kind: "branch", slot: uid("slot-"), variant: "Core" } : { kind: "student", studentId: students[0]?.id ?? "" };
                  if (a.kind !== k) set({ audience: next });
                }}
                className={`press inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] ${a.kind === k ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"}`}
              >
                <Icon name={icon} size={12} />{label}
              </button>
            ))}
          </div>
          {a.kind === "all" && (
            <button onClick={onBranchOut} className="btn btn-quiet press mt-2 h-7 px-2 text-[12.5px]"><Icon name="plus" size={12} /> Make an extension version of this card</button>
          )}
          {a.kind === "student" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {students.map((s) => (
                <button key={s.id} onClick={() => set({ audience: { kind: "student", studentId: s.id } })} aria-pressed={a.studentId === s.id}
                  className={`press inline-flex h-7 items-center gap-1.5 rounded-full border pl-1 pr-2.5 text-[12.5px] ${a.studentId === s.id ? "border-ink" : "border-line hover:border-line-strong"}`}>
                  <Avatar name={s.name} size={20} />{s.name}
                </button>
              ))}
            </div>
          )}
          {a.kind === "branch" && (
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                This version is called
                <input value={a.variant} onChange={(e) => set({ audience: { ...a, variant: e.target.value } })} aria-label="Version name" className="field h-7 w-32 py-0" />
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-line px-3 py-2.5 text-[13px]">
                <input type="checkbox" className="mt-0.5 accent-[#1b1b1a]" checked={!!lesson.choiceSlots?.includes(a.slot)}
                  onChange={(e) => onChange({ ...lesson, choiceSlots: e.target.checked ? [...(lesson.choiceSlots ?? []), a.slot] : (lesson.choiceSlots ?? []).filter((x) => x !== a.slot) })} />
                <span><span className="font-medium">Students choose their own version.</span> <span className="text-ink-3">They see every version and pick one. Who you place below is shown to them as your recommendation.</span></span>
              </label>
              <p className="text-[12px] text-ink-3">{lesson.choiceSlots?.includes(a.slot) ? "Tap a student to change your recommendation." : "Tap a student to move them to the other version. Students can’t see which version they have."}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {variants.map((v) => {
                  const who = students.filter((s) => (lesson.branches[a.slot]?.[s.id] ?? variants[0]) === v);
                  return (
                    <div key={v} className={`rounded-xl p-2.5 ${v === a.variant ? "bg-[#eef0fb]" : "bg-lane"}`}>
                      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] text-ink-2">{v}<span className="mono">{who.length}</span>{v === a.variant && <span className="text-[11px] text-[#4b56a8]">· this card</span>}</div>
                      <div className="flex min-h-7 flex-wrap gap-1">
                        {who.map((s) => (
                          <button key={s.id}
                            onClick={() => {
                              const next = variants[(variants.indexOf(v) + 1) % variants.length];
                              onChange({ ...lesson, branches: { ...lesson.branches, [a.slot]: { ...lesson.branches[a.slot], [s.id]: next } } });
                            }}
                            className="pop press inline-flex h-6 items-center gap-1 rounded-full border border-line bg-white pl-0.5 pr-2 text-[12px] hover:border-line-strong">
                            <Avatar name={s.name} size={18} />{s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        <Section title="Tools (APIs) on this card">
          <div className="space-y-1.5">
            {available.map(({ c, a: act }) => {
              const idx = m.tools.findIndex((t) => t.connector === c.id && t.action === act.id);
              const on = idx >= 0;
              const first = act.inputs[0];
              return (
                <div key={`${c.id}.${act.id}`} className="space-y-1.5">
                  <button
                    onClick={() => set({ tools: on ? m.tools.filter((_, k) => k !== idx) : [...m.tools, { connector: c.id, action: act.id, label: act.title }] })}
                    aria-pressed={on}
                    className={`press flex h-9 w-full items-center gap-2.5 rounded-lg border px-3 text-[13px] ${on ? "border-ink" : "border-line text-ink-2 hover:border-line-strong"}`}
                  >
                    <Icon name={CONNECTOR_ICON[c.id] ?? "plug"} size={14} />
                    <span className="flex-1 text-left">{act.title}<span className="ml-1.5 text-ink-3">· {c.name}</span></span>
                    {!c.configured && <span className="text-[11.5px] text-warn">needs key</span>}
                    <span className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${on ? "border-ink bg-ink text-white" : "border-line-strong"}`}>{on && <Icon name="check" size={10} strokeWidth={3} />}</span>
                  </button>
                  {on && first && first.type !== "textarea" && (
                    <input
                      value={m.tools[idx].defaults?.[first.name] ?? ""}
                      onChange={(e) => set({ tools: m.tools.map((t, k) => (k === idx ? { ...t, defaults: { ...t.defaults, [first.name]: e.target.value } } : t)) })}
                      placeholder={`Prefill ${first.label.toLowerCase()} (optional)`}
                      aria-label={`Prefill ${first.label}`}
                      className="field ml-6 h-8 w-[calc(100%-1.5rem)] py-0"
                    />
                  )}
                </div>
              );
            })}
            {available.length === 0 && <p className="text-[13px] text-ink-3">No connectors are on for this course yet. Turn some on in Settings.</p>}
          </div>
        </Section>

        <Section title="Rules">
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={!!m.gate} onChange={(e) => set({ gate: e.target.checked })} className="accent-[#1b1b1a]" />
            Stay face down until the cards before it are done
          </label>
        </Section>
      </div>
    </aside>,
    document.body,
  );
}

function QuestionsEditor({ questions, onChange }: { questions: Question[]; onChange: (q: Question[]) => void }) {
  const set = (id: string, patch: Partial<Question>) => onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-2.5">
      <p className="text-[12px] text-ink-3">Tick the circle next to the right answer.</p>
      {questions.map((q, qi) => (
        <div key={q.id} className="rise rounded-xl border border-line p-3">
          <div className="flex items-center gap-2">
            <span className="mono w-5">{String(qi + 1).padStart(2, "0")}</span>
            <input value={q.text} onChange={(e) => set(q.id, { text: e.target.value })} placeholder="Question" aria-label={`Question ${qi + 1}`} className="field" />
            <button onClick={() => onChange(questions.filter((x) => x.id !== q.id))} aria-label="Delete question" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={14} /></button>
          </div>
          <div className="mt-2 space-y-1.5 pl-7">
            {q.options.map((opt, oi) => (
              <label key={oi} className="flex items-center gap-2">
                <input type="radio" name={`ans-${q.id}`} checked={q.answer === oi} onChange={() => set(q.id, { answer: oi })} aria-label={`Option ${oi + 1} is correct`} className="accent-[#2f9e5b]" />
                <input value={opt} onChange={(e) => set(q.id, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })} placeholder={`Option ${oi + 1}`} aria-label={`Option ${oi + 1}`} className={`field h-8 py-0 ${q.answer === oi ? "border-ok/50" : ""}`} />
              </label>
            ))}
          </div>
          {q.options.length < 4 && (
            <button onClick={() => set(q.id, { options: [...q.options, ""] })} className="btn btn-quiet press ml-6 mt-1 h-7 px-2 text-[12px]"><Icon name="plus" size={12} /> Option</button>
          )}
        </div>
      ))}
      <button onClick={() => onChange([...questions, { id: uid("q-"), text: "", options: ["", ""], answer: 0 }])} className="btn btn-ghost press"><Icon name="plus" size={13} /> Add a question</button>
    </div>
  );
}
