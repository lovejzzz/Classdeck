"use client";

import Link from "next/link";
import { useState } from "react";
import { invokeTool } from "@/lib/client";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { visibleModules } from "@/lib/profile";
import { STATUS_LABEL, TYPE_META } from "@/lib/ui";
import type { CourseState, Lesson, Module } from "@/lib/types";
import { download, toCsv } from "@/lib/download";
import { MediaView } from "../cards/Media";
import { Present } from "../Present";
import { WallBoard } from "../WallBoard";
import { Avatar, Icon, StatusIcon } from "../Icon";

export function Classroom({
  courseId, state, lesson, connectors, sel, setSel,
}: {
  courseId: string; state: CourseState; lesson: Lesson; connectors: ConnectorInfo[];
  sel: { sid: string; mid: string } | null; setSel: (s: { sid: string; mid: string } | null) => void;
}) {
  const { course, progress, toolUse } = state;
  const visible = Object.fromEntries(course.students.map((s) => [s.id, new Set(visibleModules(lesson, s.id, state.choices[s.id]).map((m) => m.id))]));
  const studioIds = new Set(lesson.modules.filter((m) => m.type === "studio").map((m) => m.id));
  const lessonPosts = state.studio.posts.filter((p) => studioIds.has(p.moduleId));
  const feedbackGiven = (sid: string) => state.studio.feedback.filter((f) => f.fromId === sid && lessonPosts.some((p) => p.id === f.postId && p.studentId !== sid)).length;
  const groupName = (sid: string) => course.groups?.find((g) => g.studentIds.includes(sid))?.name ?? "";

  // —— who needs attention in this lesson ——
  const DAY = 86400000;
  // "Now" is fixed when the view opens; the page polls, so it never drifts far.
  const [now] = useState(() => Date.now());
  // A student's cards for this lesson; while they haven't picked a path, the versions count once.
  const statusIn = (sid: string) => {
    const mine = visibleModules(lesson, sid, state.choices[sid]);
    const seen = new Set<string>();
    return mine
      .filter((m) => !m.choice || (!seen.has(m.choice.slot) && (seen.add(m.choice.slot), true)))
      .map((m) => progress[sid]?.[m.id]);
  };
  const notStarted = course.students.filter((st) => statusIn(st.id).every((p) => !p || p.status === "todo"));
  const stalled = course.students.filter((st) => {
    const ps = statusIn(st.id).filter(Boolean);
    const doing = ps.filter((p) => p!.status === "doing");
    const latest = Math.max(0, ...ps.map((p) => p!.updatedAt));
    return doing.length > 0 && now - latest > 2 * DAY;
  });
  const unpicked = (lesson.choiceSlots ?? []).length
    ? course.students.filter((st) => !notStarted.includes(st) && (lesson.choiceSlots ?? []).some((slot) => !state.choices[st.id]?.[slot]))
    : [];
  const waiting = lessonPosts.filter((p) => !state.studio.feedback.some((f) => f.postId === p.id)).map((p) => course.students.find((st) => st.id === p.studentId)!).filter(Boolean);
  const owing = course.students.filter((st) => lessonPosts.some((p) => p.studentId === st.id) && feedbackGiven(st.id) < 2);
  const studioId = lesson.modules.find((m) => m.type === "studio")?.id;
  const firstVisible = (sid: string) => lesson.modules.find((m) => visible[sid].has(m.id))?.id;
  const attention: { key: string; icon: string; tint: string; title: string; hint: string; who: typeof course.students; cell: (sid: string) => string | undefined }[] = [
    { key: "start", icon: "clock", tint: "var(--color-ink-2)", title: "Haven’t started", hint: "No card opened in this lesson yet.", who: notStarted, cell: firstVisible },
    { key: "stall", icon: "timer", tint: "var(--color-warn)", title: "Stalled", hint: "Started, but nothing new for 2+ days.", who: stalled, cell: (sid) => lesson.modules.find((m) => progress[sid]?.[m.id]?.status === "doing")?.id },
    { key: "wait", icon: "message", tint: "#c25a35", title: "Waiting for feedback", hint: "Posted to Collab Studio, no replies yet.", who: waiting, cell: () => studioId },
    { key: "owe", icon: "studio", tint: "#3d7ea6", title: "Owe feedback", hint: "Posted, but replied to fewer than 2 peers.", who: owing, cell: () => studioId },
    ...(unpicked.length ? [{ key: "path", icon: "split", tint: "#4b56a8", title: "Haven’t picked a path", hint: "Working, but no Guided/Stretch choice yet.", who: unpicked, cell: firstVisible }] : []),
  ];
  const totals = course.students.reduce(
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
    const head = ["Student", "Group", ...lesson.modules.map((m) => m.title), ...(studioIds.size ? ["Feedback given"] : [])];
    const rows = course.students.map((st) => [
      st.name,
      groupName(st.id),
      ...lesson.modules.map((m) => {
        if (!visible[st.id].has(m.id)) return "";
        const pr = progress[st.id]?.[m.id];
        const status = pr?.status ?? "todo";
        return `${status === "done" ? "Done" : status === "doing" ? "In progress" : "Not started"}${m.questions && pr?.score !== undefined ? ` (${pr.score}/${m.questions.length})` : ""}`;
      }),
      ...(studioIds.size ? [feedbackGiven(st.id)] : []),
    ]);
    download(`${course.title} - ${lesson.title}.csv`, toCsv([head, ...rows]), "text/csv");
  }
  const selModule = sel && lesson.modules.find((m) => m.id === sel.mid);
  const selProgress = sel && progress[sel.sid]?.[sel.mid];
  const selStudent = sel && course.students.find((s) => s.id === sel.sid);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-[13px] text-ink-3">{lesson.goal}</p>
        <ExportMenu items={[
          ["This lesson (CSV)", exportCsv],
          ["All weeks (CSV)", exportAll],
          ["All peer feedback (CSV)", exportFeedback],
        ]} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Cards done", `${totals.cards ? Math.round((totals.done / totals.cards) * 100) : 0}%`, `${totals.done} of ${totals.cards}`],
          ["Started", `${course.students.length - notStarted.length}/${course.students.length}`, "students"],
          ...(studioIds.size ? [["Posted to Studio", `${posted}/${course.students.length}`, "students"], ["Feedback given", `${feedbackTotal}`, `goal ${course.students.length * 2}`]] : []),
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
          <div className="pop card flex items-center gap-2 px-4 py-3 text-[13.5px]"><StatusIcon status="done" size={15} /> Everyone is on track for this lesson.</div>
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
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {a.who.map((st) => (
                    <button key={st.id}
                      onClick={() => {
                        const mid = a.cell(st.id);
                        if (mid) setSel({ sid: st.id, mid });
                        requestAnimationFrame(() => document.getElementById("class-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
                      }}
                      className="press inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-white pl-1 pr-2.5 text-[12.5px] hover:border-line-strong">
                      <Avatar name={st.name} size={20} />{st.name}
                    </button>
                  ))}
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
              {lesson.modules.map((m) => {
                const who = course.students.filter((s) => visible[s.id].has(m.id));
                const done = who.filter((s) => progress[s.id]?.[m.id]?.status === "done").length;
                return (
                  <th key={m.id} className="min-w-[6.5rem] border-b border-line px-2 py-3 text-left font-normal">
                    <div className="flex items-center gap-1.5" style={{ color: TYPE_META[m.type].tint }}>
                      <Icon name={m.type} size={13} />
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
                  <div style={{ color: "#3d7ea6" }}><Icon name="message" size={13} /></div>
                  <div className="mt-1.5 text-[12.5px] font-medium text-ink">Feedback given</div>
                  <div className="mono mt-1 text-[11px]">goal 2</div>
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
                  {groupName(s.id) && <span className="ml-2 text-[11px] text-ink-3">{groupName(s.id)}</span>}
                </td>
                {lesson.modules.map((m) => {
                  if (!visible[s.id].has(m.id)) return <td key={m.id} className="border-b border-line/70 px-2 py-1.5 group-last:border-b-0"><span className="block h-8 rounded-lg hatch" /></td>;
                  const p = progress[s.id]?.[m.id];
                  const status = p?.status ?? "todo";
                  const tools = toolUse[s.id]?.[m.id];
                  const active = sel?.sid === s.id && sel.mid === m.id;
                  const scored = m.questions && p?.score !== undefined && status === "done";
                  return (
                    <td key={m.id} className="border-b border-line/70 px-2 py-1.5 group-last:border-b-0">
                      <button
                        onClick={() => setSel(active ? null : { sid: s.id, mid: m.id })}
                        aria-label={`${s.name}, ${m.title}, ${STATUS_LABEL[status]}`}
                        className={`press flex h-8 w-full items-center gap-1.5 rounded-lg px-2 transition-colors duration-500 ${active ? "bg-ink text-white" : status === "done" ? "bg-ok/[0.07] hover:bg-ok/[0.12]" : status === "doing" ? "bg-warn/[0.07] hover:bg-warn/[0.12]" : "hover:bg-lane"}`}
                      >
                        <StatusIcon status={status} size={13} />
                        {scored && <span className={`font-mono text-[11.5px] ${active ? "text-white" : "text-ink-2"}`}>{p.score}/{m.questions!.length}</span>}
                        <span className="flex-1" />
                        {tools ? <span className={`flex items-center gap-0.5 font-mono text-[11px] ${active ? "text-white/70" : "text-ink-3"}`}><Icon name="tool" size={10} />{tools}</span> : null}
                      </button>
                    </td>
                  );
                })}
                {studioIds.size > 0 && (
                  <td className="border-b border-line/70 px-2 py-1.5 group-last:border-b-0">
                    <span className={`flex h-8 items-center gap-1.5 rounded-lg px-2 font-mono text-[12px] ${feedbackGiven(s.id) >= 2 ? "bg-ok/[0.07] text-ok" : "text-ink-2"}`}>
                      {feedbackGiven(s.id)}/2
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        {sel && selModule && selStudent && (
          <div key={`${sel.sid}-${sel.mid}`} id="class-detail" className="pop card scroll-mt-24 p-5">
            <div className="flex items-center gap-2.5">
              <Avatar name={selStudent.name} size={24} />
              <h3 className="text-[14px] font-medium">{selStudent.name}<span className="mx-1.5 text-ink-3">·</span>{selModule.title}</h3>
              <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><StatusIcon status={selProgress?.status ?? "todo"} size={12} />{STATUS_LABEL[selProgress?.status ?? "todo"]}</span>
              <span className="flex-1" />
              <button onClick={() => setSel(null)} aria-label="Close details" className="btn btn-quiet press h-7 w-7 justify-center px-0"><Icon name="x" size={14} /></button>
            </div>
            {selProgress?.ratings && Object.keys(selProgress.ratings).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">{course.skills?.map((sk) => selProgress.ratings![sk.id] && <span key={sk.id} className="chip">{sk.name} · {selProgress.ratings![sk.id]}</span>)}</div>
            )}
            {selProgress?.work?.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{selProgress.work.map((a) => <div key={a.id}><div className="mb-1 text-[12px] text-ink-3">{a.name}</div><MediaView a={a} /></div>)}</div> : null}
            {state.studio.posts.filter((p) => p.moduleId === selModule.id && p.studentId === selStudent.id).map((p) => (
              <div key={p.id} className="mt-3 rounded-lg bg-[#fbf3ee] p-3 text-[13px]">
                <div className="font-medium">{p.title}</div>
                {p.question && <div className="text-ink-2">Asked: {p.question}</div>}
                {p.work.map((a) => <div key={a.id} className="mt-2"><MediaView a={a} /></div>)}
                <div className="mt-2 text-[12px] text-ink-3">{state.studio.feedback.filter((f) => f.postId === p.id).length} feedback received</div>
              </div>
            ))}
            {selProgress?.output ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-lane px-3.5 py-3 text-[13.5px] leading-relaxed">{selProgress.output}</p>
            ) : (
              !selModule.questions && <p className="mt-3 text-[13px] text-ink-3">Nothing written yet.</p>
            )}
            {selModule.questions && (
              <ul className="mt-3 space-y-1.5 text-[13px]">
                {selModule.questions.map((q, i) => {
                  const a = selProgress?.answers?.[q.id];
                  const ok = selProgress?.results?.[q.id];
                  return (
                    <li key={q.id} className="flex items-center gap-2">
                      <span className="mono w-5">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex-1">{q.text}</span>
                      {a === undefined ? <span className="text-ink-3">No answer</span> : (
                        <span className={`flex items-center gap-1 ${ok ? "text-ok" : "text-bad"}`}><Icon name={ok ? "check" : "x"} size={13} strokeWidth={2.2} />{q.options[a]}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {lesson.modules.filter((m) => m.questions?.length).map((m) => (
        <section key={m.id} className="card p-5">
          <h3 className="flex items-center gap-2 text-[14px] font-medium">
            <span style={{ color: TYPE_META[m.type].tint }}><Icon name={m.type} size={14} /></span>
            {m.title}<span className="font-normal text-ink-3">· correct by question</span>
          </h3>
          <div className="mt-4 space-y-2.5">
            {m.questions!.map((q, i) => {
              const all = course.students.map((s) => progress[s.id]?.[m.id]?.results?.[q.id]).filter((x) => x !== undefined);
              const rate = all.length ? all.filter(Boolean).length / all.length : 0;
              return (
                <div key={q.id} className="grid items-center gap-3 text-[13px] sm:grid-cols-[1.5rem_1fr_10rem_6rem]">
                  <span className="mono">{String(i + 1).padStart(2, "0")}</span>
                  <span className="truncate">{q.text}</span>
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

      {lesson.modules.filter((m) => m.type === "wall").map((m) => (
        <WallPanel key={m.id} courseId={courseId} module={m} state={state} aiReady={!!connectors.find((c) => c.id === "ai")?.configured} />
      ))}
    </div>
  );
}

function WallPanel({ courseId, module: m, state, aiReady }: { courseId: string; module: Module; state: CourseState; aiReady: boolean }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const { course } = state;
  const posts = state.posts.filter((p) => p.moduleId === m.id);
  const name = (id: string) => (id === "teacher" ? "Teacher" : course.students.find((s) => s.id === id)?.name ?? "");
  const pending = posts.filter((p) => p.approved === false).length;

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
      posts.map((p) => [name(p.studentId), p.anonymous ? "yes" : "", new Date(p.createdAt).toISOString(), p.text, (p.work ?? []).map((a) => a.url).join(" "), String(p.votes?.length ?? 0), String(p.likes?.length ?? 0), (p.comments ?? []).map((c) => `${name(c.from)}: ${c.text}`).join(" | "), p.approved === false ? "no" : "yes"]),
    );
    download(`${m.title} - wall.csv`, toCsv(rows), "text/csv");
  }

  return (
    <section className="card p-5">
      <WallBoard
        courseId={courseId}
        me="teacher"
        teacher
        module={m}
        posts={state.posts}
        students={course.students}
        onChanged={() => {}}
        header={
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex flex-1 items-center gap-2 text-[14px] font-medium">
                <span style={{ color: TYPE_META.wall.tint }}><Icon name="wall" size={14} /></span>
                {m.title}<span className="mono">{posts.length}</span>
                {pending > 0 && <span className="chip h-5 bg-warn/10 text-[11px] text-warn">{pending} waiting for approval</span>}
              </h3>
              <button onClick={() => setPresenting(true)} disabled={!posts.length} className="btn btn-dark press h-8"><Icon name="play" size={12} /> Present</button>
              <button onClick={summarize} disabled={busy || posts.length === 0} className="btn btn-ghost press h-8"><Icon name="sparkles" size={13} /> {busy ? "Reading…" : "Summary"}</button>
              <button onClick={exportCsv} disabled={!posts.length} className="btn btn-ghost press h-8"><Icon name="download" size={13} /> CSV</button>
            </div>
            {!aiReady && !summary && <p className="mt-1 text-[12px] text-ink-3">Summaries need the AI tutor connector, and its key isn’t set on the server yet.</p>}
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
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn btn-ghost press h-8"><Icon name="download" size={13} /> Export <Icon name="chevron" size={12} /></button>
      {open && (
        <div className="pop absolute right-0 top-10 z-20 w-56 rounded-xl border border-line bg-white p-1 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]" onMouseLeave={() => setOpen(false)}>
          {items.map(([label, fn]) => (
            <button key={label} onClick={() => { setOpen(false); fn(); }} className="press block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-lane">{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
