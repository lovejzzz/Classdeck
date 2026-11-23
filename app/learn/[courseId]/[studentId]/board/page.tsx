"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MediaView } from "@/components/cards/Media";
import { SignInNeeded } from "@/components/SignInNeeded";
import { FeedbackInbox } from "@/components/student/Progress";
import { Avatar, Icon, StatusIcon } from "@/components/Icon";
import { setPreview, useCourse, useQuery } from "@/lib/client";
import { PreviewBar } from "@/components/student/PreviewBar";
import { ago } from "@/lib/time";
import { suitOfCard } from "@/lib/ui";
import { faceMeta, writesOwn } from "@/lib/kinds";
import { RichText } from "@/components/RichText";
import { recommend } from "@/lib/coach";
import type { Module, Progress } from "@/lib/types";

/** A student's own board: everything they made, and the feedback they got. */
export default function BoardPage() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>();
  // Student View (a teacher testing as this student): every request is a test, nothing is saved.
  // From the router, not window.location: arriving by a link, the address bar still shows the page we came from.
  const testing = useSearchParams().has("preview");
  if (typeof window !== "undefined") setPreview(testing ? studentId : null);
  const { state, error, needAuth, refresh } = useCourse(courseId, studentId, 8000);
  const [tab, setTab] = useState<"work" | "feedback" | "starred" | "next">(() => {
    const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    return (["work", "feedback", "starred", "next"] as const).find((t) => t === h) ?? "work";
  });
  const [now] = useState(() => Date.now());
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
  const starred = all.filter((x) => mine[x.m.id]?.starred);
  // What's due and to revise is on the cards page; here, the suggestions about how to get better.
  const suggestions = recommend(state, studentId, now).filter((r) => ["focus", "mismatch", "feedback", "reflect"].includes(r.kind) || (r.kind === "path" && r.id !== "electives"));
  const cardLink = (mid: string) => `/learn/${courseId}/${studentId}?card=${mid}${testing ? "&preview=1" : ""}`;
  const shown = tab;
  // Quizzes handed in, by their best try.
  const quizScores = all.filter((x) => x.m.type === "quiz" && x.m.questions?.length && mine[x.m.id]?.status === "done").map((x) => (mine[x.m.id].best ?? mine[x.m.id].score ?? 0) / x.m.questions!.length);
  const quizAvg = quizScores.length ? Math.round((100 * quizScores.reduce((a, b) => a + b, 0)) / quizScores.length) : undefined;
  const reviewed = all.filter((x) => mine[x.m.id]?.review).length;
  const takes = all.reduce((n, x) => n + (mine[x.m.id]?.work?.filter((w) => w.kind === "audio" || w.kind === "video").length ?? 0), 0);

  return (
    <div className="flex-1">
      {testing && <div className="no-print"><PreviewBar board courseId={courseId} studentId={studentId} students={course.students} onReset={refresh} /></div>}
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
          {/* A course without recordings or peer feedback shows quiz scores and the teacher's feedback instead. */}
          {(takes || given ? [["Cards done", `${done}`], ["Recordings", `${takes}`], ["Feedback given", `${given}`]] : [["Cards done", `${done}`], ["Quiz average", quizAvg === undefined ? "–" : `${quizAvg}%`], ["Teacher feedback", `${reviewed}`]]).map(([k, v]) => (
            <div key={k} className="card px-4 py-3">
              <div className="text-[12px] text-ink-3">{k}</div>
              <div className="mt-1 font-mono text-[22px]">{v}</div>
            </div>
          ))}
        </div>

        <div className="no-print mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Board sections">
          {([["work", "My work"], ["feedback", "Feedback"], ["starred", "Starred"], ["next", "Suggestions"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={shown === k} onClick={() => { setTab(k); history.replaceState(null, "", `#${k}`); }}
              className={`press -mb-px h-10 flex-none border-b-2 px-3 text-[13.5px] ${shown === k ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>{label}</button>
          ))}
        </div>

        {shown === "feedback" && <section className="rise mt-6"><FeedbackInbox state={state} studentId={studentId} onChanged={refresh} /></section>}

        {/* Cards the student starred to come back to, in course order. */}
        {shown === "starred" && (
          <section className="rise mt-6">
            {starred.length ? (
              <ul className="card divide-y divide-line overflow-hidden">
                {starred.map(({ w, l, m }) => (
                  <li key={m.id}>
                    <Link href={cardLink(m.id)} className="press flex items-center gap-3 px-4 py-3 hover:bg-[#fafaf9]">
                      <Icon name="star" size={14} className="flex-none text-[#d39b1f]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">{m.title}</span>
                        <span className="block text-[12px] text-ink-3">{w.title.split(" · ")[0]} · {l.title}{mine[m.id]?.status === "done" ? " · done" : ""}</span>
                      </span>
                      <Icon name="arrow" size={13} className="flex-none text-ink-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13.5px] text-ink-3">Star a card (the ☆ at the top of it) to find it here later.</p>}
          </section>
        )}

        {/* Suggestions from the student's own data: skills to focus on, where they and their teacher see a skill differently, feedback to try, paths. */}
        {shown === "next" && (
          <section className="rise mt-6">
            {suggestions.length ? (
              <ul className="card divide-y divide-line overflow-hidden">
                {suggestions.map((r) => {
                  const body = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium">{r.title}</span>
                        <span className="block text-[12.5px] leading-snug text-ink-2">{r.text}</span>
                      </span>
                      {r.moduleId && <Icon name="arrow" size={13} className="flex-none text-ink-3" />}
                    </>
                  );
                  return (
                    <li key={r.id}>
                      {r.moduleId ? <Link href={cardLink(r.moduleId)} className="press flex items-center gap-3 px-4 py-3 hover:bg-[#fafaf9]">{body}</Link>
                        : <div className="flex items-center gap-3 px-4 py-3">{body}</div>}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-[13.5px] text-ink-3">Nothing to suggest yet. Suggestions come from your self-checks, your teacher’s feedback and your skills.</p>}
          </section>
        )}

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
                    // What this student posted on a class discussion (a wall), shown like their other work.
                    const wallPosts = state.posts.filter((x) => x.moduleId === m.id && x.studentId === studentId);
                    return (
                      <article key={m.id} className="card p-4">
                        <div className="flex items-center gap-2">
                          <span style={{ color: suitOfCard(m).tint }}><Icon name={faceMeta(m).icon} size={14} /></span>
                          <h3 className="flex-1 text-[14px] font-medium">{m.title}</h3>
                          {m.type === "quiz" && m.questions?.length && p?.status === "done" && <span className="mono text-[12px] text-ink-2">{p.best ?? p.score ?? 0}/{m.questions.length}</span>}
                          {p?.starred && <Icon name="star" size={13} className="text-[#d39b1f]" />}
                          <StatusIcon status={p?.status ?? "todo"} size={13} />
                        </div>
                        {p?.ratings && Object.keys(p.ratings).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {course.skills?.map((s) => p.ratings![s.id] && <span key={s.id} className="chip">{s.name} · {p.ratings![s.id]}</span>)}
                          </div>
                        )}
                        {p?.output && (writesOwn(m) ? <RichText text={p.output} className="mt-2 text-[13.5px] leading-relaxed text-[#353532]" /> : <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#353532]">{p.output}</p>)}
                        {p?.work?.length ? <div className="mt-3 space-y-2">{p.work.map((a) => <div key={a.id}><div className="mb-1 text-[12px] text-ink-3">{a.name}</div><MediaView a={a} /></div>)}</div> : null}
                        {(p?.review?.text || p?.review?.attachments?.length) && (
                          // The teacher's feedback: their words, and anything they attached (a voice note, a drawing, a file).
                          <div className="mt-2 rounded-lg bg-[#287670]/[0.06] px-3 py-2 text-[13px] leading-relaxed">
                            <p className="flex gap-2"><span className="flex-none font-medium text-[#287670]">{p.review!.verdict === "revise" ? "Teacher asked for a revision:" : "Teacher:"}</span><span>{p.review!.text}</span></p>
                            {p.review!.attachments?.map((a) => <div key={a.id} className="mt-2"><MediaView a={a} /></div>)}
                          </div>
                        )}
                        {wallPosts.map((wp) => (
                          <div key={wp.id} className="mt-3 rounded-lg bg-lane p-3">
                            <div className="text-[12px] text-ink-3">Posted to the class · {ago(wp.createdAt)}{wp.comments?.length ? ` · ${wp.comments.length} repl${wp.comments.length === 1 ? "y" : "ies"}` : ""}</div>
                            {wp.text && <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#353532]">{wp.text}</p>}
                            {wp.work?.length ? <div className="mt-2 space-y-2">{wp.work.map((a) => <MediaView key={a.id} a={a} />)}</div> : null}
                          </div>
                        ))}
                        {post && (
                          <div className="mt-3 rounded-lg bg-[#fbf3ee] p-3">
                            <div className="text-[12.5px] font-medium">Posted to your group · {ago(post.updatedAt)}</div>
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
