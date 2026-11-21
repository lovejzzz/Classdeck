"use client";

import { AccountMenu } from "@/components/AccountMenu";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { MarksContext } from "@/components/Marks";
import { SignInNeeded } from "@/components/SignInNeeded";
import { TeacherLive } from "@/components/LiveClass";
import { Gradebook } from "@/components/teacher/Gradebook";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { NotificationCenter, type Note } from "@/components/NotificationCenter";
import { Shortcuts } from "@/components/ShortcutHelp";
import { Classroom } from "@/components/teacher/Classroom";
import { Deck } from "@/components/teacher/Deck";
import { Settings } from "@/components/teacher/Settings";
import { InviteStudents } from "@/components/teacher/ShareDialog";
import { LogoMark } from "@/components/Logo";
import { op, useConnectors, useCourse } from "@/lib/client";
import { toast } from "@/lib/toast";
import { useUrlState } from "@/lib/urlState";
import type { ClassEvent } from "@/lib/types";
import { StudentViewButton } from "@/components/teacher/StudentViewButton";

// Map (the course as a card tree) is the default; List is the same cards in rows of weeks.
const TABS = [["map", "Map"], ["plan", "List"], ["students", "Students"], ["grades", "Grades"], ["settings", "Settings"]] as const;
type Tab = (typeof TABS)[number][0];

const KIND: Record<ClassEvent["kind"], { icon: string; tint: string }> = {
  done: { icon: "check", tint: "var(--color-ok)" },
  post: { icon: "wall", tint: "#995293" },
  wrong: { icon: "x", tint: "var(--color-bad)" },
  quiz: { icon: "quiz", tint: "#6a5ac0" },
  tool: { icon: "tool", tint: "var(--color-ink-2)" },
  studio: { icon: "studio", tint: "#ae502f" },
  feedback: { icon: "message", tint: "#367195" },
};

function readSeen(key: string) {
  try {
    return Number(localStorage.getItem(key) ?? 0);
  } catch {
    return 0;
  }
}

export default function TeachPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { state, error, refresh, needAuth, authDetail } = useCourse(courseId, undefined, 3000);
  const { connectors } = useConnectors();
  // The tab lives in the address, so Back returns to the previous tab and a reload stays put.
  const [tabParam, setTabParam] = useUrlState("tab");
  // "class" was its own tab before it joined Students.
  const tab: Tab = tabParam === "class" ? "students" : TABS.some(([id]) => id === tabParam) ? (tabParam as Tab) : "map";
  // Every tab change is its own Back step, including going back to the map.
  const setTab = (t: Tab) => setTabParam(t === "map" ? null : t, { push: true, drop: ["run", "qr", ...(t === "map" || t === "plan" ? [] : ["card"])] });
  const [picked, setPicked] = useState<string | null>(null);
  const [sel, setSel] = useState<{ sid: string; mid: string } | null>(null);
  const seenKey = `seen-at:teacher:${courseId}`;
  const [seenAt, setSeenAt] = useState(() => (typeof window === "undefined" ? 0 : readSeen(seenKey)));
  const [inviting, setInviting] = useState(false);

  if (needAuth && !state) return <SignInNeeded who="teacher" courseId={courseId} next={`/teach/${courseId}`} detail={authDetail} />;
  if (error && !state) return <p className="p-10 text-center text-ink-2">{error}</p>;
  if (!state) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="skeleton h-8 w-72" />
        <div className="mt-8 flex gap-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[238px] w-[170px]" />)}</div>
      </div>
    );
  }
  const { course } = state;
  const viewer = state.me?.role === "viewer";
  const lessons = course.weeks.flatMap((w) => w.lessons);
  const lesson = lessons.find((l) => l.id === (picked ?? course.currentLessonId)) ?? lessons[0];
  const studentName = (id: string) => course.students.find((s) => s.id === id)?.name ?? "Student";
  const moduleOf = (mid: string) => {
    for (const l of lessons) {
      const m = l.modules.find((x) => x.id === mid);
      if (m) return { l, m };
    }
  };

  // A student working through quick cards makes a finished note (and a wrong-answer note) per card. Answers and
  // finished cards close together are one note per student: "Answered 4 cards · 1 wrong", the misses spelled out.
  // Quizzes, posts, raised hands and the rest stay notes of their own.
  const RUN = 15 * 60_000;
  const fresh = state.events.filter((e) => e.at > seenAt).sort((a, b) => a.at - b.at);
  const runs: ClassEvent[][] = [];
  const openRun = new Map<string, ClassEvent[]>();
  for (const e of fresh) {
    if (e.kind !== "done" && e.kind !== "wrong") { runs.push([e]); continue; }
    const r = openRun.get(e.studentId);
    if (r && e.at - r[r.length - 1].at <= RUN) r.push(e);
    else { const n = [e]; runs.push(n); openRun.set(e.studentId, n); }
  }
  const notes: Note[] = runs.map((r) => {
    const e = r[r.length - 1];
    const cards = [...new Set(r.map((x) => x.moduleId))];
    const wrong = r.filter((x) => x.kind === "wrong");
    const one = cards.length === 1;
    // The note opens the first card answered wrong (or the last one done).
    const lead = wrong[0] ?? e;
    const lessonsHit = [...new Set(cards.map((id) => moduleOf(id)?.l.title).filter(Boolean))];
    return {
      id: lead.id,
      at: e.at,
      group: e.studentId,
      groupLabel: studentName(e.studentId),
      source: one ? moduleOf(e.moduleId)?.m.title ?? "" : lessonsHit.length === 1 ? lessonsHit[0]! : `${lessonsHit.length} lessons`,
      icon: KIND[wrong.length ? "wrong" : e.kind].icon,
      tint: KIND[wrong.length ? "wrong" : e.kind].tint,
      title: studentName(e.studentId),
      text: r.length === 1 ? e.text
        : one ? wrong.map((x) => x.text).concat(r.some((x) => x.kind === "done") ? ["Finished"] : []).join(" · ")
        : `Worked through ${cards.length} cards${wrong.length ? ` · ${wrong.length} wrong: ${wrong.map((x) => `${moduleOf(x.moduleId)?.m.title ?? "a card"} (${x.text.replace(/^Q\d+: /, "")})`).join("; ")}` : ""}`,
    };
  }).reverse();

  return (
    <MarksContext.Provider value={{ courseId, me: "teacher", marks: state.marks ?? [], names: Object.fromEntries(state.course.students.map((s) => [s.id, s.name])), refresh }}>
    <div className="flex-1 overflow-x-clip">
      {courseId !== "demo" && <ConnectionBanner needAuth={needAuth} error={error} signInHref={`/login?next=/teach/${courseId}`} />}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-ink">
            <LogoMark size={15} />Questhand
          </Link>
          <span className="text-line-strong">/</span>
          <h1 className="truncate text-[14px] font-medium">{course.title}</h1>
          <span className="flex-1" />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(course.joinCode).catch(() => {});
              toast("Class code copied");
            }}
            className="btn btn-ghost press hidden h-7 px-2.5 text-[12px] sm:inline-flex"
            title="Copy class code"
          >
            <span className="text-ink-3">Class code</span><span className="font-mono tracking-[0.15em]">{course.joinCode}</span>
          </button>
          {!viewer && <StudentViewButton courseId={courseId} students={course.students} />}
          <Shortcuts
            list={[
              { keys: "1", label: "Map", run: () => setTab("map") },
              { keys: "2", label: "List", run: () => setTab("plan") },
              { keys: "3", label: "Students", run: () => setTab("students") },
              { keys: "4", label: "Grades", run: () => setTab("grades") },
              ...(viewer ? [] : [{ keys: "5", label: "Settings", run: () => setTab("settings") }]),
            ]}
            extra={tab === "plan" || tab === "map" ? [{ keys: "n", label: "New card in today’s lesson" }, { keys: "r", label: "Run today’s class session" }, { keys: "[ ]", label: "Previous / next week" }, { keys: "mod+d", label: "Duplicate the card you’re editing" }] : []}
          />
          <NotificationCenter
            title="Class activity"
            notes={notes}
            emptyText="You’re all caught up"
            modes={[
              { id: "stack", label: "Stack" },
              { id: "student", label: "By student", groupBy: (n) => ({ key: n.group, label: n.groupLabel, avatar: true }) },
            ]}
            onClear={() => {
              const now = Date.now();
              try {
                localStorage.setItem(seenKey, String(now));
              } catch {}
              setSeenAt(now);
            }}
            onPick={(n) => {
              const ev = state.events.find((e) => e.id === n.id);
              const found = ev && moduleOf(ev.moduleId);
              if (!ev || !found) return;
              setPicked(found.l.id);
              setTab("students");
              setSel({ sid: ev.studentId, mid: ev.moduleId });
            }}
          />
          <AccountMenu />
          {courseId === "demo" && <button
            onClick={async () => {
              if (!confirm("Restore the sample data? All edits and student work will be cleared.")) return;
              await op(courseId, { op: "reset" });
              setPicked(null);
              setSel(null);
              refresh();
              toast("Sample data restored", { icon: "reset", tone: "plain" });
            }}
            className="btn btn-quiet press h-8 w-8 justify-center px-0"
            aria-label="Restore sample data"
            title="Restore sample data"
          >
            <Icon name="reset" size={15} />
          </button>}
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex max-w-full overflow-x-auto rounded-lg bg-lane p-0.5 [--tab:4.25rem] [scrollbar-width:none] sm:[--tab:5rem]" role="tablist">
            <span
              className="absolute inset-y-0.5 left-0.5 w-[var(--tab)] rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-[var(--ease-out)]"
              style={{ transform: `translateX(calc(${TABS.findIndex((t) => t[0] === tab)} * var(--tab)))` }}
            />
            {TABS.filter(([id]) => !(viewer && id === "settings")).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`relative h-7 w-[var(--tab)] flex-none rounded-md text-[13px] transition-colors duration-300 ${tab === id ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {label}
                {id === "students" && !!course.waiting?.length && (
                  <span title={`${course.waiting.length} waiting to join`} aria-label={`${course.waiting.length} waiting to join`} className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-[#ae502f]" />
                )}
              </button>
            ))}
          </div>

          {tab === "students" && lesson && course.students.length > 0 && (
            <div className="relative">
              <select
                value={lesson.id}
                onChange={(e) => {
                  setPicked(e.target.value);
                  setSel(null);
                }}
                aria-label="Choose a lesson"
                className="field h-8 appearance-none py-0 pr-8"
              >
                {course.weeks.map((w) => (
                  <optgroup key={w.id} label={w.title}>
                    {w.lessons.map((l) => <option key={l.id} value={l.id}>{l.title}{l.id === course.currentLessonId ? " (today)" : ""}</option>)}
                  </optgroup>
                ))}
              </select>
              <Icon name="chevron" size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            </div>
          )}
          <span className="flex-1" />
          {/* The Deck puts its undo, redo and save status here, in the row with the tabs. */}
          <div id="deck-status" className="flex items-center" />
          {tab === "students" && !viewer && (
            <button onClick={() => setInviting(true)} className="btn btn-dark press h-8"><Icon name="plus" size={13} /> Invite students</button>
          )}
        </div>

        <main key={tab === "plan" ? "map" : tab} className="rise mt-6">
          {viewer && (
            <p className="mb-5 rounded-xl bg-lane px-4 py-2.5 text-[13px] text-ink-2">You can view this course. Only its owner and editors can change it.</p>
          )}
          {course.students.length === 0 && courseId !== "demo" && tab !== "settings" && (
            <section aria-label="Getting started" className="card mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
              <div className="min-w-[14rem] flex-1">
                <h2 className="text-[15px] font-medium">{course.waiting?.length ? `${course.waiting.length} student${course.waiting.length === 1 ? " is" : "s are"} waiting to be let in` : "No students yet"}</h2>
                <p className="mt-1 text-[13px] text-ink-2">{course.waiting?.length ? `${course.waiting.map((w) => w.name).slice(0, 3).join(", ")}${course.waiting.length > 3 ? " and others" : ""} joined with the class code. Let them in or turn them away.` : "Invite students by email, or share the class link or QR code."}</p>
              </div>
              {!viewer && (
                <button onClick={() => setInviting(true)} className="btn btn-dark press h-9">
                  {course.waiting?.length ? <>Review <Icon name="arrow" size={13} /></> : <><Icon name="plus" size={13} /> Invite students</>}
                </button>
              )}
            </section>
          )}
          {/* Someone waiting to join shows on every tab but Settings, not only Students, so nobody is left on the waiting page. */}
          {course.students.length > 0 && !!course.waiting?.length && tab !== "settings" && !viewer && (
            <button onClick={() => setInviting(true)} className="press mb-5 flex w-full items-center gap-2 rounded-xl bg-[#fbf3ee] px-4 py-2.5 text-left text-[13px]">
              <span className="h-2 w-2 rounded-full bg-[#ae502f]" />
              <span className="flex-1"><span className="font-medium">{course.waiting.length === 1 ? `${course.waiting[0].name} is waiting to join.` : `${course.waiting.length} waiting to join: ${course.waiting.map((w) => w.name).slice(0, 3).join(", ")}${course.waiting.length > 3 ? " and others" : ""}.`}</span> Let them in or turn them away.</span>
              <Icon name="arrow" size={13} />
            </button>
          )}
          {(tab === "plan" || tab === "map") && <Deck course={course} readOnly={viewer} onRefresh={refresh} progress={state.progress} studioPosts={state.studio.posts} choices={state.choices} live={<TeacherLive courseId={courseId} state={state} onChanged={refresh} />} view={tab === "map" ? "map" : "list"} onView={(v) => setTab(v === "map" ? "map" : "plan")} />}
          {tab === "students" && lesson && (course.students.length > 0 || courseId === "demo") && <Classroom courseId={courseId} state={state} lesson={lesson} connectors={connectors} sel={sel} setSel={setSel} />}
          {tab === "students" && <div className={course.students.length ? "mt-8" : ""}><Settings part="students" course={course} readOnly={viewer} onInvite={() => setInviting(true)} onChanged={refresh} /></div>}
          {tab === "grades" && (course.students.length > 0 || courseId === "demo") && <Gradebook state={state} />}
          {tab === "settings" && !viewer && <Settings course={course} me={state.me} onChanged={refresh} />}
        </main>
      </div>
    </div>
      {inviting && <InviteStudents course={course} me={state.me} onClose={() => setInviting(false)} onChanged={refresh} />}
    </MarksContext.Provider>
  );
}
