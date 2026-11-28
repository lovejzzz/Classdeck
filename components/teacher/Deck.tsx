"use client";

import { usePanelShift } from "./usePanelShift";
import { createPortal } from "react-dom";
import { lessonDates, localDay, shortDate, type LessonDate } from "@/lib/dates";
import { ScheduleDialog } from "./ScheduleDialog";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { baseOf, type LessonBase } from "@/lib/merge";
import { op } from "@/lib/client";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { uid } from "@/lib/profile";
import { toast } from "@/lib/toast";
import { ask } from "../Confirm";
import type { Course, Lesson, Module, ProgressMap, TrashEntry } from "@/lib/types";
import { Icon } from "../Icon";
import { useShortcuts } from "@/lib/shortcuts";
import { useUrlState } from "@/lib/urlState";
import { nextNumber } from "@/lib/templates";
import { AddWeek } from "./WeekTemplates";
import { CardEditor } from "./CardEditor";
import { CourseMap } from "./CourseMap";
import { newCard, type CardKind } from "@/lib/kinds";
import { NeighborGraph } from "./NeighborGraph";
import { branchBelow, deleteCardIn, leavesOf, parentOf, SCORE, slotOf, targetsOf, topOf, wiresOf } from "@/lib/branching";
import { loadLibrary } from "./NewCardFan";

/** The time, for grouping quick edits into one undo step (only ever called from event handlers). */
const clock = () => Date.now();

/** The teacher's whole course, on the course map: its cards, branches, lessons and weeks, and the card editor. */
/** What a saved card keeps (not where it is, who it's for, its due date or its tie to My cards), to tell if it changed. */
const lookOfContent = (m: Module) => JSON.stringify({ ...m, id: "", audience: undefined, due: undefined, collected: undefined });

export function Deck({ course, onRefresh, progress = {}, choices = {}, readOnly = false, view = "map", onView }: {
  course: Course; connectors?: ConnectorInfo[]; readOnly?: boolean; onRefresh: () => unknown; progress?: ProgressMap; choices?: Record<string, Record<string, string>>;
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
  usePanelShift(editorOpen);
  const [saving, setSaving] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Lessons whose last save didn't go through: tried again by themselves (sooner at first, then less often).
  const failed = useRef(new Set<string>());
  const retry = useRef<{ timer?: ReturnType<typeof setTimeout>; tries: number }>({ tries: 0 });
  const [retries, setRetries] = useState(0);
  function saveFailed(ids: string[], error?: string) {
    ids.forEach((id) => failed.current.add(id));
    setSaveError(error ?? "Couldn’t save");
    if (retry.current.timer) return;
    const wait = Math.min(30_000, 3000 * 2 ** retry.current.tries);
    retry.current.timer = setTimeout(retryNow, wait);
  }
  async function retryNow() {
    if (retry.current.timer) { clearTimeout(retry.current.timer); retry.current.timer = undefined; }
    const ids = [...failed.current];
    if (!ids.length) return;
    retry.current.tries++;
    setRetries(retry.current.tries);
    const r = await inTurn(ids, async () => {
      const sent = ids.map((id) => latest.current[id]).filter(Boolean);
      const b = sending(sent);
      const r = await op<{ ok?: boolean; error?: string }>(course.id, { op: "saveLessons", lessons: sent, bases: b.sent });
      if (r.ok === false) b.failed();
      return r;
    });
    if (r.ok === false) return saveFailed(ids, r.error);
    ids.forEach((id) => failed.current.delete(id));
    retry.current.tries = 0;
    setRetries(0);
    setSaveError(null);
    await onRefresh();
  }
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef<Record<string, Lesson>>({});
  // What each lesson looked like on the server when this page started changing it. Sent with each save, so the server
  // keeps changes made meanwhile in another tab (or by a co-teacher) to cards this page didn't touch.
  const bases = useRef<Record<string, LessonBase>>({});
  // The latest copy from the server, also for a callback made earlier (the Undo in a message after deleting).
  const courseNow = useRef(course);
  useEffect(() => { courseNow.current = course; }, [course]);
  const serverLesson = (id: string) => courseNow.current.weeks.flatMap((w) => w.lessons).find((l) => l.id === id);
  const startFrom = (id: string) => { if (!bases.current[id]) { const l = serverLesson(id); if (l) bases.current[id] = baseOf(l); } };
  // Sending a lesson: the next save starts from what this one sent (an Undo right after a delete must count as a
  // change). If the save fails, the base it was sent with comes back.
  // One save at a time for each lesson: a later save waits for the one before it, so it starts from what really
  // reached the server (if the earlier one failed, the later one carries its changes too).
  const queue = useRef(new Map<string, Promise<unknown>>());
  const inTurn = <T,>(ids: string[], run: () => Promise<T>): Promise<T> => {
    const before = Promise.all(ids.map((id) => queue.current.get(id)));
    const p = before.then(run);
    const done = p.catch(() => undefined);
    ids.forEach((id) => queue.current.set(id, done));
    void done.then(() => ids.forEach((id) => { if (queue.current.get(id) === done) queue.current.delete(id); }));
    return p;
  };
  const sending = (list: Lesson[]) => {
    const sent = Object.fromEntries(list.filter((l) => bases.current[l.id]).map((l) => [l.id, bases.current[l.id]]));
    for (const l of list) bases.current[l.id] = baseOf(l);
    return { sent, failed: () => { for (const [id, b] of Object.entries(sent)) bases.current[id] = b; } };
  };
  // Edits wait a moment before they're saved. Leaving the page (closing the tab, reloading, typing another address)
  // sends whatever is still waiting at once, in a request that outlives the page; if that can't be done (a very big
  // lesson) or a save is still on its way, the browser asks before leaving.
  useEffect(() => {
    const flush = () => {
      for (const [id, t] of timers.current) {
        // keepalive requests are limited to 64 KB: a bigger lesson stays waiting, and leaving asks first.
        if (JSON.stringify(latest.current[id]).length > 60_000) continue;
        clearTimeout(t);
        void sendNow(id, true);
      }
    };
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    const leaving = (e: BeforeUnloadEvent) => {
      flush();
      if (timers.current.size) { e.preventDefault(); e.returnValue = ""; }
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", leaving);
    return () => { document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", leaving); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id]);
  const openRef = useRef(false);
  const pushedRef = useRef(false);
  const [scheduleFrom, setScheduleFrom] = useState<string | null>(null);
  const [renamingWeek, setRenamingWeek] = useState<string | null>(null);

  useEffect(() => {
    const map = timers.current;
    const pending = latest.current;
    return () => {
      // Flush anything still waiting so no edit is lost when leaving the tab.
      map.forEach((t, id) => {
        clearTimeout(t);
        op(course.id, { op: "saveLesson", lesson: pending[id], base: bases.current[id] });
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
  // Each step also says what it was and when, for the history list beside Undo.
  const undoStack = useRef<{ lessons: Lesson[]; at: number; label: string; when: number }[]>([]);
  const redoStack = useRef<Lesson[][]>([]);
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });
  // The steps as state (for the history list), mirrored from the stack whenever it changes.
  const [steps, setSteps] = useState<{ label: string; when: number }[]>([]);
  const [historyOpen, setHistoryOpen] = useState<"bar" | "editor" | null>(null);
  const syncCounts = () => { setCounts({ undo: undoStack.current.length, redo: redoStack.current.length }); setSteps(undoStack.current.map(({ label, when }) => ({ label, when }))); };
  /** Remember a lesson as it was, for Undo. Quick edits to the same lesson count as one step. */
  function remember(next: Lesson) {
    const prev = lessonOf(next.id);
    const last = undoStack.current[undoStack.current.length - 1];
    if (!(last && last.lessons.length === 1 && last.lessons[0].id === next.id && clock() - last.at < 1000)) undoStack.current = [...undoStack.current, { lessons: [prev], at: clock(), label: describeChange([prev], [next]), when: Date.now() }].slice(-100);
    else { last.at = clock(); last.when = Date.now(); last.label = describeChange(last.lessons, [next]); }
    redoStack.current = [];
    syncCounts();
  }
  function rememberAll(list: Lesson[]) {
    const before = list.map((l) => lessonOf(l.id));
    undoStack.current = [...undoStack.current, { lessons: before, at: 0, label: describeChange(before, list), when: Date.now() }].slice(-100);
    redoStack.current = [];
    syncCounts();
  }
  /** Put lessons back to a saved state without recording it (Undo and Redo). */
  const restore = (list: Lesson[]) => (list.length === 1 ? change(list[0], false) : changeMany(list, false));
  function change(next: Lesson, record = true) {
    startFrom(next.id);
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
    list.forEach((l) => startFrom(l.id));
    if (record) rememberAll(list);
    for (const l of list) latest.current[l.id] = l;
    setDrafts((d) => ({ ...d, ...Object.fromEntries(list.map((l) => [l.id, l])) }));
    let waiting = 0;
    for (const l of list) {
      const t = timers.current.get(l.id);
      if (t) { clearTimeout(t); timers.current.delete(l.id); waiting++; }
    }
    setSaving((n) => n - waiting + 1);
    let sent: Lesson[] = [];
    const r = await inTurn(list.map((l) => l.id), async () => {
      sent = list.map((l) => latest.current[l.id]);
      const b = sending(sent);
      const r = await op<{ ok?: boolean; error?: string }>(course.id, { op: "saveLessons", lessons: sent, bases: b.sent });
      if (r.ok === false) b.failed();
      return r;
    });
    setSaving((n) => n - 1);
    if (r.ok === false) return saveFailed(sent.map((l) => l.id), r.error);
    sent.forEach((l) => failed.current.delete(l.id));
    if (!failed.current.size) setSaveError(null);
    await onRefresh();
    for (const l of sent) if (latest.current[l.id] === l) delete bases.current[l.id];
    setDrafts((d) => {
      const n = { ...d };
      for (const l of sent) if (n[l.id] === l && latest.current[l.id] === l) delete n[l.id];
      return n;
    });
  }
  async function sendNow(id: string, keepalive = false) {
    timers.current.delete(id);
    let sent = latest.current[id];
    // Leaving the page can't wait in line: it goes at once.
    const r = await (keepalive ? (f: () => Promise<{ ok?: boolean; error?: string }>) => f() : (f: () => Promise<{ ok?: boolean; error?: string }>) => inTurn([id], f))(async () => {
      sent = latest.current[id];
      const b = sending([sent]);
      const r = await op<{ ok?: boolean; error?: string }>(course.id, { op: "saveLesson", lesson: sent, base: b.sent[id] }, { keepalive });
      if (r.ok === false) b.failed();
      return r;
    });
    setSaving((n) => n - 1);
    if (r.ok === false) {
      // Keep the edit on screen, say so, and try again by itself.
      return saveFailed([id], r.error);
    }
    failed.current.delete(id);
    if (!failed.current.size) setSaveError(null);
    await onRefresh();
    if (latest.current[id] === sent) delete bases.current[id];
    // Once the server has this version, show the server's copy again (so edits made elsewhere appear).
    setDrafts((d) => (d[id] === sent && latest.current[id] === sent ? Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)) : d));
  }

  /** Go back to how the course was before step `i` of the history (undoing it and everything after it). */
  function undoTo(i: number) {
    while (undoStack.current.length > i) undo();
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
    undoStack.current.push({ lessons: r.map((l) => lessonOf(l.id)), at: 0, label: describeChange(r.map((l) => lessonOf(l.id)), r), when: Date.now() });
    restore(r);
    syncCounts();
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      // One undo for everything, the card editor's changes included.
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
        ? { name: m.title, kind: "group", modules: [m, ...l.modules.filter((x) => x.id !== m.id && topOf(x.id, parentOf(l.modules)) === m.id)] }
        : { module: m, name: m?.title };
    // A card already in My cards: Collect again keeps its newest version there (no second copy).
    if (m && !lesson && m.type !== "group" && m.collected && (await updateCollected(m, true))) return;
    const r = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (!r.ok) return toast(r.error ?? "Couldn’t save it", { icon: "x", tone: "bad" });
    await loadLibrary(true);
    // One card: it remembers it's in My cards, so changing it later asks whether to update that copy too.
    if (m && !lesson && m.type !== "group" && l && r.card?.id) {
      const now = lessonOf(l.id);
      change({ ...now, modules: now.modules.map((x) => (x.id === m.id ? { ...x, collected: r.card.id } : x)) }, false);
      if (openedAs.current?.id === m.id) openedAs.current = { id: m.id, was: lookOfContent({ ...m, collected: r.card.id }) };
    }
    toast(`Saved${lesson ? ` “${lesson.title}” and its ${lesson.modules.length} cards` : ""}. To use it in any of your courses, press + Card on a lesson, then Saved cards.`, { icon: "star" });
  }

  /** Put a collected card's newest version in My cards. False when it isn't there any more (then it's collected anew). */
  async function updateCollected(m: Module, quiet = false): Promise<boolean> {
    const r = await fetch("/api/library", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.collected, module: m }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (!r.ok) {
      if (!quiet) toast(r.error ?? "Couldn’t save it to Saved cards", { icon: "x", tone: "bad" });
      return false;
    }
    await loadLibrary(true);
    if (openedAs.current?.id === m.id) openedAs.current = { id: m.id, was: lookOfContent(m) };
    toast(`Saved the changes to “${m.title || "the card"}” in Saved cards`, { icon: "star" });
    return true;
  }

  // The card open in the panel as it was when it opened. Once it's let go (closed, or another card opened), a card that
  // came from My cards (or was collected) and has changed asks whether My cards should have the changes too.
  const openedAs = useRef<{ id: string; was: string } | null>(null);
  useEffect(() => {
    const id = editorOpen ? editing?.moduleId : undefined;
    const prev = openedAs.current;
    const find = (x: string) => allLessons().flatMap((l) => l.modules).find((m) => m.id === x);
    if (prev && prev.id !== id) {
      const m = find(prev.id);
      if (m?.collected && lookOfContent(m) !== prev.was && !readOnly) {
        ask({ title: `Update the saved copy?`, body: `“${m.title || "This card"}” is in Saved cards. Save these changes there too, so the next copy you put down has them? Copies already in your courses stay as they are.`, confirm: "Save to Saved cards", cancel: "Not now" })
          .then((yes) => { if (yes) updateCollected(m); });
      }
    }
    if (id && prev?.id !== id) { const m = find(id); openedAs.current = m ? { id, was: lookOfContent(m) } : null; }
    else if (!id) openedAs.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen, editing?.moduleId]);

  async function duplicate(op_: "duplicateWeek" | "duplicateLesson", id: string, what: string) {
    await op(course.id, op_ === "duplicateWeek" ? { op: op_, weekId: id } : { op: op_, lessonId: id });
    onRefresh();
    toast(`Duplicated ${what}`, { icon: "layers" });
  }

  /** Delete a lesson or a whole week, after asking. It can't be undone; students' work on the cards stays saved. */
  async function remove(what: "lesson" | "week", id: string, title: string, cards: number) {
    const lessons = what === "week" ? course.weeks.find((x) => x.id === id)?.lessons.length ?? 0 : 1;
    const n = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;
    const items = what === "week" ? [n(lessons, "lesson"), cards ? n(cards, "card") : ""].filter(Boolean) : cards ? [n(cards, "card")] : [];
    const one = items.length === 1 && /^1 /.test(items[0]);
    const ok = await ask({
      title: `Delete “${title}”?`,
      body: `${items.length ? `Its ${items.join(" and ")} ${one ? "goes" : "go"} with it. ` : ""}This can’t be undone. Students’ work on its cards stays saved.`,
      confirm: "Delete", danger: true,
    });
    if (!ok) return;
    const r = await op<{ ok?: boolean; error?: string }>(course.id, what === "week" ? { op: "deleteWeek", weekId: id } : { op: "deleteLesson", lessonId: id });
    if (r.ok === false) return toast(r.error ?? "That didn’t work", { icon: "x", tone: "bad" });
    // Undo can't bring a deleted lesson back: steps that would change one are dropped.
    const gone = new Set(what === "week" ? course.weeks.find((x) => x.id === id)?.lessons.map((l) => l.id) : [id]);
    undoStack.current = undoStack.current.filter((u) => !u.lessons.some((l) => gone.has(l.id)));
    redoStack.current = redoStack.current.filter((r) => !r.some((l) => gone.has(l.id)));
    syncCounts();
    await onRefresh();
    toast(`Deleted “${title}”`, { icon: "trash", tone: "plain" });
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
      ["Schedule lessons from here…", () => setScheduleFrom(l.id)],
      ...(lessonWires.length ? [[l.openPaths ? "Hide paths from students (card backs)" : "Show students every path", () => {
        change({ ...l, openPaths: !l.openPaths || undefined });
        toast(l.openPaths ? "Students see card backs for paths they haven’t taken" : "Students see every path and what deals it", { icon: "split" });
      }] as [string, () => void]] : []),
      [l.elective ? "Make required for everyone" : "Make it an elective", () => {
        change({ ...l, elective: l.elective ? undefined : true });
        toast(l.elective ? `“${l.title}” is required again` : `Students choose whether to take “${l.title}”`, { icon: "layers" });
      }],
      ["Duplicate lesson", () => duplicate("duplicateLesson", l.id, `“${l.title}”`)],
      ...(course.weeks.reduce((n, x) => n + x.lessons.length, 0) > 1 ? [["Delete lesson…", () => void remove("lesson", l.id, l.title, l.modules.filter((m) => m.type !== "group").length)] as [string, () => void]] : []),
      ...(l.modules.length ? [["Save lesson to Saved cards", () => saveToLibrary(null, l)] as [string, () => void]] : []),
      ["—", () => {}],
      [`Add a lesson to ${w.title.split(" · ")[0]}`, () => addLesson(w.id)],
      [`Rename ${w.title.split(" · ")[0]}`, () => setRenamingWeek(w.id)],
      [`Duplicate ${w.title.split(" · ")[0]}`, () => duplicate("duplicateWeek", w.id, `“${w.title}”`)],
      ...(course.weeks.length > 1 ? [[`Delete ${w.title.split(" · ")[0]}…`, () => void remove("week", w.id, w.title, w.lessons.reduce((n, x) => n + x.modules.filter((m) => m.type !== "group").length, 0))] as [string, () => void]] : []),
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
    { keys: "n", label: "New card", run: () => today && addCard(lessonOf(today.id), "content"), enabled: !!today && !editorOpen },
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
  // The card being edited is gone (a card group came apart when its second-to-last card was deleted): close the panel.
  const gone = editorOpen && !!editing && !curModule;
  useEffect(() => {
    if (gone) queueMicrotask(() => closeEditor());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone]);

  // Undo, redo and the history of changes: one set for the whole course, shown above the map and in the card editor.
  const undoBar = (where: "bar" | "editor") => (
    <>
              <button onClick={undo} disabled={!counts.undo} aria-label="Undo" title="Undo (⌘Z)" className="btn btn-quiet press h-8 w-8 justify-center px-0 disabled:opacity-30"><UndoIcon /></button>
              <button onClick={redo} disabled={!counts.redo} aria-label="Redo" title="Redo (⇧⌘Z)" className="btn btn-quiet press h-8 w-8 justify-center px-0 disabled:opacity-30"><UndoIcon flip /></button>
              {/* History: every change since the page opened; pick one to go back to before it. */}
              <span className="relative">
                <button onClick={() => setHistoryOpen((o) => (o === where ? null : where))} disabled={!steps.length} aria-expanded={historyOpen === where} aria-label="History of changes" title="History of changes"
                  className="btn btn-quiet press h-8 w-8 justify-center px-0 disabled:opacity-30"><Icon name="clock" size={15} /></button>
                {historyOpen === where && steps.length > 0 && (
                  <History steps={steps} onPick={(i) => { undoTo(i); setHistoryOpen(null); }} onClose={() => setHistoryOpen(null)} />
                )}
              </span>
    </>
  );

  return (
    <div>
      {statusSlot && createPortal(
        <span className="flex items-center gap-1 text-[12.5px] text-ink-3">
          {/* While the card panel is open, its own undo, redo and history are the ones to use: not shown twice. */}
          {!readOnly && !editorOpen && undoBar("bar")}
          <span className="ml-1 flex items-center gap-1.5" aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${saveError ? "bg-bad" : saving ? "bg-warn" : "bg-ok"}`} />
            {saveError && !saving ? (
              // Changes stay on screen; saving is tried again by itself. The server's reason is in the tooltip.
              <span className="flex items-center gap-1.5 text-bad" title={saveError}>
                {retries < 3 ? "Saving didn’t work. Trying again…" : "Your latest changes aren’t saved yet."}
                <button onClick={() => void retryNow()} className="underline underline-offset-2 hover:text-ink">Try now</button>
              </span>
            ) : saving ? "Saving" : "Saved"}
          </span>
        </span>,
        statusSlot,
      )}

      {view === "map" ? (
        // The map starts where the tabs do (the page's column), not at the window's edge.
        <div>
          <CourseMap
            lessons={allLessons()}
            weekOf={Object.fromEntries(course.weeks.flatMap((w) => w.lessons.map((l) => [l.id, w.title.split(" · ")[0]])))}
            weekNames={Object.fromEntries(course.weeks.flatMap((w) => w.lessons.map((l) => [l.id, w.title])))}
            todayId={course.currentLessonId}
            students={course.students}
            live={course.mapLive !== false}
            onSaveGroup={readOnly ? undefined : (g) => saveToLibrary(g)}
            progress={progress}
            readOnly={readOnly}
            busy={editorOpen}
            selected={editorOpen ? editing?.moduleId : null}
            onDeselect={editorOpen ? () => closeEditor() : undefined}
            focus={mapFocus ?? (course.currentLessonId ? { id: course.currentLessonId, at: 0 } : null)}
            onChange={change}
            onChangeMany={changeMany}
            onEdit={(lid, id) => { if (!readOnly) edit(lid, id); }}
            onAddLesson={course.weeks.length ? () => addLesson(course.weeks[course.weeks.length - 1].id) : undefined}
            lessonBar={(lid) => lessonBar(lid)}
            addLessonLabel={course.weeks.length ? `Lesson in ${course.weeks[course.weeks.length - 1].title.split(" · ")[0]}` : undefined}
            footer={readOnly ? undefined : <AddWeek n={nextWeek} onBlank={async () => {
              await op(course.id, { op: "addWeek", title: `Week ${nextWeek}` });
              onRefresh();
              toast("Added a week");
            }} onTemplate={async (week, name) => {
              await op(course.id, { op: "insertWeek", week });
              onRefresh();
              toast(`Added Week ${nextWeek} from “${name}”`, { icon: "layers" });
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
                if (!(await ask({ title: `Delete “${m.title}” and its ${leavesOf(m, allLessons().flatMap((l) => l.modules)).length} cards?`, body: "To keep the cards, open the group and use Ungroup instead. You can undo this.", confirm: "Delete all", danger: true }))) return;
                deletedToast(m.title, deleteCard(m.id));
              } else removeCard(allLessons().find((l) => l.modules.some((x) => x.id === m.id))!, m);
            }}
          />
        </div>
      ) : null}
      {/* Scheduling lessons, and renaming a week: small panels over the map. */}
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
          undoBar={readOnly ? undefined : undoBar("editor")}
          position={{ index: cur.modules.findIndex((x) => x.id === curModule.id), total: cur.modules.length, lesson: cur.title }}
          onPrev={at > 0 ? () => step(-1) : undefined}
          onNext={at >= 0 && at < order.length - 1 ? () => step(1) : undefined}
          onSaveToLibrary={() => saveToLibrary(curModule)}
          onDeleteCard={readOnly ? undefined : (id) => { const l = allLessons().find((x) => x.modules.some((y) => y.id === id)); const c = l?.modules.find((y) => y.id === id); if (l && c) void removeCard(l, c); }}
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
            if (removed.type === "group" && !(await ask({ title: `Delete “${removed.title}” and its ${leavesOf(removed, allLessons().flatMap((l) => l.modules)).length} cards?`, body: "To keep the cards, use Ungroup instead. You can undo this.", confirm: "Delete all", danger: true }))) return;
            const before = deleteCard(removed.id);
            closeEditor();
            deletedToast(removed.title, before);
          }}
        />
      )}
    </div>
  );
}

/** A small "⋯" menu for the actions that don't need to be on screen all the time. */
function More({ items, label }: { items: [string, () => void][]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; above: number } | null>(null);
  // Near the bottom of the screen the menu opens upward (and scrolls if it's taller than the room there), so its
  // last items (the week's) can always be reached.
  useLayoutEffect(() => {
    const el = list.current;
    if (!open || !at || !el) return;
    const h = el.offsetHeight, room = window.innerHeight - 8;
    const top = at.y + h <= room ? at.y : at.above - h >= 8 ? at.above - h : 8;
    el.style.top = `${top}px`;
    el.style.maxHeight = `${room - top}px`;
  }, [open, at]);
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
      <button onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setAt({ x: Math.min(b.left, window.innerWidth - 248), y: b.bottom + 4, above: b.top - 4 }); setOpen((o) => !o); }} onPointerDown={(e) => e.stopPropagation()}
        aria-label={label} aria-expanded={open} aria-haspopup="menu" className={`btn press h-6 w-7 justify-center px-0 ${open ? "bg-black/[0.06]" : "btn-quiet"}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
      </button>
      {/* On the page itself, so it floats above the map's cards whatever the zoom. */}
      {open && at && createPortal(
        <div ref={list} role="menu" className="pop fixed z-[60] w-60 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]" style={{ left: at.x, top: at.y }}>
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

const q = (t?: string) => `“${(t || "Untitled card").trim().slice(0, 40)}”`;
/** What an edit did, in a few words, from the lessons before and after it (for the history list). */
function describeChange(before: Lesson[], after: Lesson[]): string {
  const changed = after.filter((a) => JSON.stringify(a) !== JSON.stringify(before.find((b) => b.id === a.id)));
  const was = new Map(before.flatMap((l) => l.modules.map((m) => [m.id, { m, l }] as const)));
  const now = new Map(after.flatMap((l) => l.modules.map((m) => [m.id, { m, l }] as const)));
  const added = [...now.values()].filter((x) => !was.has(x.m.id) && x.m.type !== "group");
  const removed = [...was.values()].filter((x) => !now.has(x.m.id) && x.m.type !== "group");
  const more = (n: number) => (n > 1 ? ` and ${n - 1} more` : "");
  const moved = [...now.values()].find((x) => was.has(x.m.id) && was.get(x.m.id)!.l.id !== x.l.id);
  if (moved) return `Moved ${q(moved.m.title)} to ${q(moved.l.title)}`;
  if (added.length && removed.length) return `Changed cards in ${q(changed[0]?.title)}`;
  if (added.length) return added[0].m.type === "group" || added.some((x) => x.m.type === "group") ? "Made a card group" : `Added ${q(added[0].m.title)}${more(added.length)}`;
  if (removed.length) return `Deleted ${q(removed[0].m.title)}${more(removed.length)}`;
  if ([...now.values()].some((x) => x.m.type === "group" && !was.has(x.m.id))) return "Made a card group";
  for (const a of changed) {
    const b = before.find((x) => x.id === a.id);
    if (!b) continue;
    if (a.title !== b.title) return `Renamed the lesson to ${q(a.title)}`;
    const order = (l: Lesson) => l.modules.map((m) => m.id).join();
    if (order(a) !== order(b)) { const i = a.modules.findIndex((m, k) => m.id !== b.modules[k]?.id); return `Moved ${q(a.modules[i]?.title)}`; }
    for (const m of a.modules) {
      const o = b.modules.find((x) => x.id === m.id);
      if (!o || JSON.stringify(o) === JSON.stringify(m)) continue;
      if (o.title !== m.title) return `Renamed ${q(o.title)} to ${q(m.title)}`;
      if (JSON.stringify(o.questions?.map((x) => x.next)) !== JSON.stringify(m.questions?.map((x) => x.next)) || JSON.stringify(o.bands) !== JSON.stringify(m.bands)) return `Changed what ${q(m.title)} deals`;
      return `Edited ${q(m.title)}`;
    }
    return `Changed the lesson ${q(a.title)}`;
  }
  return changed.length > 1 ? `Changed ${changed.length} lessons` : "Changed a lesson";
}

/** The list of changes since the page opened, newest first. Picking one puts the course back to before it (Redo brings the steps back). */
function History({ steps, onPick, onClose }: { steps: { label: string; when: number }[]; onPick: (i: number) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const away = (e: PointerEvent) => { if (!box.current?.parentElement?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { clearInterval(t); window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [onClose]);
  const ago = (t: number) => { const m = Math.round((now - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
  return (
    <div ref={box} role="menu" className="pop absolute right-0 top-10 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white p-1.5 shadow-[0_20px_50px_-18px_rgba(20,20,18,0.3)]">
      <div className="px-2.5 pb-1.5 pt-1 text-[12px] text-ink-3">Go back to before a change. Redo brings it back.</div>
      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-ink"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Now</div>
      <ul className="max-h-80 overflow-y-auto">
        {steps.map((st, i) => ({ st, i })).reverse().map(({ st, i }) => (
          <li key={i}>
            <button role="menuitem" onClick={() => onPick(i)} className="press group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-lane">
              <span className="min-w-0 flex-1 truncate text-ink-2 group-hover:text-ink">{st.label}</span>
              <span className="flex-none text-[11.5px] text-ink-3 group-hover:hidden">{ago(st.when)}</span>
              <span className="hidden flex-none text-[11.5px] text-[#4b56a8] group-hover:inline">Go back</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
