"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { exportGrades, gradeRows, type GradeRow } from "@/lib/gradebook";
import { isFinished, isLate } from "@/lib/grading";
import { visibleModules } from "@/lib/profile";
import { treeView } from "@/lib/branching";
import { groupingsOf } from "@/lib/shared";
import type { ConnectorInfo } from "@/lib/connectors/types";
import type { CourseState, Lesson } from "@/lib/types";
import { Avatar, Icon } from "../Icon";
import { SkillRadar } from "../SkillRadar";
import { FeedbackInbox, Journal } from "../student/Progress";
import { Classroom } from "./Classroom";
import { Settings } from "./Settings";

type Sel = { sid: string; mid: string } | null;

/**
 * The Students tab: the class list on the left, and on the right whoever is picked there. "Whole class" is the lesson
 * view (where everyone is, who needs you, its discussions); a student is their whole course (work waiting for you,
 * scores, your feedback, week by week); "Class list and groups" is the list itself, demo students and groups. Work opens
 * in a panel at the right from anywhere.
 */
export function StudentsPage({ courseId, state, connectors, lesson, setLesson, who, setWho, sel, setSel, readOnly, onMessage, onInvite, onChanged }: {
  courseId: string; state: CourseState; connectors: ConnectorInfo[];
  lesson: Lesson; setLesson: (id: string) => void;
  /** "class", "manage", or a student's id. */
  who: string; setWho: (w: string) => void;
  sel: Sel; setSel: (s: Sel) => void;
  readOnly: boolean;
  onMessage?: (studentId: string) => void;
  onInvite: () => void;
  onChanged: () => void;
}) {
  const { course } = state;
  const [now] = useState(() => Date.now());
  const [find, setFind] = useState("");
  const rows = useMemo(() => gradeRows(state, now), [state, now]);
  const unread = (sid: string) => (state.nudges ?? []).filter((n) => n.studentId === sid && n.from === "student" && !n.read).length;
  const started = (sid: string) => Object.values(state.progress[sid] ?? {}).some((p) => p.status !== "todo");
  const shown = rows.filter((r) => !find.trim() || r.st.name.toLowerCase().includes(find.trim().toLowerCase()));
  const picked = rows.find((r) => r.st.id === who);
  const view = picked ? "student" : who === "manage" || !course.students.length ? "manage" : "class";
  const openWork = (sid: string, lessonId: string, mid: string) => { setLesson(lessonId); setSel({ sid, mid }); };
  // On a phone the list sits above: picking someone brings their page into view.
  const detail = useRef<HTMLDivElement>(null);
  const pick = (w: string) => {
    setWho(w);
    setSel(null);
    if (typeof window !== "undefined" && window.innerWidth < 1024) requestAnimationFrame(() => detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const classroom = (drawerOnly: boolean) => (
    <Classroom courseId={courseId} state={state} lesson={lesson} connectors={connectors} sel={sel} setSel={setSel} onMessage={onMessage} readOnly={readOnly}
      drawerOnly={drawerOnly} extraExports={[["Grades, whole course (CSV)", () => exportGrades(state, rows)]]} />
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      {/* The class list: whole class, then everyone, each with what needs you. */}
      <nav aria-label="Students" className="card p-2 lg:sticky lg:top-20">
        {course.students.length > 6 && (
          <div className="relative mb-1.5">
            <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a student" aria-label="Find a student" className="field h-8 py-0 pl-8 text-[13px]" />
          </div>
        )}
        <div className="max-h-[17rem] overflow-y-auto lg:max-h-[calc(100dvh-14rem)]">
          {course.students.length > 0 && (
            <Row on={view === "class"} onClick={() => pick("class")}>
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink text-white"><Icon name="users" size={12} /></span>
              <span className="min-w-0 flex-1 truncate font-medium">Whole class</span>
              <span className="mono">{course.students.length}</span>
            </Row>
          )}
          {shown.map((r) => {
            const msgs = unread(r.st.id);
            return (
              <Row key={r.st.id} on={who === r.st.id} onClick={() => pick(r.st.id)}>
                {/* A demo student's photo has a dashed yellow ring (the list stays narrow; their page says Demo). */}
                <span className={`flex-none rounded-full ${r.st.demo ? "outline outline-[1.5px] outline-offset-1 outline-dashed outline-[#d9a92a]" : ""}`} title={r.st.demo ? "Demo student" : undefined}><Avatar name={r.st.name} size={24} /></span>
                <span className="min-w-0 flex-1 truncate">{r.st.name}{r.st.demo && <span className="sr-only"> (demo student)</span>}</span>
                {/* What needs you about them, most pressing first. */}
                {msgs > 0 && <span title={`${msgs} new message${msgs === 1 ? "" : "s"}`} className="flex h-[18px] flex-none items-center gap-0.5 rounded-full bg-[#eef0fb] px-1.5 text-[10.5px] text-[#4b56a8]"><Icon name="message" size={10} />{msgs}</span>}
                {r.waiting > 0 && <span title={`${r.waiting} waiting for your feedback`} className="flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-full bg-[#287670]/12 px-1.5 font-mono text-[10.5px] text-[#287670]">{r.waiting}</span>}
                {r.late > 0 && <span title={`${r.late} overdue`} className="h-[18px] flex-none rounded-full bg-bad/10 px-1.5 text-[10.5px] leading-[18px] text-bad">late</span>}
                {!started(r.st.id) && <span title="Hasn’t started" className="h-[18px] flex-none rounded-full bg-lane px-1.5 text-[10.5px] leading-[18px] text-ink-3">new</span>}
              </Row>
            );
          })}
          {find && !shown.length && <p className="px-2.5 py-2 text-[12.5px] text-ink-3">No one called that.</p>}
        </div>
        <div className="mt-1.5 border-t border-line pt-1.5">
          <Row on={view === "manage"} onClick={() => pick("manage")}>
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-lane text-ink-2"><Icon name="settings" size={12} /></span>
            <span className="min-w-0 flex-1 truncate" title="The class list, demo students and groups">Class list and groups</span>
          </Row>
          {!readOnly && (
            <button onClick={onInvite} className="press flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-2 hover:bg-lane hover:text-ink">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-dashed border-line-strong"><Icon name="plus" size={11} /></span>Invite students
            </button>
          )}
        </div>
      </nav>

      <div ref={detail} key={view === "student" ? picked!.st.id : view} className="rise min-w-0 scroll-mt-20">
        {view === "class" && (
          <div className="space-y-4">
            <LessonPicker state={state} lesson={lesson} onPick={(id) => { setLesson(id); setSel(null); }} />
            {classroom(false)}
          </div>
        )}
        {view === "student" && (
          <>
            <StudentCourse state={state} row={picked!} courseId={courseId} onOpen={openWork} onMessage={onMessage} now={now} />
            {classroom(true)}
          </>
        )}
        {view === "manage" && (
          <Settings part="students" course={course} readOnly={readOnly} onInvite={onInvite} onChanged={onChanged} nudges={state.nudges} onMessage={onMessage} />
        )}
      </div>
    </div>
  );
}

function Row({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-current={on || undefined}
      className={`press flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${on ? "bg-[#eef0fb] text-ink shadow-[inset_0_0_0_1px_rgba(75,86,168,0.25)]" : "text-ink hover:bg-lane"}`}>
      {children}
    </button>
  );
}

function LessonPicker({ state, lesson, onPick }: { state: CourseState; lesson: Lesson; onPick: (id: string) => void }) {
  const { course } = state;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-ink-3">Lesson</span>
      <div className="relative">
        <select value={lesson.id} onChange={(e) => onPick(e.target.value)} aria-label="Choose a lesson" className="field h-8 appearance-none py-0 pr-8">
          {course.weeks.map((w) => (
            <optgroup key={w.id} label={w.title}>
              {w.lessons.map((l) => <option key={l.id} value={l.id}>{l.title}{l.id === course.currentLessonId ? " (today)" : ""}</option>)}
            </optgroup>
          ))}
        </select>
        <Icon name="chevron" size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      </div>
    </div>
  );
}

/** One student over the whole course: what's waiting for you, week by week, scores and your feedback. */
function StudentCourse({ state, row: r, courseId, onOpen, onMessage, now }: {
  state: CourseState; row: GradeRow; courseId: string; now: number;
  onOpen: (sid: string, lessonId: string, mid: string) => void;
  onMessage?: (studentId: string) => void;
}) {
  const { course } = state;
  const skills = course.skills ?? [];
  const levels = course.levels ?? [];
  const sid = r.st.id;
  const mine = state.progress[sid] ?? {};
  const tree = treeView(course.weeks, mine);
  const groups = groupingsOf(course).flatMap((gs) => gs.groups.filter((g) => g.studentIds.includes(sid)).map((g) => g.name));
  const cell = (n?: number) => (n ? levels.find((l) => l.n === n)?.name ?? String(n) : "");
  const sec = "mb-2 text-[11.5px] font-medium uppercase tracking-[0.07em] text-ink-3";

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={r.st.name} size={40} />
        <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold">{r.st.name}{r.st.demo && <span className="chip h-5 bg-[#fff2c7] text-[10.5px] font-medium text-[#7a5a00]">Demo</span>}</h2>
          <p className="text-[12.5px] text-ink-3">
            {r.done} of {r.total} cards done{r.quizPct !== undefined ? ` · quizzes ${Math.round(r.quizPct * 100)}%` : ""}{r.late ? ` · ${r.late} overdue` : ""}
            {groups.length ? ` · in ${groups.join(", ")}` : ""}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Link href={`/learn/${courseId}/${sid}?preview=1`} className="btn btn-ghost press h-8"><Icon name="eye" size={13} /> {r.st.demo ? "Try as them" : "Their view"}</Link>
          {onMessage && <button onClick={() => onMessage(sid)} className="btn btn-ghost press h-8"><Icon name="message" size={13} /> Message</button>}
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-6">
          <section>
            <h3 className={sec}>Waiting for your feedback{r.toReview.length ? ` · ${r.toReview.length}` : ""}</h3>
            {r.toReview.length ? (
              <ul className="space-y-1.5">
                {r.toReview.map(({ m, week, lessonId }) => {
                  const out = mine[m.id]?.output?.replace(/[#*_>|-]+/g, " ").replace(/\s+/g, " ").trim();
                  return (
                    <li key={m.id}>
                      <button onClick={() => onOpen(sid, lessonId, m.id)} className="press flex w-full items-start gap-3 rounded-xl border border-line bg-white px-3.5 py-2.5 text-left hover:border-line-strong">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-medium">{m.title} <span className="font-normal text-ink-3">· {week.split(" · ")[0]}</span></span>
                          {out && <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">{out}</span>}
                        </span>
                        <span className="mt-0.5 flex-none text-[12.5px] text-[#287670]">Review →</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-[13px] text-ink-3">Nothing waiting.</p>}
          </section>

          <section>
            <h3 className={sec}>Your feedback</h3>
            {r.reviews.length === 0 ? <p className="text-[13px] text-ink-3">No reviewed work yet.</p> : (
              <ul className="space-y-2.5">
                {r.reviews.map(({ m, week, r: rv }) => (
                  <li key={m.id} className="flex gap-3 text-[13px]">
                    <span className={`mt-0.5 flex-none ${rv.verdict === "revise" ? "text-warn" : "text-ok"}`}><Icon name={rv.verdict === "revise" ? "reset" : "check"} size={14} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{m.title}</span> <span className="text-ink-3">· {week.split(" · ")[0]} · {new Date(rv.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      {rv.text && <span className="block text-ink-2">{rv.text}</span>}
                      {rv.levels && <span className="mt-1 flex flex-wrap gap-1">{Object.entries(rv.levels).map(([k, v]) => <span key={k} className="chip h-5 bg-lane text-[11px]">{skills.find((s) => s.id === k)?.name} · {cell(v)}</span>)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="group">
            <summary className="cursor-pointer text-[13px] font-medium text-ink-2 hover:text-ink">Reflections</summary>
            <div className="mt-3"><Journal state={state} studentId={sid} /></div>
          </details>
          <details className="group">
            <summary className="cursor-pointer text-[13px] font-medium text-ink-2 hover:text-ink">Feedback received, and what they tried</summary>
            <div className="mt-3"><FeedbackInbox state={state} studentId={sid} readOnly /></div>
          </details>
        </div>

        <div className="space-y-6">
          <section>
            <h3 className={sec}>Week by week</h3>
            <div className="space-y-3">
              {course.weeks.map((w) => {
                const lessons = w.lessons.filter((l) => !l.elective || state.choices[sid]?.[`elective:${l.id}`]);
                if (!lessons.length) return null;
                return (
                  <div key={w.id}>
                    <div className="mb-1 text-[12px] text-ink-3">{w.title.split(" · ")[0]}</div>
                    <div className="flex flex-wrap gap-[3px]">
                      {lessons.flatMap((l, li) => [
                        ...(li ? [<span key={`gap-${l.id}`} className="w-1.5" />] : []),
                        ...visibleModules(l, sid, state.choices[sid], tree, course).map((m) => {
                          const p = mine[m.id];
                          const late = isLate(m, p, now);
                          const done = isFinished(m, p);
                          const doing = p && p.status !== "todo" && !done;
                          const waiting = r.toReview.some((x) => x.m.id === m.id);
                          return (
                            <button key={m.id} onClick={() => onOpen(sid, l.id, m.id)} title={`${l.title} · ${m.title}: ${waiting ? "waiting for your feedback" : late ? "overdue" : done ? "done" : doing ? "started" : "not started"}`}
                              aria-label={`${m.title}, ${waiting ? "waiting for your feedback" : late ? "overdue" : done ? "done" : doing ? "started" : "not started"}`}
                              className={`press h-5 w-5 rounded-[5px] transition-transform hover:scale-110 ${waiting ? "bg-[#287670]/70" : late ? "bg-bad/60" : done ? "bg-ok/30" : doing ? "bg-warn/35" : "bg-lane"}`} />
                          );
                        }),
                      ])}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-ok/30" />done</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-warn/35" />started</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#287670]/70" />for you</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-bad/60" />overdue</span>
            </p>
          </section>

          {r.scored.length > 0 && (
            <section>
              <h3 className={sec}>Scores</h3>
              <ul className="space-y-1">
                {r.scored.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{x.title}</span>
                    {x.tries && x.tries > 1 && <span className="text-[11.5px] text-ink-3">best of {x.tries}</span>}
                    <span className={`font-mono text-[12px] ${x.right / x.total < 0.6 ? "text-bad" : "text-ink-2"}`}>{x.right}/{x.total}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {skills.length > 0 && (
            <section>
              <h3 className={sec}>Skills · you and them</h3>
              <SkillRadar skills={skills} size={240} series={[
                { label: "Self", values: r.self, style: "fill", color: "#1b1b1a" },
                { label: "You", values: r.teacher, style: "dash", color: "#ae502f" },
              ]} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
