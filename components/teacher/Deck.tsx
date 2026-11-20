"use client";

import { createPortal } from "react-dom";
import { lessonDates, localDay, shortDate, type LessonDate } from "@/lib/dates";
import { useEffect, useRef, useState } from "react";
import { dueAt } from "@/lib/grading";
import { op } from "@/lib/client";
import { CARD_SIZE } from "@/lib/cards";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { uid, visibleModules } from "@/lib/profile";
import { toast } from "@/lib/toast";
import { SUITS, suitOfCard } from "@/lib/ui";
import { ask } from "../Confirm";
import { Clearable } from "../Clearable";
import type { Course, Lesson, Module, ProgressMap, StudioPost } from "@/lib/types";
import { HScroll } from "../HScroll";
import { scrollToWeek, WeekNav } from "../WeekNav";
import { CardFace } from "../cards/CardFace";
import { CardTable } from "../cards/CardTable";
import { Icon } from "../Icon";
import { useShortcuts } from "@/lib/shortcuts";
import { useUrlState } from "@/lib/urlState";
import { nextNumber, standardWeek } from "@/lib/templates";
import { CardEditor } from "./CardEditor";
import { CourseMap } from "./CourseMap";
import { newCard, type CardKind } from "@/lib/kinds";
import { NeighborGraph } from "./NeighborGraph";
import { bandLabel, branchBelow, deleteCardIn, treeView, wiresOf } from "@/lib/branching";
import { SessionRunner } from "./SessionRunner";
import { NewCardFan, loadLibrary, type NewCardChoice } from "./NewCardFan";

/** The time, for grouping quick edits into one undo step (only ever called from event handlers). */
const clock = () => Date.now();

const SIZE = CARD_SIZE.deck;

/** The teacher's whole course as a deck: one row per week, lessons laid out left to right. */
export function Deck({ course, onRefresh, progress = {}, studioPosts = [], choices = {}, live, readOnly = false, view = "list", onView }: {
  course: Course; connectors?: ConnectorInfo[]; readOnly?: boolean; onRefresh: () => unknown; progress?: ProgressMap; studioPosts?: StudioPost[]; choices?: Record<string, Record<string, string>>; live?: React.ReactNode;
  /** The course map (the default) or the list of weeks. */
  view?: "map" | "list";
  onView?: (v: "map" | "list") => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Lesson>>({});
  const [editing, setEditing] = useState<{ lessonId: string; moduleId: string } | null>(null);
  // A card or lesson the map should bring into view (set when moving there from the list or the editor).
  const [mapFocus, setMapFocus] = useState<{ id: string; at: number } | null>(null);
  /** Show a card or lesson on the course map. */
  const showOnMap = (id: string) => { setMapFocus({ id, at: clock() }); if (view !== "map") onView?.("map"); };
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef<Record<string, Lesson>>({});
  const openRef = useRef(false);
  const pushedRef = useRef(false);
  const [agendaFor, setAgendaFor] = useState<string | null>(null);
  // Weeks before the current one start folded; the teacher can open any of them.
  const currentWeekIndex = Math.max(0, course.weeks.findIndex((w) => w.lessons.some((l) => l.id === course.currentLessonId)));
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const isFolded = (i: number, id: string) => i < currentWeekIndex && !unfolded.has(id);
  const toggleFold = (id: string) => setUnfolded((u) => { const n = new Set(u); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** How much of a week the class has finished, across everyone, for whole-class cards. */
  // Each student's share of the week: only the cards on their board (follow-ups count once they're dealt).
  const trees = Object.fromEntries(course.students.map((st) => [st.id, treeView(course.weeks, progress[st.id])]));
  const classDone = (w: Course["weeks"][number]) => {
    let done = 0, total = 0;
    for (const st of course.students)
      for (const l of w.lessons)
        for (const m of visibleModules(l, st.id, choices[st.id], trees[st.id])) {
          if (m.audience.kind !== "all" || m.choice) continue;
          total++;
          if (progress[st.id]?.[m.id]?.status === "done") done++;
        }
    return { done, total };
  };
  // The session timer is in the address (?run=lesson), so the browser's Back button closes it.
  const [runId, setRunId] = useUrlState("run");
  const runLesson = runId ? course.weeks.flatMap((w) => w.lessons.map((l) => ({ l, w }))).find((x) => x.l.id === runId && x.l.session) : undefined;
  const running = runLesson ? { lessonId: runLesson.l.id, weekTitle: runLesson.w.title } : null;
  // Opening adds a history entry; closing on screen steps back out of it (only if this page opened it).
  const ranHere = useRef(false);
  const setRunning = (r: { lessonId: string; weekTitle?: string } | null) => {
    if (r) { ranHere.current = true; setRunId(r.lessonId); }
    else { setRunId(null, { back: ranHere.current }); ranHere.current = false; }
  };

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

  const nextWeek = nextNumber(course.weeks.map((w) => w.title), "Week");
  const lessonOf = (id: string) => drafts[id] ?? course.weeks.flatMap((w) => w.lessons).find((l) => l.id === id)!;
  // Card trees reach across lessons, so labels and the editor look at every card in the course.
  const courseCards = course.weeks.flatMap((w) => w.lessons.flatMap((l) => lessonOf(l.id).modules));
  const courseWires = wiresOf(courseCards);

  // Undo and redo cover changes to lessons and their cards (not adding weeks or lessons). Quick edits to the same
  // lesson, like typing, count as one step.
  // Each step holds every lesson it changed: an edit that spans lessons (a card and its follow-ups) undoes as one.
  const undoStack = useRef<{ lessons: Lesson[]; at: number }[]>([]);
  const redoStack = useRef<Lesson[][]>([]);
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });
  const syncCounts = () => setCounts({ undo: undoStack.current.length, redo: redoStack.current.length });
  /** Remember a lesson as it was, for Undo. Quick edits to the same lesson count as one step. */
  function remember(next: Lesson) {
    const prev = lessonOf(next.id);
    const last = undoStack.current[undoStack.current.length - 1];
    if (!(last && last.lessons.length === 1 && last.lessons[0].id === next.id && clock() - last.at < 1000)) undoStack.current = [...undoStack.current, { lessons: [prev], at: clock() }].slice(-100);
    else last.at = clock();
    redoStack.current = [];
    syncCounts();
  }
  function rememberAll(list: Lesson[]) {
    undoStack.current = [...undoStack.current, { lessons: list.map((l) => lessonOf(l.id)), at: 0 }].slice(-100);
    redoStack.current = [];
    syncCounts();
  }
  /** Put lessons back to a saved state without recording it (Undo and Redo). */
  const restore = (list: Lesson[]) => (list.length === 1 ? change(list[0], false) : changeMany(list, false));
  function change(next: Lesson, record = true) {
    if (record) remember(next);
    latest.current[next.id] = next;
    setDrafts((d) => ({ ...d, [next.id]: next }));
    const t = timers.current.get(next.id);
    if (t) clearTimeout(t);
    else setSaving((n) => n + 1);
    timers.current.set(next.id, setTimeout(() => sendNow(next.id), 600));
  }
  /**
   * Change several lessons at once and save them in one go (deleting a card with its follow-ups in a later lesson,
   * undoing that, or a new card in one lesson wired from another). Saved separately, the server could see a wire to
   * a card that isn't there yet and drop it.
   */
  async function changeMany(list: Lesson[], record = true) {
    if (!list.length) return;
    if (record) rememberAll(list);
    for (const l of list) latest.current[l.id] = l;
    setDrafts((d) => ({ ...d, ...Object.fromEntries(list.map((l) => [l.id, l])) }));
    let waiting = 0;
    for (const l of list) {
      const t = timers.current.get(l.id);
      if (t) { clearTimeout(t); timers.current.delete(l.id); waiting++; }
    }
    setSaving((n) => n - waiting + 1);
    const sent = list.map((l) => latest.current[l.id]);
    const r = await op<{ ok?: boolean; error?: string }>(course.id, { op: "saveLessons", lessons: sent });
    setSaving((n) => n - 1);
    if (r.ok === false) { setSaveError(r.error ?? "Couldn’t save"); return; }
    setSaveError(null);
    await onRefresh();
    setDrafts((d) => {
      const n = { ...d };
      for (const l of sent) if (n[l.id] === l && latest.current[l.id] === l) delete n[l.id];
      return n;
    });
  }
  async function sendNow(id: string) {
    timers.current.delete(id);
    const sent = latest.current[id];
    const r = await op<{ ok?: boolean; error?: string }>(course.id, { op: "saveLesson", lesson: sent });
    setSaving((n) => n - 1);
    if (r.ok === false) {
      // Keep the edit on screen and say so; the next change tries again.
      setSaveError(r.error ?? "Couldn’t save");
      return;
    }
    setSaveError(null);
    await onRefresh();
    // Once the server has this version, show the server's copy again (so edits made elsewhere appear).
    setDrafts((d) => (d[id] === sent && latest.current[id] === sent ? Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)) : d));
  }

  function undo() {
    const u = undoStack.current.pop();
    if (!u) return;
    redoStack.current.push(u.lessons.map((l) => lessonOf(l.id)));
    restore(u.lessons);
    syncCounts();
  }
  function redo() {
    const r = redoStack.current.pop();
    if (!r) return;
    undoStack.current.push({ lessons: r.map((l) => lessonOf(l.id)), at: 0 });
    restore(r);
    syncCounts();
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      // The card editor has its own undo for the card it shows.
      if (openRef.current) return;
      // Text fields keep their own undo.
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  // The undo, redo and save status sit in the row with the tabs, which the page leaves room for.
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the slot is part of the page around the deck
  useEffect(() => setStatusSlot(document.getElementById("deck-status")), []);

  // Long-press a card: that week's cards show a delete button until the teacher is done.
  const [trashWeek, setTrashWeek] = useState<string | null>(null);
  useEffect(() => {
    if (!trashWeek) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setTrashWeek(null);
    // A click anywhere that isn't a card (or the delete box) ends delete mode.
    const away = (e: PointerEvent) => {
      const t = e.target;
      if (t instanceof Element && (t.closest('[role="button"][aria-label^="Edit "]') || t.closest("[data-confirm]"))) return;
      setTrashWeek(null);
    };
    window.addEventListener("keydown", k);
    window.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("keydown", k);
      window.removeEventListener("pointerdown", away);
    };
  }, [trashWeek]);
  /** Every lesson in the course, in order, with unsaved edits. */
  const allLessons = () => course.weeks.flatMap((w) => w.lessons.map((l) => lessonOf(l.id)));
  /**
   * Delete a card and the follow-ups only it deals (they'd otherwise go to everyone), in whichever lessons they are,
   * and unhook any wires to them. Returns those lessons as they were, to restore.
   */
  function deleteCard(id: string): Lesson[] {
    const { before, after } = deleteCardIn(allLessons(), id);
    if (after.length === 1) change(after[0]);
    else changeMany(after);
    return before;
  }
  const deletedToast = (title: string, before: Lesson[]) =>
    toast(`Deleted “${title}”`, { icon: "trash", tone: "plain", action: { label: "Undo", run: () => { if (before.length === 1) change(before[0]); else changeMany(before); toast(`Restored “${title}”`); } } });
  async function removeCard(_l: Lesson, m: Module) {
    const extra = branchBelow(allLessons().flatMap((l) => l.modules), m.id).length;
    if (!(await ask({ title: `Delete “${m.title}”?`, body: extra ? `The ${extra} follow-up card${extra === 1 ? "" : "s"} it deals go with it. Students’ work stays saved, and you can undo this.` : "Students’ work on it stays saved, and you can undo this.", confirm: "Delete", danger: true }))) return;
    deletedToast(m.title, deleteCard(m.id));
  }


  const cardEls = useRef(new Map<string, HTMLElement>());
  /** Scroll so the card being edited sits in view, to the left of the editor panel. */
  function reveal(id: string) {
    setTimeout(() => {
      const el = cardEls.current.get(id);
      if (!el) return;
      const scroller = el.closest(".overflow-x-auto") as HTMLElement | null;
      const r = el.getBoundingClientRect();
      const panel = window.innerWidth >= 720 ? Math.min(480, window.innerWidth) : 0;
      const roomRight = window.innerWidth - panel;
      if (scroller && panel && (r.right > roomRight - 16 || r.left < 16)) {
        scroller.scrollBy({ left: r.left - Math.max(24, (roomRight - r.width) / 2), behavior: "smooth" });
      }
      if (r.top < 130 || r.bottom > window.innerHeight - 16) window.scrollBy({ top: r.top - 170, behavior: "smooth" });
    }, 60);
  }

  function edit(lessonId: string, moduleId: string) {
    const already = openRef.current;
    openRef.current = true;
    // Only step back on close if opening added the entry (not when the card came in with the address on load).
    if (!already) pushedRef.current = !new URLSearchParams(window.location.search).has("card");
    setEditing({ lessonId, moduleId });
    requestAnimationFrame(() => setEditorOpen(true));
    reveal(moduleId);
    // The open card is in the address, so the browser's Back button closes the editor.
    setCardParam(moduleId, { replace: already });
  }
  function closeEditor(fromHistory = false) {
    openRef.current = false;
    setEditorOpen(false);
    setTimeout(() => !openRef.current && setEditing(null), 500);
    if (!fromHistory) setCardParam(null, { back: pushedRef.current });
    pushedRef.current = false;
  }
  const [cardParam, setCardParam] = useUrlState("card");
  // Back pressed while the editor is open: the card leaves the address, so close the editor to match.
  useEffect(() => {
    if (cardParam === null && openRef.current) closeEditor(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardParam]);

  function addCard(l: Lesson, kind: CardKind) {
    const m = newCard(kind);
    change({ ...l, modules: [...l.modules, m] });
    edit(l.id, m.id);
  }

  /** A card put down from the New card fan: Content or a Question (its kind is picked in the editor), or a blank card. */
  function addChosen(l: Lesson, c: NewCardChoice) {
    const fam = c.kind === "suit" ? SUITS.find((x) => x.id === c.suit)! : undefined;
    const m = newCard(fam ? fam.kinds[0] : "content", fam ? `New ${fam.name} card` : "Untitled card");
    change({ ...l, modules: [...l.modules, m] });
    edit(l.id, m.id);
  }

  async function saveToLibrary(m: Module) {
    const r = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module: m, name: m.title }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (!r.ok) return toast(r.error ?? "Couldn’t save it", { icon: "x", tone: "bad" });
    await loadLibrary(true);
    toast(`Saved to Your cards. Put down a ${suitOfCard(m).name} card to use it.`, { icon: "star" });
  }

  async function duplicate(op_: "duplicateWeek" | "duplicateLesson", id: string, what: string) {
    await op(course.id, op_ === "duplicateWeek" ? { op: op_, weekId: id } : { op: op_, lessonId: id });
    onRefresh();
    toast(`Duplicated ${what}`, { icon: "layers" });
  }

  async function addLesson(weekId: string) {
    // The server names it by its place in the course and renumbers the "Lesson N"s after it.
    await op(course.id, { op: "addLesson", weekId });
    onRefresh();
    toast("Added a lesson");
  }

  const today = course.weeks.flatMap((w) => w.lessons).find((l) => l.id === course.currentLessonId);
  const dates = lessonDates({ weeks: course.weeks.map((w) => ({ ...w, lessons: w.lessons.map((l) => lessonOf(l.id)) })) });
  const weekStep = (d: number) => {
    const ids = course.weeks.map((w) => w.id);
    const tops = ids.map((id) => document.getElementById(`week-${id}`)?.getBoundingClientRect().top ?? 0);
    const cur = Math.max(0, tops.findIndex((t) => t > 140) - 1);
    const next = ids[Math.max(0, Math.min(ids.length - 1, (tops.every((t) => t <= 140) ? ids.length - 1 : cur) + d))];
    setUnfolded((u) => new Set(u).add(next));
    scrollToWeek(next);
  };
  useShortcuts([
    { keys: "n", label: "New card", run: () => today && addCard(lessonOf(today.id), "content"), enabled: !!today && !editorOpen && !running },
    { keys: "r", label: "Run Collab Studio", run: () => today?.session && setRunning({ lessonId: today.id, weekTitle: course.weeks.find((w) => w.lessons.includes(today))?.title ?? "" }), enabled: !!today?.session && !running },
    { keys: "[", label: "Previous week", run: () => weekStep(-1), enabled: !editorOpen && !running },
    { keys: "]", label: "Next week", run: () => weekStep(1), enabled: !editorOpen && !running },
  ]);

  // Every card in course order, for stepping through them in the editor.
  const order = course.weeks.flatMap((w) => w.lessons.flatMap((ls) => lessonOf(ls.id).modules.map((m) => ({ lessonId: ls.id, id: m.id }))));
  const at = editing ? order.findIndex((x) => x.id === editing.moduleId) : -1;
  const step = (d: number) => {
    const next = order[at + d];
    if (!next) return;
    setUnfolded((u) => new Set(u).add(course.weeks.find((w) => w.lessons.some((l) => l.id === next.lessonId))!.id));
    edit(next.lessonId, next.id);
  };

  const cur = editing && lessonOf(editing.lessonId);
  const curModule = cur?.modules.find((m) => m.id === editing?.moduleId);

  return (
    <div>
      {statusSlot && createPortal(
        <span className="flex items-center gap-1 text-[12.5px] text-ink-3">
          {!readOnly && (
            <>
              <button onClick={undo} disabled={!counts.undo} aria-label="Undo" title="Undo (⌘Z)" className="btn btn-quiet press h-8 w-8 justify-center px-0 disabled:opacity-30"><UndoIcon /></button>
              <button onClick={redo} disabled={!counts.redo} aria-label="Redo" title="Redo (⇧⌘Z)" className="btn btn-quiet press h-8 w-8 justify-center px-0 disabled:opacity-30"><UndoIcon flip /></button>
            </>
          )}
          <span className="ml-1 flex items-center gap-1.5" aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${saveError ? "bg-bad" : saving ? "bg-warn" : "bg-ok"}`} />
            {saveError && !saving ? <span className="text-bad">Not saved: {saveError}</span> : saving ? "Saving" : "Saved"}
          </span>
        </span>,
        statusSlot,
      )}

      {view === "map" ? (
        <div className="ml-[calc(50%-50vw)] w-screen px-4">
          <CourseMap
            lessons={allLessons()}
            weekOf={Object.fromEntries(course.weeks.flatMap((w) => w.lessons.map((l) => [l.id, w.title.split(" · ")[0]])))}
            todayId={course.currentLessonId}
            students={course.students}
            progress={progress}
            readOnly={readOnly}
            busy={editorOpen}
            selected={editorOpen ? editing?.moduleId : null}
            focus={mapFocus ?? (course.currentLessonId ? { id: course.currentLessonId, at: 0 } : null)}
            onChange={change}
            onChangeMany={changeMany}
            onEdit={(lid, id) => { if (!readOnly) edit(lid, id); }}
            onAddLesson={course.weeks.length ? () => addLesson(course.weeks[course.weeks.length - 1].id) : undefined}
            onDelete={readOnly ? undefined : async (m) => {
              if (m.type === "group") {
                if (!(await ask({ title: `Delete “${m.title}” and its ${m.members?.length ?? 0} cards?`, body: "To keep the cards, open the group and use Ungroup instead. You can undo this.", confirm: "Delete all", danger: true }))) return;
                deletedToast(m.title, deleteCard(m.id));
              } else removeCard(allLessons().find((l) => l.modules.some((x) => x.id === m.id))!, m);
            }}
          />
        </div>
      ) : (
        <>
      {course.weeks.length > 1 && <WeekNav
        className="top-14 -mx-4 mb-4"
        weeks={course.weeks.map((w, i) => ({ id: w.id, label: w.title.split(" · ")[0], ...classDone(w), current: i === currentWeekIndex }))}
        onPick={(id) => {
          setUnfolded((u) => new Set(u).add(id));
          scrollToWeek(id);
        }}
      />}

      <div className="space-y-6 pb-8">
        {course.weeks.map((w, wi) => (
          <section key={w.id} id={`week-${w.id}`} aria-label={w.title} className="scroll-mt-32">
            <div className="flex items-center gap-3">
              <Clearable inline><input
                key={w.title}
                defaultValue={w.title}
                readOnly={readOnly}
                aria-label="Week title"
                onBlur={async (e) => {
                  const v = e.target.value.trim();
                  if (!v || v === w.title) return;
                  await op(course.id, { op: "renameWeek", weekId: w.id, title: v });
                  onRefresh();
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                style={{ width: `${Math.max(10, w.title.length + 4)}ch` }}
                className={`-ml-1.5 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] font-medium hover:border-line focus:border-line-strong focus:bg-white focus:outline-none ${wi === currentWeekIndex ? "text-ink" : "text-ink-2"}`}
              /></Clearable>
              {wi < currentWeekIndex && (
                <button onClick={() => toggleFold(w.id)} className="btn btn-quiet press h-6 px-2 text-[11.5px]">{isFolded(wi, w.id) ? "Show cards" : "Fold"}</button>
              )}
              {!readOnly && <More label={`${w.title} actions`} items={[["Duplicate week", () => duplicate("duplicateWeek", w.id, `“${w.title}”`)]]} />}
              {!readOnly && (
                <button onClick={() => addLesson(w.id)} className="btn btn-quiet press h-7 px-2 text-[12.5px]">
                  <Icon name="plus" size={12} /> Add a lesson
                </button>
              )}
              {trashWeek === w.id && (
                <button onClick={() => setTrashWeek(null)} className="btn btn-dark press h-7 px-3 text-[12.5px]">Done deleting</button>
              )}
            </div>
            {isFolded(wi, w.id) ? (
              <button onClick={() => toggleFold(w.id)} className="press mt-2 flex w-full items-center gap-4 rounded-xl border border-line bg-white/60 px-4 py-3 text-left hover:bg-white">
                <span className="flex -space-x-6">
                  {w.lessons.flatMap((l) => l.modules).slice(0, 5).map((m, i) => (
                    <span key={m.id} className="block h-[56px] w-[40px] overflow-hidden rounded-[6px] shadow-[0_2px_6px_-2px_rgba(0,0,0,0.2)] ring-2 ring-canvas" style={{ rotate: `${(i - 2) * 3}deg` }}>
                      <span className="block h-[238px] w-[170px] origin-top-left scale-[0.2353]"><CardFace m={m} /></span>
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
                  const lessonWires = wiresOf(l);
                  const studentsOf = (m: Module) => {
                    const w = courseWires.find((x) => x.to === m.id);
                    if (w) {
                      const src = courseCards.find((x) => x.id === w.from);
                      if (w.score) return `If score ${bandLabel(w.score)}`;
                      const q = src?.questions?.find((x) => x.id === w.q);
                      return `If ${String.fromCharCode(65 + w.option)}${q?.options[w.option]?.trim() ? `: ${q.options[w.option].trim().slice(0, 18)}` : ""}`;
                    }
                    return m.audience.kind === "branch" ? m.audience.variant : m.audience.kind === "student" ? course.students.find((s) => s.id === (m.audience as { studentId: string }).studentId)?.name : undefined;
                  };
                  return (
                    <div key={l.id}>
                      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" style={{ maxWidth: `min(${Math.max((l.modules.length + 1) * (SIZE.w + 14) - 14, 360)}px, calc(100vw - 2rem))` }}>
                        <Clearable inline><input
                          value={l.title}
                          readOnly={readOnly}
                          onChange={(e) => change({ ...l, title: e.target.value })}
                          aria-label="Lesson title"
                          className="-ml-1.5 w-auto min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-medium hover:border-line focus:border-line-strong focus:bg-white focus:outline-none"
                          style={{ width: `${Math.max(8, l.title.length + 4)}ch` }}
                        /></Clearable>
                        {/* Today's lesson shows "Today" in place of its date; clicking it changes the date like any other. */}
                        <LessonDateChip value={dates.get(l.id)} today={isToday} disabled={readOnly} onChange={(date) => change({ ...l, date })} />
                        {l.elective && (
                          <span className="chip h-5 bg-[#eef0fb] text-[11px] text-[#4b56a8]" title="Students choose whether to take this lesson">
                            Elective · {Object.values(choices).filter((c) => c[`elective:${l.id}`]).length} chose it
                          </span>
                        )}
                        {!readOnly && <More
                          label={`${l.title} actions`}
                          items={[
                            // The session timer (with Live, polls and notes) is opened from here now, not a button on the lesson.
                            ...(l.session ? [[`Run Collab Studio (${l.session.minutes} min)`, () => setRunning({ lessonId: l.id, weekTitle: w.title })] as [string, () => void]] : []),
                            [l.session ? "Edit Collab Studio agenda" : "Add a Collab Studio session", () => {
                              if (!l.session) {
                                const agenda = [{ label: "Warm-up", minutes: 10 }, { label: "Round-robin presentations and feedback", minutes: 30, roundRobin: true }, { label: "Reflection", minutes: 10 }];
                                change({ ...l, session: { agenda, minutes: 50 } });
                              }
                              setAgendaFor(l.id);
                            }],
                            [lessonWires.length ? `Show on the map (${lessonWires.length} branch${lessonWires.length === 1 ? "" : "es"})` : "Show on the map", () => showOnMap(l.id)],
                            ...(lessonWires.length ? [[l.openPaths ? "Hide paths from students (card backs)" : "Show students every path", () => {
                              change({ ...l, openPaths: !l.openPaths || undefined });
                              toast(l.openPaths ? "Students see card backs for paths they haven’t taken" : "Students see every path and what deals it", { icon: "split" });
                            }] as [string, () => void]] : []),
                            ["Duplicate lesson", () => duplicate("duplicateLesson", l.id, `“${l.title}”`)],
                            ...(l.elective ? [["Make required for everyone", () => {
                              change({ ...l, elective: undefined });
                              toast(`“${l.title}” is required again`, { icon: "layers" });
                            }] as [string, () => void]] : []),
                          ]}
                        />}
                      </div>
                      <Clearable><input
                        value={l.goal ?? ""}
                        readOnly={readOnly}
                        onChange={(e) => change({ ...l, goal: e.target.value || undefined })}
                        placeholder="Add a one-line goal for this lesson"
                        aria-label="Lesson goal"
                        className="-ml-1.5 mt-0.5 block w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[12.5px] text-ink-3 placeholder:text-ink-3 hover:border-line focus:border-line-strong focus:bg-white focus:text-ink-2 focus:outline-none"
                        style={{ maxWidth: Math.min(Math.max((l.modules.length + 1) * (SIZE.w + 14) - 14, 280), 576) }}
                      /></Clearable>
                      {agendaFor === l.id && <AgendaEditor lesson={l} onChange={change} onClose={() => setAgendaFor(null)} />}
                      <CardTable
                        cards={l.modules.map((m) => ({
                          id: m.id,
                          label: `Edit ${m.title}`,
                          front: (
                            <span className={`relative block h-full w-full ${trashWeek === w.id ? "animate-[wiggle_0.32s_ease-in-out_infinite_alternate]" : ""}`}>
                              <CardFace m={m} badge={studentsOf(m)} due={m.due ? { label: `Due ${new Date(dueAt(m.due)).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, tone: "later" } : undefined} />
                              {trashWeek === w.id && (
                                <button
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onPointerUp={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); removeCard(l, m); }}
                                  aria-label={`Delete ${m.title}`}
                                  className="press absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-bad text-white shadow-[0_4px_10px_-4px_rgba(0,0,0,0.5)]"
                                ><Icon name="x" size={13} strokeWidth={2.5} /></button>
                              )}
                            </span>
                          ),
                        }))}
                        layout="row"
                        size={SIZE}
                        gap={14}
                        idle={false}
                        deal={false}
                        draggable={!readOnly && trashWeek !== w.id}
                        onActivate={(id) => { if (trashWeek) setTrashWeek(null); else if (!readOnly) edit(l.id, id); }}
                        onLongPress={readOnly ? undefined : () => setTrashWeek(w.id)}
                        register={(id, el) => (el ? cardEls.current.set(id, el) : cardEls.current.delete(id))}
                        onReorder={(ids) => change({ ...l, modules: ids.map((id) => l.modules.find((m) => m.id === id)!) })}
                        after={readOnly ? undefined : <NewCardFan onChoose={(c) => addChosen(l, c)} />}
                        ariaLabel={l.title}
                      />
                    </div>
                  );
                })}
              </div>
            </HScroll>
            )}
          </section>
        ))}
        {!readOnly && <div>
          <NewWeek n={nextWeek} onBlank={async () => {
            await op(course.id, { op: "addWeek", title: `Week ${nextWeek}` });
            onRefresh();
            toast("Added a week");
          }} onTemplate={async (theme) => {
            await op(course.id, { op: "insertWeek", week: standardWeek(theme, nextWeek) });
            onRefresh();
            toast(`Added “Week ${nextWeek} · ${theme}” from the template`, { icon: "layers" });
          }} />
        </div>}
      </div>

        </>
      )}

      {running && (
        <SessionRunner course={course} lesson={lessonOf(running.lessonId)} weekTitle={running.weekTitle} posts={studioPosts} onClose={() => setRunning(null)} live={live} />
      )}

      {cur && curModule && (
        <CardEditor
          key={curModule.id}
          lesson={cur}
          module={curModule}
          students={course.students}
          skills={course.skills}
          started={course.students.filter((st) => { const p = progress[st.id]?.[curModule.id]; return !!p && (p.status !== "todo" || !!p.output || !!p.work?.length); }).length}
          open={editorOpen}
          onChange={change}
          onClose={() => closeEditor()}
          position={{ index: cur.modules.findIndex((x) => x.id === curModule.id), total: cur.modules.length, lesson: cur.title }}
          onPrev={at > 0 ? () => step(-1) : undefined}
          onNext={at >= 0 && at < order.length - 1 ? () => step(1) : undefined}
          onSaveToLibrary={() => saveToLibrary(curModule)}
          onTree={readOnly ? undefined : () => { showOnMap(curModule.id); if (view !== "map") closeEditor(); }}
          neighbors={<NeighborGraph card={curModule} lessons={allLessons()} onGo={(lid, id) => { edit(lid, id); if (view === "map") setMapFocus({ id, at: clock() }); }} onMap={view === "map" ? undefined : () => { showOnMap(curModule.id); closeEditor(); }} />}
          allCards={courseCards}
          onDuplicate={() => {
            const copy: Module = { ...structuredClone(curModule), id: uid("m-"), title: `${curModule.title} (copy)` };
            const i = cur.modules.findIndex((x) => x.id === curModule.id);
            const next = [...cur.modules];
            next.splice(i + 1, 0, copy);
            change({ ...cur, modules: next });
            setEditing({ lessonId: cur.id, moduleId: copy.id });
            toast("Duplicated. You’re now editing the copy.", { icon: "layers" });
          }}
          onDelete={async () => {
            const removed = curModule;
            if (removed.type === "group" && !(await ask({ title: `Delete “${removed.title}” and its ${removed.members?.length ?? 0} cards?`, body: "To keep the cards, use Ungroup instead. You can undo this.", confirm: "Delete all", danger: true }))) return;
            const before = deleteCard(removed.id);
            closeEditor();
            deletedToast(removed.title, before);
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

/** Edit a lesson's Collab Studio agenda: parts with minutes, which part is round-robin, and the total. */
function AgendaEditor({ lesson, onChange, onClose }: { lesson: Lesson; onChange: (l: Lesson) => void; onClose: () => void }) {
  const agenda = lesson.session?.agenda ?? [];
  const save = (next: typeof agenda | null) => {
    if (!next) return onChange({ ...lesson, session: undefined });
    onChange({ ...lesson, session: { ...lesson.session, agenda: next, minutes: next.reduce((n, a) => n + (a.minutes || 0), 0) } });
  };
  return (
    <div className="pop mt-2 w-[30rem] max-w-[90vw] rounded-xl border border-line bg-white p-3 shadow-[0_16px_40px_-20px_rgba(20,20,18,0.35)]">
      <div className="mb-2 flex items-center text-[12.5px]">
        <span className="flex-1 font-medium">Collab Studio agenda</span>
        <span className="mono mr-2">{agenda.reduce((n, a) => n + (a.minutes || 0), 0)} min</span>
        <button onClick={onClose} aria-label="Close agenda" className="btn btn-quiet press h-6 w-6 justify-center px-0"><Icon name="x" size={12} /></button>
      </div>
      <div className="space-y-1.5">
        {agenda.map((a, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input value={a.label} onChange={(e) => save(agenda.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} aria-label="Part" className="field h-8 flex-1 py-0" />
            <input type="number" min={1} max={180} value={a.minutes} onChange={(e) => save(agenda.map((x, k) => (k === i ? { ...x, minutes: Math.max(1, Number(e.target.value) || 1) } : x)))} aria-label="Minutes" className="field h-8 w-16 py-0 font-mono" />
            <label className="flex items-center gap-1 text-[11.5px] text-ink-2" title="Each student presents in turn during this part">
              <input type="checkbox" checked={!!a.roundRobin} onChange={(e) => save(agenda.map((x, k) => (k === i ? { ...x, roundRobin: e.target.checked || undefined } : x)))} className="accent-[#1b1b1a]" />Turns
            </label>
            <button onClick={() => save(agenda.filter((_, k) => k !== i))} aria-label="Remove part" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={12} /></button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => save([...agenda, { label: "New part", minutes: 10 }])} className="btn btn-ghost press h-7 px-2.5 text-[12px]"><Icon name="plus" size={12} /> Part</button>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-2" title="Host, Timer, Ah-counter, and Evaluator rotate through each group every session">
          <input type="checkbox" checked={!!lesson.session?.roles} onChange={(e) => lesson.session && onChange({ ...lesson, session: { ...lesson.session, roles: e.target.checked || undefined } })} className="accent-[#1b1b1a]" />
          Rotate roles
        </label>
        <span className="flex-1" />
        <button onClick={() => { save(null); onClose(); }} className="btn btn-quiet press h-7 px-2.5 text-[12px] hover:!text-bad">Remove group session</button>
      </div>
    </div>
  );
}

/** A small "⋯" menu for the actions that don't need to be on screen all the time. */
function More({ items, label }: { items: [string, () => void][]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", off);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label={label} aria-expanded={open} aria-haspopup="menu" className={`btn press h-6 w-7 justify-center px-0 ${open ? "bg-black/[0.06]" : "btn-quiet"}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
      </button>
      {open && (
        <div role="menu" className="pop absolute left-0 top-7 z-30 w-52 rounded-xl border border-line bg-white p-1 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]">
          {items.map(([text, fn]) => (
            <button key={text} role="menuitem" onClick={() => { setOpen(false); fn(); }} className="press block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-lane">{text}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Curved arrows for undo (and, flipped, redo). */
function UndoIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

/**
 * A lesson's date, with a calendar to change it. A date the teacher set is shown solid; one worked out from the
 * week before is lighter, until it's changed.
 */
function LessonDateChip({ value, today = false, disabled, onChange }: { value?: LessonDate; today?: boolean; disabled?: boolean; onChange: (date: string | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const past = value && value.date < localDay();
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { const el = input.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); el.click(); } }}
        title={value ? (value.own ? "Change the date" : "Worked out from the week before. Click to change it.") : "Set the date this lesson meets"}
        className={today
          ? "press inline-flex h-6 items-center gap-1.5 rounded-full bg-ok/10 px-2 text-[11.5px] text-ok disabled:cursor-default"
          : `press inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11.5px] disabled:cursor-default ${value?.own ? "border-line bg-white text-ink-2" : "border-dashed border-line-strong text-ink-3"} ${past ? "opacity-70" : ""}`}
      >
        {today ? <><span className="h-1.5 w-1.5 rounded-full bg-ok" />Today</> : <><Icon name="clock" size={11} />{value ? shortDate(value.date) : "Set date"}</>}
      </button>
      <input ref={input} type="date" tabIndex={-1} aria-label="Lesson date" value={value?.date ?? ""} onChange={(e) => onChange(e.target.value || undefined)}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0" />
      {value?.own && !disabled && !today && (
        <button type="button" onClick={() => onChange(undefined)} aria-label="Clear the date" title="Clear: follow the week before again" className="press ml-0.5 rounded-full p-0.5 text-ink-3 hover:text-ink"><Icon name="x" size={10} /></button>
      )}
    </span>
  );
}
