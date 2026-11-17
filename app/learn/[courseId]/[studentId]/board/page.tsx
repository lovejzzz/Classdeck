"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { MediaView } from "@/components/cards/Media";
import { SignInNeeded } from "@/components/SignInNeeded";
import { FeedbackInbox } from "@/components/student/Progress";
import { Avatar, Icon, StatusIcon } from "@/components/Icon";
import { useCourse, useQuery } from "@/lib/client";
import { ago } from "@/lib/time";
import { TYPE_META } from "@/lib/ui";
import type { Module, Progress } from "@/lib/types";

/** A student's own board: everything they made, and the feedback they got. */
export default function BoardPage() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>();
  const { state, error, needAuth, refresh } = useCourse(courseId, studentId, 8000);
  const [tab, setTab] = useState<"work" | "feedback">(() => {
    const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    return (["work", "feedback"] as const).find((t) => t === h) ?? "work";
  });
  const query = useQuery();
  if (needAuth && !state) return <SignInNeeded who="student" courseId={courseId} next={`/learn/${courseId}/${studentId}/board`} />;
  if (error && !state) return <p className="p-10 text-center text-ink-2">{error}</p>;
  if (!state) return <div className="mx-auto w-full max-w-4xl px-4 py-10"><div className="skeleton h-64" /></div>;

  const { course } = state;
  const student = course.students.find((s) => s.id === studentId);
  if (!student) return <p className="p-10 text-center text-ink-2">There’s no student with that name in this class.</p>;
  const mine: Record<string, Progress> = state.progress[studentId] ?? {};
  const all = course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules.map((m) => ({ w, l, m }))));
  const posts = state.studio.posts.filter((p) => p.studentId === studentId);
  const fbFor = (postId: string) => state.studio.feedback.filter((f) => f.postId === postId);
  const given = state.studio.feedback.filter((f) => f.fromId === studentId).length;
  const name = (id: string) => course.students.find((s) => s.id === id)?.name ?? "Peer";
  const hasContent = (m: Module) => {
    const p = mine[m.id];
    return !!p && (p.status === "done" || !!p.output || !!p.work?.length || posts.some((x) => x.moduleId === m.id));
  };
  const done = all.filter((x) => mine[x.m.id]?.status === "done").length;
  const shown = tab;
  const takes = all.reduce((n, x) => n + (mine[x.m.id]?.work?.filter((w) => w.kind === "audio" || w.kind === "video").length ?? 0), 0);

  return (
    <div className="flex-1">
      <div className="no-print sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-4xl items-center gap-3 px-4 text-[13px]">
          <Link href={`/learn/${courseId}/${studentId}${query?.get("preview") ? "?preview=1" : ""}`} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink"><Icon name="back" size={13} /> Cards</Link>
          <span className="flex-1" />
          <button onClick={() => window.print()} className="btn btn-ghost press h-8"><Icon name="download" size={13} /> Print or save as PDF</button>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <header className="rise flex items-center gap-4">
          <Avatar name={student.name} size={48} />
          <div>
            <div className="eyebrow">{course.title}{course.subtitle ? ` · ${course.subtitle}` : ""}</div>
            <h1 className="text-[26px] font-semibold tracking-tight">{student.name}’s practice board</h1>
          </div>
        </header>

        <div className="rise mt-6 grid grid-cols-3 gap-3" style={{ "--i": 1 } as React.CSSProperties}>
          {[["Cards done", `${done}`], ["Recorded takes", `${takes}`], ["Feedback given", `${given}`]].map(([k, v]) => (
            <div key={k} className="card px-4 py-3">
              <div className="text-[12px] text-ink-3">{k}</div>
              <div className="mt-1 font-mono text-[22px]">{v}</div>
            </div>
          ))}
        </div>

        <div className="no-print mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Board sections">
          {([["work", "My work"], ["feedback", "Feedback"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={shown === k} onClick={() => { setTab(k); history.replaceState(null, "", `#${k}`); }}
              className={`press -mb-px h-10 flex-none border-b-2 px-3 text-[13.5px] ${shown === k ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>{label}</button>
          ))}
        </div>

        {shown === "feedback" && <section className="rise mt-6"><FeedbackInbox state={state} studentId={studentId} onChanged={refresh} /></section>}

        {shown === "work" && <section className="mt-6 space-y-6">
          {course.weeks.map((w) => {
            const items = w.lessons.flatMap((l) => l.modules).filter(hasContent);
            if (!items.length) return null;
            return (
              <div key={w.id} className="rise">
                <h2 className="mb-3 text-[13px] font-medium text-ink-2">{w.title}</h2>
                <div className="space-y-2.5">
                  {items.map((m) => {
                    const p = mine[m.id];
                    const post = posts.find((x) => x.moduleId === m.id);
                    const meta = TYPE_META[m.type];
                    return (
                      <article key={m.id} className="card p-4">
                        <div className="flex items-center gap-2">
                          <span style={{ color: meta.tint }}><Icon name={m.type} size={14} /></span>
                          <h3 className="flex-1 text-[14px] font-medium">{m.title}</h3>
                          {p?.starred && <Icon name="star" size={13} className="text-[#d39b1f]" />}
                          <StatusIcon status={p?.status ?? "todo"} size={13} />
                        </div>
                        {p?.ratings && Object.keys(p.ratings).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {course.skills?.map((s) => p.ratings![s.id] && <span key={s.id} className="chip">{s.name} · {p.ratings![s.id]}</span>)}
                          </div>
                        )}
                        {p?.output && <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#353532]">{p.output}</p>}
                        {p?.work?.length ? <div className="mt-3 space-y-2">{p.work.map((a) => <div key={a.id}><div className="mb-1 text-[12px] text-ink-3">{a.name}</div><MediaView a={a} /></div>)}</div> : null}
                        {post && (
                          <div className="mt-3 rounded-lg bg-[#fbf3ee] p-3">
                            <div className="text-[12.5px] font-medium">Posted to Collab Studio · {ago(post.updatedAt)}</div>
                            {post.question && <p className="mt-1 text-[13px] text-ink-2">Asked: {post.question}</p>}
                            {fbFor(post.id).map((f) => (
                              <div key={f.id} className="mt-2 flex gap-2 text-[13px]">
                                <Avatar name={name(f.fromId)} size={18} />
                                <p className="leading-relaxed"><span className="text-ink-3">{name(f.fromId)}:</span> {f.observed} <span className="text-ink-3">Try next:</span> {f.next}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>}
      </main>
    </div>
  );
}
