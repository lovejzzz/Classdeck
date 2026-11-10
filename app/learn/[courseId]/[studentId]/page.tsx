"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CardBack, CardFace } from "@/components/cards/CardFace";
import { CardTable, type TableCard } from "@/components/cards/CardTable";
import { Burst } from "@/components/cards/Burst";
import { Lift } from "@/components/cards/Lift";
import { TiltCard } from "@/components/cards/TiltCard";
import { Avatar, Icon, StatusIcon } from "@/components/Icon";
import { HScroll } from "@/components/HScroll";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Shortcuts } from "@/components/ShortcutHelp";
import { useRouter } from "next/navigation";
import { scrollToWeek, WeekNav } from "@/components/WeekNav";
import { CardDetail } from "@/components/student/CardDetail";
import { Pile } from "@/components/student/Pile";
import { useInbox } from "@/components/student/useInbox";
import { CARD_SIZE } from "@/lib/cards";
import { useConnectors, useCourse, useQuery } from "@/lib/client";
import { PRESET_LABELS, fromPreset } from "@/lib/profile";
import { toast } from "@/lib/toast";
import { TYPE_META } from "@/lib/ui";
import type { Lesson, Module, PresetId, Progress, Status } from "@/lib/types";

const narrowQuery = "(max-width: 639px)";
function useNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(narrowQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(narrowQuery).matches,
    () => false,
  );
}

function readOrder(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

interface LiftState {
  id: string;
  lessonId: string;
  from: DOMRect;
  open: boolean;
  completed: boolean;
}

export default function LearnPage() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>();
  const { state, error, refresh } = useCourse(courseId, studentId);
  const { connectors } = useConnectors();
  const query = useQuery();
  const narrow = useNarrow();
  const router = useRouter();
  const inbox = useInbox(state?.course, studentId);
  const [view, setView] = useState<"hand" | "done">("hand");
  const [lift, setLift] = useState<LiftState | null>(null);
  const [local, setLocal] = useState<Record<string, Partial<Progress>>>({});
  const [orderTick, setOrderTick] = useState(0);
  const [bump, setBump] = useState(0);
  const els = useRef(new Map<string, HTMLElement>());
  const pileRef = useRef<HTMLButtonElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());
  const [burst, setBurst] = useState<{ x: number; y: number; colors: string[]; key: number } | null>(null);

  const course = state?.course;
  const previewPreset = query?.get("preset") as PresetId | null;
  const isPreview = query?.get("preview") === "1";
  const profile = useMemo(
    () => (previewPreset && previewPreset in PRESET_LABELS ? fromPreset(previewPreset) : course?.profile),
    [previewPreset, course?.profile],
  );

  // Bring today's lesson into view in the week rows.
  useEffect(() => {
    const el = todayRef.current;
    const row = el?.parentElement?.parentElement;
    if (el && row) row.scrollTo({ left: el.offsetLeft - 24, behavior: "smooth" });
  }, [course?.currentLessonId, profile?.horizon]);

  if (error && !state) return <Centered>{error}</Centered>;
  if (!course || !profile) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10" aria-busy="true" aria-label="Loading">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton mt-3 h-7 w-64" />
        <div className="mt-10 flex justify-center gap-3">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[252px] w-[180px]" style={{ rotate: `${(i - 2) * 4}deg` }} />)}
        </div>
      </div>
    );
  }
  const student = course.students.find((s) => s.id === studentId);
  if (!student) return <Centered>There’s no student with that name in this class.</Centered>;

  const lessons = course.weeks.flatMap((w) => w.lessons);
  const current = lessons.find((l) => l.id === course.currentLessonId) ?? lessons[0];
  if (!current) return <Centered>Your teacher hasn’t set up a lesson yet.</Centered>;

  const server = state.progress[studentId] ?? {};
  const mine: Record<string, Progress> = { ...server };
  for (const [id, patch] of Object.entries(local)) mine[id] = { ...(server[id] ?? { status: "todo", updatedAt: 0 }), ...patch };
  const statusOf = (id: string): Status => mine[id]?.status ?? "todo";
  const lockedIn = (l: Lesson, m: Module) => {
    const i = l.modules.indexOf(m);
    return (profile.autonomy === "sequential" || !!m.gate) && l.modules.slice(0, i).some((x) => statusOf(x.id) !== "done");
  };
  const big = profile.density === "spacious";
  const handMode = profile.horizon === "lesson";
  const size = narrow ? CARD_SIZE.mobile : CARD_SIZE[profile.density];

  const optimistic = (moduleId: string, patch: Partial<Progress>) => setLocal((l) => ({ ...l, [moduleId]: { ...l[moduleId], ...patch } }));
  const synced = async () => {
    await refresh();
    setLocal({});
  };

  function open(lessonId: string, id: string, el: HTMLElement) {
    setLift({ id, lessonId, from: el.getBoundingClientRect(), open: true, completed: false });
  }
  function close(completed = false) {
    setLift((l) => (l ? { ...l, open: false, completed } : l));
  }

  const toCard = (l: Lesson, m: Module, i: number): TableCard => {
    const locked = lockedIn(l, m);
    const status = statusOf(m.id);
    return {
      id: m.id,
      label: `${m.title}, ${status === "done" ? "done" : locked ? "locked" : status === "doing" ? "in progress" : "not started"}`,
      front: <CardFace m={m} status={status} index={i} total={l.modules.length} personal={m.personal} big={big && !narrow} />,
      back: <CardBack locked={locked} />,
      faceDown: locked,
      locked,
      holo: m.personal || m.choice?.recommended,
    };
  };
  const onLockedTap = () => toast("Finish the cards before this one first", { icon: "lock", tone: "plain" });

  // —— hand mode: today's lesson as a hand of cards plus the done pile ——
  const handKey = `order:${courseId}:${studentId}:${current.id}`;
  void orderTick;
  const saved = typeof window === "undefined" ? [] : readOrder(handKey);
  const byOrder = (list: Module[]) =>
    [...list].sort((a, b) => {
      const ia = saved.indexOf(a.id);
      const ib = saved.indexOf(b.id);
      return (ia < 0 ? 999 + current.modules.indexOf(a) : ia) - (ib < 0 ? 999 + current.modules.indexOf(b) : ib);
    });
  const inHand = byOrder(current.modules.filter((m) => statusOf(m.id) !== "done"));
  const done = current.modules.filter((m) => statusOf(m.id) === "done").sort((a, b) => (mine[a.id]?.updatedAt ?? 0) - (mine[b.id]?.updatedAt ?? 0));
  // Cards that count toward progress: an unpicked set of paths counts once, as the first version.
  const countable = (l: Lesson) => l.modules.filter((m, i) => !m.choice || l.modules.findIndex((x) => x.choice?.slot === m.choice!.slot) === i);
  const doneCount = (l: Lesson) => countable(l).filter((m) => statusOf(m.id) === "done").length;

  // The next card to play: something already started, else the first open card today, else the next week's first.
  const currentWeek = course.weeks.find((w) => w.lessons.some((l) => l.id === current.id)) ?? course.weeks[0];
  const weeksShown = profile.horizon === "week" ? [currentWeek] : course.weeks;
  const playable = (l: Lesson) => l.modules.filter((m) => statusOf(m.id) !== "done" && !lockedIn(l, m));
  const upNext = (() => {
    const today = playable(current);
    const m = today.find((x) => statusOf(x.id) === "doing") ?? today[0];
    if (m) return { lesson: current, m };
    const later = lessons.slice(lessons.indexOf(current) + 1);
    for (const l of later) {
      const first = playable(l)[0];
      if (first) return { lesson: l, m: first };
    }
  })();
  // Unpicked paths count once: you'll only do one of them.
  const minutesLeft = (() => {
    const seen = new Set<string>();
    return current.modules.reduce((n, m) => {
      if (statusOf(m.id) === "done") return n;
      if (m.choice) {
        if (seen.has(m.choice.slot)) return n;
        seen.add(m.choice.slot);
      }
      return n + (m.minutes ?? 0);
    }, 0);
  })();

  // A nudge toward this week's Collab Studio when peers are waiting on you.
  const studioNudge = (() => {
    const sm = current.modules.find((m) => m.type === "studio");
    if (!sm || statusOf(sm.id) === "done") return undefined;
    const others = state.studio.posts.filter((p) => p.moduleId === sm.id && p.studentId !== studentId);
    const mine = state.studio.posts.some((p) => p.moduleId === sm.id && p.studentId === studentId);
    const given = new Set(state.studio.feedback.filter((f) => f.fromId === studentId && others.some((p) => p.id === f.postId)).map((f) => f.postId)).size;
    const names = others.map((p) => course.students.find((x) => x.id === p.studentId)?.name ?? "A peer");
    if (!others.length && !mine) return undefined;
    const goal = Math.min(2, others.length || 2);
    const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} and ${names.length - 1} others`;
    const text = !mine
      ? `${who} posted in Collab Studio. Add your work and reply.`
      : given < goal && others.length
        ? `${who} posted. Give feedback (${given}/${goal}).`
        : "Your post is up. Waiting for your group.";
    return { id: sm.id, text, peers: names };
  })();

  // [ and ] step through the week rows.
  function jumpWeek(d: number) {
    const sections = weeksShown.map((w) => document.getElementById(`week-${w.id}`)).filter(Boolean) as HTMLElement[];
    const y = 120;
    const idx = sections.findIndex((el) => el.getBoundingClientRect().top > y + 4);
    const cur = idx < 0 ? sections.length - 1 : Math.max(0, idx - 1);
    const target = weeksShown[Math.max(0, Math.min(weeksShown.length - 1, cur + d))];
    if (!target) return;
    setOpenWeeks((o) => new Set(o).add(target.id));
    scrollToWeek(target.id);
  }

  const openLesson = lift ? lessons.find((l) => l.id === lift.lessonId) : undefined;
  const openModule = lift && openLesson?.modules.find((m) => m.id === lift.id);
  const openWeek = openLesson && course.weeks.find((w) => w.lessons.includes(openLesson));

  return (
    <div className="flex-1 overflow-x-hidden">
      {isPreview && (
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-line bg-white/85 px-4 py-2 text-[13px] backdrop-blur">
          <Icon name="eye" size={14} className="text-ink-3" />
          <span className="text-ink-2">Previewing as {student.name}</span>
          <div className="ml-2 flex rounded-lg bg-lane p-0.5">
            {(Object.keys(PRESET_LABELS) as PresetId[]).map((id) => (
              <a key={id} href={`?preview=1&preset=${id}`} className={`press rounded-md px-2.5 py-0.5 ${profile.preset === id ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2"}`}>
                {PRESET_LABELS[id]}
              </a>
            ))}
          </div>
          <Link href={`/teach/${courseId}`} className="ml-auto inline-flex items-center gap-1 text-ink-2 hover:text-ink"><Icon name="back" size={13} /> Teacher view</Link>
        </div>
      )}

      {handMode && (
      <div className="mx-auto max-w-6xl px-4 pt-8">
        <header className="rise flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <div className="eyebrow flex items-center gap-2 whitespace-nowrap"><Avatar name={student.name} size={18} />{course.title}{course.subtitle ? ` · ${course.subtitle}` : ""} · {student.name}</div>
            <h1 className={`mt-2 font-semibold tracking-tight ${big ? "text-[30px]" : "text-[24px]"}`}>
              {handMode ? current.title : profile.horizon === "week" ? "This week" : "This term"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/learn/${courseId}/${studentId}/board${isPreview ? "?preview=1" : ""}`} className="btn btn-ghost press h-8"><Icon name="board" size={13} /> My board</Link>
            <NotificationCenter
              title="Notifications"
              align="left"
              notes={inbox.notes}
              modes={[{ id: "stack", label: "Stack" }]}
              emptyText="You’re all caught up"
              onClear={inbox.clear}
              onPick={(n) => {
                if (!n.id.startsWith("m:")) return;
                const id = n.id.slice(2);
                setTimeout(() => {
                  const el = els.current.get(id);
                  const l = lessons.find((x) => x.modules.some((m) => m.id === id));
                  if (el && l) open(l.id, id, el);
                }, 80);
              }}
            />
            {handMode && (
              <>
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={done.length} aria-valuemax={current.modules.length} aria-label="Progress">
                  <div className="h-full rounded-full bg-ok transition-[width] duration-700 ease-out" style={{ width: `${current.modules.length ? (done.length / current.modules.length) * 100 : 0}%` }} />
                </div>
                <span className="mono">{done.length}/{current.modules.length}</span>
              </>
            )}
          </div>
        </header>
      </div>
      )}

      {handMode ? (
        <div className="mx-auto max-w-6xl px-4">
          <div className="mt-6 flex items-center gap-2">
            {view === "done" && (
              <button onClick={() => setView("hand")} className="btn btn-ghost press h-8"><Icon name="back" size={13} /> Back to your hand</button>
            )}
            <span className="text-[13px] text-ink-3">
              {view === "hand"
                ? inHand.length ? "Tap a card to play it, or drag it up out of your hand. Drag sideways to rearrange." : ""
                : `${done.length} finished card${done.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="mt-2 flex flex-col items-stretch gap-6 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              {view === "hand" && inHand.length === 0 ? (
                <div className="pop flex h-[300px] flex-col items-center justify-center gap-2 text-center">
                  <span className="text-[17px] font-medium">You’ve played every card in this lesson.</span>
                  <span className="text-[13px] text-ink-3">Nice work. Your finished cards are in the pile.</span>
                </div>
              ) : (
                <CardTable
                  key={`${current.id}-${view}`}
                  cards={(view === "hand" ? inHand : done).map((m) => toCard(current, m, current.modules.indexOf(m)))}
                  layout={profile.density === "compact" ? "grid" : "fan"}
                  size={size}
                  hiddenId={lift?.id}
                  register={(id, el) => (el ? els.current.set(id, el) : els.current.delete(id))}
                  onActivate={(id, el) => open(current.id, id, el)}
                  onPlay={view === "hand" ? (id, el) => open(current.id, id, el) : undefined}
                  onLockedTap={onLockedTap}
                  onReorder={(ids) => {
                    try {
                      localStorage.setItem(handKey, JSON.stringify(ids));
                    } catch {}
                    setOrderTick((x) => x + 1);
                  }}
                  ariaLabel="Your hand"
                />
              )}
            </div>
            <div className="flex justify-end pb-6">
              <Pile ref={pileRef} top={done[done.length - 1]} count={done.length} bump={bump} size={size} onOpen={() => setView("done")} />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* —— Today: where you are and the next card to play —— */}
          <section className="mx-auto max-w-6xl px-4 pt-7">
            <div className="flex flex-wrap items-center gap-3">
              <div className="eyebrow flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap"><Avatar name={student.name} size={18} /><span className="truncate">{course.title}{course.subtitle ? ` · ${course.subtitle}` : ""} · {student.name}</span></div>
              <Link href={`/learn/${courseId}/${studentId}/board${isPreview ? "?preview=1" : ""}`} className="btn btn-ghost press h-8"><Icon name="board" size={13} /> My board</Link>
              <Shortcuts
                list={[
                  { keys: "n", label: "Open the next card", run: () => upNext && heroRef.current && open(upNext.lesson.id, upNext.m.id, heroRef.current), enabled: !!upNext && !lift },
                  { keys: "b", label: "My board", run: () => router.push(`/learn/${courseId}/${studentId}/board${isPreview ? "?preview=1" : ""}`), enabled: !lift },
                  { keys: "[", label: "Previous week", run: () => jumpWeek(-1), enabled: weeksShown.length > 1 && !lift },
                  { keys: "]", label: "Next week", run: () => jumpWeek(1), enabled: weeksShown.length > 1 && !lift },
                ]}
                extra={[{ keys: "←", label: "Move between cards" }, { keys: "mod+enter", label: "Mark the open card done" }, { keys: "escape", label: "Close a card" }]}
              />
              <NotificationCenter
                title="Notifications"
                notes={inbox.notes}
                modes={[{ id: "stack", label: "Stack" }]}
                emptyText="You’re all caught up"
                onClear={inbox.clear}
                onPick={(n) => {
                  if (!n.id.startsWith("m:")) return;
                  const id = n.id.slice(2);
                  setTimeout(() => {
                    const el = els.current.get(id);
                    const l = lessons.find((x) => x.modules.some((m) => m.id === id));
                    if (el && l) open(l.id, id, el);
                  }, 80);
                }}
              />
            </div>

            <div className="rise mt-6 grid items-center gap-8 md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[12.5px] font-medium text-ok">
                  <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-40" /><span className="relative inline-flex h-2 w-2 rounded-full bg-ok" /></span>
                  Today · {currentWeek.title.split(" · ")[0]}
                </div>
                <h1 className={`mt-2 font-semibold tracking-tight ${big ? "text-[36px]" : "text-[30px]"}`}>{current.title}</h1>
                {current.goal && <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">{current.goal}</p>}
                <div className="mt-5 flex max-w-md gap-1" aria-label={`${doneCount(current)} of ${countable(current).length} cards done`}>
                  {countable(current).map((m) => {
                    const st = statusOf(m.id);
                    return <span key={m.id} title={m.title} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${st === "done" ? "bg-ok" : st === "doing" ? "bg-warn" : "bg-line"}`} />;
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-ink-3">
                  <span><span className="font-mono text-ink">{doneCount(current)}</span> of {countable(current).length} cards done</span>
                  {minutesLeft > 0 && <span className="flex items-center gap-1"><Icon name="clock" size={12} />about {minutesLeft} min left</span>}
                  {current.session && <span className="flex items-center gap-1"><Icon name="studio" size={12} />Collab Studio · {current.session.minutes} min</span>}
                </div>
                {studioNudge && (
                  <button
                    onClick={() => {
                      const el = els.current.get(studioNudge.id);
                      if (el) open(current.id, studioNudge.id, el);
                    }}
                    className="pop press mt-4 flex max-w-md items-center gap-3 rounded-xl border border-[#c25a35]/25 bg-[#fbf3ee] px-3.5 py-2.5 text-left hover:border-[#c25a35]/50"
                  >
                    <span className="flex -space-x-1.5">{studioNudge.peers.slice(0, 3).map((n) => <span key={n} className="rounded-full ring-2 ring-[#fbf3ee]"><Avatar name={n} size={22} /></span>)}</span>
                    <span className="min-w-0 flex-1 text-[13px]">{studioNudge.text}</span>
                    <Icon name="arrow" size={14} className="text-[#c25a35]" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-5">
                {upNext ? (
                  <>
                    <div className="order-2 min-w-0 text-left sm:order-1 sm:text-right">
                      <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-ink-3">{statusOf(upNext.m.id) === "doing" ? "Pick up where you left off" : upNext.lesson.id === current.id ? "Up next" : "Get ahead"}</div>
                      <div className="mt-1 max-w-[12rem] text-[15px] font-medium leading-snug">{upNext.m.title}</div>
                      <button onClick={() => heroRef.current && open(upNext.lesson.id, upNext.m.id, heroRef.current)} className="btn btn-dark press mt-3 h-9 px-4">
                        {statusOf(upNext.m.id) === "doing" ? "Continue" : "Play this card"} <Icon name="arrow" size={13} />
                      </button>
                    </div>
                    <div className="order-1 flex-none sm:order-2">
                    <TiltCard
                      ref={heroRef}
                      w={narrow ? CARD_SIZE.mobile.w : CARD_SIZE.comfortable.w}
                      h={narrow ? CARD_SIZE.mobile.h : CARD_SIZE.comfortable.h}
                      label={`Up next: ${upNext.m.title}`}
                      hidden={lift?.id === upNext.m.id}
                      onClick={() => heroRef.current && open(upNext.lesson.id, upNext.m.id, heroRef.current)}
                    >
                      <CardFace m={upNext.m} status={statusOf(upNext.m.id)} index={upNext.lesson.modules.indexOf(upNext.m)} total={upNext.lesson.modules.length} personal={upNext.m.personal} />
                    </TiltCard>
                    </div>
                  </>
                ) : (
                  <div className="pop flex h-[252px] w-[180px] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-ok/50 bg-ok/[0.04] p-4 text-center">
                    <StatusIcon status="done" size={22} />
                    <span className="text-[14px] font-medium">Every card is done</span>
                    <span className="text-[12px] text-ink-3">See you in Collab Studio.</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* —— Week navigator —— */}
          {weeksShown.length > 1 && (
            <WeekNav
              className="top-0 mt-8"
              weeks={weeksShown.map((w) => {
                const ms = w.lessons.flatMap((l) => l.modules);
                return { id: w.id, label: w.title.split(" · ")[0], done: ms.filter((m) => statusOf(m.id) === "done").length, total: ms.length, current: w.lessons.some((l) => l.id === current.id) };
              })}
              onPick={(id) => {
                setOpenWeeks((o) => new Set(o).add(id));
                scrollToWeek(id);
              }}
            />
          )}

          <div className="mt-6 space-y-8 pb-16">
            {weeksShown.map((week) => {
              const ms = week.lessons.flatMap((l) => l.modules);
              const finished = ms.length > 0 && ms.every((m) => statusOf(m.id) === "done");
              const isNow = week.lessons.some((l) => l.id === current.id);
              const folded = finished && !isNow && !openWeeks.has(week.id);
              return (
                <section key={week.id} id={`week-${week.id}`} aria-label={week.title} className="scroll-mt-20">
                  <div className="mx-auto flex max-w-6xl items-center gap-3 px-4">
                    <h2 className={`text-[13px] font-medium ${isNow ? "text-ink" : "text-ink-2"}`}>{week.title}</h2>
                    {finished && !isNow && (
                      <button onClick={() => setOpenWeeks((o) => { const n = new Set(o); if (n.has(week.id)) n.delete(week.id); else n.add(week.id); return n; })} className="btn btn-quiet press h-6 px-2 text-[11.5px]">
                        {folded ? "Show cards" : "Fold"}
                      </button>
                    )}
                  </div>
                  {folded ? (
                    <div className="mx-auto max-w-6xl px-4">
                      <button
                        onClick={() => setOpenWeeks((o) => new Set(o).add(week.id))}
                        className="group mt-3 flex items-center gap-5 rounded-2xl p-2 text-left"
                        aria-label={`${week.title}: all ${ms.length} cards done. Show cards`}
                      >
                        <span className="relative block h-[118px] w-[86px] flex-none">
                          {[2, 1, 0].map((i) => (
                            <span key={i} className="absolute inset-0 transition-transform duration-500 ease-[var(--ease-spring)]"
                              style={{ transform: `translate(${i * 4}px, ${i * -3}px) rotate(${(i - 1) * 4}deg)`, zIndex: 3 - i }}>
                              <span className="block h-[252px] w-[180px] origin-top-left scale-[0.475]">
                                <CardFace m={ms[Math.min(i, ms.length - 1)]} status="done" />
                              </span>
                            </span>
                          ))}
                        </span>
                        <span>
                          <span className="flex items-center gap-1.5 text-[14px] font-medium"><StatusIcon status="done" size={14} /> All {ms.length} cards done</span>
                          <span className="mt-1 block text-[12.5px] text-ink-3 group-hover:text-ink-2">{week.lessons.map((l) => l.title).join(" · ")} · Show cards</span>
                        </span>
                      </button>
                    </div>
                  ) : (
                    <HScroll className="mt-1">
                      <div className="flex w-max gap-10 pb-6 pt-4" style={{ paddingInline: "max(1rem, calc((100vw - 72rem) / 2 + 1rem))" }}>
                        {week.lessons.map((l) => {
                          const isToday = l.id === current.id;
                          const rowWidth = Math.max(l.modules.length, 1) * (size.w + 14) - 14;
                          return (
                            <div key={l.id} ref={isToday ? todayRef : undefined} className="scroll-ml-6">
                              <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ maxWidth: Math.max(rowWidth, 280) }}>
                                <span className="font-medium">{l.title}</span>
                                {isToday && <span className="chip h-5 bg-ok/10 text-[11px] text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Today</span>}
                                <span className="mono">{doneCount(l)}/{countable(l).length}</span>
                                {l.session && <span className="chip h-5 text-[11px]"><Icon name="studio" size={11} />Collab Studio · {l.session.minutes} min</span>}
                              </div>
                              {l.goal && !isToday && <p className="mt-1 text-[12.5px] text-ink-3" style={{ maxWidth: Math.min(Math.max(rowWidth, 280), 576) }}>{l.goal}</p>}
                              {l.modules.length ? (
                                <CardTable
                                  cards={l.modules.map((m, i) => toCard(l, m, i))}
                                  layout="row"
                                  size={size}
                                  gap={14}
                                  draggable={false}
                                  hiddenId={lift?.id}
                                  register={(id, el) => (el ? els.current.set(id, el) : els.current.delete(id))}
                                  onActivate={(id, el) => open(l.id, id, el)}
                                  onLockedTap={onLockedTap}
                                  ariaLabel={l.title}
                                />
                              ) : (
                                <div className="hatch mt-5 flex items-center justify-center text-[12.5px] text-ink-3" style={{ width: size.w, height: size.h }}>No cards yet</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </HScroll>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {burst && <Burst key={burst.key} seed={burst.key} x={burst.x} y={burst.y} colors={burst.colors} onDone={() => setBurst(null)} />}

      {lift && openModule && (
        <Lift
          from={lift.from}
          open={lift.open}
          label={openModule.title}
          onBackdrop={() => close()}
          landing={() => {
            if (lift.completed && handMode && pileRef.current) return pileRef.current.getBoundingClientRect();
            return els.current.get(lift.id)?.getBoundingClientRect() ?? null;
          }}
          onGone={() => {
            if (lift.completed) {
              if (handMode) setBump((b) => b + 1);
              const target = handMode ? pileRef.current : els.current.get(lift.id);
              const r = target?.getBoundingClientRect();
              if (r) setBurst({ x: r.left + r.width / 2, y: r.top + r.height / 2, colors: [TYPE_META[openModule.type].tint, "#2f9e5b", "#f2c94c", "#1b1b1a"], key: Date.now() });
            }
            setLift(null);
          }}
        >
          <CardDetail
            courseId={courseId}
            lessonId={lift.lessonId}
            studentId={studentId}
            module={openModule}
            progress={mine[openModule.id]}
            posts={state.posts}
            students={course.students}
            connectors={connectors}
            big={big}
            onClose={close}
            onChanged={synced}
            optimistic={(patch) => optimistic(openModule.id, patch)}
            course={course}
            lesson={openLesson!}
            weekTitle={openWeek?.title ?? ""}
            mine={mine}
            studio={state.studio}
          />
        </Lift>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <p className="flex flex-1 items-center justify-center p-10 text-ink-2">{children}</p>;
}
