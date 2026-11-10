"use client";

import { useEffect, useState } from "react";
import { op } from "@/lib/client";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { useShortcuts } from "@/lib/shortcuts";
import { toast } from "@/lib/toast";
import { TYPE_META } from "@/lib/ui";
import type { Attachment, Course, CourseState, Lesson, Module, Post, Progress, Student } from "@/lib/types";
import { MediaView } from "../cards/Media";
import { Icon, StatusIcon } from "../Icon";
import { ToolTray } from "../ToolTray";
import { WallBoard } from "../WallBoard";
import { SelfCheck } from "./SelfCheck";
import { Studio } from "./Studio";
import { WorkComposer } from "./WorkComposer";

const WORK_TYPES = new Set(["explore", "practice", "submit", "reflect", "selfcheck"]);

export interface DetailProps {
  courseId: string;
  lessonId: string;
  studentId: string;
  module: Module;
  progress?: Progress;
  posts: Post[];
  students: Student[];
  connectors: ConnectorInfo[];
  big: boolean;
  onClose: (completed?: boolean) => void;
  onChanged: () => void;
  optimistic: (patch: Partial<Progress>) => void;
  course: Course;
  lesson: Lesson;
  weekTitle: string;
  mine: Record<string, Progress>;
  studio: CourseState["studio"];
}

/** What's on the card once it's lifted out of the hand. */
export function CardDetail(p: DetailProps) {
  const { module: m } = p;
  const meta = TYPE_META[m.type];
  const [output, setOutput] = useState(p.progress?.output ?? "");
  const hasOutput = !!meta.outputLabel && m.type !== "selfcheck";
  const showWork = WORK_TYPES.has(m.type) && !m.choice;
  const skills = (m.skills ?? []).map((id) => p.course.skills?.find((s) => s.id === id)?.name).filter(Boolean);
  // The earliest other self-check with ratings, for showing progress.
  const earlier = (() => {
    if (m.type !== "selfcheck") return undefined;
    for (const w of p.course.weeks) for (const l of w.lessons) for (const x of l.modules) {
      if (x.id === m.id) return undefined;
      if (x.type === "selfcheck" && p.mine[x.id]?.ratings && Object.keys(p.mine[x.id].ratings!).length) return { label: `${w.title.split(" · ")[0]} rating`, ratings: p.mine[x.id].ratings! };
    }
  })();
  const lessonWork: { from: string; a: Attachment }[] = p.lesson.modules.flatMap((x) => (x.id === m.id ? [] : (p.mine[x.id]?.work ?? []).map((a) => ({ from: x.title, a }))));
  const starred = !!p.progress?.starred;
  // When this card is one of several paths, the others, side by side.
  const paths = m.choice ? p.lesson.modules.filter((x) => x.choice?.slot === m.choice!.slot) : [];
  useShortcuts([{ keys: "mod+enter", label: "Mark done", run: () => save("done"), enabled: hasOutput && !m.choice }]);

  async function star() {
    const r = await op<{ ok: boolean; error?: string }>(p.courseId, { op: "star", studentId: p.studentId, moduleId: m.id, starred: !starred });
    if (!r.ok) return toast(r.error ?? "Couldn’t star", { icon: "star", tone: "plain" });
    p.optimistic({ starred: !starred });
    p.onChanged();
    toast(starred ? "Removed from your selected works" : "Kept as a selected work", { icon: "star" });
  }


  const body = p.big ? "text-[17px]" : "text-[15px]";

  // Opening a card counts as starting it.
  useEffect(() => {
    if (!p.progress || p.progress.status === "todo") {
      p.optimistic({ status: "doing" });
      op(p.courseId, { op: "setProgress", studentId: p.studentId, moduleId: m.id, status: "doing" }).then(p.onChanged);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);

  // Cards that ask for work can't be marked done empty. Reading cards (optional thoughts) can.
  const needsAnswer = ["explore", "practice", "submit", "reflect"].includes(m.type) && !m.questions?.length;
  const [nudge, setNudge] = useState(0);

  function save(status?: "done") {
    if (status === "done" && needsAnswer && !output.trim() && !(p.progress?.work?.length)) {
      setNudge((n) => n + 1);
      toast("Write your answer or add a take before marking this done", { icon: "practice", tone: "plain" });
      const el = document.getElementById("output");
      el?.focus();
      el?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], { duration: 380, easing: "ease-out" });
      return;
    }
    p.optimistic(status ? { output, status } : { output });
    op(p.courseId, { op: "setProgress", studentId: p.studentId, moduleId: m.id, output, status }).then(p.onChanged);
    if (status) {
      p.onClose(true);
      toast(m.type === "submit" ? `Handed in “${m.title}”` : `Finished “${m.title}”`);
    }
  }

  return (
    <div className={`grid ${m.tools.length && !m.choice ? "md:grid-cols-[1fr_20rem]" : ""}`}>
      <div className="min-w-0 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: meta.tint }}>
              <Icon name={m.type} size={13} strokeWidth={2} /> {meta.name}
              {m.personal && <span className="chip ml-1 h-5 normal-case tracking-normal">For you</span>}
            </div>
            <h2 className={`mt-2 font-semibold tracking-tight ${p.big ? "text-[28px]" : "text-[22px]"}`}>{m.title}</h2>
          </div>
          {!m.choice && (
            <button onClick={star} aria-pressed={starred} aria-label={starred ? "Unstar" : "Keep as a selected work"} title={starred ? "One of your selected works" : "Keep as a selected work"}
              className={`btn press -mt-1 h-9 w-9 justify-center px-0 ${starred ? "text-[#d39b1f]" : "btn-quiet"}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="M11.5 2.8a.6.6 0 0 1 1 0l2.6 5.3 5.8.8a.6.6 0 0 1 .3 1l-4.2 4.1 1 5.8a.6.6 0 0 1-.8.6L12 17.7l-5.2 2.7a.6.6 0 0 1-.8-.6l1-5.8-4.2-4.1a.6.6 0 0 1 .3-1l5.8-.8z" /></svg>
            </button>
          )}
          <button onClick={() => p.onClose()} aria-label="Close" className="btn btn-quiet press -mr-2 -mt-1 h-9 w-9 justify-center px-0" autoFocus>
            <Icon name="x" size={17} />
          </button>
        </div>

        {(m.minutes || m.submitTo || skills.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {m.minutes && <span className="chip"><Icon name="clock" size={12} />{m.minutes} min</span>}
            {m.submitTo && <span className="chip"><Icon name={m.submitTo === "studio" ? "studio" : "board"} size={12} />{m.submitTo === "studio" ? "Hand in to Collab Studio" : "Keep on your personal board"}</span>}
            {skills.map((s) => <span key={s} className="chip bg-[#eef3f7] text-[#3d6f91]">{s}</span>)}
          </div>
        )}

        {m.choice && (
          <section className="pop mt-5" aria-label="Pick your path">
            <div className="mb-3 flex items-center gap-2 text-[13.5px]">
              <Icon name="split" size={15} />
              <span className="font-medium">Pick your path</span>
              <span className="text-ink-3">· same goal, different support. You can do only one.</span>
            </div>
            <div className={`grid gap-3 ${paths.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {paths.map((x) => (
                <div key={x.id} className={`flex flex-col rounded-xl border p-4 ${x.id === m.id ? "border-ink" : "border-line"}`}>
                  <div className="flex items-center gap-2">
                    <span className="chip h-6 bg-[#eef0fb] font-medium text-[#4b56a8]">{x.choice?.variant}</span>
                    {x.choice?.recommended && <span className="chip h-6 bg-ok/10 text-ok"><Icon name="check" size={11} />Your teacher recommends this</span>}
                    <span className="flex-1" />
                    {x.minutes && <span className="mono">{x.minutes} min</span>}
                  </div>
                  <div className="mt-2.5 text-[15px] font-medium">{x.title}</div>
                  <p className="mt-1.5 line-clamp-[8] flex-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">{x.body}</p>
                  <button
                    onClick={async () => {
                      await op(p.courseId, { op: "chooseBranch", studentId: p.studentId, lessonId: p.lessonId, slot: x.choice!.slot, variant: x.choice!.variant });
                      toast(`You chose the ${x.choice!.variant} path`, { icon: "split" });
                      if (x.id !== m.id) p.onClose();
                      p.onChanged();
                    }}
                    className={`btn press mt-4 h-9 justify-center ${x.id === m.id ? "btn-dark" : "btn-ghost"}`}
                  >
                    Choose {x.choice?.variant}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {!m.choice && (m.attachments ?? []).filter((a) => a.kind === "image" || a.kind === "video").map((a) => (
          <div key={a.id} className="mt-5"><MediaView a={a} /></div>
        ))}

        {m.body && !m.choice && <div className={`mt-5 whitespace-pre-wrap leading-[1.7] text-[#353532] ${body}`}>{m.body}</div>}

        {!m.choice && (m.attachments ?? []).some((a) => a.kind === "audio" || a.kind === "file" || a.kind === "link") && (
          <div className="mt-5 space-y-2">
            {(m.attachments ?? []).filter((a) => a.kind === "audio" || a.kind === "file" || a.kind === "link").map((a) => (
              <MediaView key={a.id} a={a} />
            ))}
          </div>
        )}

        {m.criteria && !m.choice && (
          <p className="mt-5 flex gap-2 text-[13px] text-ink-2"><Icon name="check" size={14} className="mt-0.5 flex-none text-ok" /><span><span className="font-medium text-ink">Done when: </span>{m.criteria}</span></p>
        )}

        {m.questions?.length ? <div className="mt-7"><Questions {...p} /></div> : null}
        {m.type === "wall" && (
          <div className="mt-7">
            <WallBoard courseId={p.courseId} me={p.studentId} module={m} posts={p.posts} students={p.students} onChanged={p.onChanged} />
          </div>
        )}

        {m.type === "selfcheck" && !m.choice && p.course.skills && p.course.levels && (
          <div className="mt-7">
            <SelfCheck
              courseId={p.courseId} studentId={p.studentId} moduleId={m.id} skills={p.course.skills} levels={p.course.levels}
              ratings={p.progress?.ratings ?? {}} earlier={earlier} onChanged={p.onChanged} big={p.big}
              onDone={() => save("done")}
            />
          </div>
        )}

        {m.type === "studio" && (
          <div className="mt-7">
            <Studio
              courseId={p.courseId} studentId={p.studentId} module={m} course={p.course} lessonTitle={p.lesson.title} weekTitle={p.weekTitle}
              posts={p.studio.posts} feedback={p.studio.feedback} progress={p.progress} lessonWork={lessonWork} onChanged={p.onChanged}
            />
          </div>
        )}

        {hasOutput && !m.choice && (
          <div className="mt-7">
            <label className="eyebrow mb-1.5 block" htmlFor="output">{meta.outputLabel}</label>
            <textarea
              id="output"
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              onBlur={() => save()}
              rows={p.big ? 4 : 5}
              placeholder="Write here. It saves as you go."
              className={`field resize-y leading-relaxed ${nudge && !output.trim() ? "border-warn/60" : ""} ${p.big ? "text-[16px]" : ""}`}
            />
          </div>
        )}

        {showWork && (
          <div className="mt-5">
            <div className="eyebrow mb-2">
              {(p.progress?.work?.length ?? 0) > 0 ? "Your takes" : "Add a recording, file, or link"}
              {m.submitTo === "personal" ? " · saved to your personal board" : ""}
            </div>
            <WorkComposer courseId={p.courseId} studentId={p.studentId} moduleId={m.id} work={p.progress?.work ?? []} onChanged={p.onChanged} />
          </div>
        )}

        {hasOutput && !m.choice && (
          // Stays in view at the bottom of the card while you scroll through long content.
          <div className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-7 flex flex-wrap items-center gap-3 border-t border-line bg-white/90 px-6 py-3 backdrop-blur sm:-mx-8 sm:-mb-8 sm:px-8">
            <button onClick={() => save("done")} className={`btn btn-dark press ${p.big ? "h-11 px-5 text-[15px]" : "h-9 px-4"}`}>
              <Icon name="check" size={14} /> {p.progress?.status === "done" ? "Save changes" : meta.doneLabel}
            </button>
            {p.progress?.status === "done" ? (
              <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><StatusIcon status="done" size={13} /> Done. You can still edit.</span>
            ) : (
              <span className="text-[12.5px] text-ink-3">Saves as you type · {typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl"}↵ to finish</span>
            )}
          </div>
        )}
      </div>

      {m.tools.length > 0 && !m.choice && (
        <aside className="min-w-0 border-t border-line bg-[#fafaf9] p-5 md:border-l md:border-t-0">
          <ToolTray
            tools={m.tools}
            connectors={p.connectors}
            context={{ courseId: p.courseId, lessonId: p.lessonId, studentId: p.studentId, moduleId: m.id }}
            onUse={hasOutput ? (t) => setOutput((o) => (o ? `${o}\n${t}` : t)) : undefined}
          />
        </aside>
      )}
    </div>
  );
}

function Questions(p: DetailProps) {
  const { module: m, progress } = p;
  const isQuiz = m.type === "quiz";
  const submitted = isQuiz && progress?.status === "done";
  const total = m.questions?.length ?? 0;
  const [pending, setPending] = useState<Record<string, number>>({});
  const answers = { ...(progress?.answers ?? {}), ...pending };
  const results = progress?.results ?? {};

  async function choose(qid: string, choice: number) {
    if (submitted) return;
    setPending((x) => ({ ...x, [qid]: choice }));
    await op(p.courseId, { op: "answer", studentId: p.studentId, moduleId: m.id, qid, choice });
    await p.onChanged();
    setPending((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== qid)));
  }

  async function submit() {
    p.optimistic({ status: "done" });
    const r = await op<{ score?: number }>(p.courseId, { op: "submitQuiz", studentId: p.studentId, moduleId: m.id });
    p.onChanged();
    toast(`Submitted. Score: ${r.score ?? 0}/${total}`, { icon: "quiz" });
  }

  return (
    <div className="space-y-6">
      {m.questions?.map((q, qi) => {
        const picked = answers[q.id];
        const showResult = (!isQuiz || submitted) && !(q.id in pending);
        const right = results[q.id];
        return (
          <fieldset key={q.id}>
            <legend className={`font-medium ${p.big ? "text-[18px]" : "text-[15px]"}`}>
              <span className="mono mr-2">{String(qi + 1).padStart(2, "0")}</span>
              {q.text}
            </legend>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {q.options.map((opt, oi) => {
                const isPicked = picked === oi;
                let tone = "border-line bg-white hover:border-line-strong hover:bg-[#fafaf9]";
                if (isPicked && showResult) tone = right ? "border-ok/50 bg-ok/[0.06]" : "border-bad/45 bg-bad/[0.05] shake";
                else if (isPicked) tone = "border-ink bg-white";
                return (
                  <button
                    key={`${oi}-${isPicked && showResult ? (right ? "y" : "n") : ""}`}
                    onClick={() => choose(q.id, oi)}
                    disabled={submitted}
                    aria-pressed={isPicked}
                    className={`press flex items-center gap-2.5 rounded-[10px] border px-3 text-left ${p.big ? "py-3.5 text-[16px]" : "py-2.5 text-[14px]"} ${tone}`}
                  >
                    <span className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${isPicked ? "border-ink bg-ink" : "border-line-strong"}`}>
                      {isPicked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="flex-1">{opt}</span>
                    {isPicked && showResult && (
                      <span className={`pop ${right ? "text-ok" : "text-bad"}`}><Icon name={right ? "check" : "x"} size={15} strokeWidth={2.2} /></span>
                    )}
                  </button>
                );
              })}
            </div>
            {picked !== undefined && showResult && !right && !isQuiz && (
              <p className="rise mt-1.5 text-[12.5px] text-bad">Not quite. Have another go.</p>
            )}
          </fieldset>
        );
      })}
      {isQuiz && !submitted && (
        <button onClick={submit} disabled={Object.keys(answers).length < total} className="btn btn-dark press h-9 px-4">Submit</button>
      )}
      {(submitted || (!isQuiz && progress?.status === "done")) && (
        <p className="pop flex items-center gap-2 text-[14px]">
          <StatusIcon status="done" size={15} /> Score <span className="font-mono">{progress?.score ?? 0} / {total}</span>
        </p>
      )}
    </div>
  );
}
