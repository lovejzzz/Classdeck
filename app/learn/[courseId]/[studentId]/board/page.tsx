"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CardFace } from "@/components/cards/CardFace";
import { MediaView } from "@/components/cards/Media";
import { SignInNeeded } from "@/components/SignInNeeded";
import { PlanPanel } from "@/components/student/PlanPanel";
import { FeedbackInbox, Journal, PracticeLog } from "@/components/student/Progress";
import { SkillRadar, teacherLevels } from "@/components/SkillRadar";
import { Avatar, Icon, StatusIcon } from "@/components/Icon";
import { useCourse, useQuery } from "@/lib/client";
import { ago } from "@/lib/time";
import { TYPE_META } from "@/lib/ui";
import type { Module, Progress } from "@/lib/types";

/** A student's personal practice board: their growth, their best work, and every week's practice. */
export default function BoardPage() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>();
  const { state, error, needAuth, refresh } = useCourse(courseId, studentId, 8000);
  const [tab, setTab] = useState<"plan" | "overview" | "practice" | "feedback" | "journal" | "work">(() => {
    const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    return (["plan", "overview", "practice", "feedback", "journal", "work"] as const).find((t) => t === h) ?? "plan";
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
  const checks = all.filter((x) => x.m.type === "selfcheck" && mine[x.m.id]?.ratings && Object.keys(mine[x.m.id].ratings!).length);
  const first = checks[0];
  const last = checks.length > 1 ? checks[checks.length - 1] : undefined;
  const starred = all.filter((x) => mine[x.m.id]?.starred);
  const posts = state.studio.posts.filter((p) => p.studentId === studentId);
  const fbFor = (postId: string) => state.studio.feedback.filter((f) => f.postId === postId);
  const given = state.studio.feedback.filter((f) => f.fromId === studentId).length;
  const name = (id: string) => course.students.find((s) => s.id === id)?.name ?? "Peer";
  const levels = course.levels ?? [];
  const hasContent = (m: Module) => {
    const p = mine[m.id];
    return !!p && (p.status === "done" || !!p.output || !!p.work?.length || posts.some((x) => x.moduleId === m.id));
  };
  const done = all.filter((x) => mine[x.m.id]?.status === "done").length;
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
          {([["plan", "My plan"], ["overview", "Skills"], ["practice", "Practice log"], ["feedback", "Feedback"], ["journal", "Reflections"], ["work", "All work"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); history.replaceState(null, "", `#${k}`); }}
              className={`press -mb-px h-10 flex-none border-b-2 px-3 text-[13.5px] ${tab === k ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>{label}</button>
          ))}
        </div>

        {tab === "plan" && <section className="rise mt-6"><PlanPanel courseId={courseId} studentId={studentId} course={course} plan={state.plans?.[studentId]} onChanged={refresh} /></section>}
        {tab === "practice" && <section className="rise mt-6"><PracticeLog state={state} studentId={studentId} /></section>}
        {tab === "feedback" && <section className="rise mt-6"><FeedbackInbox state={state} studentId={studentId} onChanged={refresh} /></section>}
        {tab === "journal" && <section className="rise mt-6"><Journal state={state} studentId={studentId} /></section>}

        {tab === "overview" && <>
        <section className="rise card mt-6 p-5" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="flex items-center gap-3">
            <h2 className="flex-1 text-[15px] font-medium">Six skill areas</h2>
            {first && (
              <span className="flex items-center gap-3 text-[12px] text-ink-3">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-[#367195]" />{first.w.title.split(" · ")[0]}</span>
                {last && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink" />{last.w.title.split(" · ")[0]}</span>}
              </span>
            )}
          </div>
          {!first ? (
            <p className="mt-3 text-[13px] text-ink-3">Your self-check from Week 0 will show up here.</p>
          ) : (
            <div className="mt-4 grid items-center gap-6 md:grid-cols-[21rem_1fr]">
            <SkillRadar skills={course.skills ?? []} size={220} series={[
              { label: first.w.title.split(" · ")[0], values: mine[first.m.id].ratings!, style: "outline", color: "#367195" },
              ...(last ? [{ label: last.w.title.split(" · ")[0], values: mine[last.m.id].ratings!, style: "fill" as const, color: "#1b1b1a" }] : []),
              { label: "Teacher", values: teacherLevels(mine), style: "dash", color: "#ae502f" },
            ]} />
            <div className="space-y-3">
              {course.skills?.map((s) => {
                const a = mine[first.m.id].ratings![s.id];
                const b = last ? mine[last.m.id].ratings![s.id] : undefined;
                const pos = (n: number) => `${((n - 1) / 3) * 100}%`;
                return (
                  <div key={s.id} className="grid items-center gap-3 sm:grid-cols-[12rem_1fr_3rem]">
                    <span className="text-[13.5px]">{s.name}</span>
                    <div className="relative mx-2 h-6">
                      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-lane" />
                      {[1, 2, 3, 4].map((n) => <span key={n} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-strong" style={{ left: pos(n) }} />)}
                      {a && b && b !== a && <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-ok/60" style={{ left: pos(Math.min(a, b)), width: `${(Math.abs(b - a) / 3) * 100}%` }} />}
                      {a && <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#367195] bg-white" style={{ left: pos(a) }} title={`${first.w.title}: ${levels[a - 1]?.name}`} />}
                      {b && <span className="pop absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: pos(b) }} title={`${last!.w.title}: ${levels[b - 1]?.name}`} />}
                    </div>
                    <span className="text-right font-mono text-[12px] text-ink-2">{b ? `${a}→${b}` : a}</span>
                  </div>
                );
              })}
              <div className="grid gap-3 text-[11px] text-ink-3 sm:grid-cols-[12rem_1fr_3rem]">
                <span />
                <div className="mx-2 flex justify-between">{levels.map((l) => <span key={l.n}>{l.name}</span>)}</div>
              </div>
            </div>
            </div>
          )}
        </section>

        <section className="rise mt-6" style={{ "--i": 3 } as React.CSSProperties}>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-medium"><Icon name="star" size={15} className="text-[#d39b1f]" /> Selected works <span className="mono">{starred.length}/3</span></h2>
          {starred.length === 0 ? (
            <p className="hatch flex h-24 items-center justify-center text-[13px] text-ink-3">Star a card’s work to keep it here. You can keep three.</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {starred.map(({ m }, i) => (
                <div key={m.id} className="pop w-[180px]" style={{ "--i": i, rotate: `${(i - 1) * 2}deg` } as React.CSSProperties}>
                  <div className="h-[252px] shadow-[0_14px_30px_-16px_rgba(20,20,18,0.4)]"><CardFace m={m} status="done" /></div>
                  {mine[m.id].work?.[0] && <div className="mt-2"><MediaView a={mine[m.id].work![0]} /></div>}
                </div>
              ))}
            </div>
          )}
        </section>

        </>}

        {tab === "work" && <section className="mt-6 space-y-6">
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
