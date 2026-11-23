"use client";

import { createPortal } from "react-dom";
import { lessonDates, localDay, shortDate, type LessonDate } from "@/lib/dates";
import { ScheduleDialog } from "./ScheduleDialog";
import { useEffect, useRef, useState } from "react";
import { op } from "@/lib/client";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { uid } from "@/lib/profile";
import { toast } from "@/lib/toast";
import { ask } from "../Confirm";
import type { Course, Lesson, Module, ProgressMap, StudioPost, TrashEntry } from "@/lib/types";
import { Icon } from "../Icon";
import { useShortcuts } from "@/lib/shortcuts";
import { useUrlState } from "@/lib/urlState";
import { nextNumber, standardWeek } from "@/lib/templates";
import { CardEditor } from "./CardEditor";
import { CourseMap } from "./CourseMap";
import { newCard, type CardKind } from "@/lib/kinds";
import { NeighborGraph } from "./NeighborGraph";
import { branchBelow, deleteCardIn, SCORE, slotOf, targetsOf, wiresOf } from "@/lib/branching";
import { SessionRunner } from "./SessionRunner";
import { loadLibrary } from "./NewCardFan";

/** The time, for grouping quick edits into one undo step (only ever called from event handlers). */
const clock = () => Date.now();

/** The teacher's whole course, on the course map: its cards, branches, lessons and weeks, and the card editor. */
export function Deck({ course, onRefresh, progress = {}, studioPosts = [], choices = {}, live, readOnly = false, view = "map", onView }: {
  course: Course; connectors?: ConnectorInfo[]; readOnly?: boolean; onRefresh: () => unknown; progress?: ProgressMap; studioPosts?: StudioPost[]; choices?: Record<string, Record<string, string>>; live?: React.ReactNode;
  /** Only the course map now (the list of weeks became part of it). */
  view?: "map";
  onView?: (v: "map") => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Lesson>>({});
  const [editing, setEditing] = useState<{ lessonId: string; moduleId: string } | null>(null);
  // Opened from an answer on another card (the card it deals): where to go back to.
  const [cameFrom, setCameFrom] = useState<{ lessonId: string; moduleId: string; to: string; note: string } | null>(null);
  // A card or lesson the map should bring into view (set when moving there from the list or the editor).
  const [mapFocus, setMapFocus] = useState<{ id: string; at: number } | null>(null);
  /** Show a card or lesson on the course map. */
  const showOnMap = (id: string) => { setMapFocus({ id, at: clock() }); if (view !== "map") onView?.("map"); };
  const [editorOpen, setEditorOpen] = useState(false);
  // The page's top bar and tabs make room for the card panel while it's open (see .panel-shift-* in globals.css).
  useEffect(() => {
    const b = document.body;
    const fit = () => {
      // The page's content is centred in up to 72rem; the panel is 480px wide. Room enough for the controls to end
      // just left of it (not on a phone, where the panel covers the page anyway).
      const w = window.innerWidth, side = (w - Math.min(w, 1152)) / 2;
      b.style.setProperty("--panel-head", w < 900 ? "1rem" : `${Math.max(16, 492 - side)}px`);
      b.style.setProperty("--panel-row", w < 900 ? "0px" : `${Math.max(0, 476 - side)}px`);
    };
    if (editorOpen) { fit(); b.dataset.panel = "open"; window.addEventListener("resize", fit); } else delete b.dataset.panel;
    return () => { delete b.dataset.panel; window.removeEventListener("resize", fit); };
  }, [editorOpen]);
  const [saving, setSaving] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef<Record<string, Lesson>>({});
  const openRef = useRef(false);
  const pushedRef = useRef(false);
  const [agendaFor, setAgendaFor] = useState<string | null>(null);
  const [scheduleFrom, setScheduleFrom] = useState<string | null>(null);
  const [renamingWeek, setRenamingWeek] = useState<string | null>(null);
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
  // The last deletion's trash entry, so Undo can take it back out of the trash.
  const lastTrash = useRef<string | null>(null);
  function deleteCard(id: string): Lesson[] {
    const lessons = allLessons();
    const { before, after, gone } = deleteCardIn(lessons, id);
    // Keep what went in the map's trash bin: each card, where it sat, and the answers that dealt it.
    const all = lessons.flatMap((l) => l.modules);
    const entry: TrashEntry = {
      id: uid("t-"), at: Date.now(), title: all.find((m) => m.id === id)?.title || "Untitled card",
      lessons: before.map((l) => ({ lessonId: l.id, lessonTitle: l.title, cards: l.modules.map((m, index) => ({ m, index })).filter((x) => gone.has(x.m.id)) })).filter((x) => x.cards.length),
      inbound: wiresOf(all).filter((w) => gone.has(w.to) && !gone.has(w.from)).map((w) => ({ from: w.from, q: w.q, option: w.option, to: w.to })),
    };
    lastTrash.current = entry.id;
    void op(course.id, { op: "trashPut", entry });
    if (after.length === 1) change(after[0]);
    else changeMany(after);
    return before;
  }
  /** Delete several cards at once (picked on the map): one step to undo, one entry in the trash. */
  function deleteCards(ids: string[]): Lesson[] {
    const original = allLessons();
    let lessons = original;
    const gone = new Set<string>();
    for (const id of ids) {
      if (gone.has(id)) continue;
      const res = deleteCardIn(lessons, id);
      res.gone.forEach((x) => gone.add(x));
      const by = new Map(res.after.map((l) => [l.id, l]));
      lessons = lessons.map((l) => by.get(l.id) ?? l);
    }
    const changed = lessons.filter((l, i) => l !== original[i]);
    const before = original.filter((l, i) => l !== lessons[i]);
    const all = original.flatMap((l) => l.modules);
    const entry: TrashEntry = {
      id: uid("t-"), at: Date.now(), title: `${gone.size} cards`,
      lessons: before.map((l) => ({ lessonId: l.id, lessonTitle: l.title, cards: l.modules.map((m, index) => ({ m, index })).filter((x) => gone.has(x.m.id)) })).filter((x) => x.cards.length),
      inbound: wiresOf(all).filter((w) => gone.has(w.to) && !gone.has(w.from)).map((w) => ({ from: w.from, q: w.q, option: w.option, to: w.to })),
    };
    lastTrash.current = entry.id;
    void op(course.id, { op: "trashPut", entry });
    if (changed.length === 1) change(changed[0]); else if (changed.length) changeMany(changed);
    return before;
  }
  const deletedToast = (title: string, before: Lesson[]) => {
    const tid = lastTrash.current;
    toast(`Deleted “${title}”`, { icon: "trash", tone: "plain", action: { label: "Undo", run: () => { if (before.length === 1) change(before[0]); else changeMany(before); if (tid) void op(course.id, { op: "trashDrop", id: tid }); toast(`Restored “${title}”`); } } });
  };
  /** Put cards from the trash back where they were (or at the end of the first lesson, if theirs is gone). */
  async function restoreTrash(e: TrashEntry) {
    const lessons = allLessons();
    const have = new Set(lessons.flatMap((l) => l.modules.map((m) => m.id)));
    const changed = new Map<string, Lesson>();
    const get = (id: string) => changed.get(id) ?? lessons.find((l) => l.id === id);
    for (const part of e.lessons) {
      const target = get(part.lessonId) ?? get(lessons[0]?.id ?? "");
      if (!target) continue;
      const modules = [...target.modules];
      for (const { m, index } of [...part.cards].sort((a, b) => a.index - b.index)) if (!have.has(m.id)) { modules.splice(Math.min(index, modules.length), 0, m); have.add(m.id); }
      changed.set(target.id, { ...target, modules });
    }
    // The answers that dealt these cards point at them again, where the answer is still free.
    for (const w of e.inbound) {
      const l = [...changed.values(), ...lessons].find((x) => x.modules.some((m) => m.id === w.from));
      if (!l || !have.has(w.to)) continue;
      const cur = get(l.id)!;
      changed.set(l.id, { ...cur, modules: cur.modules.map((m) => {
        if (m.id !== w.from) return m;
        if (w.q === SCORE) return m.bands?.[w.option] && !m.bands[w.option].next ? { ...m, bands: m.bands.map((b, i) => (i === w.option ? { ...b, next: w.to } : b)) } : m;
        return { ...m, questions: m.questions?.map((q) => {
          if (q.id !== w.q || targetsOf(q, w.option).includes(w.to)) return q;
          const next = [...(q.next ?? [])];
          while (next.length < q.options.length) next.push(null);
          next[w.option] = slotOf([...targetsOf(q, w.option), w.to]);
          return { ...q, next };
        }) };
      }) });
    }
    if (!changed.size) return;
    await changeMany([...changed.values()]);
    await op(course.id, { op: "trashDrop", id: e.id });
    onRefresh();
    toast(`Restored “${e.title}”`, { icon: "reset" });
  }
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
  // A card in the address when the course opens (a reload with the editor open, or a link to the card): open it again.
  const linkUsed = useRef(false);
  useEffect(() => {
    if (linkUsed.current) return;
    linkUsed.current = true;
    const id = cardParam;
    if (!id || readOnly) return;
    const l = allLessons().find((x) => x.modules.some((m) => m.id === id));
    setTimeout(() => (l ? edit(l.id, id) : setCardParam(null, { replace: true })), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addCard(l: Lesson, kind: CardKind) {
    const m = newCard(kind);
    change({ ...l, modules: [...l.modules, m] });
    edit(l.id, m.id);
  }

  /** Save to my cards: one card, or a card group with its cards, or (from a lesson's menu) a whole lesson. */
  async function saveToLibrary(m: Module | null, lesson?: Lesson) {
    const l = lesson ?? (m ? allLessons().find((x) => x.modules.some((y) => y.id === m.id)) : undefined);
    const body = lesson
      ? { name: lesson.title, kind: "lesson", modules: lesson.modules }
      : m && m.type === "group" && l
        ? { name: m.title, kind: "group", modules: [m, ...l.modules.filter((x) => m.members?.includes(x.id))] }
        : { module: m, name: m?.title };
    const r = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (!r.ok) return toast(r.error ?? "Couldn’t save it", { icon: "x", tone: "bad" });
    await loadLibrary(true);
    toast(`Saved${lesson ? ` “${lesson.title}” and its ${lesson.modules.length} cards` : ""}. To use it in any of your courses, press + Card on a lesson, then Saved cards.`, { icon: "star" });
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

  /** Beside a lesson's name on the map: its date (or Today), whether it's an elective, and its lesson and week actions. */
  const lessonBar = (lid: string) => {
    const l = lessonOf(lid);
    const w = course.weeks.find((x) => x.lessons.some((y) => y.id === lid));
    if (!w) return null;
    const isToday = l.id === course.currentLessonId;
    const lessonWires = wiresOf(l);
    const items: [string, () => void][] = [
      // "Today" follows the lessons' dates; a course without dates moves it by hand.
      ...(l.id !== course.currentLessonId ? [["Make it today’s lesson", async () => {
        if (lessonDates(course).size) change({ ...l, date: localDay() });
        else { await op(course.id, { op: "setCurrentLesson", lessonId: l.id }); await onRefresh(); }
        toast(`“${l.title}” is today’s lesson`, { icon: "clock" });
      }] as [string, () => void]] : []),
      ...(l.session ? [[`Run the class session (${l.session.minutes} min)`, () => setRunning({ lessonId: l.id, weekTitle: w.title })] as [string, () => void]] : []),
      ["Schedule lessons from here…", () => setScheduleFrom(l.id)],
      [l.session ? "Edit the session agenda" : "Add a class session", () => {
        if (!l.session) change({ ...l, session: { agenda: [{ label: "Warm-up", minutes: 10 }, { label: "Round-robin presentations and feedback", minutes: 30, roundRobin: true }, { label: "Reflection", minutes: 10 }], minutes: 50 } });
        setAgendaFor(l.id);
      }],
      ...(lessonWires.length ? [[l.openPaths ? "Hide paths from students (card backs)" : "Show students every path", () => {
        change({ ...l, openPaths: !l.openPaths || undefined });
        toast(l.openPaths ? "Students see card backs for paths they haven’t taken" : "Students see every path and what deals it", { icon: "split" });
      }] as [string, () => void]] : []),
      [l.elective ? "Make required for everyone" : "Make it an elective", () => {
        change({ ...l, elective: l.elective ? undefined : true });
        toast(l.elective ? `“${l.title}” is required again` : `Students choose whether to take “${l.title}”`, { icon: "layers" });
      }],
      ["Duplicate lesson", () => duplicate("duplicateLesson", l.id, `“${l.title}”`)],
      ...(l.modules.length ? [["Save lesson to my cards", () => saveToLibrary(null, l)] as [string, () => void]] : []),
      ["—", () => {}],
      [`Add a lesson to ${w.title.split(" · ")[0]}`, () => addLesson(w.id)],
      [`Rename ${w.title.split(" · ")[0]}`, () => setRenamingWeek(w.id)],
      [`Duplicate ${w.title.split(" · ")[0]}`, () => duplicate("duplicateWeek", w.id, `“${w.title}”`)],
    ];
    return (
      <span className="flex flex-none items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        <LessonDateChip value={dates.get(l.id)} today={isToday} disabled={readOnly} onChange={(date) => change({ ...l, date })} />
        {l.elective && (
          <span className="chip h-5 bg-[#eef0fb] text-[11px] text-[#4b56a8]" title="Students choose whether to take this lesson">
            Elective · {Object.values(choices).filter((c) => c[`elective:${l.id}`]).length} chose it
          </span>
        )}
        {!readOnly && <More label={`${l.title} actions`} items={items} />}
      </span>
    );
  };

  const today = course.weeks.flatMap((w) => w.lessons).find((l) => l.id === course.currentLessonId);
  const dates = lessonDates({ weeks: course.weeks.map((w) => ({ ...w, lessons: w.lessons.map((l) => lessonOf(l.id)) })) });
  useShortcuts([
    { keys: "n", label: "New card", run: () => today && addCard(lessonOf(today.id), "content"), enabled: !!today && !editorOpen && !running },
    { keys: "r", label: "Run the class session", run: () => today?.session && setRunning({ lessonId: today.id, weekTitle: course.weeks.find((w) => w.lessons.includes(today))?.title ?? "" }), enabled: !!today?.session && !running },
  ]);

  // Every card in course order, for stepping through them in the editor.
  const order = course.weeks.flatMap((w) => w.lessons.flatMap((ls) => lessonOf(ls.id).modules.map((m) => ({ lessonId: ls.id, id: m.id }))));
  const at = editing ? order.findIndex((x) => x.id === editing.moduleId) : -1;
  const step = (d: number) => {
    const next = order[at + d];
    if (!next) return;
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
            weekNames={Object.fromEntries(course.weeks.flatMap((w) => w.lessons.map((l) => [l.id, w.title])))}
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
            lessonBar={(lid) => lessonBar(lid)}
            footer={readOnly ? undefined : <NewWeek n={nextWeek} onBlank={async () => {
              await op(course.id, { op: "addWeek", title: `Week ${nextWeek}` });
              onRefresh();
              toast("Added a week");
            }} onTemplate={async (theme) => {
              await op(course.id, { op: "insertWeek", week: standardWeek(theme, nextWeek) });
              onRefresh();
              toast(`Added “Week ${nextWeek} · ${theme}” from the template`, { icon: "layers" });
            }} />}
            trash={course.trash ?? []}
            onRestore={readOnly ? undefined : (e) => void restoreTrash(e)}
            onForget={readOnly ? undefined : async (id) => { await op(course.id, { op: "trashDrop", id }); onRefresh(); }}
            onDeleteMany={readOnly ? undefined : async (ms) => {
              if (!ms.length) return;
              if (ms.length === 1) { const m = ms[0]; removeCard(allLessons().find((l) => l.modules.some((x) => x.id === m.id))!, m); return; }
              if (!(await ask({ title: `Delete these ${ms.length} cards?`, body: "Cards their answers deal (and a group's cards) go with them. You can undo this, or put them back from the Trash.", confirm: "Delete", danger: true }))) return;
              deletedToast(`${ms.length} cards`, deleteCards(ms.map((m) => m.id)));
            }}
            onDelete={readOnly ? undefined : async (m) => {
              if (m.type === "group") {
                if (!(await ask({ title: `Delete “${m.title}” and its ${m.members?.length ?? 0} cards?`, body: "To keep the cards, open the group and use Ungroup instead. You can undo this.", confirm: "Delete all", danger: true }))) return;
                deletedToast(m.title, deleteCard(m.id));
              } else removeCard(allLessons().find((l) => l.modules.some((x) => x.id === m.id))!, m);
            }}
          />
        </div>
      ) : null}
      {/* A lesson's class-session agenda, and renaming a week: small panels over the map. */}
      {agendaFor && (() => { const l = allLessons().find((x) => x.id === agendaFor); return l ? (
        <div className="fixed left-1/2 top-28 z-[55] -translate-x-1/2"><AgendaEditor lesson={l} onChange={change} onClose={() => setAgendaFor(null)} /></div>
      ) : null; })()}
      {scheduleFrom && (() => {
        const all = allLessons(), i = all.findIndex((x) => x.id === scheduleFrom);
        if (i < 0) return null;
        return (
          <div className="fixed left-1/2 top-28 z-[55] -translate-x-1/2">
            <ScheduleDialog lessons={all.slice(i)} start={dates.get(scheduleFrom)?.date} onClose={() => setScheduleFrom(null)}
              onApply={(dated) => { setScheduleFrom(null); void changeMany(dated); toast(`Dated ${dated.length} lesson${dated.length === 1 ? "" : "s"}, ${shortDate(dated[0].date!)} to ${shortDate(dated[dated.length - 1].date!)}`, { icon: "clock" }); }} />
          </div>
        );
      })()}
      {renamingWeek && (() => { const w = course.weeks.find((x) => x.id === renamingWeek); return w ? (
        <WeekRename title={w.title} onClose={() => setRenamingWeek(null)} onSave={async (title) => { setRenamingWeek(null); if (title && title !== w.title) { await op(course.id, { op: "renameWeek", weekId: w.id, title }); onRefresh(); } }} />
      ) : null; })()}

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
          course={course}
          onCourseChanged={onRefresh}
          started={course.students.filter((st) => { const p = progress[st.id]?.[curModule.id]; return !!p && (p.status !== "todo" || !!p.output || !!p.work?.length); }).length}
          open={editorOpen}
          onChange={change}
          onClose={() => closeEditor()}
          position={{ index: cur.modules.findIndex((x) => x.id === curModule.id), total: cur.modules.length, lesson: cur.title }}
          onPrev={at > 0 ? () => step(-1) : undefined}
          onNext={at >= 0 && at < order.length - 1 ? () => step(1) : undefined}
          onSaveToLibrary={() => saveToLibrary(curModule)}
          onTree={readOnly ? undefined : () => { showOnMap(curModule.id); if (view !== "map") closeEditor(); }}
          onOpen={readOnly ? undefined : (id) => setEditing({ lessonId: cur.id, moduleId: id })}
          onGo={(id) => {
            const lid = allLessons().find((l) => l.modules.some((x) => x.id === id))?.id;
            if (!lid) return;
            const src = curModule;
            const q = src.questions?.find((x) => x.options.some((_, i) => targetsOf(x, i).includes(id)));
            const oi = q ? q.options.findIndex((_, i) => targetsOf(q, i).includes(id)) : -1;
            const o = q && oi >= 0 ? q.options[oi]?.trim() : "";
            setCameFrom({ lessonId: cur.id, moduleId: src.id, to: id, note: oi >= 0 ? `answer ${String.fromCharCode(65 + oi)}${o ? `: ${o}` : ""}` : "an answer" });
            edit(lid, id);
            if (view === "map") setMapFocus({ id, at: clock() });
          }}
          back={cameFrom && cameFrom.to === curModule.id ? (() => {
            const from = allLessons().flatMap((l) => l.modules).find((x) => x.id === cameFrom.moduleId);
            return from ? { title: from.title || "Untitled card", note: cameFrom.note, go: () => { const c = cameFrom; setCameFrom(null); edit(c.lessonId, c.moduleId); if (view === "map") setMapFocus({ id: c.moduleId, at: clock() }); } } : undefined;
          })() : undefined}
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
      <p className="w-full text-[12px] text-ink-3">A goal, an example, a two-question quick check that deals a review or a stretch card, a task, a class discussion and a reflection. Edit anything after.</p>
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
        <span className="flex-1 font-medium">Class session agenda</span>
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
  const list = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node) && setOpen(false);
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
      <button onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setAt({ x: Math.min(b.left, window.innerWidth - 248), y: b.bottom + 4 }); setOpen((o) => !o); }} onPointerDown={(e) => e.stopPropagation()}
        aria-label={label} aria-expanded={open} aria-haspopup="menu" className={`btn press h-6 w-7 justify-center px-0 ${open ? "bg-black/[0.06]" : "btn-quiet"}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
      </button>
      {/* On the page itself, so it floats above the map's cards whatever the zoom. */}
      {open && at && createPortal(
        <div ref={list} role="menu" className="pop fixed z-[60] w-60 rounded-xl border border-line bg-white p-1 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]" style={{ left: at.x, top: at.y }}>
          {items.map(([text, fn]) => (
            text.startsWith("—") ? <div key={text} className="mx-2 my-1 border-t border-line" /> :
            <button key={text} role="menuitem" onClick={() => { setOpen(false); fn(); }} className="press block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-lane">{text}</button>
          ))}
        </div>,
        document.body,
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

/** Rename a week: a small panel over the map. */
function WeekRename({ title, onSave, onClose }: { title: string; onSave: (t: string) => void; onClose: () => void }) {
  const [v, setV] = useState(title);
  return (
    <form className="pop fixed left-1/2 top-28 z-[55] flex w-[26rem] max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-xl border border-line bg-white p-3 shadow-[0_16px_40px_-20px_rgba(20,20,18,0.35)]"
      onSubmit={(e) => { e.preventDefault(); onSave(v.trim()); }}>
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()} aria-label="Week title" className="field h-8 flex-1 py-0" />
      <button type="submit" disabled={!v.trim()} className="btn btn-dark press h-8">Save</button>
      <button type="button" onClick={onClose} className="btn btn-quiet press h-8">Cancel</button>
    </form>
  );
}
