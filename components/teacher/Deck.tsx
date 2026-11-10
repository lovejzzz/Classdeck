"use client";

import { useEffect, useRef, useState } from "react";
import { op } from "@/lib/client";
import { CARD_SIZE } from "@/lib/cards";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { uid } from "@/lib/profile";
import { toast } from "@/lib/toast";
import { TYPE_META, TYPE_ORDER } from "@/lib/ui";
import type { Course, Lesson, Module, ModuleType, ProgressMap, StudioPost } from "@/lib/types";
import { HScroll } from "../HScroll";
import { scrollToWeek, WeekNav } from "../WeekNav";
import { CardFace } from "../cards/CardFace";
import { CardTable } from "../cards/CardTable";
import { Icon } from "../Icon";
import { useShortcuts } from "@/lib/shortcuts";
import { CARD_TEMPLATES, standardWeek, type CardTemplate } from "@/lib/templates";
import { CardEditor } from "./CardEditor";
import { SessionRunner } from "./SessionRunner";

const SIZE = CARD_SIZE.deck;

/** A dashed card-shaped slot: start a blank card by type, or from a template. */
function AddCard({ onPick, onTemplate }: { onPick: (t: ModuleType) => void; onTemplate: (t: CardTemplate) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"blank" | "template">("template");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [open]);
  return (
    <div ref={ref} className="relative h-full w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`press flex h-full w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed text-[13px] transition-colors ${open ? "border-ink text-ink" : "border-line-strong text-ink-3 hover:border-ink-3 hover:text-ink-2"}`}
        aria-expanded={open}
      >
        <Icon name="plus" size={18} className={`transition-transform duration-300 ${open ? "rotate-45" : ""}`} />
        New card
      </button>
      {open && (
        <div className="pop absolute bottom-12 left-0 z-30 w-64 rounded-xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]">
          <div className="mb-1 flex rounded-lg bg-lane p-0.5">
            {(["template", "blank"] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={`press h-6 flex-1 rounded-md text-[12px] ${tab === k ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2"}`}>{k === "template" ? "Templates" : "Blank"}</button>
            ))}
          </div>
          {tab === "blank" ? (
            <div className="grid grid-cols-2 gap-1">
              {TYPE_ORDER.map((t, i) => (
                <button key={t} onClick={() => { setOpen(false); onPick(t); }} style={{ "--i": i } as React.CSSProperties}
                  className="rise press flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] hover:bg-lane">
                  <span style={{ color: TYPE_META[t].tint }}><Icon name={t} size={13} /></span>{TYPE_META[t].name}
                </button>
              ))}
            </div>
          ) : (
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {CARD_TEMPLATES.map((t, i) => {
                const type = t.make().type;
                return (
                  <button key={t.id} onClick={() => { setOpen(false); onTemplate(t); }} style={{ "--i": i } as React.CSSProperties}
                    className="rise press flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-lane">
                    <span className="mt-0.5" style={{ color: TYPE_META[type].tint }}><Icon name={type} size={13} /></span>
                    <span><span className="block text-[12.5px] font-medium">{t.name}</span><span className="block text-[11.5px] text-ink-3">{t.description}</span></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The teacher's whole course as a deck: one row per week, lessons laid out left to right. */
export function Deck({ course, connectors, onRefresh, progress = {}, studioPosts = [] }: { course: Course; connectors: ConnectorInfo[]; onRefresh: () => void; progress?: ProgressMap; studioPosts?: StudioPost[] }) {
  const [drafts, setDrafts] = useState<Record<string, Lesson>>({});
  const [editing, setEditing] = useState<{ lessonId: string; moduleId: string } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef<Record<string, Lesson>>({});
  const openRef = useRef(false);
  // Weeks before the current one start folded; the teacher can open any of them.
  const currentWeekIndex = Math.max(0, course.weeks.findIndex((w) => w.lessons.some((l) => l.id === course.currentLessonId)));
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const isFolded = (i: number, id: string) => i < currentWeekIndex && !unfolded.has(id);
  const toggleFold = (id: string) => setUnfolded((u) => { const n = new Set(u); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** How much of a week the class has finished, across everyone, for whole-class cards. */
  const classDone = (w: Course["weeks"][number]) => {
    const ms = w.lessons.flatMap((l) => l.modules).filter((m) => m.audience.kind === "all");
    const total = ms.length * course.students.length;
    const done = ms.reduce((n, m) => n + course.students.filter((st) => progress[st.id]?.[m.id]?.status === "done").length, 0);
    return { done, total };
  };
  const [running, setRunning] = useState<{ lessonId: string; weekTitle: string } | null>(null);

  useEffect(() => {
    const map = timers.current;
    const pending = latest.current;
    return () => {
      // Flush anything still waiting so no edit is lost when leaving the tab.
      map.forEach((t, id) => {
        clearTimeout(t);
        op(course.id, { op: "saveLesson", lesson: pending[id] });
      });
    };
  }, [course.id]);

  const lessonOf = (id: string) => drafts[id] ?? course.weeks.flatMap((w) => w.lessons).find((l) => l.id === id)!;

  function change(next: Lesson) {
    latest.current[next.id] = next;
    setDrafts((d) => ({ ...d, [next.id]: next }));
    const t = timers.current.get(next.id);
    if (t) clearTimeout(t);
    else setSaving((n) => n + 1);
    timers.current.set(next.id, setTimeout(async () => {
      timers.current.delete(next.id);
      await op(course.id, { op: "saveLesson", lesson: latest.current[next.id] });
      setSaving((n) => n - 1);
      onRefresh();
    }, 600));
  }

  function edit(lessonId: string, moduleId: string) {
    openRef.current = true;
    setEditing({ lessonId, moduleId });
    requestAnimationFrame(() => setEditorOpen(true));
  }
  function closeEditor() {
    openRef.current = false;
    setEditorOpen(false);
    setTimeout(() => !openRef.current && setEditing(null), 500);
  }

  function addCard(l: Lesson, type: ModuleType) {
    const m: Module = {
      id: uid("m-"), type, title: `New ${TYPE_META[type].name.toLowerCase()} card`, body: "", audience: { kind: "all" }, tools: [], attachments: [],
      questions: type === "practice" || type === "quiz" ? [{ id: uid("q-"), text: "", options: ["", ""], answer: 0 }] : undefined,
    };
    change({ ...l, modules: [...l.modules, m] });
    edit(l.id, m.id);
  }

  function addFromTemplate(l: Lesson, t: CardTemplate) {
    const m: Module = { id: uid("m-"), ...t.make() };
    change({ ...l, modules: [...l.modules, m] });
    edit(l.id, m.id);
  }

  async function duplicate(op_: "duplicateWeek" | "duplicateLesson", id: string, what: string) {
    await op(course.id, op_ === "duplicateWeek" ? { op: op_, weekId: id } : { op: op_, lessonId: id });
    onRefresh();
    toast(`Duplicated ${what}`, { icon: "layers" });
  }

  async function addLesson(weekId: string, n: number) {
    await op(course.id, { op: "addLesson", weekId, title: `Lesson ${n + 1}` });
    onRefresh();
    toast("Added a lesson");
  }

  const today = course.weeks.flatMap((w) => w.lessons).find((l) => l.id === course.currentLessonId);
  const weekStep = (d: number) => {
    const ids = course.weeks.map((w) => w.id);
    const tops = ids.map((id) => document.getElementById(`week-${id}`)?.getBoundingClientRect().top ?? 0);
    const cur = Math.max(0, tops.findIndex((t) => t > 140) - 1);
    const next = ids[Math.max(0, Math.min(ids.length - 1, (tops.every((t) => t <= 140) ? ids.length - 1 : cur) + d))];
    setUnfolded((u) => new Set(u).add(next));
    scrollToWeek(next);
  };
  useShortcuts([
    { keys: "n", label: "New card", run: () => today && addCard(lessonOf(today.id), "read"), enabled: !!today && !editorOpen && !running },
    { keys: "r", label: "Run Collab Studio", run: () => today?.session && setRunning({ lessonId: today.id, weekTitle: course.weeks.find((w) => w.lessons.includes(today))?.title ?? "" }), enabled: !!today?.session && !running },
    { keys: "[", label: "Previous week", run: () => weekStep(-1), enabled: !editorOpen && !running },
    { keys: "]", label: "Next week", run: () => weekStep(1), enabled: !editorOpen && !running },
  ]);

  const cur = editing && lessonOf(editing.lessonId);
  const curModule = cur?.modules.find((m) => m.id === editing?.moduleId);

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <p className="flex-1 text-[13px] text-ink-3">Each row is a week. Drag cards to reorder them within a lesson; click a card to edit it.</p>
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3" aria-live="polite">
          <span className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${saving ? "bg-warn" : "bg-ok"}`} />
          {saving ? "Saving" : "Saved"}
        </span>
      </div>

      <WeekNav
        className="top-14 -mx-4 mb-4"
        weeks={course.weeks.map((w, i) => ({ id: w.id, label: w.title.split(" · ")[0], ...classDone(w), current: i === currentWeekIndex }))}
        onPick={(id) => {
          setUnfolded((u) => new Set(u).add(id));
          scrollToWeek(id);
        }}
      />

      <div className="space-y-6 pb-8">
        {course.weeks.map((w, wi) => (
          <section key={w.id} id={`week-${w.id}`} aria-label={w.title} className="scroll-mt-32">
            <div className="flex items-center gap-3">
              <h2 className={`text-[13px] font-medium ${wi === currentWeekIndex ? "text-ink" : "text-ink-2"}`}>{w.title}</h2>
              {wi < currentWeekIndex && (
                <button onClick={() => toggleFold(w.id)} className="btn btn-quiet press h-6 px-2 text-[11.5px]">{isFolded(wi, w.id) ? "Show cards" : "Fold"}</button>
              )}
              <button onClick={() => duplicate("duplicateWeek", w.id, `“${w.title}”`)} className="btn btn-quiet press h-6 px-2 text-[11.5px]"><Icon name="layers" size={11} /> Duplicate week</button>
            </div>
            {isFolded(wi, w.id) ? (
              <button onClick={() => toggleFold(w.id)} className="press mt-2 flex w-full items-center gap-4 rounded-xl border border-line bg-white/60 px-4 py-3 text-left hover:bg-white">
                <span className="flex -space-x-6">
                  {w.lessons.flatMap((l) => l.modules).slice(0, 5).map((m, i) => (
                    <span key={m.id} className="block h-[56px] w-[40px] overflow-hidden rounded-[6px] shadow-[0_2px_6px_-2px_rgba(0,0,0,0.2)] ring-2 ring-canvas" style={{ rotate: `${(i - 2) * 3}deg` }}>
                      <span className="block h-[235px] w-[168px] origin-top-left scale-[0.238]"><CardFace m={m} /></span>
                    </span>
                  ))}
                </span>
                <span className="min-w-0 flex-1 text-[13px]">
                  <span className="font-medium">{w.lessons.map((l) => l.title).join(" · ")}</span>
                  <span className="block text-ink-3">{w.lessons.reduce((n, l) => n + l.modules.length, 0)} cards · class {(() => { const c = classDone(w); return c.total ? Math.round((c.done / c.total) * 100) : 0; })()}% done</span>
                </span>
                <span className="text-[12.5px] text-ink-3">Show cards</span>
              </button>
            ) : (
            <HScroll className="ml-[calc(50%-50vw)] w-screen">
              <div className="flex w-max items-start gap-10 pb-6 pt-4" style={{ paddingInline: "max(1rem, calc((100vw - 72rem) / 2 + 1rem))" }}>
                {w.lessons.map((ls) => {
                  const l = lessonOf(ls.id);
                  const isToday = l.id === course.currentLessonId;
                  const studentsOf = (m: Module) =>
                    m.audience.kind === "branch" ? m.audience.variant : m.audience.kind === "student" ? course.students.find((s) => s.id === (m.audience as { studentId: string }).studentId)?.name : undefined;
                  return (
                    <div key={l.id}>
                      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" style={{ maxWidth: Math.max((l.modules.length + 1) * (SIZE.w + 14) - 14, 280) }}>
                        <input
                          value={l.title}
                          onChange={(e) => change({ ...l, title: e.target.value })}
                          aria-label="Lesson title"
                          className="-ml-1.5 w-auto min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-medium hover:border-line focus:border-line-strong focus:bg-white focus:outline-none"
                          style={{ width: `${Math.max(8, l.title.length + 2)}ch` }}
                        />
                        {isToday ? (
                          <span className="chip h-5 bg-ok/10 text-[11px] text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Today</span>
                        ) : (
                          <button
                            onClick={async () => {
                              await op(course.id, { op: "setCurrentLesson", lessonId: l.id });
                              onRefresh();
                              toast(`Students now see “${l.title}”`);
                            }}
                            className="btn btn-quiet press h-6 px-2 text-[11.5px]"
                          >
                            Set as today
                          </button>
                        )}
                        <span className="mono">{l.modules.length} cards</span>
                        <button onClick={() => duplicate("duplicateLesson", l.id, `“${l.title}”`)} className="btn btn-quiet press h-6 px-2 text-[11.5px]" title="Duplicate this lesson"><Icon name="layers" size={11} /> Duplicate</button>
                        {l.session && (
                          <button onClick={() => setRunning({ lessonId: l.id, weekTitle: w.title })} className="btn btn-quiet press h-6 px-2 text-[11.5px] text-[#c25a35]">
                            <Icon name="timer" size={12} /> Run Collab Studio · {l.session.minutes}m
                          </button>
                        )}
                      </div>
                      {l.goal && <p className="mt-0.5 text-[12.5px] text-ink-3" style={{ maxWidth: Math.min(Math.max((l.modules.length + 1) * (SIZE.w + 14) - 14, 280), 576) }}>{l.goal}</p>}
                      <CardTable
                        cards={l.modules.map((m, i) => ({
                          id: m.id,
                          label: `Edit ${m.title}`,
                          front: <CardFace m={m} index={i} total={l.modules.length} badge={studentsOf(m)} />,
                        }))}
                        layout="row"
                        size={SIZE}
                        gap={14}
                        idle={false}
                        deal={false}
                        onActivate={(id) => edit(l.id, id)}
                        onReorder={(ids) => change({ ...l, modules: ids.map((id) => l.modules.find((m) => m.id === id)!) })}
                        after={<AddCard onPick={(t) => addCard(l, t)} onTemplate={(t) => addFromTemplate(l, t)} />}
                        ariaLabel={l.title}
                      />
                    </div>
                  );
                })}
                <div className="pt-7">
                  <button
                    onClick={() => addLesson(w.id, w.lessons.length)}
                    className="press mt-[22px] flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line-strong text-[13px] text-ink-3 hover:border-ink-3 hover:text-ink-2"
                    style={{ width: 120, height: SIZE.h }}
                  >
                    <Icon name="layers" size={18} />
                    New lesson
                  </button>
                </div>
              </div>
            </HScroll>
            )}
          </section>
        ))}
        <div>
          <NewWeek n={course.weeks.length} onBlank={async () => {
            await op(course.id, { op: "addWeek", title: `Week ${course.weeks.length}` });
            onRefresh();
            toast("Added a week");
          }} onTemplate={async (theme) => {
            await op(course.id, { op: "insertWeek", week: standardWeek(theme, course.weeks.length) });
            onRefresh();
            toast(`Added “Week ${course.weeks.length} · ${theme}” from the template`, { icon: "layers" });
          }} />
        </div>
      </div>

      {running && (
        <SessionRunner course={course} lesson={lessonOf(running.lessonId)} weekTitle={running.weekTitle} posts={studioPosts} onClose={() => setRunning(null)} />
      )}

      {cur && curModule && (
        <CardEditor
          key={curModule.id}
          lesson={cur}
          module={curModule}
          students={course.students}
          connectors={connectors}
          skills={course.skills}
          enabled={course.enabledConnectors}
          open={editorOpen}
          onChange={change}
          onClose={closeEditor}
          onDuplicate={() => {
            const copy: Module = { ...structuredClone(curModule), id: uid("m-"), title: `${curModule.title} (copy)` };
            const i = cur.modules.findIndex((x) => x.id === curModule.id);
            const next = [...cur.modules];
            next.splice(i + 1, 0, copy);
            change({ ...cur, modules: next });
            setEditing({ lessonId: cur.id, moduleId: copy.id });
            toast("Duplicated. You’re now editing the copy.", { icon: "layers" });
          }}
          onDelete={() => {
            change({ ...cur, modules: cur.modules.filter((x) => x.id !== curModule.id) });
            closeEditor();
            toast(`Deleted “${curModule.title}”`, { icon: "trash", tone: "plain" });
          }}
          onBranchOut={() => {
            const slot = uid("slot-");
            const a: Module = { ...curModule, audience: { kind: "branch", slot, variant: "Core" } };
            const b: Module = { ...curModule, id: uid("m-"), title: `${curModule.title} (extension)`, audience: { kind: "branch", slot, variant: "Extension" } };
            const i = cur.modules.findIndex((x) => x.id === curModule.id);
            const next = [...cur.modules];
            next.splice(i, 1, a, b);
            change({ ...cur, modules: next });
            setEditing({ lessonId: cur.id, moduleId: b.id });
            toast("Made an extension version. Assign students below.");
          }}
        />
      )}
    </div>
  );
}

/** Add a week: blank, or a standard CaPS week built from a theme. */
function NewWeek({ n, onBlank, onTemplate }: { n: number; onBlank: () => void; onTemplate: (theme: string) => void }) {
  const [theme, setTheme] = useState("");
  const [open, setOpen] = useState(false);
  return open ? (
    <form className="pop flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-3" onSubmit={(e) => { e.preventDefault(); if (theme.trim()) { onTemplate(theme.trim()); setOpen(false); setTheme(""); } }}>
      <span className="text-[13px] text-ink-2">Week {n} theme</span>
      <input autoFocus value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="e.g. Handling questions" aria-label="Week theme" className="field h-8 w-64 py-0" />
      <button type="submit" disabled={!theme.trim()} className="btn btn-dark press h-8">Create from template</button>
      <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet press h-8">Cancel</button>
      <p className="w-full text-[12px] text-ink-3">Six cards (goal, example, guided and stretch practice, Collab Studio, reflection) and a 60-minute session agenda. Edit anything after.</p>
    </form>
  ) : (
    <div className="flex gap-2">
      <button onClick={() => setOpen(true)} className="btn btn-ghost press"><Icon name="layers" size={13} /> New week from template</button>
      <button onClick={onBlank} className="btn btn-quiet press"><Icon name="plus" size={13} /> Blank week</button>
    </div>
  );
}
