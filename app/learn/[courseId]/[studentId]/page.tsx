"use client";

import { BackCloses } from "@/components/BackCloses";
import { AccountMenu } from "@/components/AccountMenu";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CardBack, CardFace } from "@/components/cards/CardFace";
import { CardTable, type TableCard } from "@/components/cards/CardTable";
import { Burst } from "@/components/cards/Burst";
import { Lift } from "@/components/cards/Lift";
import { TiltCard } from "@/components/cards/TiltCard";
import { Avatar, Icon, StatusIcon } from "@/components/Icon";
import { HScroll } from "@/components/HScroll";
import { InboxCenter } from "@/components/InboxCenter";
import { Shortcuts } from "@/components/ShortcutHelp";
import { useRouter } from "next/navigation";
import { scrollToWeek, WeekNav } from "@/components/WeekNav";
import { CardDetail } from "@/components/student/CardDetail";
import { Pile } from "@/components/student/Pile";
import { useInbox } from "@/components/student/useInbox";
import { MarksContext } from "@/components/Marks";
import { SignInNeeded } from "@/components/SignInNeeded";
import { NeedsYou } from "@/components/student/NeedsYou";
import { ElectiveRow, chooseElective } from "@/components/student/Electives";
import { dueInfo } from "@/lib/grading";
import { CARD_SIZE } from "@/lib/cards";
import { setPreview, useConnectors, useCourse, useQuery } from "@/lib/client";
import { PreviewBar } from "@/components/student/PreviewBar";
import { toast } from "@/lib/toast";
import { suitOfCard } from "@/lib/ui";
import type { Lesson, Module, Profile, Progress, Status } from "@/lib/types";

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
  /** The card it was opened from, so it can turn into the open card. */
  el?: HTMLElement;
}

const FIXED_PROFILE: Profile = { preset: "custom", density: "comfortable", autonomy: "free", horizon: "term", entry: "code" };

/** The bell's sections for a student, each of which can be turned off. */
const STUDENT_SECTIONS = [
  { id: "feedback", label: "Feedback", hint: "Your teacher looked at your work" },
  { id: "discussion", label: "Discussions", hint: "Replies to you, and @mentions of you" },
  { id: "cards", label: "New cards", hint: "Cards added or dealt to you, and today’s lesson" },
];
/** A student's note's section, from its id ("n:" teacher, "r:" feedback, "m:card#reply" discussion, else new cards). */
const studentSection = (id: string) => (id.startsWith("n:") ? "teacher" : id.startsWith("r:") ? "feedback" : id.startsWith("m:") && id.includes("#") ? "discussion" : "cards");

export default function LearnPage() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>();
  // Student View (a teacher testing as this student): set before the course is read, so every request is a test.
  // From the router, not window.location: arriving by a link, the address bar still shows the page we came from.
  const testing = useSearchParams().has("preview");
  if (typeof window !== "undefined") setPreview(testing ? studentId : null);
  const { state, error, refresh, needAuth } = useCourse(courseId, studentId);
  const { connectors } = useConnectors();
  const query = useQuery();
  const narrow = useNarrow();
  const router = useRouter();
  const inbox = useInbox(state?.course, studentId, state?.progress[studentId], state?.nudges, state?.posts);
  const [view, setView] = useState<"hand" | "done">("hand");
  const [lift, setLift] = useState<LiftState | null>(null);
  const [local, setLocal] = useState<Record<string, Partial<Progress>>>({});
  const [orderTick, setOrderTick] = useState(0);
  const [bump, setBump] = useState(0);
  const els = useRef(new Map<string, HTMLElement>());
  const pileRef = useRef<HTMLButtonElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());
  // Today (the next card and today's lesson) or All cards (every week); #all in the address keeps All cards on a reload.
  const [home, setHome] = useState<"today" | "all">(() => (typeof window !== "undefined" && window.location.hash === "#all" ? "all" : "today"));
  useEffect(() => {
    const want = home === "all" ? "#all" : "";
    if (window.location.hash !== want) history.replaceState(history.state, "", window.location.pathname + window.location.search + want);
  }, [home]);
  const [burst, setBurst] = useState<{ x: number; y: number; colors: string[]; key: number } | null>(null);
  const [now] = useState(() => Date.now());

  // Electives the student hasn't chosen aren't in their lessons yet (they show in their week, to choose).
  const course = state && {
    ...state.course,
    weeks: state.course.weeks.map((w) => ({ ...w, lessons: w.lessons.filter((l) => !l.elective || l.chosen) })).filter((w) => w.lessons.length),
  };
  const isPreview = query?.get("preview") === "1";
  // Every course is laid out the same way now: the whole term, comfortable cards, any card open in any order.
  const profile = course ? FIXED_PROFILE : undefined;

  // A card in the address when the page loads (a reload while it was open, or a link to it) opens again, once the course is in.
  const [linkedCard] = useState<string | null>(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("card") : null));
  const restoring = !!linkedCard;
  const linkUsed = useRef(false);
  useEffect(() => {
    const id = linkedCard;
    if (!id || !course || isPreview || linkUsed.current) return;
    linkUsed.current = true;
    const lesson = course.weeks.flatMap((w) => w.lessons).find((l) => l.modules.some((m) => m.id === id));
    if (!lesson) { router.replace(window.location.pathname, { scroll: false }); return; }
    const w = window.innerWidth, h = window.innerHeight;
    // Once the board has drawn, so the card rises over it.
    setTimeout(() => setLift({ id, lessonId: lesson.id, from: new DOMRect(w / 2 - 90, h / 2 - 126, 180, 252), open: true, completed: false }), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, isPreview]);

  // An answer just dealt a card (maybe in a later lesson): unfold its week, bring it into view, and make it glow.
  useEffect(() => {
    const show = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const wk = state?.course.weeks.find((w) => w.lessons.some((l) => l.modules.some((m) => m.id === id)));
      if (wk) setOpenWeeks((s) => new Set(s).add(wk.id));
      if (!els.current.get(id)) setHome("all");
      setLift((l) => (l ? { ...l, open: false } : l));
      setTimeout(() => {
        const el = els.current.get(id);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        el.classList.add("dealt-glow");
        setTimeout(() => el.classList.remove("dealt-glow"), 3600);
      }, 450);
    };
    window.addEventListener("questhand:show-card", show);
    return () => window.removeEventListener("questhand:show-card", show);
  }, [state]);

  // Cards an answer just dealt: marked New until opened, and dealt into place on the board with a short flight once
  // the card that dealt them closes (or at once, if no card is open).
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const toDeal = useRef<string[]>([]);
  const liftOpen = useRef(false);
  useEffect(() => { liftOpen.current = !!lift; }, [lift]);
  function deal(ids: string[], again = false) {
    // A card dealt into a lesson that isn't on screen (Today shows only today's lesson): to All cards, where it is.
    if (!again && ids.some((id) => !els.current.get(id))) {
      setHome("all");
      setTimeout(() => deal(ids, true), 200);
      return;
    }
    const targets = ids.map((id) => ({ id, el: els.current.get(id) })).filter((x): x is { id: string; el: HTMLElement } => !!x.el);
    if (!targets.length) return;
    targets[0].el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => targets.forEach(({ id, el }, i) => {
      const glow = () => { el.classList.add("dealt-glow"); setTimeout(() => el.classList.remove("dealt-glow"), 3600); };
      const m = course?.weeks.flatMap((w) => w.lessons).flatMap((l) => l.modules).find((x) => x.id === id);
      if (still || !m) return glow();
      // A plain card in the card's colours with its title flies from the middle of the screen into its place.
      const to = el.getBoundingClientRect();
      const g = document.createElement("div");
      g.setAttribute("aria-hidden", "true");
      g.style.cssText = `position:fixed;left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px;z-index:80;pointer-events:none;border-radius:14px;background:#fff;border:1px solid rgba(0,0,0,0.08);box-shadow:0 24px 50px -18px rgba(20,20,18,0.55);overflow:hidden;font:600 14px/1.3 var(--font-sans, system-ui);color:#1b1b1a`;
      g.innerHTML = `<div style="height:6px;background:${suitOfCard(m).tint}"></div><div style="padding:10px 12px"><span style="display:inline-block;margin-bottom:6px;padding:1px 8px;border-radius:99px;background:#eef0fb;color:#4b56a8;font-size:11px">New</span><div></div></div>`;
      (g.querySelector("div > div > div") as HTMLElement).textContent = m.title;
      document.body.appendChild(g);
      const dx = innerWidth / 2 - (to.left + to.width / 2), dy = innerHeight / 2 - (to.top + to.height / 2);
      const a = g.animate([
        { transform: `translate(${dx}px, ${dy + 40}px) scale(0.6) rotate(-8deg)`, opacity: 0 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) scale(1.06) rotate(4deg)`, opacity: 1, offset: 0.45 },
        { transform: "none", opacity: 1 },
      ], { duration: 720, delay: i * 140, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" });
      a.onfinish = () => { g.remove(); glow(); };
      a.oncancel = () => g.remove();
    }), 420);
  }
  useEffect(() => {
    const on = (e: Event) => {
      const ids = (e as CustomEvent<string[]>).detail ?? [];
      setFresh((f) => new Set([...f, ...ids]));
      if (liftOpen.current) toDeal.current.push(...ids);
      else setTimeout(() => deal(ids), 300);
    };
    window.addEventListener("questhand:dealt", on);
    return () => window.removeEventListener("questhand:dealt", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);


  if (needAuth && !state) return <SignInNeeded who="student" courseId={courseId} next={`/learn/${courseId}/${studentId}`} />;
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
  // The teacher asked for another go and the student hasn't finished it again yet.
  const revising = (id: string) => mine[id]?.review?.verdict === "revise" && statusOf(id) !== "done";
  const big = profile.density === "spacious";
  const handMode = profile.horizon === "lesson";
  const size = narrow ? CARD_SIZE.mobile : CARD_SIZE[profile.density];

  const optimistic = (moduleId: string, patch: Partial<Progress>) => setLocal((l) => ({ ...l, [moduleId]: { ...l[moduleId], ...patch } }));
  // Local changes are dropped only once the server's copy has been fetched; if that fails, they stay on screen.
  const synced = async () => {
    if (await refresh()) setLocal({});
  };

  function open(lessonId: string, id: string, el: HTMLElement) {
    setFresh((f) => (f.has(id) ? new Set([...f].filter((x) => x !== id)) : f));
    setLift({ id, lessonId, from: el.getBoundingClientRect(), open: true, completed: false, el });
  }
  function close(completed = false) {
    setLift((l) => (l ? { ...l, open: false, completed } : l));
  }

  const toCard = (l: Lesson, m: Module, i: number): TableCard => {
    // Nothing is locked: "today" already says what comes first.
    const locked = false;
    const status = statusOf(m.id);
    return {
      id: m.id,
      label: `${m.title}, ${status === "done" ? "done" : locked ? "locked" : status === "doing" ? "in progress" : "not started"}`,
      front: <CardFace m={m} status={status} index={i} total={l.modules.length} personal={m.personal || m.dealtFor} big={big && !narrow} due={dueInfo(m.due, now)} badge={revising(m.id) ? "Revise" : (fresh.has(m.id) && status !== "done") || (inbox.newCards.has(m.id) && status === "todo") ? "New" : m.dealtFor && status !== "done" ? "For you" : undefined} />,
      back: <CardBack locked={locked} />,
      faceDown: locked,
      locked,
      // Cards dealt by the student's own answers shimmer, like the ones made just for them.
      holo: m.personal || m.choice?.recommended || m.dealtFor,
    };
  };
  const onLockedTap = () => toast("Finish the cards before this one first", { icon: "lock", tone: "plain" });
  /** A lesson's cards in runs: loose cards, and each card group's cards together (in lesson order). */
  const segmentsOf = (l: Lesson) => {
    const deckOf = new Map((l.decks ?? []).flatMap((d) => d.members.map((id) => [id, d] as const)));
    const out: { key: string; deck?: NonNullable<Lesson["decks"]>[number]; cards: Module[] }[] = [];
    for (const m of l.modules) {
      const d = deckOf.get(m.id);
      const last = out[out.length - 1];
      if (last && last.deck === d) last.cards.push(m);
      else out.push({ key: d ? d.id : `loose-${m.id}`, deck: d, cards: [m] });
    }
    return out;
  };

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
  // The weeks as shown: with the electives not chosen yet, in their place, to choose.
  const weeksShown = profile.horizon === "week" ? [currentWeek] : state.course.weeks.filter((w) => w.lessons.length);
  const toElectives = () => {
    const wk = state.course.weeks.find((w) => w.lessons.some((l) => l.elective && !l.chosen));
    const l = wk?.lessons.find((x) => x.elective && !x.chosen);
    if (!wk || !l) return;
    setHome("all");
    setOpenWeeks((o) => new Set(o).add(wk.id));
    setTimeout(() => document.getElementById(`elective-${l.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };
  // A discussion you've posted on, with no classmate's post left to reply to yet: you're waiting on others, so it
  // isn't your next card (it would hold up everything after it). It comes back once someone posts.
  const waitingOnClass = (m: Module) => {
    if (m.type !== "wall" || statusOf(m.id) === "done") return false;
    const posts = state.posts.filter((x) => x.moduleId === m.id);
    if (!posts.some((x) => x.studentId === studentId)) return false;
    return posts.filter((x) => x.studentId !== studentId).every((x) => x.comments?.some((c) => c.from === studentId));
  };
  const playable = (l: Lesson) => l.modules.filter((m) => statusOf(m.id) !== "done" && !waitingOnClass(m));
  const upNext = (() => {
    // A revision the teacher asked for comes first, whichever lesson it's in.
    for (const l of lessons) {
      const r = playable(l).find((x) => revising(x.id));
      if (r) return { lesson: l, m: r };
    }
    // Then anything overdue, in any lesson (earliest first).
    for (const l of lessons) {
      const late = playable(l).find((x) => x.due && dueInfo(x.due, now)?.tone === "late");
      if (late) return { lesson: l, m: late };
    }
    const today = playable(current);
    // Then what's late, then what's already started, then today's next card.
    const m = today.find((x) => x.due && dueInfo(x.due, now)?.tone === "late") ?? today.find((x) => statusOf(x.id) === "doing") ?? today[0];
    if (m) return { lesson: current, m };
    // Today's done: catch up on earlier lessons before getting ahead.
    const at = lessons.indexOf(current);
    for (const l of [...lessons.slice(0, at).filter((x) => !x.elective || x.chosen), ...lessons.slice(at + 1)]) {
      const first = playable(l)[0];
      if (first) return { lesson: l, m: first };
    }
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

  const nothingYet = lessons.every((l) => l.modules.length === 0);
  // Why this is the card to play now.
  const nextReason = !upNext ? "" : revising(upNext.m.id) ? "Your teacher asked for a revision" : dueInfo(upNext.m.due, now)?.tone === "late" ? "Overdue" : statusOf(upNext.m.id) === "doing" ? "Pick up where you left off" : upNext.lesson.id === current.id ? "Up next" : lessons.indexOf(upNext.lesson) < lessons.indexOf(current) ? "Catch up" : currentWeek.lessons.includes(upNext.lesson) ? "Next lesson" : "Get ahead";
  function goHome(k: "today" | "all") {
    setHome(k);
    window.scrollTo({ top: 0 });
  }
  /** Open a card from where it is on screen, or, when it isn't (it's in another lesson), from the given element or the middle of the screen. */
  function reveal(id: string, go: (el: HTMLElement, l: Lesson, id: string) => void, from?: HTMLElement | null) {
    const l = lessons.find((x) => x.modules.some((m) => m.id === id));
    if (!l) return;
    const el = els.current.get(id) ?? from;
    if (el) return go(el, l, id);
    setFresh((f) => (f.has(id) ? new Set([...f].filter((x) => x !== id)) : f));
    setLift({ id, lessonId: l.id, from: new DOMRect(innerWidth / 2 - 90, innerHeight / 2 - 126, 180, 252), open: true, completed: false });
  }

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
  // A card in a card group: its place in the group, and the group's next card on this student's board.
  const openGroup = (() => {
    const d = openModule ? openLesson?.decks?.find((x) => x.members.includes(openModule.id)) : undefined;
    if (!d || !openModule || !openLesson) return undefined;
    const ids = d.members.filter((id) => openLesson.modules.some((m) => m.id === id));
    const i = ids.indexOf(openModule.id);
    const nm = openLesson.modules.find((m) => m.id === ids[i + 1]);
    // Once the group's done: its score and the cards that score opened, said on its last card.
    const opened = (d.paths ?? []).filter((x) => x.to).map((x) => lessons.flatMap((l) => l.modules).find((m) => m.id === x.to)?.title).filter((t): t is string => !!t);
    // A group inside it: its name on each of its cards, and its own score on its last card once it's done.
    const titleOf = (id?: string) => lessons.flatMap((l) => l.modules).find((m) => m.id === id)?.title;
    const openedBy = (ps?: { to?: string }[]) => (ps ?? []).filter((x) => x.to).map((x) => titleOf(x.to)).filter((t): t is string => !!t);
    const pt = d.parts?.find((x) => x.members.includes(openModule.id));
    const ptIds = pt ? pt.members.filter((id) => ids.includes(id)) : [];
    const part = pt ? { title: pt.title, score: pt.done && ptIds[ptIds.length - 1] === openModule.id ? pt.score : undefined, opened: openedBy(pt.paths) } : undefined;
    const parts = nm ? undefined : d.parts?.filter((x) => x.done && x.score !== undefined).map((x) => ({ title: x.title, score: x.score as number }));
    return { title: d.title, index: i + 1, total: ids.length, next: nm ? { title: nm.title, go: () => setLift((l) => (l ? { ...l, id: nm.id } : l)) } : undefined, score: d.done ? d.score : undefined, opened, part, parts };
  })();
  const openWeek = openLesson && course.weeks.find((w) => w.lessons.includes(openLesson));

  /** One lesson as a row of cards, scrolling sideways on its own when it has many. */
  const lessonRow = (l: Lesson) => {
    if (l.elective && !l.chosen) return (
      <HScroll key={l.id}>
        <div className="pb-1 pt-2 sm:pb-4 sm:pt-3" style={{ paddingInline: "max(1rem, calc((100vw - 72rem) / 2 + 1rem))" }}>
          <ElectiveRow state={state} studentId={studentId} lesson={l} size={size} onChanged={synced} />
        </div>
      </HScroll>
    );
    const isToday = l.id === current.id;
    const rowWidth = Math.max(l.modules.length, 1) * (size.w + 14) - 14;
    return (
      <HScroll key={l.id}>
      <div className="w-max pb-1 pt-2 sm:pb-4 sm:pt-3" style={{ paddingInline: "max(1rem, calc((100vw - 72rem) / 2 + 1rem))" }}>
      <div className="scroll-ml-6">
        <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ maxWidth: Math.max(rowWidth, 280) }}>
          <span className="font-medium">{l.title}</span>
          {isToday && <span className="chip h-5 bg-ok/10 text-[11px] text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Today</span>}
          {l.elective && <span className="chip h-5 bg-[#eef0fb] text-[11px] text-[#4b56a8]"><Icon name="split" size={10} />Elective</span>}
          <span className="mono">{doneCount(l)}/{countable(l).length}</span>
          {l.elective && l.modules.every((m) => statusOf(m.id) === "todo") && <button onClick={() => chooseElective(courseId, studentId, l, false, synced)} className="btn btn-quiet press h-6 px-2 text-[11.5px]">Drop</button>}
        </div>
        {l.goal && !isToday && <p className="mt-1 text-[12.5px] text-ink-3" style={{ maxWidth: Math.min(Math.max(rowWidth, 280), 576) }}>{l.goal}</p>}
        {l.modules.length ? (
          // Cards in a card group sit together in a frame with the group's name (and score, once done).
          <div className="flex items-start gap-4">
            {segmentsOf(l).map((seg) => {
              const table = (
                <CardTable
                  cards={seg.cards.map((m) => toCard(l, m, l.modules.indexOf(m)))}
                  layout="row"
                  size={size}
                  gap={14}
                  idle={false}
                  draggable={false}
                  hiddenId={lift?.id}
                  register={(id, el) => (el ? els.current.set(id, el) : els.current.delete(id))}
                  onActivate={(id, el) => open(l.id, id, el)}
                  onLockedTap={onLockedTap}
                  ariaLabel={seg.deck ? `${l.title}: ${seg.deck.title}` : l.title}
                />
              );
              if (!seg.deck) return <div key={seg.key}>{table}</div>;
              return (
                <div key={seg.key} className="rounded-[22px] border border-[#4b56a8]/25 bg-[#eef0fb]/60 px-3 pb-0.5 pt-2.5">
                  <div className="flex items-center gap-2 px-1 text-[12px]">
                    <Icon name="layers" size={12} className="text-[#4b56a8]" />
                    <span className="font-medium text-ink">{seg.deck.title}</span>
                    <span className="text-ink-3">{seg.cards.length} cards</span>
                    {seg.deck.done && seg.deck.score !== undefined && <span className="chip h-5 bg-white text-[11px] text-[#4b56a8]">Score {seg.deck.score}%</span>}
                  </div>
                  {table}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="hatch mt-5 flex items-center justify-center text-[12.5px] text-ink-3" style={{ width: size.w, height: size.h }}>No cards yet</div>
        )}
      </div>
      </div>
      </HScroll>
    );
  };

  return (
    <MarksContext.Provider value={{ courseId, me: studentId, marks: state.marks ?? [], names: Object.fromEntries(course.students.map((s) => [s.id, s.name])), refresh: synced }}>
    <main className="flex-1 overflow-x-hidden">
      {!isPreview && <ConnectionBanner needAuth={needAuth} error={error} signInHref={`/learn/${courseId}`} />}
      {isPreview && <PreviewBar courseId={courseId} studentId={studentId} students={course.students} onReset={() => { setLocal({}); refresh(); }} />}

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
            <InboxCenter
              courseId={courseId}
              courseTitle={course.title}
              notes={inbox.notes.map((n) => ({ ...n, cat: studentSection(n.id) })).filter((n) => n.cat !== "teacher")}
              sections={STUDENT_SECTIONS}
              muteKey="notify-off:student:v2"
              noMessages={isPreview}
              emptyText="You’re all caught up"
              onClear={inbox.clear}
              onPick={(n) => {
                if (!n.id.startsWith("m:")) return;
                // "m:<card>" or, for a reply in a discussion, "m:<card>#<reply>".
                const id = n.id.slice(2).split("#")[0];
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
          {/* —— The top: the course, the three places (Today, All cards, My board), and the bell —— */}
          <section className="mx-auto max-w-6xl px-4 pt-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
              <div className="min-w-0 flex-1 truncate text-[14px] font-medium">{course.title}</div>
              <nav aria-label="Your course" className="order-last flex w-full justify-center sm:order-none sm:w-auto">
                <div className="flex gap-1 rounded-xl bg-black/[0.045] p-[3px]">
                  {(["today", "all"] as const).map((k) => (
                    <button key={k} onClick={() => goHome(k)} aria-current={home === k ? "page" : undefined}
                      className={`press h-8 rounded-[9px] px-3.5 text-[13px] ${home === k ? "bg-white font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"}`}>
                      {k === "today" ? "Today" : "All cards"}
                    </button>
                  ))}
                  <Link href={`/learn/${courseId}/${studentId}/board${isPreview ? "?preview=1" : ""}`} className="press flex h-8 items-center rounded-[9px] px-3.5 text-[13px] text-ink-2 hover:text-ink">My board</Link>
                </div>
              </nav>
              <div className="flex flex-1 items-center justify-end gap-2">
                <Shortcuts
                  list={[
                    { keys: "n", label: "Open the next card", run: () => upNext && heroRef.current && open(upNext.lesson.id, upNext.m.id, heroRef.current), enabled: !!upNext && !lift && home === "today" },
                    { keys: "t", label: "Today", run: () => goHome("today"), enabled: !lift },
                    { keys: "a", label: "All cards", run: () => goHome("all"), enabled: !lift },
                    { keys: "b", label: "My board", run: () => router.push(`/learn/${courseId}/${studentId}/board${isPreview ? "?preview=1" : ""}`), enabled: !lift },
                    { keys: "[", label: "Previous week", run: () => jumpWeek(-1), enabled: home === "all" && weeksShown.length > 1 && !lift },
                    { keys: "]", label: "Next week", run: () => jumpWeek(1), enabled: home === "all" && weeksShown.length > 1 && !lift },
                  ]}
                  extra={[{ keys: "←", label: "Move between cards" }, { keys: "mod+enter", label: "Mark the open card done" }, { keys: "escape", label: "Close a card" }]}
                />
                <InboxCenter
                  courseId={courseId}
                  courseTitle={course.title}
                  notes={inbox.notes.map((n) => ({ ...n, cat: studentSection(n.id) })).filter((n) => n.cat !== "teacher")}
                  sections={STUDENT_SECTIONS}
                  muteKey="notify-off:student:v2"
                  noMessages={isPreview}
                  emptyText="You’re all caught up"
                  onClear={inbox.clear}
                  onPick={(n) => {
                    if (!n.id.startsWith("m:")) return;
                    // "m:<card>" or, for a reply in a discussion, "m:<card>#<reply>".
                    reveal(n.id.slice(2).split("#")[0], (el, l, id) => open(l.id, id, el));
                  }}
                />
                {!isPreview && <AccountMenu inboxElsewhere />}
              </div>
            </div>
          </section>

          {home === "today" && (
            <>
              {/* —— Today: the one card to play now, and what else needs you —— */}
              <section className="rise mx-auto max-w-6xl px-4">
                <div className="mt-8 flex flex-col items-center gap-8 sm:mt-10 sm:flex-row sm:items-center sm:gap-14">
                  <div className="flex-none">
                    {upNext ? (
                      <TiltCard
                        ref={heroRef}
                        w={narrow ? CARD_SIZE.comfortable.w : CARD_SIZE.spacious.w}
                        h={narrow ? CARD_SIZE.comfortable.h : CARD_SIZE.spacious.h}
                        label={`Up next: ${upNext.m.title}`}
                        hidden={lift?.id === upNext.m.id && lift.el === heroRef.current}
                        onClick={() => heroRef.current && open(upNext.lesson.id, upNext.m.id, heroRef.current)}
                      >
                        <CardFace m={upNext.m} big={!narrow} status={statusOf(upNext.m.id)} index={upNext.lesson.modules.indexOf(upNext.m)} total={upNext.lesson.modules.length} personal={upNext.m.personal} due={dueInfo(upNext.m.due, now)} badge={revising(upNext.m.id) ? "Revise" : undefined} />
                      </TiltCard>
                    ) : (
                      <div className={`pop flex h-[252px] w-[180px] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed p-4 text-center ${nothingYet ? "border-line-strong" : "border-ok/50 bg-ok/[0.04]"}`}>
                        {nothingYet ? <Icon name="layers" size={22} className="text-ink-3" /> : <StatusIcon status="done" size={24} />}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    {upNext ? (
                      <>
                        <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-ink-3">
                          <span className={revising(upNext.m.id) || dueInfo(upNext.m.due, now)?.tone === "late" ? "text-warn" : ""}>{nextReason}</span> · {upNext.lesson.title}
                        </div>
                        <h1 className={`mt-2 font-semibold leading-[1.15] tracking-tight ${big ? "text-[40px]" : "text-[30px] sm:text-[36px]"}`}>{upNext.m.title}</h1>
                        {revising(upNext.m.id) && mine[upNext.m.id]?.review?.text ? (
                          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">Your teacher: “{mine[upNext.m.id]!.review!.text}”</p>
                        ) : upNext.lesson.goal ? <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">{upNext.lesson.goal}</p> : null}
                        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                          <button onClick={() => heroRef.current && open(upNext.lesson.id, upNext.m.id, heroRef.current)} className="btn btn-dark press h-10 px-5 text-[14px]">
                            {revising(upNext.m.id) ? "Revise it" : statusOf(upNext.m.id) === "doing" ? "Continue" : "Play this card"} <Icon name="arrow" size={13} />
                          </button>
                          <span className="mono">card {upNext.lesson.modules.indexOf(upNext.m) + 1} of {upNext.lesson.modules.length}</span>
                        </div>
                      </>
                    ) : nothingYet ? (
                      <>
                        <h1 className="text-[30px] font-semibold tracking-tight">No cards yet</h1>
                        <p className="mt-2 text-[15px] text-ink-2">Your teacher hasn’t added any cards. Check back soon.</p>
                      </>
                    ) : (
                      <>
                        <h1 className="text-[30px] font-semibold tracking-tight">You’re all caught up</h1>
                        <p className="mt-2 text-[15px] text-ink-2">Every card is done. {course.groups?.length ? "See you in class." : "Nice work."} Your work is on My board.</p>
                      </>
                    )}
                    {/* What else needs the student, only when something does: to revise, overdue, due soon, to catch up, electives. */}
                    <div className="flex justify-center sm:justify-start">
                      <NeedsYou heading={upNext ? "Also needs you" : "Needs you"} skip={upNext?.m.id} state={state} studentId={studentId} onElectives={toElectives}
                        onOpen={(lessonId, mid) => reveal(mid, (el) => open(lessonId, mid, el), heroRef.current)} />
                    </div>
                    {studioNudge && (
                      <button
                        onClick={() => reveal(studioNudge.id, (el) => open(current.id, studioNudge.id, el))}
                        className="pop press mt-4 flex max-w-md items-center gap-3 rounded-xl border border-[#ae502f]/25 bg-[#fbf3ee] px-3.5 py-2.5 text-left hover:border-[#ae502f]/50"
                      >
                        <span className="flex -space-x-1.5">{studioNudge.peers.slice(0, 3).map((n) => <span key={n} className="rounded-full ring-2 ring-[#fbf3ee]"><Avatar name={n} size={22} /></span>)}</span>
                        <span className="min-w-0 flex-1 text-[13px]">{studioNudge.text}</span>
                        <Icon name="arrow" size={14} className="text-[#ae502f]" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-10 border-t border-line" />
              </section>
              {/* Today's lesson, its cards in a row. */}
              <div className="pb-16 pt-2">
                {lessonRow(current)}
                <div className="mx-auto max-w-6xl px-4">
                  <button onClick={() => goHome("all")} className="btn btn-quiet press h-8 px-2 text-[12.5px]">All cards, every week <Icon name="arrow" size={12} /></button>
                </div>
              </div>
            </>
          )}

          {home === "all" && (
          <>

          {/* —— Week navigator —— */}
          {weeksShown.length > 1 && (
            <WeekNav
              className="top-0 mt-8"
              weeks={weeksShown.map((w) => {
                // Counted the way each lesson counts its cards (a path's versions once), so the totals agree.
                return { id: w.id, label: w.title.split(" · ")[0], done: w.lessons.reduce((n, l) => n + doneCount(l), 0), total: w.lessons.reduce((n, l) => n + countable(l).length, 0), current: w.lessons.some((l) => l.id === current.id) };
              })}
              onPick={(id) => {
                setOpenWeeks((o) => new Set(o).add(id));
                scrollToWeek(id);
              }}
            />
          )}

          <div className="mt-6 space-y-4 pb-16 sm:space-y-8">
            {weeksShown.map((week) => {
              const ms = week.lessons.flatMap((l) => l.modules);
              // A week with an elective still to choose isn't folded away as finished.
              const finished = ms.length > 0 && ms.every((m) => statusOf(m.id) === "done") && !week.lessons.some((l) => l.elective && !l.chosen);
              const isNow = week.lessons.some((l) => l.id === current.id);
              const folded = finished && !isNow && !openWeeks.has(week.id);
              return (
                <section key={week.id} id={`week-${week.id}`} aria-label={week.title} className="scroll-mt-20">
                  <div className="mx-auto flex max-w-6xl items-center gap-3 px-4">
                    {/* The week tabs above already say "Week 1": the heading is the week's own name, when it has one. */}
                    <h2 className={`text-[13px] font-medium ${isNow ? "text-ink" : "text-ink-2"}`}>{week.title.split(" · ").slice(1).join(" · ") || week.title}</h2>
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
                        <span className="relative block h-[119px] w-[85px] flex-none">
                          {[2, 1, 0].map((i) => (
                            <span key={i} className="absolute inset-0 transition-transform duration-500 ease-[var(--ease-spring)]"
                              style={{ transform: `translate(${i * 4}px, ${i * -3}px) rotate(${(i - 1) * 4}deg)`, zIndex: 3 - i }}>
                              <span className="block h-[252px] w-[180px] origin-top-left scale-[0.4722]">
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
                    // One row per lesson: a week's lessons stack, each scrolling sideways on its own when it has many cards.
                    <div className="mt-1 space-y-1 sm:space-y-2">
                        {week.lessons.map(lessonRow)}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          </>
          )}
        </>
      )}

      {burst && <Burst key={burst.key} seed={burst.key} x={burst.x} y={burst.y} colors={burst.colors} onDone={() => setBurst(null)} />}

      {!isPreview && <BackCloses name="card" restore={restoring} value={lift?.open ? lift.id : null} onBack={() => close()} />}
      {lift && openModule && (
        <Lift
          from={lift.from}
          open={lift.open}
          source={lift.el}
          label={openModule.title}
          onBackdrop={() => close()}
          landing={() => {
            if (lift.completed && handMode && pileRef.current) return pileRef.current.getBoundingClientRect();
            // Not finished (Later, ✕, Esc): rewind into where it came from, the card or the button that opened it.
            if (!lift.completed) return lift.el?.isConnected ? lift.el.getBoundingClientRect() : lift.from;
            return els.current.get(lift.id)?.getBoundingClientRect() ?? null;
          }}
          onGone={() => {
            if (lift.completed) {
              if (handMode) setBump((b) => b + 1);
              const target = handMode ? pileRef.current : els.current.get(lift.id);
              const r = target?.getBoundingClientRect();
              if (r) setBurst({ x: r.left + r.width / 2, y: r.top + r.height / 2, colors: [suitOfCard(openModule).tint, "#247b46", "#f2c94c", "#1b1b1a"], key: Date.now() });
            }
            setLift(null);
            // Cards this one dealt fly into place now that it's closed (after the board redraws with them).
            const queued = toDeal.current.splice(0);
            if (queued.length) setTimeout(() => deal(queued), 250);
          }}
        >
          <CardDetail
            key={openModule.id}
            group={openGroup}
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
            plan={state.plans?.[studentId]}
          />
        </Lift>
      )}
    </main>
    </MarksContext.Provider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <p className="flex flex-1 items-center justify-center p-10 text-ink-2">{children}</p>;
}

/** A one-time, dismissible tip about the less obvious ways to move around. */
