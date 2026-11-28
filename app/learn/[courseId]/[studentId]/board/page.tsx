"use client";

import Link from "next/link";
import { WorkText } from "@/components/CodeBlock";
import { countedOf, parentOf } from "@/lib/branching";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MediaView } from "@/components/cards/Media";
import { SignInNeeded } from "@/components/SignInNeeded";
import { FeedbackInbox } from "@/components/student/Progress";
import { Avatar, Icon, StatusIcon } from "@/components/Icon";
import { setPreview, useCourse, useQuery } from "@/lib/client";
import { PreviewBar } from "@/components/student/PreviewBar";
import { CourseRoute } from "@/components/student/CourseRoute";
import { ago } from "@/lib/time";
import { suitOfCard } from "@/lib/ui";
import { faceMeta, kindOf, writesOwn } from "@/lib/kinds";
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
  const router = useRouter();
  const [tab, setTab] = useState<"work" | "feedback" | "starred" | "next">(() => {
    const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    return (["work", "feedback", "starred", "next"] as const).find((t) => t === h) ?? "work";
  });
  const [now] = useState(() => Date.now());
  // A lesson picked on the route: My work shows only that lesson's.
  const [picked, setPicked] = useState<string | null>(null);
  const [showRead, setShowRead] = useState(false);
  const query = useQuery();
  if (needAuth && !state) return <SignInNeeded who="student" courseId={courseId} next={`/learn/${courseId}/${studentId}/board`} />;
  if (error && !state) return <p className="p-10 text-center text-ink-2">{error}</p>;
  // While it loads: the page's own shape (bar, name, progress, tabs), so nothing moves when it arrives.
  if (!state) return (
    <div className="flex-1" aria-busy="true">
      <div className="h-12 border-b border-line" />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center gap-4"><div className="skeleton h-12 w-12 rounded-full" /><div className="space-y-2"><div className="skeleton h-3 w-32" /><div className="skeleton h-7 w-56" /></div></div>
        <div className="skeleton mt-6 h-36" />
        <div className="skeleton mt-8 h-9 w-80" />
      </div>
    </div>
  );

  const { course } = state;
  const student = course.students.find((s) => s.id === studentId);
  if (!student) return <p className="p-10 text-center text-ink-2">There’s no student with that name in this class.</p>;
  const mine: Record<string, Progress> = state.progress[studentId] ?? {};
  const all = course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules.map((m) => ({ w, l, m }))));
  const hasContent = (m: Module) => {
    const p = mine[m.id];
    return !!p && (p.status === "done" || !!p.output || !!p.work?.length || state.posts.some((x) => x.moduleId === m.id && x.studentId === studentId));
  };
  // My work lists what the student made (answers, files, worksheets, posts) and the teacher's feedback on it; cards
  // they only read or answered with a click are one folded line under it.
  const hasWork = (m: Module) => {
    const p = mine[m.id];
    return !!p && (!!p.output?.trim() || !!p.work?.length || !!p.review || (!!p.ratings && Object.keys(p.ratings).length > 0)
      || (kindOf(m) === "worksheet" && p.status === "done") || state.posts.some((x) => x.moduleId === m.id && x.studentId === studentId));
  };
  const done = all.filter((x) => !x.m.optional && mine[x.m.id]?.status === "done").length;
  // Cards that count: an unchosen elective's aren't the student's, and an unpicked set of paths counts once.
  const total = course.weeks.flatMap((w) => w.lessons).filter((l) => !l.elective || l.chosen).reduce((n, l) => n + l.modules.filter((m, i) => !m.optional && (!m.choice || l.modules.findIndex((x) => x.choice?.slot === m.choice!.slot) === i)).length, 0);
  const pickedLesson = picked ? course.weeks.flatMap((w) => w.lessons).find((l) => l.id === picked) : undefined;
  const starred = all.filter((x) => mine[x.m.id]?.starred);
  // What's due and to revise is on the cards page; here, the suggestions about how to get better.
  const suggestions = recommend(state, studentId, now).filter((r) => ["focus", "mismatch", "feedback", "reflect"].includes(r.kind) || (r.kind === "path" && r.id !== "electives"));
  const cardLink = (mid: string) => `/learn/${courseId}/${studentId}?card=${mid}${testing ? "&preview=1" : ""}`;
  const shown = tab;
  // Card groups of questions finished, by the score that counts (best try, or average) (a group inside another is counted in that one).
  const quizScores = course.weeks.flatMap((w) => w.lessons).flatMap((l) => { const up = parentOf(l.modules); return l.modules.filter((g) => g.type === "group" && !up.has(g.id)); })
    .map((g) => countedOf(mine[g.id], g)).filter((x): x is number => x !== undefined);
  const quizAvg = quizScores.length ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length) : undefined;
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
            <h1 className="text-[26px] font-semibold tracking-tight">{student.name}’s board</h1>
          </div>
        </header>

        {/* The certificate of completion: earned (a link to it), or how close they are. */}
        {course.certificate?.mine && (() => {
          const c = course.certificate.mine;
          const pct = c.total ? Math.round((c.done * 100) / c.total) : 0;
          return c.earned ? (
            <Link href={`/learn/${courseId}/${studentId}/certificate${testing ? "?preview=1" : ""}`} className="rise card card-hover press mt-6 flex items-center gap-3 px-4 py-3.5" style={{ "--i": 1 } as React.CSSProperties}>
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-ok/10 text-ok"><Icon name="graduation" size={19} /></span>
              <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold">You’ve earned your certificate</span><span className="block text-[12.5px] text-ink-3">Open it to print or save as a PDF.</span></span>
              <span className="btn btn-dark h-9 flex-none">View certificate</span>
            </Link>
          ) : (
            <div className="rise no-print mt-6 flex items-center gap-3 rounded-xl bg-lane px-4 py-3 text-[13px] text-ink-2" style={{ "--i": 1 } as React.CSSProperties}>
              <Icon name="graduation" size={16} />
              <span className="flex-1">Finish {course.certificate.percent}% of your cards for a certificate of completion. You’re at {pct}%.</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-ok" style={{ width: `${Math.min(100, (pct * 100) / course.certificate.percent)}%` }} /></span>
            </div>
          );
        })()}

        {/* Where they are in the course, lesson by lesson, with the few numbers that matter. */}
        <section className="rise card mt-6 px-4 pt-4" style={{ "--i": 1 } as React.CSSProperties} aria-label="Your progress">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1 text-[12.5px] text-ink-3">
            <span className="font-medium text-ink">Your course</span>
            <span><span className="font-mono text-ink">{done}</span> of {total} cards done</span>
            {quizAvg !== undefined && <span>Quiz average <span className="font-mono text-ink">{quizAvg}%</span></span>}
            {reviewed > 0 && <span><span className="font-mono text-ink">{reviewed}</span> teacher feedback</span>}
            {takes > 0 && <span><span className="font-mono text-ink">{takes}</span> recording{takes === 1 ? "" : "s"}</span>}
          </div>
          <CourseRoute course={course} mine={mine} picked={picked} onPick={(id) => { setPicked(id); if (id) { setTab("work"); history.replaceState(null, "", "#work"); } }} />
        </section>

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
          {pickedLesson && (
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-ink-2">Your work in</span>
              <span className="chip h-7 gap-1.5 bg-white px-2.5 font-medium ring-1 ring-line">{pickedLesson.title}
                <button onClick={() => setPicked(null)} aria-label="Show work from every lesson" className="press -mr-1 grid h-5 w-5 place-items-center rounded-full text-ink-3 hover:bg-lane hover:text-ink"><Icon name="x" size={11} /></button>
              </span>
              {!pickedLesson.modules.some(hasContent) && <span className="text-ink-3">Nothing here yet.</span>}
            </div>
          )}
          {course.weeks.map((w) => {
            const items = w.lessons.filter((l) => !picked || l.id === picked).flatMap((l) => l.modules).filter(hasWork);
            if (!items.length) return null;
            return (
              <div key={w.id} className="rise">
                <h2 className="mb-3 text-[13px] font-medium text-ink-2">{w.title}</h2>
                <div className="space-y-2.5">
                  {items.map((m) => {
                    const p = mine[m.id];
                    // What this student posted on a class discussion (a wall), shown like their other work.
                    const wallPosts = state.posts.filter((x) => x.moduleId === m.id && x.studentId === studentId);
                    return (
                      <article key={m.id} className="card p-4">
                        {/* The card's name (and what they wrote) opens the card; recordings play right here. */}
                        <Link href={cardLink(m.id)} className="group -m-1 flex items-center gap-2 rounded-lg p-1 hover:bg-lane">
                          <span style={{ color: suitOfCard(m).tint }}><Icon name={faceMeta(m).icon} size={14} /></span>
                          <h3 className="flex-1 text-[14px] font-medium group-hover:underline group-hover:underline-offset-2">{m.title}</h3>
                          {p?.starred && <Icon name="star" size={13} className="text-[#d39b1f]" />}
                          <StatusIcon status={p?.status ?? "todo"} size={13} />
                          <Icon name="chevron" size={12} className="-rotate-90 text-ink-3 group-hover:text-ink" />
                        </Link>
                        {p?.ratings && Object.keys(p.ratings).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {course.skills?.map((s) => p.ratings![s.id] && <span key={s.id} className="chip">{s.name} · {p.ratings![s.id]}</span>)}
                          </div>
                        )}
                        {p?.output && (
                          // Not a link itself: what they wrote may hold links of its own, which still open.
                          <div onClick={(e) => { if (!(e.target as HTMLElement).closest("a,[data-code]")) router.push(cardLink(m.id)); }} className="-mx-1 mt-1 cursor-pointer rounded-lg px-1 py-1 hover:bg-lane">
                            {writesOwn(m) ? <RichText text={p.output} className="text-[13.5px] leading-relaxed text-[#353532]" /> : <WorkText text={p.output} className="text-[13.5px] leading-relaxed text-[#353532]" />}
                          </div>
                        )}
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
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!picked && !all.some((x) => hasWork(x.m)) && <p className="text-[13.5px] text-ink-3">What you write, record and post shows here, with your teacher’s feedback.</p>}
          {(() => {
            const read = all.filter((x) => (!picked || x.l.id === picked) && hasContent(x.m) && !hasWork(x.m) && x.m.type !== "group");
            if (!read.length) return null;
            return (
              <div className="rise">
                <button onClick={() => setShowRead((v) => !v)} aria-expanded={showRead} className="press flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
                  Also finished {read.length} card{read.length === 1 ? "" : "s"} <Icon name="chevron" size={12} className={`transition-transform ${showRead ? "rotate-180" : "-rotate-90"}`} />
                </button>
                {showRead && (
                  <ul className="card mt-2 divide-y divide-line overflow-hidden">
                    {read.map(({ w, l, m }) => (
                      <li key={m.id}>
                        <Link href={cardLink(m.id)} className="press flex items-center gap-3 px-4 py-2.5 hover:bg-[#fafaf9]">
                          <span style={{ color: suitOfCard(m).tint }}><Icon name={faceMeta(m).icon} size={13} /></span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px]">{m.title}</span>
                          <span className="flex-none text-[12px] text-ink-3">{w.title.split(" · ")[0]} · {l.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}
        </section>}
      </main>
    </div>
  );
}
