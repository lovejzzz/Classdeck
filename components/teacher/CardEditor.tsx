"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CARD_SIZE, formatSize, hostOf } from "@/lib/cards";
import { uid } from "@/lib/profile";
import { fmtTime, parseTime, videoEmbed } from "@/lib/media";
import { isoDay } from "@/lib/grading";
import { useShortcuts } from "@/lib/shortcuts";
import { toast } from "@/lib/toast";
import { suitOfCard } from "@/lib/ui";
import { ask } from "../Confirm";
import { Clearable } from "../Clearable";
import { clearOlder, olderSettings } from "@/lib/cardmodel";
import { ANSWER_FORMS, FAMILIES, addToGroup, kindMeta, asKind, faceMeta, familyOf, isPoll, kindOf, type CardKind } from "@/lib/kinds";
import type { Attachment, Lesson, Module, Question, Skill, Student } from "@/lib/types";
import { CardFace } from "../cards/CardFace";
import { Avatar, Icon } from "../Icon";
import { AttachMenu } from "../AttachMenu";

/** The time, for grouping quick edits into one undo step (only ever read in event handlers). */
const clock = () => Date.now();

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

export function CardEditor({
  lesson, module: m, students, open, onChange, onClose, onDelete, onDuplicate, onSaveToLibrary, onPrev, onNext, position, started = 0, onTree, allCards, neighbors,
}: {
  /** Shown at the top of the panel: where this card sits in the course's card tree. */
  neighbors?: React.ReactNode;
  /** Every card in the course (a card tree can deal cards in later lessons). */
  allCards?: Module[];
  /** Open the lesson's card tree (to wire answers to follow-up cards). */
  onTree?: () => void;
  onDuplicate: () => void;
  /** Keep a copy among the teacher's saved cards, to reuse in any course. */
  onSaveToLibrary?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: { index: number; total: number; lesson: string };
  skills?: Skill[];
  /** How many students have already worked on this card (changing what comes back doesn't move their work). */
  started?: number;
  lesson: Lesson;
  module: Module;
  students: Student[];
  open: boolean;
  onChange: (lesson: Lesson) => void;
  onClose: () => void;
  onDelete: () => void;
}) {

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useShortcuts([
    { keys: "mod+d", label: "Duplicate card", run: onDuplicate, enabled: open },
    { keys: "[", label: "Previous card", run: () => onPrev?.(), enabled: open && !!onPrev },
    { keys: "]", label: "Next card", run: () => onNext?.(), enabled: open && !!onNext },
  ]);
  const lessonRef = useRef(lesson);
  useEffect(() => { lessonRef.current = lesson; });
  /** Put a version of this card in place, in the latest copy of its lesson. */
  const put = (next: Module) => onChange({ ...lessonRef.current, modules: lessonRef.current.modules.map((x) => (x.id === next.id ? next : x)) });

  // Undo and redo for this card only. Quick edits (typing) count as one step.
  const hist = useRef<{ past: Module[]; future: Module[]; at: number }>({ past: [], future: [], at: 0 });
  const [steps, setSteps] = useState({ undo: 0, redo: 0 });
  const sync = () => setSteps({ undo: hist.current.past.length, redo: hist.current.future.length });
  function record(prev: Module) {
    const h = hist.current;
    const t = clock();
    if (t - h.at > 1000) h.past = [...h.past, prev].slice(-100);
    h.at = t;
    h.future = [];
    sync();
  }
  function undo() {
    const h = hist.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(m);
    h.at = 0;
    put(prev);
    sync();
  }
  function redo() {
    const h = hist.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(m);
    h.at = 0;
    put(next);
    sync();
  }
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const set = (patch: Partial<Module>) => {
    record(m);
    put({ ...m, ...patch });
  };
  const attachments = m.attachments ?? [];
  const addAttachment = (a: Omit<Attachment, "id">) => set({ attachments: [...attachments, { ...a, id: uid("a-") }] });
  const a = m.audience;
  const kind = kindOf(m);
  const older = olderSettings(m);

  /** Turn the card into another kind or answer form. Its words and media stay; what only the old one used goes. */
  async function toKind(k: CardKind) {
    if (k === kind) return;
    const losing = (m.questions ?? []).filter((q) => q.text.trim() || q.options.some((o) => o.trim()));
    const deals = losing.reduce((n, q) => n + (q.next ?? []).filter(Boolean).length, 0);
    const parts: string[] = [];
    if (k !== "choice" && losing.length) parts.push(`Its question and choices go${deals ? `, and the ${deals === 1 ? "card an answer deals goes" : `${deals} cards its answers deal go`} to everyone` : ""}.`);
    if (started > 0) parts.push(`${started === 1 ? "1 student has" : `${started} students have`} already worked on this card. What they handed in stays where it is and won’t move.`);
    if (parts.length && !(await ask({ title: familyOf(k) === familyOf(kind) ? `Answer with ${kindMeta(k).name.toLowerCase()} instead?` : `Make it a ${FAMILIES.find((f) => f.id === familyOf(k))!.name} card?`, body: parts.join(" "), confirm: "Change it" }))) return;
    set(asKind(m, k));
  }
  const family = familyOf(kind);
  const other = FAMILIES.find((f) => f.id !== family)!;

  // Rendered into <body> so no animated ancestor can become its positioning box.
  return createPortal(
    <aside
      className={`fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-[30rem] flex-col border-l border-line bg-white shadow-[-24px_0_60px_-30px_rgba(20,20,18,0.35)] transition-transform duration-500 ease-[var(--ease-out)] ${open ? "translate-x-0" : "translate-x-[105%]"}`}
      aria-label="Edit card"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="flex h-14 flex-none items-center gap-1.5 border-b border-line px-4">
        <div className="flex items-center rounded-lg bg-lane p-0.5">
          <button onClick={onPrev} disabled={!onPrev} aria-label="Previous card ([)" title="Previous card ([)" className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-white disabled:opacity-30"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
          <button onClick={onNext} disabled={!onNext} aria-label="Next card (])" title="Next card (])" className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-white disabled:opacity-30"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px]">
          <span className="font-medium">Card {position ? position.index + 1 : ""}</span>
          {position && <span className="text-ink-3"> of {position.total} · {position.lesson}</span>}
        </span>
        <button onClick={undo} disabled={!steps.undo} aria-label="Undo" title="Undo (⌘Z)" className="btn btn-quiet press h-8 w-8 justify-center px-0 disabled:opacity-30"><UndoArrow /></button>
        <button onClick={redo} disabled={!steps.redo} aria-label="Redo" title="Redo (⇧⌘Z)" className="btn btn-quiet press h-8 w-8 justify-center px-0 disabled:opacity-30"><UndoArrow flip /></button>
        <button onClick={onDuplicate} className="btn btn-quiet press h-8 px-2"><Icon name="layers" size={13} /> Duplicate</button>
        <button onClick={onDelete} className="btn btn-quiet press h-8 px-2 hover:!text-bad"><Icon name="trash" size={13} /> Delete</button>
        <button onClick={onClose} aria-label="Close editor" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f7f7f5]">
        {neighbors && <div key={m.id} className="rise px-4 pt-4">{neighbors}</div>}
        {/* The card on the table. */}
        <div className="relative px-5 pb-4 pt-6">
          <TiltPreview m={m} />
          {kind !== "group" && (
            <button onClick={() => toKind(other.start)} title={`Make it a ${other.name} card`} aria-label={`Make it a ${other.name} card`}
              className="press absolute right-5 top-1/2 flex w-[4.5rem] -translate-y-1/2 flex-col items-center gap-1.5 text-[11.5px] leading-tight text-ink-2 hover:text-ink">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white shadow-sm"><Icon name="swap" size={16} /></span>
              {other.name}
            </button>
          )}
        </div>

        <div className="space-y-2.5 px-4 pb-8">
          <Panel n={1} title="Title and what to do">
            <Clearable><input value={m.title} onChange={(e) => set({ title: e.target.value })} placeholder="Title" aria-label="Title" className="field text-[14px] font-medium" /></Clearable>
            <Clearable multiline className="mt-2"><textarea value={m.body} onChange={(e) => set({ body: e.target.value })} rows={5} placeholder="What students should read, watch or do" aria-label="Body" className="field resize-y leading-relaxed" /></Clearable>
            <div className="mt-3">
          <div className="space-y-1.5">
            {attachments.map((x, i) => {
              const timed = x.kind === "video" || (x.kind === "link" && !!videoEmbed(x.url));
              return (
                <div key={x.id} className="pop rounded-lg border border-line px-2.5 py-2" style={{ "--i": i } as React.CSSProperties}>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-lane text-ink-2"><Icon name={x.kind} size={13} /></span>
                    <span className="min-w-0 flex-1">
                      <Clearable><input key={`${x.id}:${x.name ?? ""}`} defaultValue={x.name ?? ""} placeholder={x.kind === "link" ? hostOf(x.url) : "Label"} aria-label="Label"
                        onBlur={(e) => e.target.value !== (x.name ?? "") && set({ attachments: attachments.map((y) => (y.id === x.id ? { ...y, name: e.target.value || undefined } : y)) })}
                        className="block w-full truncate rounded border border-transparent bg-transparent px-1 text-[13px] hover:border-line focus:border-line-strong focus:bg-white focus:outline-none" /></Clearable>
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
            <AttachMenu compact teacher onAdd={(a) => { addAttachment(a); toast(`Added ${a.name ?? a.kind}`, { icon: "upload" }); }} />
          </div>
            </div>
          </Panel>

          {kind === "content" ? null : kind === "group" ? (
          <Panel n={2} title="Cards in this group">
            <div className="space-y-1.5">
              {(m.members ?? []).map((id, i, arr) => {
                const c = lesson.modules.find((x) => x.id === id);
                if (!c) return null;
                const move = (d: number) => { const n = [...arr]; [n[i], n[i + d]] = [n[i + d], n[i]]; set({ members: n }); };
                return (
                  <div key={id} className="flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5">
                    <span className="mono w-4">{i + 1}</span>
                    <span style={{ color: suitOfCard(c).tint }}><Icon name={faceMeta(c).icon} size={13} /></span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{c.title || "Untitled card"}</span>
                    <span className="text-[11px] text-ink-3">{faceMeta(c).name}</span>
                    <button onClick={() => move(-1)} disabled={i === 0} aria-label="Move up" className="btn btn-quiet press h-7 w-7 justify-center px-0 disabled:opacity-30">↑</button>
                    <button onClick={() => move(1)} disabled={i === arr.length - 1} aria-label="Move down" className="btn btn-quiet press h-7 w-7 justify-center px-0 disabled:opacity-30">↓</button>
                    <button onClick={() => set({ members: arr.filter((x) => x !== id) })} aria-label={`Take ${c.title} out of the group`} title="Take it out of the group" className="btn btn-quiet press h-7 w-7 justify-center px-0 hover:!text-bad"><Icon name="x" size={12} /></button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => { const { lesson: next, card } = addToGroup(lessonRef.current, m.id); onChange(next); toast(`Added “${card.title}” to the group`, { icon: "plus" }); }}
              className="btn btn-ghost press mt-2 h-8 w-full justify-center border-dashed text-[12.5px]"><Icon name="plus" size={12} /> Add a question</button>
            <p className="mt-2.5 text-[12px] text-ink-3">
              Students see these cards together. The group’s score counts its questions with a right answer (first answers); once they’re all answered, it can deal a card by score: set the ranges on the map. A group of fewer than two cards comes apart.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {onTree && <button onClick={onTree} className="btn btn-ghost press h-8 px-3 text-[12.5px] text-[#4b56a8]"><Icon name="split" size={12} /> Branch by score on the map</button>}
              <button onClick={() => { onChange({ ...lessonRef.current, modules: lessonRef.current.modules.filter((x) => x.id !== m.id) }); onClose(); }} className="btn btn-ghost press h-8 px-3 text-[12.5px]">Ungroup (keep the cards)</button>
            </div>
          </Panel>
          ) : (
          <Panel n={2} title="How students answer">
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="How students answer">
              {ANSWER_FORMS.map((k) => (
                <button key={k.id} role="radio" aria-checked={kind === k.id} onClick={() => toKind(k.id)}
                  className={`press flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[12.5px] transition-colors ${kind === k.id ? "border-[#a0561f] bg-[#a0561f]/[0.06] font-medium text-ink" : "border-line bg-white text-ink-2 hover:border-line-strong"}`}>
                  <Icon name={k.icon} size={16} />{k.name}
                </button>
              ))}
            </div>
            <div className="mt-3 border-t border-line pt-3">
              {kind === "answer" && <p className="text-[12.5px] text-ink-3">Students type an answer, record audio or video, or upload files and links. Only you see it, and you give feedback.</p>}
              {kind === "choice" && m.type !== "quiz" && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="text-ink-2">Right answer</span>
                  <Seg value={isPoll(m) ? "poll" : "right"} options={[["right", "One is right"], ["poll", "None (a poll)"]]}
                    onPick={(v) => { if ((v === "poll") !== isPoll(m)) set(asKind(m, "choice", v === "poll")); }} />
                </div>
              )}
              {kind === "choice" && !isPoll(m) && (
                <>
                  <QuestionsEditor single questions={m.questions ?? []} cards={allCards ?? lesson.modules} onTree={onTree} onChange={(questions) => set({ questions: questions.length ? questions : undefined })} />
                  <p className="mt-2 text-[12px] text-ink-3">One question per card. To ask several and branch by the total score, shift-click Question cards on the map to put them in a card group.</p>
                </>
              )}
              {isPoll(m) && <PollEditor question={m.questions?.[0]} cards={allCards ?? lesson.modules} onTree={onTree} onChange={(q) => set({ questions: [q] })} />}
              {kind === "discussion" && (
                <div className="space-y-2.5 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink-2">Who discusses</span>
                    <Seg value={m.type === "studio" ? "groups" : "class"} options={[["class", "The whole class"], ["groups", "Each group"]]}
                      onPick={(v) => set(asKind({ ...m, type: v === "groups" ? "studio" : "wall", submitTo: v === "groups" ? "studio" : undefined }, "discussion"))} />
                  </div>
                  {m.type === "wall" && (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-ink-2">Reactions</span>
                        <Seg value={m.wall?.reactions ?? "likes"} options={[["likes", "Likes"], ["votes", "Votes"], ["none", "None"]]} onPick={(v) => set({ wall: { ...wallDefaults, ...m.wall, reactions: v as "likes" | "votes" | "none" } })} />
                      </div>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!m.wall?.anonymous} onChange={(e) => set({ wall: { ...wallDefaults, ...m.wall, anonymous: e.target.checked } })} className="accent-[#4b56a8]" /> Hide names from classmates</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!m.wall?.approval} onChange={(e) => set({ wall: { ...wallDefaults, ...m.wall, approval: e.target.checked } })} className="accent-[#4b56a8]" /> I approve posts before others see them</label>
                    </>
                  )}
                  {m.type === "studio" && <p className="text-ink-3">Each group posts and gives each other feedback. Run the group session (timer, round-robin) from the lesson’s ⋯ menu.</p>}
                </div>
              )}
            </div>
          </Panel>
          )}

          <Panel n={kind === "content" ? 2 : 3} title="When and for whom">
            <div className="flex flex-wrap items-center gap-1.5">
              <input type="date" value={m.due ?? ""} onChange={(e) => set({ due: e.target.value || undefined })} aria-label="Due date" className="field h-8 w-40 py-0" />
              {([["Today", 0], ["+3 days", 3], ["+1 week", 7]] as const).map(([label, n]) => (
                <button key={label} onClick={() => set({ due: isoDay(n) })} className="btn btn-quiet press h-7 px-2 text-[12px]">{label}</button>
              ))}
              {m.due && <button onClick={() => set({ due: undefined })} aria-label="Clear due date" className="btn btn-quiet press h-7 w-7 justify-center px-0"><Icon name="x" size={12} /></button>}
            </div>
            {a.kind === "branch" ? (
              <p className="mt-3 text-[12.5px] text-ink-2">
                Only students on the “{a.variant}” path get this card (set up before paths were removed).{" "}
                <button onClick={() => set({ audience: { kind: "all" } })} className="underline underline-offset-2 hover:text-ink">Give it to everyone</button>
              </p>
            ) : (
              <>
                <div className="mt-3"><Seg value={a.kind} options={[["all", "Everyone"], ["student", "One student"]]} onPick={(v) => v !== a.kind && set({ audience: v === "all" ? { kind: "all" } : { kind: "student", studentId: students[0]?.id ?? "" } })} /></div>
                {a.kind === "student" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {students.map((s) => (
                      <button key={s.id} onClick={() => set({ audience: { kind: "student", studentId: s.id } })} aria-pressed={a.studentId === s.id}
                        className={`press inline-flex h-7 items-center gap-1.5 rounded-full border pl-1 pr-2.5 text-[12.5px] ${a.studentId === s.id ? "border-ink" : "border-line hover:border-line-strong"}`}>
                        <Avatar name={s.name} size={20} />{s.name}
                      </button>
                    ))}
                    {!students.length && <span className="text-[12.5px] text-ink-3">No students yet.</span>}
                  </div>
                )}
              </>
            )}
          </Panel>

          {onSaveToLibrary && (
            <button onClick={onSaveToLibrary} className="btn btn-ghost press h-10 w-full justify-center bg-white" title="Save a copy to reuse in any of your courses">
              <Icon name="star" size={14} /> Save to my cards
            </button>
          )}

          {older.length > 0 && (
            <p className="px-1 text-[12px] text-ink-3">
              Older settings on this card still apply: {older.join(" · ")}.{" "}
              <button onClick={() => set(clearOlder(m))} className="underline underline-offset-2 hover:text-ink">Clear them</button>
            </p>
          )}
        </div>
      </div>
    </aside>,
    document.body,
  );
}

function UndoArrow({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

/** One of the parts of a card, numbered in the order a teacher fills them in. */
function Panel({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section data-sec={title} className="rounded-xl border border-line bg-white px-4 py-3.5">
      <h3 className="mb-2.5 flex items-baseline gap-2 text-[13px] font-medium"><span className="font-mono text-[11px] font-normal text-ink-3">{n}</span>{title}</h3>
      {children}
    </section>
  );
}

function QuestionsEditor({ questions, onChange, cards = [], onTree, single }: { questions: Question[]; onChange: (q: Question[]) => void; cards?: Module[]; onTree?: () => void; single?: boolean }) {
  const titleOf = (id: string) => cards.find((c) => c.id === id)?.title || "Untitled card";
  const set = (id: string, patch: Partial<Question>) => onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-2.5">
      <p className="text-[12px] text-ink-3">Mark the right answer (or answers). For short answers, list every answer you’ll accept; for order questions, type the steps in order.</p>
      {questions.map((q, qi) => {
        const short = q.kind === "short";
        const multi = q.kind === "multi";
        const ordered = q.kind === "order";
        return (
          <div key={q.id} className="rise rounded-xl border border-line p-3">
            <div className="flex items-center gap-2">
              {questions.length > 1 && <span className="mono w-5">{String(qi + 1).padStart(2, "0")}</span>}
              <input value={q.text} onChange={(e) => set(q.id, { text: e.target.value })} placeholder={questions.length > 1 ? "Question" : "Question (leave empty to use the title)"} aria-label={`Question ${qi + 1}`} className="field" />
              <button onClick={() => onChange(questions.filter((x) => x.id !== q.id))} aria-label="Delete question" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={14} /></button>
            </div>
            <div className="mt-2 pl-7">
              <Seg value={q.kind ?? "choice"} options={[["choice", "One answer"], ["multi", "Several"], ["order", "Order"], ["short", "Short answer"]]}
                onPick={(v) => set(q.id,
                  v === "short" ? { kind: "short", accept: q.accept?.length ? q.accept : [""], next: undefined }
                  : v === "multi" ? { kind: "multi", options: q.options.length ? q.options : ["", ""], answerSet: q.answerSet ?? (q.answer !== undefined ? [q.answer] : []) }
                  : v === "order" ? { kind: "order", options: q.options.length >= 3 ? q.options : [...q.options, "", "", ""].slice(0, 3), next: undefined }
                  : { kind: undefined, options: q.options.length ? q.options : ["", ""], answer: q.answer ?? 0 })} />
            </div>
            {short ? (
              <div className="mt-2 pl-7">
                <input value={(q.accept ?? []).join(", ")} onChange={(e) => set(q.id, { accept: e.target.value.split(",").map((x) => x.trimStart()) })}
                  placeholder="Accepted answers, separated by commas" aria-label={`Accepted answers for question ${qi + 1}`} className="field h-8 border-ok/40 py-0" />
                <p className="mt-1 text-[11.5px] text-ink-3">Capitals, spaces, and punctuation are ignored when checking.</p>
              </div>
            ) : (
              <>
                {ordered && <p className="mt-2 pl-7 text-[11.5px] text-ink-3">Write the items in the correct order. Students see them mixed up.</p>}
                <div className="mt-2 space-y-1.5 pl-7">
                  {q.options.map((opt, oi) => {
                    const correct = multi ? q.answerSet?.includes(oi) : !ordered && q.answer === oi;
                    return (
                      <label key={oi} className="flex items-center gap-2">
                        {ordered ? <span className="mono w-4 text-center">{oi + 1}</span>
                          : multi ? <input type="checkbox" checked={!!correct} onChange={() => set(q.id, { answerSet: correct ? (q.answerSet ?? []).filter((x) => x !== oi) : [...(q.answerSet ?? []), oi] })} aria-label={`Option ${oi + 1} is correct`} className="accent-[#247b46]" />
                          : <input type="radio" name={`ans-${q.id}`} checked={q.answer === oi} onChange={() => set(q.id, { answer: oi })} aria-label={`Option ${oi + 1} is correct`} className="accent-[#247b46]" />}
                        <input value={opt} onChange={(e) => set(q.id, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })} placeholder={ordered ? `Step ${oi + 1}` : `Option ${oi + 1}`} aria-label={`Option ${oi + 1}`} className={`field h-8 py-0 ${correct ? "border-ok/50" : ""}`} />
                        {!ordered && q.next?.[oi] && (
                          <button onClick={onTree} title="Students who pick this get this card. Change it in the card tree." className="chip h-6 max-w-[40%] flex-none gap-1 truncate bg-[#eef0fb] px-2 text-[11px] text-[#4b56a8]">
                            <Icon name="split" size={11} /> <span className="truncate">{titleOf(q.next[oi]!)}</span>
                          </button>
                        )}
                        {q.options.length > 2 && (
                          <button onClick={() => set(q.id, { options: q.options.filter((_, k) => k !== oi), answer: q.answer !== undefined && q.answer > oi ? q.answer - 1 : q.answer === oi ? 0 : q.answer, answerSet: q.answerSet?.filter((x) => x !== oi).map((x) => (x > oi ? x - 1 : x)), next: q.next?.filter((_, k) => k !== oi) })} aria-label={`Remove option ${oi + 1}`} className="text-ink-3 hover:text-bad"><Icon name="x" size={12} /></button>
                        )}
                      </label>
                    );
                  })}
                </div>
                <div className="ml-6 mt-1 flex flex-wrap gap-1">
                  {q.options.length < 6 && (
                    <button onClick={() => set(q.id, { options: [...q.options, ""] })} className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="plus" size={12} /> Option</button>
                  )}
                  {!ordered && onTree && (
                    <button onClick={onTree} className="btn btn-quiet press h-7 px-2 text-[12px] text-[#4b56a8]" title="Deal a different card for each answer">
                      <Icon name="split" size={12} /> {q.next?.some(Boolean) ? "Edit the card tree" : "A card for each answer"}
                    </button>
                  )}
                </div>
              </>
            )}
            <div className="mt-2 pl-7">
              <input value={q.explain ?? ""} onChange={(e) => set(q.id, { explain: e.target.value || undefined })}
                placeholder="Why this is the answer (shown after answering, optional)" aria-label={`Explanation for question ${qi + 1}`} className="field h-8 py-0 text-[12.5px]" />
            </div>
          </div>
        );
      })}
      {!(single && questions.length >= 1) && <button onClick={() => onChange([...questions, { id: uid("q-"), text: "", options: ["", ""], answer: 0 }])} className="btn btn-ghost press"><Icon name="plus" size={13} /> Add a question</button>}
    </div>
  );
}


const wallDefaults = { posting: "students" as const, comments: true, reactions: "likes" as const, anonymous: false, approval: false };

/** A poll: one question and its choices, none of them right. Each choice can deal a card on the map. */
function PollEditor({ question, onChange, cards = [], onTree }: { question?: Question; onChange: (q: Question) => void; cards?: Module[]; onTree?: () => void }) {
  const q: Question = question ?? { id: uid("q-"), text: "", options: ["", ""] };
  const titleOf = (id: string) => cards.find((c) => c.id === id)?.title || "Untitled card";
  return (
    <div className="space-y-2">
      <input value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} placeholder="What are you asking? (leave empty to use the title)" aria-label="Poll question" className="field" />
      <div className="space-y-1.5">
        {q.options.map((o, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-lane text-[10.5px] font-semibold text-ink-3">{String.fromCharCode(65 + oi)}</span>
            <input value={o} onChange={(e) => onChange({ ...q, options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })} placeholder={`Option ${oi + 1}`} aria-label={`Option ${oi + 1}`} className="field h-8 py-0" />
            {q.next?.[oi] && (
              <button onClick={onTree} title="Students who pick this get this card. Change it on the map." className="chip h-6 max-w-[40%] flex-none gap-1 truncate bg-[#eef0fb] px-2 text-[11px] text-[#4b56a8]">
                <Icon name="split" size={11} /> <span className="truncate">{titleOf(q.next[oi]!)}</span>
              </button>
            )}
            {q.options.length > 2 && (
              <button onClick={() => onChange({ ...q, options: q.options.filter((_, k) => k !== oi), next: q.next?.filter((_, k) => k !== oi) })} aria-label={`Remove choice ${oi + 1}`} className="text-ink-3 hover:text-bad"><Icon name="x" size={12} /></button>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {q.options.length < 6 && <button onClick={() => onChange({ ...q, options: [...q.options, ""] })} className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="plus" size={12} /> Option</button>}
        {onTree && <button onClick={onTree} className="btn btn-quiet press h-7 px-2 text-[12px] text-[#4b56a8]"><Icon name="split" size={12} /> A card for each answer</button>}
      </div>
      <p className="text-[12px] text-ink-3">No right answer. After voting, students see how the class voted.</p>
    </div>
  );
}
