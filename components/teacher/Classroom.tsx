"use client";

import { usePanelShift } from "./usePanelShift";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invokeTool, op } from "@/lib/client";
import { answerText, dueAt, fmtSec, isLate, quizSet, wallProgress } from "@/lib/grading";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { visibleModules } from "@/lib/profile";
import { awaitingFeedback, faceMeta, isPoll, kindOf, reviewableCard, sharedDoc, writesOwn } from "@/lib/kinds";
import { docKey, groupFor, groupingOf, repliesNeeded } from "@/lib/shared";
import { SharedDoc } from "../SharedDoc";
import { DocReview } from "./DocReview";
import { STATUS_LABEL, TYPE_META, suitOfCard } from "@/lib/ui";
import type { Attachment, CourseState, Lesson, Level, Module, Review, Skill } from "@/lib/types";
import { download, toCsv } from "@/lib/download";
import { toast } from "@/lib/toast";
import { MarkedMedia } from "../Marks";
import { MathText } from "../MathText";
import { AttachMenu } from "../AttachMenu";
import { MediaView } from "../cards/Media";
import { draftOf } from "../student/SpeechBuilder";
import { Present } from "../Present";
import { WallBoard } from "../WallBoard";
import { RichText } from "../RichText";
import { Avatar, Icon, StatusIcon } from "../Icon";
import { FormAnswers, FormFill, FormTable } from "./ActivityForm";
import { groupScore, leavesOf, parentOf, treeView } from "@/lib/branching";

/** How many names an attention card shows before “and N more”. */
const MANY = 24;

export function Classroom({
  courseId, state, lesson, connectors, sel, setSel, onMessage, readOnly = false, drawerOnly = false, extraExports = [],
}: {
  /** Show only the panel with a student's work on a card (the Students tab's student view opens work there). */
  drawerOnly?: boolean;
  /** More choices for the Export menu (the whole course's grades). */
  extraExports?: [string, () => void][];
  /** A co-teacher who can only view: they see the class's work but don't give feedback, remind or fill in forms. */
  readOnly?: boolean;
  /** Open a conversation with a student (for cards with nothing to give feedback on). */
  onMessage?: (studentId: string) => void;
  courseId: string; state: CourseState; lesson: Lesson; connectors: ConnectorInfo[];
  sel: { sid: string; mid: string } | null; setSel: (s: { sid: string; mid: string } | null) => void;
}) {
  const { course, progress, toolUse } = state;
  const visible = Object.fromEntries(course.students.map((s) => [s.id, new Set(visibleModules(lesson, s.id, state.choices[s.id], treeView(course.weeks, progress[s.id]), course).map((m) => m.id))]));
  const studioIds = new Set(lesson.modules.filter((m) => m.type === "studio").map((m) => m.id));
  // The cards students do: a card group is a frame around its cards, not a card of its own.
  const cards = lesson.modules.filter((m) => m.type !== "group");
  const lessonPosts = state.studio.posts.filter((p) => studioIds.has(p.moduleId));
  // Same rule as the server: peers' posts given feedback (each post counted once), against a goal of 2,
  // or fewer in a small group.
  const feedbackGiven = (sid: string) => new Set(state.studio.feedback.filter((f) => f.fromId === sid && lessonPosts.some((p) => p.id === f.postId && p.studentId !== sid)).map((f) => f.postId)).size;
  /** A student's group on a card, for feedback to the group: its name and members, and whether they wrote one worksheet. */
  const groupOnCard = (m: Module, sid: string) => {
    const shared = kindOf(m) === "worksheet" && m.writers === "group";
    const hasGroups = !!(m.grouping || course.groups?.length || course.groupings?.length);
    const g = hasGroups ? groupFor(course, m, sid) : undefined;
    if (!g || g.id === "all" || g.studentIds.length < 2) return undefined;
    return { name: g.name, members: g.studentIds.map((id) => course.students.find((x) => x.id === id)?.name).filter((x): x is string => !!x), shared };
  };
  // The same group the server uses: the studio card's own groups (its grouping), so a small group's goal is smaller.
  const studioCard = lesson.modules.find((m) => m.type === "studio");
  const feedbackGoal = (sid: string) => Math.min(2, Math.max(0, (groupFor(course, studioCard, sid)?.studentIds.length ?? 1) - 1));
  const helpfulGiven = (sid: string) => state.studio.feedback.filter((f) => f.fromId === sid && f.helpful && lessonPosts.some((p) => p.id === f.postId)).length;
  // A student's group is worth showing only once the course has a discussion run in groups (or several groups).
  const usesGroups = course.weeks.some((w) => w.lessons.some((l) => l.modules.some((m) => m.type === "studio"))) || (course.groups?.length ?? 0) > 1;
  const groupName = (sid: string) => (usesGroups ? course.groups?.find((g) => g.studentIds.includes(sid))?.name ?? "" : "");

  // —— who needs attention in this lesson ——
  const DAY = 86400000;
  // "Now" is fixed when the view opens; the page polls, so it never drifts far.
  const [now] = useState(() => Date.now());
  // Attention cards showing every name, not only the first MANY.
  const [allOf, setAllOf] = useState<Set<string>>(new Set());
  // A student's cards for this lesson; while they haven't picked a path, the versions count once.
  const statusIn = (sid: string) => {
    const mine = visibleModules(lesson, sid, state.choices[sid], treeView(course.weeks, progress[sid]), course);
    const seen = new Set<string>();
    return mine
      .filter((m) => !m.choice || (!seen.has(m.choice.slot) && (seen.add(m.choice.slot), true)))
      .map((m) => progress[sid]?.[m.id]);
  };
  // Students who have cards in this lesson (an elective they didn't choose, or cards dealt only to others, leave some with none).
  const inLesson = course.students.filter((st) => statusIn(st.id).length > 0);
  const notStarted = inLesson.filter((st) => statusIn(st.id).every((p) => !p || p.status === "todo"));
  // The class's numbers leave out the demo students (the teacher's own tests), unless they're all there is.
  const real = inLesson.some((st) => !st.demo) ? inLesson.filter((st) => !st.demo) : inLesson;
  const stalled = course.students.filter((st) => {
    const ps = statusIn(st.id).filter(Boolean);
    const doing = ps.filter((p) => p!.status === "doing");
    const latest = Math.max(0, ...ps.map((p) => p!.updatedAt));
    return doing.length > 0 && now - latest > 2 * DAY;
  });
  const unpicked = (lesson.choiceSlots ?? []).length
    ? course.students.filter((st) => !notStarted.includes(st) && (lesson.choiceSlots ?? []).some((slot) => !state.choices[st.id]?.[slot]))
    : [];
  const studioId = lesson.modules.find((m) => m.type === "studio")?.id;
  // Peer review on a discussion (it asks each student to reply to classmates): the same two lists as Collab Studio's.
  const peerWalls = lesson.modules.filter((m) => m.type === "wall" && (m.wall?.replies ?? 0) > 0);
  const wallPosts = (state.posts ?? []).filter((p) => peerWalls.some((m) => m.id === p.moduleId) && p.studentId !== "teacher");
  const fromClassmate = (p: (typeof wallPosts)[number]) => (p.comments ?? []).some((c) => c.from !== p.studentId && c.from !== "teacher");
  const wallWaiting = (sid: string) => wallPosts.find((p) => p.studentId === sid && !fromClassmate(p))?.moduleId;
  const wallOwing = (sid: string) => peerWalls.find((m) => wallPosts.some((p) => p.moduleId === m.id && p.studentId === sid) && !wallProgress(wallPosts, m.id, sid, repliesNeeded(course, m, sid)).done)?.id;
  const studioWaiting = new Set(lessonPosts.filter((p) => !state.studio.feedback.some((f) => f.postId === p.id)).map((p) => p.studentId));
  const waiting = course.students.filter((st) => studioWaiting.has(st.id) || !!wallWaiting(st.id));
  const owing = course.students.filter((st) => (lessonPosts.some((p) => p.studentId === st.id) && feedbackGiven(st.id) < feedbackGoal(st.id)) || !!wallOwing(st.id));
  const lateCard = (sid: string) => lesson.modules.find((m) => visible[sid].has(m.id) && isLate(m, progress[sid]?.[m.id], now))?.id;
  const overdue = course.students.filter((st) => !!lateCard(st.id));
  // Finished written work the teacher hasn't responded to yet.
  const reviewable = (m: Module) => reviewableCard(m);
  const toReviewCell = (sid: string) => lesson.modules.find((m) => visible[sid].has(m.id) && reviewable(m) && awaitingFeedback(progress[sid]?.[m.id]))?.id;
  // A group's worksheet is one piece of work: it's listed once, under the group's name.
  const groupWork = (sid: string) => {
    const mid = toReviewCell(sid);
    const m = mid ? lesson.modules.find((x) => x.id === mid) : undefined;
    return m && kindOf(m) === "worksheet" && m.writers === "group" ? groupFor(course, m, sid) : undefined;
  };
  const toReview = (() => {
    const seen = new Set<string>();
    return course.students.filter((st) => {
      if (!toReviewCell(st.id)) return false;
      const g = groupWork(st.id);
      const key = g ? `${toReviewCell(st.id)}:${g.id}` : st.id;
      return seen.has(key) ? false : (seen.add(key), true);
    });
  })();
  const firstVisible = (sid: string) => lesson.modules.find((m) => visible[sid].has(m.id))?.id;
  // A quiz handed in (best try) or a card group finished, under half right.
  const inner = parentOf(lesson.modules);
  const lowCell = (sid: string) => lesson.modules.find((m) => {
    const pr = progress[sid]?.[m.id];
    if (m.type === "quiz" && visible[sid].has(m.id) && pr?.status === "done" && m.questions?.length) return (pr.best ?? pr.score ?? 0) / Math.max(1, quizSet(m, sid, pr.attempt ?? 1).length) < 0.5;
    // A group inside a group is judged by the outer group's score, which holds the same answers.
    if (m.type === "group" && !inner.has(m.id) && leavesOf(m, lesson.modules).some((c) => visible[sid].has(c.id))) { const g = groupScore(m, lesson.modules, progress[sid] ?? {}); return g.done && g.right / Math.max(1, g.total) < 0.5; }
    return false;
  })?.id;
  const low = course.students.filter((st) => !!lowCell(st.id));
  const attention: { key: string; icon: string; tint: string; title: string; hint: string; who: typeof course.students; cell: (sid: string) => string | undefined }[] = [
    { key: "late", icon: "clock", tint: "var(--color-bad)", title: "Overdue", hint: "A card past its due date isn’t done.", who: overdue, cell: lateCard },
    { key: "review", icon: "message", tint: "#287670", title: "Ready for your feedback", hint: "Finished work you haven’t reviewed yet.", who: toReview, cell: toReviewCell },
    { key: "low", icon: "quiz", tint: "var(--color-warn)", title: "Low quiz scores", hint: "Under half right on a quiz or card group here.", who: low, cell: (sid) => { const id = lowCell(sid); const g = lesson.modules.find((m) => m.id === id); return g?.type === "group" ? leavesOf(g, lesson.modules).find((c) => visible[sid].has(c.id))?.id : id; } },
    { key: "start", icon: "clock", tint: "var(--color-ink-2)", title: "Haven’t started", hint: "No card opened in this lesson yet.", who: notStarted, cell: firstVisible },
    { key: "stall", icon: "timer", tint: "var(--color-warn)", title: "Stalled", hint: "Started, but nothing new for 2+ days.", who: stalled, cell: (sid) => lesson.modules.find((m) => progress[sid]?.[m.id]?.status === "doing")?.id },
    { key: "wait", icon: "message", tint: "#ae502f", title: "Waiting for feedback", hint: "Posted for peer review, no classmate has replied yet.", who: waiting, cell: (sid) => (studioWaiting.has(sid) ? studioId : wallWaiting(sid)) },
    { key: "owe", icon: "studio", tint: "#367195", title: "Owe feedback", hint: "Posted, but replied to fewer classmates than the card asks (fewer in a small group).", who: owing, cell: (sid) => wallOwing(sid) ?? studioId },
    ...(unpicked.length ? [{ key: "path", icon: "split", tint: "#4b56a8", title: "Haven’t picked a path", hint: "Working, but no Guided/Stretch choice yet.", who: unpicked, cell: firstVisible }] : []),
  ];
  const totals = real.reduce(
    (acc, st) => {
      const ps = statusIn(st.id);
      acc.cards += ps.length;
      acc.done += ps.filter((p) => p?.status === "done").length;
      return acc;
    },
    { cards: 0, done: 0 },
  );
  const posted = new Set(lessonPosts.map((p) => p.studentId)).size;
  const feedbackTotal = state.studio.feedback.filter((f) => lessonPosts.some((p) => p.id === f.postId)).length;

  function exportAll() {
    const all = course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules.map((m) => ({ w, l, m }))));
    const head = ["Student", "Group", ...all.map((x) => `${x.w.title.split(" · ")[0]} · ${x.m.title}`)];
    const rows = course.students.map((st) => [
      st.name, groupName(st.id),
      ...all.map(({ m }) => {
        const pr = progress[st.id]?.[m.id];
        return pr ? (pr.status === "done" ? "Done" : pr.status === "doing" ? "In progress" : "") : "";
      }),
    ]);
    download(`${course.title} - all weeks.csv`, toCsv([head, ...rows]), "text/csv");
  }

  function exportFeedback() {
    const name = (id: string) => course.students.find((x) => x.id === id)?.name ?? id;
    const title = (mid: string) => course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules)).find((m) => m.id === mid)?.title ?? "";
    const rows: (string | number)[][] = [["Card", "Post by", "Post title", "Feedback from", "Observed", "Effect", "Try next", "Level", "Given at"]];
    for (const f of state.studio.feedback) {
      const p = state.studio.posts.find((x) => x.id === f.postId);
      if (!p) continue;
      rows.push([title(p.moduleId), name(p.studentId), p.title, name(f.fromId), f.observed, f.effect, f.next, f.level ?? "", new Date(f.createdAt).toISOString()]);
    }
    download(`${course.title} - peer feedback.csv`, toCsv(rows), "text/csv");
  }

  function exportCsv() {
    const head = ["Student", "Group", ...cards.map((m) => m.title), ...(studioIds.size ? ["Feedback given"] : [])];
    const rows = course.students.map((st) => [
      st.name,
      groupName(st.id),
      ...cards.map((m) => {
        if (!visible[st.id].has(m.id)) return "";
        const pr = progress[st.id]?.[m.id];
        const status = pr?.status ?? "todo";
        // Quizzes show the best try, out of the questions this student actually got.
        const best = m.type === "quiz" ? pr?.best ?? pr?.score : pr?.score;
        return `${status === "done" ? "Done" : status === "doing" ? "In progress" : "Not started"}${m.questions && !isPoll(m) && best !== undefined ? ` (${best}/${quizSet(m, st.id, pr?.attempt ?? 1).length})` : ""}`;
      }),
      ...(studioIds.size ? [feedbackGiven(st.id)] : []),
    ]);
    download(`${course.title} - ${lesson.title}.csv`, toCsv([head, ...rows]), "text/csv");
  }
  const selModule = sel && lesson.modules.find((m) => m.id === sel.mid);
  const selProgress = sel && progress[sel.sid]?.[sel.mid];
  const selStudent = sel && course.students.find((s) => s.id === sel.sid);
  // Step through the class on the same card (↑/↓), skipping students who don't have it.
  /** After giving feedback, open the next student (in class-list order) whose finished work on this card is still waiting for it. */
  function nextWaiting(justDone: string) {
    if (!sel) return;
    const list = course.students.filter((st) => visible[st.id].has(sel.mid));
    const i = list.findIndex((st) => st.id === sel.sid);
    const order = [...list.slice(i + 1), ...list.slice(0, i)];
    const next = order.find((st) => st.id !== justDone && awaitingFeedback(progress[st.id]?.[sel.mid]));
    if (next) setSel({ sid: next.id, mid: sel.mid });
    else toast("That’s everyone who finished this card", { icon: "check", tone: "ok" });
  }
  function stepStudent(d: number) {
    if (!sel) return;
    const list = course.students.filter((st) => visible[st.id].has(sel.mid));
    const i = list.findIndex((st) => st.id === sel.sid);
    const next = list[(i + d + list.length) % list.length];
    if (next) setSel({ sid: next.id, mid: sel.mid });
  }
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "Escape") setSel(null);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        stepStudent(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  usePanelShift(!!(sel && selModule && selStudent));
  // A student's work on one card, in a panel at the right (opened from the grid, the lists, or a student's view).
  const drawer = sel && selModule && selStudent ? (
          createPortal(
          <aside key={`${sel.sid}-${sel.mid}`} id="class-detail" aria-label="Student work"
            className="fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-[28rem] flex-col border-l border-line bg-white shadow-[-24px_0_60px_-30px_rgba(20,20,18,0.35)]"
            style={{ animation: "panel-in 0.38s var(--ease-out) both" }}>
            <div className="flex h-14 flex-none items-center gap-2 border-b border-line px-4">
              <div className="flex items-center rounded-lg bg-lane p-0.5">
                <button onClick={() => stepStudent(-1)} aria-label="Previous student (↑)" title="Previous student (↑)" className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-white"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg></button>
                <button onClick={() => stepStudent(1)} aria-label="Next student (↓)" title="Next student (↓)" className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-white"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
              </div>
              <Avatar name={selStudent.name} size={24} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{selStudent.name}</span>
              <Link href={`/learn/${courseId}/${selStudent.id}?preview=1`} target="_blank" className="btn btn-quiet press h-7 px-2 text-[12px]">Their view <Icon name="external" size={11} /></Link>
              <button onClick={() => setSel(null)} aria-label="Close details" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={15} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
            <div className="flex items-center gap-2">
              <span style={{ color: suitOfCard(selModule).tint }}><Icon name={selModule.type} size={14} /></span>
              <h3 className="flex-1 text-[15px] font-medium">{selModule.title}</h3>
              <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><StatusIcon status={selProgress?.status ?? "todo"} size={12} />{STATUS_LABEL[selProgress?.status ?? "todo"]}</span>
            </div>
            {selProgress?.ratings && Object.keys(selProgress.ratings).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">{course.skills?.map((sk) => selProgress.ratings![sk.id] && <span key={sk.id} className="chip">{sk.name} · {selProgress.ratings![sk.id]}</span>)}</div>
            )}
            {selProgress?.work?.length ? <div className="mt-3 space-y-4">{selProgress.work.map((a) => <div key={a.id}><div className="mb-1 text-[12px] text-ink-3">{a.name}</div><MarkedMedia a={a} /></div>)}</div> : null}
            {state.studio.posts.filter((p) => p.moduleId === selModule.id && p.studentId === selStudent.id).map((p) => (
              <div key={p.id} className="mt-3 rounded-lg bg-[#fbf3ee] p-3 text-[13px]">
                <div className="font-medium">{p.title}</div>
                {p.question && <div className="text-ink-2">Asked: {p.question}</div>}
                {p.work.map((a) => <div key={a.id} className="mt-2"><MarkedMedia a={a} /></div>)}
                <div className="mt-2 text-[12px] text-ink-3">{state.studio.feedback.filter((f) => f.postId === p.id).length} feedback received</div>
                {state.studio.feedback.filter((f) => f.postId === p.id).map((f) => (
                  <div key={f.id} className="mt-2 rounded-md bg-white px-2.5 py-2 text-[12.5px] leading-snug">
                    <div className="flex items-center gap-1.5 text-ink-3">{course.students.find((x) => x.id === f.fromId)?.name}{f.helpful && <span className="flex items-center gap-0.5 text-ok"><Icon name="check" size={11} />helpful</span>}</div>
                    <div><span className="text-ink-3">Observed:</span> {f.observed}</div>
                    <div><span className="text-ink-3">Try next:</span> {f.next}</div>
                  </div>
                ))}
              </div>
            ))}
            {!readOnly && selProgress?.status !== "done" && <RemindButton courseId={courseId} ids={[selStudent.id]} names={selStudent.name} moduleId={selModule.id} text={`Reminder: “${selModule.title}”${selModule.due ? " is due soon" : ""}. Open it when you can.`} />}
            {selModule.due && (
              <p className={`mt-2 text-[12.5px] ${isLate(selModule, selProgress ?? undefined, now) ? "text-bad" : "text-ink-3"}`}>
                Due {new Date(dueAt(selModule.due)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{isLate(selModule, selProgress ?? undefined, now) ? " · late" : ""}
              </p>
            )}
            {selModule.checklist?.length ? (
              <ul className="mt-3 space-y-1 text-[13px]">
                {selModule.checklist.filter((x) => x.trim()).map((t, i) => {
                  const on = selProgress?.checks?.includes(i);
                  return <li key={i} className={`flex items-start gap-2 ${on ? "" : "text-ink-3"}`}><span className={`mt-[3px] flex h-3.5 w-3.5 flex-none items-center justify-center rounded border ${on ? "border-ok bg-ok text-white" : "border-line-strong"}`}>{on && <Icon name="check" size={9} strokeWidth={3} />}</span>{t}</li>;
                })}
              </ul>
            ) : null}
            {selProgress?.rehearsals?.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-1 text-[12px] text-ink-3">
                <Icon name="timer" size={12} /> Timed runs{selModule.timer ? ` (target ${fmtSec(selModule.timer)})` : ""}:
                {selProgress.rehearsals.map((x, i) => <span key={i} className={`rounded-full px-1.5 font-mono text-[11px] ${selModule.timer && Math.abs(x - selModule.timer) <= selModule.timer * 0.1 ? "bg-ok/10 text-ok" : "bg-lane text-ink-2"}`}>{fmtSec(x)}</span>)}
              </div>
            ) : null}
            {selProgress?.speech && (
              <div className="mt-3 rounded-lg bg-lane px-3.5 py-3 text-[13px] leading-relaxed">
                <div className="mb-1 text-[12px] text-ink-3">Speech draft · {selProgress.speech.versions.length} saved version{selProgress.speech.versions.length === 1 ? "" : "s"}</div>
                <p className="whitespace-pre-wrap">{draftOf(selProgress.speech.fields, true)}</p>
              </div>
            )}
            {selProgress?.highlights?.length ? (
              <div className="mt-3 space-y-1.5">
                <div className="text-[12px] text-ink-3">Highlighted</div>
                {selProgress.highlights.map((h, i) => (
                  <p key={i} className="border-l-2 border-[#f0cf62] pl-2.5 text-[13px] leading-snug">
                    “{selModule.body.slice(h.start, h.end).trim()}”{h.note && <span className="block text-[12.5px] text-ink-3">{h.note}</span>}
                  </p>
                ))}
              </div>
            ) : null}
            {sharedDoc(selModule) && (() => {
              // A shared copy: the live document (the teacher can watch it being written, and write in it too).
              const key = docKey(course, selModule, sel!.sid);
              return key ? (
                <LiveCopy key={key} startOpen={!selProgress?.output} label={selModule.writers === "class" ? "The class’s live copy" : "This group’s live copy"}>
                  <SharedDoc courseId={courseId} docKey={key} template={selModule.body} name="Teacher" readOnly={readOnly} />
                </LiveCopy>
              ) : null;
            })()}
            {selProgress?.output && (writesOwn(selModule) || sharedDoc(selModule)) ? (
              // Their own copy of a Text card: formatted, and open to comments on any passage.
              readOnly ? <div className="mt-3 rounded-lg bg-lane px-3.5 py-3"><RichText text={selProgress.output} className="text-[13.5px] leading-relaxed" /></div> : <DocReview doc={selProgress.output} notes={selProgress.notes ?? []} courseId={courseId} studentId={sel!.sid} moduleId={selModule.id} onChanged={() => {}} names={Object.fromEntries(course.students.map((x) => [x.id, x.name]))} />
            ) : selProgress?.output ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-lane px-3.5 py-3 text-[13.5px] leading-relaxed">{selProgress.output}</p>
            ) : (
              // A shared doc is written in its live copy above; what's said here is about the copy handed in.
              !selModule.questions && kindOf(selModule) !== "content" && <p className="mt-3 text-[13px] text-ink-3">{sharedDoc(selModule) ? "Not handed in yet. Once it is, you can comment on any passage of the copy they hand in." : "Nothing written yet."}</p>
            )}
            {selModule.questions && selProgress?.attempt && selProgress.attempt > 1 ? (
              <p className="mt-3 text-[12.5px] text-ink-3">Try {selProgress.attempt} of {selModule.attempts ?? 1} · best score {selProgress.best ?? 0}/{quizSet(selModule, sel!.sid, selProgress.attempt ?? 1).length}</p>
            ) : null}
            {selModule.questions && (
              <ul className="mt-3 space-y-1.5 text-[13px]">
                {selModule.questions.map((q, i) => {
                  const a = selProgress?.answers?.[q.id];
                  const ok = selProgress?.results?.[q.id];
                  return (
                    <li key={q.id} className="flex items-center gap-2">
                      <span className="mono w-5">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex-1"><MathText text={q.text.trim() || selModule.title} /></span>
                      {a === undefined ? <span className="text-ink-3">No answer</span> : isPoll(selModule) ? <span className="text-ink-2">{answerText(q, a)}</span> : (
                        <span className={`flex items-center gap-1 ${ok ? "text-ok" : "text-bad"}`}><Icon name={ok ? "check" : "x"} size={13} strokeWidth={2.2} />{answerText(q, a)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {selModule.form?.by === "student" && <FormAnswers m={selModule} progress={selProgress ?? undefined} skills={course.skills ?? []} levels={course.levels ?? []} />}
            {!readOnly && selModule.form && selModule.form.by !== "student" && (
              <FormFill key={`${sel.sid}-${sel.mid}-form`} courseId={courseId} studentId={sel.sid} name={selStudent.name} m={selModule} skills={course.skills ?? []} levels={course.levels ?? []}
                prev={selProgress?.updates?.find((u) => u.id === `form:${selModule.id}`)} onNext={() => stepStudent(1)} />
            )}
            {/* Feedback is for work handed in (an open answer, a worksheet). Reading, choices and discussions have none to
                review; a message says anything else. */}
            {!reviewable(selModule) && onMessage && (
              <div className="mt-6 flex items-center gap-3 border-t border-line pt-5 text-[12.5px] text-ink-3">
                <span className="flex-1">{kindOf(selModule) === "discussion" ? "Reply in the discussion, or write to them yourself." : kindOf(selModule) === "content" ? "Nothing to hand in on this card." : kindOf(selModule) === "worksheet" ? "The whole class writes one copy together, so there’s no copy of their own to give feedback on." : "Checked by the card itself."}</span>
                <button onClick={() => onMessage(sel.sid)} className="btn btn-ghost press h-8 px-3 text-[12.5px]"><Icon name="message" size={12} /> <span className="max-w-[10rem] truncate">Message {selStudent.name}</span></button>
              </div>
            )}
            {readOnly && reviewable(selModule) && selProgress?.review && (
              <p className="mt-6 border-t border-line pt-5 text-[13px] text-ink-2"><span className="font-medium">{selProgress.review.verdict === "revise" ? "Asked to revise" : "Looks good"}</span>{selProgress.review.text ? `: ${selProgress.review.text}` : ""}</p>
            )}
            {!readOnly && reviewable(selModule) && (
              <ReviewBox key={`${sel.sid}-${sel.mid}-${selProgress?.review?.at ?? 0}`} group={groupOnCard(selModule, sel.sid)} courseId={courseId} studentId={sel.sid} moduleId={sel.mid} name={selStudent.name} review={selProgress?.review} done={selProgress?.status === "done"}
                skills={selModule.skills?.length ? (course.skills ?? []).filter((sk) => selModule.skills!.includes(sk.id)) : course.skills ?? []} rateOpen={!!selModule.skills?.length} levels={course.levels ?? []} onNext={() => nextWaiting(sel.sid)} />
            )}
            </div>
          </aside>,
          document.body,
          )
  ) : null;
  // Only the panel: the Students tab shows a student of its own and opens their work here.
  if (drawerOnly) return <>{drawer}</>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {/* What this page is, when the lesson has no goal of its own to show . */}
        <p className="flex-1 text-[13px] text-ink-3">{lesson.goal || "Where each student is in this lesson, and who needs you. Click a card under a student to see their work."}</p>
        <ExportMenu items={[
          ["This lesson (CSV)", exportCsv],
          ["All weeks (CSV)", exportAll],
          ["All peer feedback (CSV)", exportFeedback],
          ...extraExports,
        ]} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Cards done", `${totals.cards ? Math.round((totals.done / totals.cards) * 100) : 0}%`, `${totals.done} of ${totals.cards}`],
          ["Started", `${real.length - notStarted.filter((st) => real.includes(st)).length}/${real.length}`, "students"],
          ...(studioIds.size ? [["Posted to Studio", `${posted}/${course.students.length}`, "students"], ["Feedback given", `${feedbackTotal}`, `goal ${course.students.reduce((n, st) => n + feedbackGoal(st.id), 0)}`]] : []),
        ].map(([k, v, sub], i) => (
          <div key={k} className="rise card px-4 py-3" style={{ "--i": i } as React.CSSProperties}>
            <div className="text-[12px] text-ink-3">{k}</div>
            <div className="mt-1 flex items-baseline gap-2"><span className="font-mono text-[22px]">{v}</span><span className="text-[12px] text-ink-3">{sub}</span></div>
          </div>
        ))}
      </div>

      <section aria-label="Needs attention">
        <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">Needs attention</h3>
        {attention.every((a) => a.who.length === 0) ? (
          <div className="pop card flex items-center gap-2 px-4 py-3 text-[13.5px]">{course.students.length ? <><StatusIcon status="done" size={15} /> Everyone is on track for this lesson.</> : <span className="text-ink-2">Nothing to show until students join.</span>}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attention.filter((a) => a.who.length).map((a, i) => (
              <div key={a.key} className="rise card p-4" style={{ "--i": i } as React.CSSProperties}>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-lane" style={{ color: a.tint }}><Icon name={a.icon} size={14} /></span>
                  <span className="flex-1 text-[13.5px] font-medium">{a.title}</span>
                  <span className="font-mono text-[18px]">{a.who.length}</span>
                </div>
                <p className="mt-1.5 text-[12.5px] text-ink-3">{a.hint}</p>
                {!readOnly && (a.key === "late" || a.key === "start" || a.key === "stall") && (
                  <RemindButton courseId={courseId} ids={a.who.map((st) => st.id)} names={a.who.length === 1 ? a.who[0].name : `${a.who.length} students`}
                    text={a.key === "late" ? "You have a card past its due date. Can you finish it today?" : a.key === "start" ? `Time to start “${lesson.title}”. Open your first card when you can.` : "Pick up where you left off when you have a moment."} />
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {/* A big class: the first few names, the rest one click away (not a wall of 200 names). */}
                  {(allOf.has(a.key) ? a.who : a.who.slice(0, MANY)).map((st) => (
                    <button key={st.id}
                      onClick={() => {
                        const mid = a.cell(st.id);
                        if (mid) setSel({ sid: st.id, mid });
                      }}
                      className="press inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-white pl-1 pr-2.5 text-[12.5px] hover:border-line-strong">
                      {(() => { const g = a.key === "review" ? groupWork(st.id) : undefined; return g ? <><Icon name="users" size={13} className="ml-1 text-ink-3" />{g.name}</> : <><Avatar name={st.name} size={20} />{st.name}</>; })()}
                    </button>
                  ))}
                  {a.who.length > MANY && (
                    <button onClick={() => setAllOf((x) => { const n = new Set(x); if (n.has(a.key)) n.delete(a.key); else n.add(a.key); return n; })}
                      className="press inline-flex h-7 items-center rounded-full px-2.5 text-[12.5px] text-ink-2 hover:bg-lane hover:text-ink">
                      {allOf.has(a.key) ? "Show fewer" : `and ${a.who.length - MANY} more`}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="card overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-line bg-white px-4 py-3 text-left text-[12px] font-normal text-ink-3">Student</th>
              {cards.map((m) => {
                const who = course.students.filter((s) => visible[s.id].has(m.id));
                const done = who.filter((s) => progress[s.id]?.[m.id]?.status === "done").length;
                return (
                  <th key={m.id} className="min-w-[6.5rem] border-b border-line px-2 py-3 text-left font-normal">
                    <div className="flex items-center gap-1.5" style={{ color: suitOfCard(m).tint }}>
                      <Icon name={faceMeta(m).icon} size={13} />
                    </div>
                    <div className="mt-1.5 max-w-28 truncate text-[12.5px] font-medium text-ink" title={m.title}>{m.title}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="h-1 w-12 overflow-hidden rounded-full bg-lane">
                        <div className="h-full rounded-full bg-ok transition-[width] duration-700" style={{ width: `${who.length ? (done / who.length) * 100 : 0}%` }} />
                      </div>
                      <span className="mono text-[11px]">{done}/{who.length}</span>
                    </div>
                  </th>
                );
              })}
              {studioIds.size > 0 && (
                <th className="min-w-[6rem] border-b border-line px-2 py-3 text-left font-normal">
                  <div style={{ color: "#367195" }}><Icon name="message" size={13} /></div>
                  <div className="mt-1.5 text-[12.5px] font-medium text-ink">Feedback given</div>
                  <div className="mono mt-1 text-[11px]">goal up to 2</div>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {course.students.map((s) => (
              <tr key={s.id} className="group">
                <td className="sticky left-0 z-10 whitespace-nowrap border-b border-line/70 bg-white px-4 py-1.5 group-last:border-b-0">
                  <Link href={`/learn/${courseId}/${s.id}?preview=1`} target="_blank" className="inline-flex items-center gap-2 font-medium hover:underline" title="See this student’s view">
                    <Avatar name={s.name} size={20} />
                    {s.name}
                  </Link>
                  {s.demo && <span className="chip ml-2 h-5 bg-[#fff2c7] text-[10.5px] font-medium text-[#7a5a00]">Demo</span>}
                  {groupName(s.id) && <span className="ml-2 text-[11px] text-ink-3">{groupName(s.id)}</span>}
                </td>
                {cards.map((m) => {
                  if (!visible[s.id].has(m.id)) return <td key={m.id} className="border-b border-line/70 px-2 py-1.5 group-last:border-b-0"><span className="block h-8 rounded-lg hatch" /></td>;
                  const p = progress[s.id]?.[m.id];
                  const status = p?.status ?? "todo";
                  const tools = toolUse[s.id]?.[m.id];
                  const active = sel?.sid === s.id && sel.mid === m.id;
                  const shown = m.type === "quiz" ? p?.best ?? p?.score : p?.score;
                  // A poll has no right answer: no score.
                  const scored = m.questions && !isPoll(m) && shown !== undefined && (status === "done" || p?.best !== undefined);
                  const late = isLate(m, p, now);
                  const rv = p?.review;
                  return (
                    <td key={m.id} className="border-b border-line/70 px-2 py-1.5 group-last:border-b-0">
                      <button
                        onClick={() => setSel(active ? null : { sid: s.id, mid: m.id })}
                        aria-label={`${s.name}, ${m.title}, ${STATUS_LABEL[status]}`}
                        className={`press flex h-8 w-full items-center gap-1.5 rounded-lg px-2 transition-colors duration-500 ${active ? "bg-ink text-white" : late ? "bg-bad/[0.06] hover:bg-bad/[0.1]" : status === "done" ? "bg-ok/[0.07] hover:bg-ok/[0.12]" : status === "doing" ? "bg-warn/[0.07] hover:bg-warn/[0.12]" : "hover:bg-lane"}`}
                      >
                        <StatusIcon status={status} size={13} />
                        {scored && <span className={`font-mono text-[11.5px] ${active ? "text-white" : "text-ink-2"}`}>{shown}/{quizSet(m, s.id, p.attempt ?? 1).length}</span>}
                        <span className="flex-1" />
                        {late && <span className={`font-mono text-[10.5px] font-medium ${active ? "text-white" : "text-bad"}`}>late</span>}
                        {m.form && (m.form.by === "student" ? p?.form : p?.updates?.some((u) => u.id === `form:${m.id}`)) && <span title={m.form.by === "student" ? "They sent the form" : "You filled in the form"} className={active ? "text-white/80" : "text-[#3d6f91]"}><Icon name="text" size={11} /></span>}
                        {rv && reviewable(m) && <span title={rv.verdict === "revise" ? "You asked for a revision" : "You reviewed this"} className={active ? "text-white/80" : rv.verdict === "revise" ? "text-warn" : "text-ok"}><Icon name={rv.verdict === "revise" ? "reset" : "message"} size={11} /></span>}
                        {tools ? <span className={`flex items-center gap-0.5 font-mono text-[11px] ${active ? "text-white/70" : "text-ink-3"}`}><Icon name="tool" size={10} />{tools}</span> : null}
                      </button>
                    </td>
                  );
                })}
                {studioIds.size > 0 && (
                  <td className="border-b border-line/70 px-2 py-1.5 group-last:border-b-0">
                    <span className={`flex h-8 items-center gap-1.5 rounded-lg px-2 font-mono text-[12px] ${feedbackGiven(s.id) >= feedbackGoal(s.id) ? "bg-ok/[0.07] text-ok" : "text-ink-2"}`} title="Given · marked helpful by the receiver">
                      {feedbackGiven(s.id)}/{feedbackGoal(s.id)}
                      {helpfulGiven(s.id) > 0 && <span className="text-[11px] text-ink-3">· {helpfulGiven(s.id)} helpful</span>}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drawer}

      {lesson.modules.filter((m) => m.questions?.length).map((m) => (
        <section key={m.id} className="card p-5">
          <h3 className="flex items-center gap-2 text-[14px] font-medium">
            <span style={{ color: suitOfCard(m).tint }}><Icon name={faceMeta(m).icon} size={14} /></span>
            {m.title}<span className="font-normal text-ink-3">· {isPoll(m) ? "votes" : "correct by question"}</span>
          </h3>
          <div className="mt-4 space-y-2.5">
            {isPoll(m) ? m.questions!.map((q, i) => {
              // A poll: how many chose each option (nothing is right or wrong).
              const votes = course.students.map((s) => progress[s.id]?.[m.id]?.answers?.[q.id]).filter((a): a is number => typeof a === "number");
              return (
                <div key={q.id}>
                  {m.questions!.length > 1 && <p className="mb-1.5 text-[13px]"><span className="mono mr-2">{String(i + 1).padStart(2, "0")}</span><MathText text={q.text.trim()} /></p>}
                  {q.options.map((o, oi) => {
                    const n = votes.filter((v) => v === oi).length;
                    return (
                      <div key={oi} className="grid items-center gap-3 py-0.5 text-[13px] sm:grid-cols-[1.5rem_1fr_10rem_6rem]">
                        <span className="mono text-ink-3">{String.fromCharCode(65 + oi)}</span>
                        <span className="truncate"><MathText text={o} /></span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-lane">
                          <div className="h-full rounded-full bg-[#4b56a8]/70 transition-[width] duration-700" style={{ width: `${votes.length ? (n / votes.length) * 100 : 0}%` }} />
                        </div>
                        <span className="mono text-right">{n} {n === 1 ? "vote" : "votes"}</span>
                      </div>
                    );
                  })}
                </div>
              );
            }) : m.questions!.map((q, i) => {
              const all = course.students.map((s) => progress[s.id]?.[m.id]?.results?.[q.id]).filter((x) => x !== undefined);
              const rate = all.length ? all.filter(Boolean).length / all.length : 0;
              return (
                <div key={q.id} className="grid items-center gap-3 text-[13px] sm:grid-cols-[1.5rem_1fr_10rem_6rem]">
                  <span className="mono">{String(i + 1).padStart(2, "0")}</span>
                  <span className="truncate"><MathText text={q.text.trim() || m.title} /></span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-lane">
                    <div className={`h-full rounded-full transition-[width] duration-700 ${rate < 0.6 ? "bg-bad/70" : "bg-ok"}`} style={{ width: `${rate * 100}%` }} />
                  </div>
                  <span className="mono text-right">{all.length ? `${Math.round(rate * 100)}% · ${all.length}` : "No answers yet"}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {lesson.modules.filter((m) => m.form?.by === "student").map((m) => (
        <FormTable key={m.id} m={m} students={course.students} progress={progress} skills={course.skills ?? []} canSee={(sid) => visible[sid].has(m.id)} />
      ))}

      {lesson.modules.filter((m) => m.type === "wall").map((m) => (
        <WallPanel key={m.id} courseId={courseId} module={m} state={state} readOnly={readOnly} aiReady={!!connectors.find((c) => c.id === "ai")?.configured} />
      ))}
    </div>
  );
}

function WallPanel({ courseId, module: m, state, aiReady, readOnly = false }: { courseId: string; module: Module; state: CourseState; aiReady: boolean; readOnly?: boolean }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const { course } = state;
  const posts = state.posts.filter((p) => p.moduleId === m.id);
  const name = (id: string) => (id === "teacher" ? "Teacher" : course.students.find((s) => s.id === id)?.name ?? "");
  const pending = posts.filter((p) => p.approved === false).length;
  // Folded until opened: a discussion's whole feed would push everything else down the page.
  const [open, setOpen] = useState(false);
  const replies = posts.reduce((n, p) => n + (p.comments?.length ?? 0), 0);
  const writers = [...new Set(posts.map((p) => p.studentId))].filter((id) => id !== "teacher");

  async function summarize() {
    setBusy(true);
    setError(null);
    const text = `Wall topic: ${m.title}\nTeacher prompt: ${m.body}\n\nStudent posts:\n${posts.map((p, i) => `${i + 1}. ${p.text}`).join("\n")}`;
    const reply = await invokeTool({ courseId, connector: "ai", action: "summarize", input: { text } });
    setBusy(false);
    if (reply.ok && reply.result.render === "text") setSummary(reply.result.text);
    else if (!reply.ok) setError(reply.error);
  }

  function exportCsv() {
    const rows = [["Author", "Anonymous", "Posted", "Text", "Attachments", "Votes", "Likes", "Comments", "Approved"]].concat(
      posts.map((p) => [name(p.studentId), p.anonymous ? "yes" : "", new Date(p.createdAt).toISOString(), p.text, (p.work ?? []).map((a) => a.url).join(" "), String(p.votes?.length ?? 0), String(p.likes?.length ?? 0), (p.comments ?? []).map((c) => `${name(c.from)}: ${[c.text, ...(c.work ?? []).map((w) => w.url)].filter(Boolean).join(" ")}`).join(" | "), p.approved === false ? "no" : "yes"]),
    );
    download(`${m.title} - wall.csv`, toCsv(rows), "text/csv");
  }

  if (!open) return (
    <section className="card flex flex-wrap items-center gap-3 p-4">
      <span style={{ color: TYPE_META.wall.tint }}><Icon name="wall" size={15} /></span>
      <button onClick={() => setOpen(true)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14px] font-medium">{m.title}</span>
        <span className="block text-[12.5px] text-ink-3">
          {posts.length ? `${posts.length} post${posts.length === 1 ? "" : "s"} · ${replies} repl${replies === 1 ? "y" : "ies"} · ${writers.length} of ${course.students.length} students posted` : "No posts yet"}
          {pending > 0 && <span className="text-warn"> · {pending} waiting for approval</span>}
        </span>
      </button>
      <button onClick={() => setOpen(true)} className="btn btn-ghost press h-8"><Icon name="chevron" size={12} /> Open the discussion</button>
    </section>
  );

  return (
    <section className="card p-5">
      <WallBoard
        courseId={courseId}
        me="teacher"
        teacher
        readOnly={readOnly}
        module={m}
        posts={state.posts}
        students={course.students}
        onChanged={() => {}}
        groupName={(id) => groupingOf(course, m)?.groups.find((g) => g.id === id)?.name ?? "A group"}
        header={
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex flex-1 items-center gap-2 text-[14px] font-medium">
                <span style={{ color: TYPE_META.wall.tint }}><Icon name="wall" size={14} /></span>
                {m.title}<span className="mono">{posts.length}</span>
                {pending > 0 && <span className="chip h-5 bg-warn/10 text-[11px] text-warn">{pending} waiting for approval</span>}
              </h3>
              <button onClick={() => setPresenting(true)} disabled={!posts.length} className="btn btn-dark press h-8"><Icon name="play" size={12} /> Present</button>
              {aiReady && <button onClick={summarize} disabled={busy || posts.length === 0} className="btn btn-ghost press h-8"><Icon name="sparkles" size={13} /> {busy ? "Reading…" : "Summary"}</button>}
              <button onClick={exportCsv} disabled={!posts.length} className="btn btn-ghost press h-8"><Icon name="download" size={13} /> CSV</button>
              <button onClick={() => setOpen(false)} aria-label="Fold the discussion" title="Fold" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="chevron" size={13} className="rotate-180" /></button>
            </div>
            
            {error && <p className="rise mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[13px] text-bad">{error}</p>}
            {busy && <div className="skeleton mt-3 h-20" />}
            {summary && <p className="rise mt-3 whitespace-pre-wrap rounded-lg bg-lane px-4 py-3 text-[13.5px] leading-relaxed">{summary}</p>}
          </div>
        }
      />
      {presenting && (
        <Present
          title={m.title}
          subtitle={course.title}
          code={course.joinCode}
          slides={posts
            .filter((p) => p.approved !== false)
            .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || ((b.votes?.length ?? 0) - (a.votes?.length ?? 0)) || a.createdAt - b.createdAt)
            .map((p) => ({ id: p.id, author: p.anonymous ? "Anonymous" : name(p.studentId), text: p.text, work: p.work, votes: p.votes?.length, likes: p.likes?.length }))}
          onClose={() => setPresenting(false)}
        />
      )}
    </section>
  );
}

function ExportMenu({ items }: { items: [string, () => void][] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Closes on a tap or click anywhere else, or Escape, not only when the mouse leaves.
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", off); window.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn btn-ghost press h-8"><Icon name="download" size={13} /> Export <Icon name="chevron" size={12} /></button>
      {open && (
        <div className="pop absolute right-0 top-10 z-20 w-56 rounded-xl border border-line bg-white p-1 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]">
          {items.map(([label, fn]) => (
            <button key={label} onClick={() => { setOpen(false); fn(); }} className="press block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-lane">{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The teacher's response to one piece of work: a note, and either "looks good" or "revise". */
function ReviewBox({ courseId, studentId, moduleId, name, review, done, skills, levels, onNext, rateOpen = false, group }: {
  /**
   * The student's group on this card. `shared`: the group wrote one worksheet, so feedback always goes to all of them.
   * Otherwise each member did their own work, and the teacher can choose to send the same feedback to the whole group.
   */
  group?: { name: string; members: string[]; shared: boolean };
  courseId: string; studentId: string; moduleId: string; name: string; review?: Review; done: boolean; skills: Skill[]; rateOpen?: boolean; levels: Level[]; onNext?: () => void }) {
  const [text, setText] = useState(review?.text ?? "");
  const [rubric, setRubric] = useState<Record<string, number>>(review?.levels ?? {});
  const [files, setFiles] = useState<Attachment[]>(review?.attachments ?? []);
  const [busy, setBusy] = useState(false);
  // Rating skills is optional: open when the card names its skills or levels were already given.
  const [rating, setRating] = useState(rateOpen || Object.keys(review?.levels ?? {}).length > 0);
  const [toGroup, setToGroup] = useState(false);
  const whole = !!group && (group.shared || toGroup);
  const who = whole ? group!.name : name;
  async function send(verdict: "good" | "revise" | "clear") {
    setBusy(true);
    const r = await op<{ ok: boolean; error?: string; reviewed?: number }>(courseId, verdict === "clear" ? { op: "review", studentId, moduleId, clear: true } : { op: "review", studentId, moduleId, verdict, text, levels: rubric, attachments: files, toGroup: whole || undefined });
    setBusy(false);
    if (r.ok === false) return toast(r.error ?? "Couldn’t save", { icon: "message", tone: "plain" });
    if (verdict === "clear") { setText(""); setFiles([]); }
    const many = (r.reviewed ?? 1) > 1 ? ` (${r.reviewed} students)` : "";
    toast(verdict === "revise" ? `Sent back to ${who} for a revision${many}` : verdict === "good" ? `Sent to ${who}${many}` : "Feedback removed", { icon: verdict === "revise" ? "reset" : "message" });
    // Marking down a list of work: go straight on to the next one waiting (not a teammate who just got this feedback).
    if (verdict !== "clear" && !whole) onNext?.();
  }
  return (
    <section aria-label="Your feedback" className="mt-6 border-t border-line pt-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">{whole ? "Feedback to the group" : "Your feedback"}</span>
        {review && (
          <span className={`flex items-center gap-1 text-[12px] ${review.verdict === "revise" ? "text-warn" : "text-ok"}`}>
            <Icon name={review.verdict === "revise" ? "reset" : "check"} size={12} />{review.verdict === "revise" ? "Revision asked" : "Looks good"} · {new Date(review.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>
      {skills.length > 0 && levels.length > 0 && !rating && (
        <button onClick={() => setRating(true)} className="btn btn-quiet press mb-2 h-7 px-2 text-[12px]"><Icon name="plus" size={12} /> Rate skills</button>
      )}
      {skills.length > 0 && levels.length > 0 && rating && (
        <div className="mb-3 space-y-2" aria-label="Rubric">
          {skills.map((sk) => (
            <div key={sk.id}>
              <div className="mb-1 text-[12.5px] text-ink-2">{sk.name}</div>
              <div className="grid grid-cols-4 gap-1">
                {levels.map((lv) => {
                  const on = rubric[sk.id] === lv.n;
                  return (
                    <button key={lv.n} onClick={() => setRubric((r) => ({ ...r, [sk.id]: on ? 0 : lv.n }))} aria-pressed={on} title={lv.description}
                      className={`press rounded-md border px-1 py-1.5 text-center text-[11.5px] leading-tight ${on ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-line-strong"}`}>
                      <span className="block font-mono text-[10.5px] opacity-70">{lv.n}</span>{lv.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {group && (
        // Who the feedback reaches: a group's own worksheet always goes to the group; individual work, the teacher's choice.
        group.shared ? (
          <p className="mb-2 rounded-lg bg-[#eef0fb] px-3 py-2 text-[12.5px] text-[#4b56a8]"><span className="font-medium">{group.name}</span> wrote this together: your feedback and comments go to all of them ({group.members.join(", ")}).</p>
        ) : (
          <label className="mb-2 flex items-start gap-2 text-[12.5px] text-ink-2">
            <input type="checkbox" checked={toGroup} onChange={(e) => setToGroup(e.target.checked)} className="mt-0.5 accent-[#4b56a8]" />
            <span>Send the same feedback to everyone in <span className="font-medium text-ink">{group.name}</span> who handed this in <span className="text-ink-3">({group.members.join(", ")})</span></span>
          </label>
        )
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={whole ? `What ${who} did well, and one thing to try next` : `What ${name} did well, and one thing to try next`} aria-label={whole ? "Feedback for the group" : "Feedback for the student"} className="field resize-y leading-relaxed"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send("good"); } }} />
      {files.length > 0 && (
        <div className="mt-2 space-y-2">
          {files.map((a) => (
            <div key={a.id} className="rounded-xl border border-line p-2">
              <div className="mb-1 flex items-center gap-2 text-[12px] text-ink-3"><span className="min-w-0 flex-1 truncate">{a.name}</span>
                <button onClick={() => setFiles((f) => f.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.name ?? "file"}`} className="hover:text-bad"><Icon name="x" size={12} /></button></div>
              <MediaView a={a} />
            </div>
          ))}
        </div>
      )}
      {files.length < 3 && (
        <div className="mt-2">
          <AttachMenu compact teacher label="Record how you’d play or say it, so they can hear it." onAdd={(a) => setFiles((f) => [...f, { ...a, id: `fb-${Math.random().toString(36).slice(2, 9)}` }])} />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => send("good")} disabled={busy} className="btn btn-dark press h-8"><Icon name="check" size={13} /> Looks good</button>
        <button onClick={() => send("revise")} disabled={busy || (!text.trim() && !files.length)} title={text.trim() || files.length ? undefined : "Say what to revise first"} className="btn btn-ghost press h-8"><Icon name="reset" size={13} /> Ask to revise</button>
        <span className="flex-1" />
        {review && <button onClick={() => send("clear")} disabled={busy} className="btn btn-quiet press h-8 text-[12px]">Remove</button>}
      </div>
      <p className="mt-2 text-[12px] text-ink-3">{done ? "“Ask to revise” puts the card back in their hand." : "They haven’t finished this card yet; you can still leave a note."}</p>
    </section>
  );
}

/** Send an in-app reminder to one or more students (they see it on their page and as a notification). */
function RemindButton({ courseId, ids, names, moduleId, text }: { courseId: string; ids: string[]; names: string; moduleId?: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(text);
  if (!ids.length) return null;
  return open ? (
    <form className="rise mt-3 flex gap-1.5" onSubmit={async (e) => {
      e.preventDefault();
      const r = await op<{ ok: boolean; error?: string; sent?: number }>(courseId, { op: "nudge", studentIds: ids, text: msg, moduleId });
      if (r.ok === false) return toast(r.error ?? "Couldn’t send", { icon: "x", tone: "bad" });
      setOpen(false);
      toast(`Reminder sent to ${names}`, { icon: "clock" });
    }}>
      <input autoFocus value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Reminder message" className="field h-8 py-0 text-[12.5px]" />
      <button className="btn btn-dark press h-8 flex-none">Send</button>
    </form>
  ) : (
    <button onClick={() => setOpen(true)} className="btn btn-quiet press mt-2 h-7 px-2 text-[12px]"><Icon name="clock" size={12} /> Remind {ids.length > 1 ? `all ${ids.length}` : names}</button>
  );
}

/**
 * A group's live document, folded or open. Only open is it connected: students see "Teacher is here" only while the
 * teacher actually has it open, not while it sits folded under a hand-in.
 */
function LiveCopy({ startOpen, label, children }: { startOpen: boolean; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <details className="mt-3 rounded-lg border border-line px-3 py-2" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-[12.5px] font-medium text-ink-2">{label}</summary>
      {open && <div className="mt-2">{children}</div>}
    </details>
  );
}
