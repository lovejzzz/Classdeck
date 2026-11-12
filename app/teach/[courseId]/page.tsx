"use client";

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
import { op, useConnectors, useCourse } from "@/lib/client";
import { PRESET_LABELS } from "@/lib/profile";
import { toast } from "@/lib/toast";
import type { ClassEvent } from "@/lib/types";

const TABS = [["plan", "Deck"], ["class", "Class"], ["grades", "Grades"], ["settings", "Settings"]] as const;
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
  const { state, error, refresh, needAuth } = useCourse(courseId, undefined, 3000);
  const { connectors } = useConnectors();
  const [tab, setTab] = useState<Tab>("plan");
  const [picked, setPicked] = useState<string | null>(null);
  const [sel, setSel] = useState<{ sid: string; mid: string } | null>(null);
  const seenKey = `seen-at:teacher:${courseId}`;
  const [seenAt, setSeenAt] = useState(() => (typeof window === "undefined" ? 0 : readSeen(seenKey)));

  if (needAuth && !state) return <SignInNeeded who="teacher" courseId={courseId} next={`/teach/${courseId}`} />;
  if (error && !state) return <p className="p-10 text-center text-ink-2">{error}</p>;
  if (!state) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="skeleton h-8 w-72" />
        <div className="mt-8 flex gap-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[235px] w-[168px]" />)}</div>
      </div>
    );
  }
  const { course } = state;
  const lessons = course.weeks.flatMap((w) => w.lessons);
  const lesson = lessons.find((l) => l.id === (picked ?? course.currentLessonId)) ?? lessons[0];
  const studentName = (id: string) => course.students.find((s) => s.id === id)?.name ?? "Student";
  const moduleOf = (mid: string) => {
    for (const l of lessons) {
      const m = l.modules.find((x) => x.id === mid);
      if (m) return { l, m };
    }
  };

  const notes: Note[] = state.events
    .filter((e) => e.at > seenAt)
    .map((e) => ({
      id: e.id,
      at: e.at,
      group: e.studentId,
      groupLabel: studentName(e.studentId),
      source: moduleOf(e.moduleId)?.m.title ?? "",
      icon: KIND[e.kind].icon,
      tint: KIND[e.kind].tint,
      title: studentName(e.studentId),
      text: e.text,
    }));

  return (
    <MarksContext.Provider value={{ courseId, me: "teacher", marks: state.marks ?? [], names: Object.fromEntries(state.course.students.map((s) => [s.id, s.name])), refresh }}>
    <div className="flex-1 overflow-x-clip">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-ink">
            <span className="inline-block h-4 w-4 rounded-[5px] bg-ink" />Classdeck
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
          <span className="chip hidden sm:inline-flex">{course.profile.preset === "custom" ? "Custom" : PRESET_LABELS[course.profile.preset]}</span>
          <Shortcuts
            list={[
              { keys: "1", label: "Deck", run: () => setTab("plan") },
              { keys: "2", label: "Class", run: () => setTab("class") },
              { keys: "3", label: "Grades", run: () => setTab("grades") },
              { keys: "4", label: "Settings", run: () => setTab("settings") },
            ]}
            extra={tab === "plan" ? [{ keys: "n", label: "New card in today’s lesson" }, { keys: "r", label: "Run today’s Collab Studio" }, { keys: "[", label: "Previous / next week ( [ ] )" }, { keys: "mod+d", label: "Duplicate the card you’re editing" }] : []}
          />
          <TeacherLive courseId={courseId} state={state} onChanged={refresh} />
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
              setTab("class");
              setSel({ sid: ev.studentId, mid: ev.moduleId });
            }}
          />
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
          <div className="relative flex rounded-lg bg-lane p-0.5" role="tablist">
            <span
              className="absolute inset-y-0.5 left-0.5 w-20 rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-[var(--ease-out)]"
              style={{ transform: `translateX(${TABS.findIndex((t) => t[0] === tab) * 5}rem)` }}
            />
            {TABS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`relative h-7 w-20 rounded-md text-[13px] transition-colors duration-300 ${tab === id ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {label}
                {id === "settings" && !!course.waiting?.length && (
                  <span title={`${course.waiting.length} waiting to join`} aria-label={`${course.waiting.length} waiting to join`} className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-[#ae502f]" />
                )}
              </button>
            ))}
          </div>

          {tab === "class" && lesson && (
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
        </div>

        <main key={tab} className="rise mt-6">
          {tab === "plan" && <Deck course={course} connectors={connectors} onRefresh={refresh} progress={state.progress} studioPosts={state.studio.posts} choices={state.choices} />}
          {tab === "class" && lesson && <Classroom courseId={courseId} state={state} lesson={lesson} connectors={connectors} sel={sel} setSel={setSel} />}
          {tab === "grades" && <Gradebook state={state} />}
          {tab === "settings" && <Settings course={course} connectors={connectors} onChanged={refresh} />}
        </main>
      </div>
    </div>
    </MarksContext.Provider>
  );
}
