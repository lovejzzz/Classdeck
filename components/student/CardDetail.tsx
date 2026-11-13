"use client";

import { useEffect, useRef, useState } from "react";
import { op } from "@/lib/client";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { useShortcuts } from "@/lib/shortcuts";
import { dueInfo, optionOrder, quizSet } from "@/lib/grading";
import { toast } from "@/lib/toast";
import { TYPE_META } from "@/lib/ui";
import type { AnswerValue, Attachment, Course, CourseState, Lesson, Module, Plan, Post, Progress, Student } from "@/lib/types";
import { MediaView } from "../cards/Media";
import { Icon, StatusIcon } from "../Icon";
import { ReadAloud } from "../ReadAloud";
import { teacherLevels } from "../SkillRadar";
import { ToolTray } from "../ToolTray";
import { WallBoard } from "../WallBoard";
import { Onboarding } from "./Onboarding";
import { SelfCheck } from "./SelfCheck";
import { CardForm } from "./CardForm";
import { Checklist, HighlightableText, Playlist, Prompts, promptsToText, Rehearsal, ReviewNote, UpdatesNote } from "./CardExtras";
import { SpeechBuilder } from "./SpeechBuilder";
import { SpeechFlow } from "./SpeechFlow";
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
  plan?: Plan;
}

/** What's on the card once it's lifted out of the hand. */
export function CardDetail(p: DetailProps) {
  const { module: m } = p;
  const meta = TYPE_META[m.type];
  const [output, setOutput] = useState(p.progress?.output ?? "");
  const prompts = m.prompts?.filter((x) => x.trim()) ?? [];
  const [responses, setResponses] = useState<string[]>(p.progress?.responses ?? []);
  const checklist = m.checklist?.filter((x) => x.trim()) ?? [];
  const [checks, setChecks] = useState<number[]>(p.progress?.checks ?? []);
  const [highlights, setHighlights] = useState(p.progress?.highlights ?? []);
  const [watched, setWatched] = useState<string[]>(p.progress?.watched ?? []);
  // The writing last sent to the server (null after a failed save), and whether "Done" is waiting on the server.
  const [savedText, setSavedText] = useState<string | null>(p.progress?.output ?? "");
  // Bumped when a save fails, so unsaved writing is tried again a little later without more typing.
  const [retry, setRetry] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const mustWatch = (m.playlist ?? []).filter((x) => !x.optional);
  const [now] = useState(() => Date.now());
  const due = p.progress?.status === "done" ? undefined : dueInfo(m.due, now);
  const review = p.progress?.review;
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
  const written = prompts.length ? responses.some((r) => r?.trim()) : !!output.trim();
  const shake = (el: Element | null) =>
    el?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], { duration: 380, easing: "ease-out" });

  function toggleCheck(i: number) {
    const next = checks.includes(i) ? checks.filter((x) => x !== i) : [...checks, i].sort((a, b) => a - b);
    setChecks(next);
    p.optimistic({ checks: next });
    op(p.courseId, { op: "setProgress", studentId: p.studentId, moduleId: m.id, checks: next }).then(p.onChanged);
  }

  function save(status?: "done") {
    if (status === "done" && mustWatch.some((x) => !watched.includes(x.id))) {
      toast(`Watch the ${mustWatch.filter((x) => !watched.includes(x.id)).length} remaining video${mustWatch.filter((x) => !watched.includes(x.id)).length === 1 ? "" : "s"} first`, { icon: "video", tone: "plain" });
      const el = document.getElementById("playlist");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      shake(el);
      return;
    }
    if (status === "done" && checklist.length && checks.length < checklist.length) {
      toast(`Tick the last ${checklist.length - checks.length === 1 ? "step" : `${checklist.length - checks.length} steps`} on the checklist first`, { icon: "check", tone: "plain" });
      const el = document.getElementById("checklist");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      shake(el);
      return;
    }
    if (status === "done" && needsAnswer && !written && !(p.progress?.work?.length)) {
      setNudge((n) => n + 1);
      toast("Write your answer or add a take before marking this done", { icon: "practice", tone: "plain" });
      const el = document.getElementById(prompts.length ? `prompt-${Math.max(0, responses.findIndex((r) => !r?.trim()))}` : "output");
      el?.focus();
      shake(el);
      return;
    }
    const text = prompts.length ? promptsToText(prompts, responses) : output;
    const patch = prompts.length ? { output: text, responses } : { output: text };
    p.optimistic(status ? { ...patch, status } : patch);
    setSavedText(text);
    const sent = op<{ ok?: boolean; error?: string }>(p.courseId, { op: "setProgress", studentId: p.studentId, moduleId: m.id, ...patch, status });
    if (!status) {
      void sent.then((r) => { if (r.ok === false) { setSavedText(null); setRetry((n) => n + 1); } else setRetry(0); p.onChanged(); });
      return;
    }
    // Finishing waits for the server: if the save fails the card stays open with the work in it.
    setFinishing(true);
    void sent.then((r) => {
      setFinishing(false);
      p.onChanged();
      if (r.ok === false) {
        setSavedText(null);
        setRetry((n) => n + 1);
        if (r.error && !/signed out|reach the server|server had a problem/i.test(r.error)) toast(r.error, { icon: "x", tone: "plain" });
        return;
      }
      p.onClose(true);
      toast(m.type === "submit" ? `Handed in “${m.title}”` : `Finished “${m.title}”`);
    });
  }

  // Save while typing (a moment after the last keystroke), and warn before leaving with unsaved writing.
  const draftText = prompts.length ? promptsToText(prompts, responses) : output;
  const dirty = hasOutput && !m.choice && draftText !== (savedText ?? p.progress?.output ?? "");
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => save(), retry ? 12000 : 1500);
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { clearTimeout(t); window.removeEventListener("beforeunload", warn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftText, dirty, retry]);

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

        {(m.minutes || m.submitTo || skills.length > 0 || due) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {due && <span className={`chip font-medium ${due.tone === "late" ? "bg-bad/10 text-bad" : due.tone === "soon" ? "bg-warn/10 text-warn" : ""}`}><Icon name="clock" size={12} />{due.label}</span>}
            {m.minutes && <span className="chip"><Icon name="clock" size={12} />{m.minutes} min</span>}
            {m.submitTo && <span className="chip"><Icon name={m.submitTo === "studio" ? "studio" : "board"} size={12} />{m.submitTo === "studio" ? "Hand in to Collab Studio" : "Keep on your personal board"}</span>}
            {skills.map((s) => <span key={s} className="chip bg-[#eef3f7] text-[#3d6f91]">{s}</span>)}
          </div>
        )}

        {review && !m.choice && <ReviewNote review={review} big={p.big} skills={p.course.skills} levels={p.course.levels} />}
        {p.progress?.updates?.length ? <UpdatesNote updates={p.progress.updates} big={p.big} skills={p.course.skills} levels={p.course.levels} /> : null}

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

        {m.body && !m.choice && (
          <>
            <div className="mt-5"><ReadAloud text={`${m.title}. ${m.body}`} big={p.big} /></div>
            <div className="mt-3">
              <HighlightableText text={m.body} highlights={highlights} className={`whitespace-pre-wrap leading-[1.7] text-[#353532] ${body}`}
                onChange={(h) => {
                  setHighlights(h);
                  p.optimistic({ highlights: h });
                  op(p.courseId, { op: "setProgress", studentId: p.studentId, moduleId: m.id, highlights: h }).then(p.onChanged);
                }} />
            </div>
          </>
        )}

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

        {m.timer && !m.choice && m.type !== "builder" ? (
          <div className="mt-6">
            <Rehearsal target={m.timer} takes={p.progress?.rehearsals ?? []} feel={p.progress?.feel} courseId={p.courseId} studentId={p.studentId} moduleId={m.id} onSaved={p.onChanged} big={p.big} />
          </div>
        ) : null}

        {m.playlist?.length && !m.choice ? (
          <div className="mt-6">
            <Playlist items={m.playlist} watched={watched} big={p.big} onChange={(ids) => {
              setWatched(ids);
              p.optimistic({ watched: ids });
              op(p.courseId, { op: "setProgress", studentId: p.studentId, moduleId: m.id, watched: ids }).then(p.onChanged);
            }} />
          </div>
        ) : null}

        {checklist.length > 0 && !m.choice && (
          <div className="mt-6"><Checklist items={checklist} checks={checks} onToggle={toggleCheck} big={p.big} /></div>
        )}

        {m.form?.by === "student" && !m.choice && (
          <div className="mt-7">
            <CardForm key={`${m.id}-${p.progress?.form?.at ?? 0}`} courseId={p.courseId} studentId={p.studentId} m={m} progress={p.progress}
              skills={p.course.skills ?? []} levels={p.course.levels ?? []} big={p.big} onChanged={p.onChanged} />
          </div>
        )}

        {m.questions?.length ? <div className="mt-7"><Questions {...p} /></div> : null}
        {m.type === "wall" && (
          <div className="mt-7">
            <WallBoard courseId={p.courseId} me={p.studentId} module={m} posts={p.posts} students={p.students} onChanged={p.onChanged} />
          </div>
        )}

        {m.type === "selfcheck" && !m.choice && p.course.skills && p.course.levels && (() => {
          const check = (onDone: () => void) => (
            <SelfCheck
              courseId={p.courseId} studentId={p.studentId} moduleId={m.id} skills={p.course.skills!} levels={p.course.levels!}
              ratings={p.progress?.ratings ?? {}} earlier={earlier} onChanged={p.onChanged} big={p.big} teacher={teacherLevels(p.mine)}
              onDone={onDone}
            />
          );
          return (
            <div className="mt-7">
              {m.onboarding
                ? <Onboarding courseId={p.courseId} studentId={p.studentId} plan={p.plan} big={p.big} skills={check} onDone={() => { p.onChanged(); save("done"); }} />
                : check(() => save("done"))}
            </div>
          );
        })()}

        {m.type === "builder" && !m.choice && (
          <div className="mt-7">
            {(() => {
              const Comp = m.flow ? SpeechFlow : SpeechBuilder;
              return <Comp courseId={p.courseId} studentId={p.studentId} module={m} progress={p.progress} onChanged={p.onChanged} big={p.big}
              onFinish={(text) => {
                p.optimistic({ status: "done", output: text });
                op(p.courseId, { op: "setProgress", studentId: p.studentId, moduleId: m.id, status: "done", output: text }).then(p.onChanged);
                p.onClose(true);
                toast(`Finished “${m.title}”`);
              }} />;
            })()}
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
            {prompts.length ? (
              <Prompts prompts={prompts} responses={responses} big={p.big} highlight={!!nudge}
                onChange={(i, v) => setResponses((r) => { const n = [...r]; n[i] = v; return n; })} onBlur={() => save()} />
            ) : (
              <>
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
              </>
            )}
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
            <button onClick={() => save("done")} disabled={finishing} className={`btn btn-dark press ${p.big ? "h-11 px-5 text-[15px]" : "h-9 px-4"}`}>
              <Icon name="check" size={14} /> {p.progress?.status === "done" ? "Save changes" : review?.verdict === "revise" ? "Hand in revision" : meta.doneLabel}
            </button>
            {checklist.length > 0 && p.progress?.status !== "done" && (
              <span className={`mono text-[11.5px] ${checks.length === checklist.length ? "text-ok" : ""}`}>{checks.length}/{checklist.length} steps</span>
            )}
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
  const attempt = progress?.attempt ?? 1;
  const set = quizSet(m, p.studentId, attempt);
  const total = set.length;
  const [pending, setPending] = useState<Record<string, AnswerValue>>({});
  const [drafts, setDrafts] = useState<Record<string, AnswerValue>>({});
  const answers: Record<string, AnswerValue> = { ...(progress?.answers ?? {}), ...pending };
  const results = progress?.results ?? {};
  const reveal = progress?.reveal ?? {};
  const tries = m.attempts ?? 1;
  const timed = isQuiz && !!m.timeLimit;
  const [startedAt, setStartedAt] = useState(progress?.startedAt);
  const started = !timed || !!startedAt || submitted;
  const [now, setNow] = useState(() => Date.now());
  const left = timed && startedAt && !submitted ? Math.max(0, startedAt + m.timeLimit! * 60_000 - now) : null;
  const autoSent = useRef(false);

  useEffect(() => {
    if (!timed || !startedAt || submitted) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [timed, startedAt, submitted]);

  async function answer(qid: string, value: AnswerValue) {
    if (submitted) return;
    const q = set.find((x) => x.id === qid)!;
    setPending((x) => ({ ...x, [qid]: value }));
    const payload = q.kind === "short" ? { text: value } : q.kind === "multi" ? { multi: value } : q.kind === "order" ? { order: value } : { choice: value };
    const r = await op<{ ok: boolean; error?: string }>(p.courseId, { op: "answer", studentId: p.studentId, moduleId: m.id, qid, ...payload });
    if (!r.ok) toast(r.error ?? "Couldn’t save that answer", { icon: "quiz", tone: "plain" });
    await p.onChanged();
    setPending((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== qid)));
  }

  async function submit(auto = false) {
    // A typed short answer that hasn't been sent yet counts too.
    for (const q of set) {
      const d = drafts[q.id];
      if (q.kind === "short" && typeof d === "string" && d.trim() && d.trim() !== answers[q.id]) {
        await op(p.courseId, { op: "answer", studentId: p.studentId, moduleId: m.id, qid: q.id, text: d.trim() });
      }
    }
    const r = await op<{ ok?: boolean; score?: number; error?: string }>(p.courseId, { op: "submitQuiz", studentId: p.studentId, moduleId: m.id });
    if (r.ok === false) {
      p.onChanged();
      if (r.error && !/signed out|reach the server|server had a problem/i.test(r.error)) toast(r.error, { icon: "x", tone: "plain" });
      return;
    }
    p.optimistic({ status: "done" });
    p.onChanged();
    toast(`${auto ? "Time’s up. " : ""}Submitted. Score: ${r.score ?? 0}/${total}`, { icon: "quiz" });
  }

  // When the clock runs out, hand in whatever is answered.
  useEffect(() => {
    if (left === 0 && !autoSent.current) {
      autoSent.current = true;
      submit(true);
    }
  });

  async function start() {
    const r = await op<{ ok: boolean; startedAt?: number }>(p.courseId, { op: "startQuiz", studentId: p.studentId, moduleId: m.id });
    if (r.startedAt) {
      setStartedAt(r.startedAt);
      setNow(Date.now());
      p.optimistic({ startedAt: r.startedAt, status: "doing" });
    }
  }

  async function retake() {
    const r = await op<{ ok: boolean; error?: string }>(p.courseId, { op: "retakeQuiz", studentId: p.studentId, moduleId: m.id });
    if (!r.ok) return toast(r.error ?? "Couldn’t start again", { icon: "quiz", tone: "plain" });
    setDrafts({});
    setStartedAt(undefined);
    autoSent.current = false;
    p.optimistic({ status: "doing", answers: {}, results: {}, score: undefined, reveal: {}, attempt: attempt + 1, startedAt: undefined });
    p.onChanged();
    toast(`Try ${attempt + 1} of ${tries}. Your best score is kept.`, { icon: "reset" });
  }

  const has = (v: AnswerValue | undefined) => v !== undefined && (Array.isArray(v) ? true : String(v).trim() !== "");
  const answeredCount = set.filter((q) => has(answers[q.id])).length;
  const optBtn = (on: boolean, extra = "") => `press flex items-center gap-2.5 rounded-[10px] border px-3 text-left ${p.big ? "py-3.5 text-[16px]" : "py-2.5 text-[14px]"} ${extra || (on ? "border-ink bg-white" : "border-line bg-white hover:border-line-strong hover:bg-[#fafaf9]")}`;

  if (!started) {
    return (
      <div className="rounded-xl border border-line p-5 text-center">
        <Icon name="timer" size={22} className="mx-auto text-ink-2" />
        <p className="mt-2 text-[15px] font-medium">This quiz is timed: {m.timeLimit} minute{m.timeLimit === 1 ? "" : "s"}</p>
        <p className="mt-1 text-[13px] text-ink-3">{total} question{total === 1 ? "" : "s"}{tries > 1 ? ` · ${tries} tries, best score counts` : ""}. The clock starts when you press Start and doesn’t stop if you close the card.</p>
        <button onClick={start} className="btn btn-dark press mt-4 h-9 px-5">Start</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(left !== null || (isQuiz && (tries > 1 || (progress?.best ?? 0) > 0 || m.pick))) && (
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-lg bg-white/90 px-1 py-1.5 text-[12.5px] text-ink-3 backdrop-blur">
          <Icon name="quiz" size={13} />
          {tries > 1 && <span>Try {Math.min(attempt, tries)} of {tries}</span>}
          {m.pick && m.questions && m.pick < m.questions.length && <span>· {total} drawn from {m.questions.length}</span>}
          {progress?.best !== undefined && <span>· best score <span className="font-mono text-ink">{progress.best}/{total}</span></span>}
          <span className="flex-1" />
          {left !== null && (
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[13px] ${left < 60_000 ? "bg-bad/10 text-bad" : "bg-lane text-ink"}`} role="timer" aria-label="Time left">
              <Icon name="timer" size={12} />{Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}
            </span>
          )}
        </div>
      )}
      {set.map((q, qi) => {
        const picked = answers[q.id];
        const showResult = (!isQuiz || submitted) && !(q.id in pending) && has(picked);
        const right = results[q.id];
        const rv = reveal[q.id];
        const locked = submitted || (!isQuiz && right === true);
        const order = optionOrder(q, p.studentId, !!m.shuffle);
        return (
          <fieldset key={q.id}>
            <legend className={`font-medium ${p.big ? "text-[18px]" : "text-[15px]"}`}>
              <span className="mono mr-2">{String(qi + 1).padStart(2, "0")}</span>
              {q.text}
              {q.kind === "multi" && <span className="ml-2 text-[12px] font-normal text-ink-3">Choose all that apply</span>}
              {q.kind === "order" && <span className="ml-2 text-[12px] font-normal text-ink-3">Put these in order</span>}
            </legend>

            {q.kind === "short" ? (() => {
              const draft = String(drafts[q.id] ?? (typeof picked === "string" ? picked : ""));
              return (
                <form className="mt-2.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) answer(q.id, draft.trim()); }}>
                  <input value={draft} disabled={locked}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    onBlur={() => isQuiz && draft.trim() && draft.trim() !== picked && answer(q.id, draft.trim())}
                    placeholder="Type your answer" aria-label={`Answer to question ${qi + 1}`}
                    className={`field ${p.big ? "h-12 text-[16px]" : "h-10"} ${showResult ? (right ? "border-ok/50 bg-ok/[0.04]" : "border-bad/45") : ""}`} />
                  {!isQuiz && right !== true && <button className="btn btn-ghost press h-10 flex-none" disabled={!draft.trim()}>Check</button>}
                  {showResult && <span className={`pop flex items-center ${right ? "text-ok" : "text-bad"}`}><Icon name={right ? "check" : "x"} size={16} strokeWidth={2.2} /></span>}
                </form>
              );
            })() : q.kind === "multi" ? (() => {
              const cur = (drafts[q.id] ?? picked ?? []) as number[];
              const key = (rv?.answerSet ?? []) as number[];
              const toggle = (oi: number) => {
                const next = cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi];
                setDrafts((d) => ({ ...d, [q.id]: next }));
                if (isQuiz) answer(q.id, next);
              };
              return (
                <div className="mt-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {order.map((oi) => {
                      const on = cur.includes(oi);
                      const tone = submitted && key.length ? (key.includes(oi) ? (on ? "border-ok/50 bg-ok/[0.06]" : "border-dashed border-ok/60 bg-white") : on ? "border-bad/45 bg-bad/[0.05]" : "") : "";
                      return (
                        <button key={oi} onClick={() => !locked && toggle(oi)} disabled={locked} aria-pressed={on} className={optBtn(on, tone)}>
                          <span className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${on ? "border-ink bg-ink text-white" : "border-line-strong"}`}>{on && <Icon name="check" size={10} strokeWidth={3} />}</span>
                          <span className="flex-1">{q.options[oi]}</span>
                        </button>
                      );
                    })}
                  </div>
                  {!isQuiz && right !== true && (
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => answer(q.id, cur)} disabled={!cur.length} className="btn btn-ghost press h-8">Check</button>
                      {showResult && <span className={`pop flex items-center gap-1 text-[13px] ${right ? "text-ok" : "text-bad"}`}><Icon name={right ? "check" : "x"} size={14} strokeWidth={2.2} />{right ? "Right" : ""}</span>}
                    </div>
                  )}
                  {!isQuiz && right === true && <p className="pop mt-1.5 flex items-center gap-1 text-[13px] text-ok"><Icon name="check" size={14} strokeWidth={2.2} /> Right</p>}
                </div>
              );
            })() : q.kind === "order" ? (() => {
              const cur = ((drafts[q.id] ?? picked) as string[] | undefined) ?? order.map((oi) => q.options[oi]);
              const move = (i: number, d: number) => {
                const j = i + d;
                if (j < 0 || j >= cur.length || locked) return;
                const next = [...cur];
                [next[i], next[j]] = [next[j], next[i]];
                setDrafts((x) => ({ ...x, [q.id]: next }));
              };
              const correct = rv?.order;
              return (
                <div className="mt-2.5">
                  <ol className="space-y-1.5">
                    {cur.map((t, i) => (
                      <li key={t} className={`flex items-center gap-2 rounded-[10px] border bg-white px-2 py-1.5 transition-transform ${submitted && correct ? (correct[i] === t ? "border-ok/50" : "border-bad/45") : "border-line"} ${p.big ? "text-[16px]" : "text-[14px]"}`}>
                        <span className="mono w-5 text-center">{i + 1}</span>
                        <span className="flex-1">{t}</span>
                        {!locked && (
                          <span className="flex">
                            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move “${t}” up`} className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-lane disabled:opacity-25"><Icon name="chevron" size={14} className="rotate-180" /></button>
                            <button onClick={() => move(i, 1)} disabled={i === cur.length - 1} aria-label={`Move “${t}” down`} className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-lane disabled:opacity-25"><Icon name="chevron" size={14} /></button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                  {!locked && (
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => answer(q.id, cur)} className="btn btn-ghost press h-8">{isQuiz ? (has(picked) ? "Update order" : "Lock in this order") : "Check"}</button>
                      {isQuiz && has(picked) && <span className="text-[12.5px] text-ink-3">Saved</span>}
                      {showResult && !isQuiz && <span className={`pop flex items-center gap-1 text-[13px] ${right ? "text-ok" : "text-bad"}`}><Icon name={right ? "check" : "x"} size={14} strokeWidth={2.2} /></span>}
                    </div>
                  )}
                  {submitted && correct && !right && <p className="rise mt-1.5 text-[12.5px] text-ink-2">Correct order: {correct.join(" → ")}</p>}
                </div>
              );
            })() : (
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {order.map((oi) => {
                  const opt = q.options[oi];
                  const isPicked = picked === oi;
                  const isKey = submitted && rv?.answer === oi && !isPicked;
                  let tone = "";
                  if (isPicked && showResult) tone = right ? "border-ok/50 bg-ok/[0.06]" : "border-bad/45 bg-bad/[0.05] shake";
                  else if (isKey) tone = "border-dashed border-ok/60 bg-white";
                  return (
                    <button key={`${oi}-${isPicked && showResult ? (right ? "y" : "n") : ""}`} onClick={() => answer(q.id, oi)} disabled={locked} aria-pressed={isPicked} className={optBtn(isPicked, tone)}>
                      <span className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${isPicked ? "border-ink bg-ink" : "border-line-strong"}`}>
                        {isPicked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {isPicked && showResult && <span className={`pop ${right ? "text-ok" : "text-bad"}`}><Icon name={right ? "check" : "x"} size={15} strokeWidth={2.2} /></span>}
                      {isKey && <span className="text-[11.5px] text-ok">Answer</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {showResult && !right && !isQuiz && (!q.kind || q.kind === "choice" || q.kind === "short") && (
              <p className="rise mt-1.5 text-[12.5px] text-bad">Not quite. Have another go.</p>
            )}
            {submitted && q.kind === "short" && !right && rv?.accept && (
              <p className="rise mt-1.5 text-[12.5px] text-ink-2">Accepted answer: <span className="font-medium text-ok">{rv.accept}</span></p>
            )}
            {(showResult || submitted) && rv?.explain && (
              <p className="rise mt-2 flex gap-2 rounded-lg bg-lane px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                <Icon name="sparkles" size={13} className="mt-[3px] flex-none text-ink-3" /><span><span className="font-medium text-ink">Why: </span>{rv.explain}</span>
              </p>
            )}
          </fieldset>
        );
      })}
      {isQuiz && !submitted && (
        <div className="flex items-center gap-3">
          <button onClick={() => submit()} disabled={answeredCount < total} className="btn btn-dark press h-9 px-4">Submit</button>
          <span className="mono text-[11.5px]">{answeredCount}/{total} answered</span>
        </div>
      )}
      {(submitted || (!isQuiz && progress?.status === "done")) && (
        <div className="pop flex flex-wrap items-center gap-3 text-[14px]">
          <span className="flex items-center gap-2"><StatusIcon status="done" size={15} /> Score <span className="font-mono">{progress?.score ?? 0} / {total}</span></span>
          {submitted && attempt < tries && (progress?.score ?? 0) < total && (
            <button onClick={retake} className="btn btn-ghost press h-8"><Icon name="reset" size={13} /> Try again ({tries - attempt} left)</button>
          )}
        </div>
      )}
    </div>
  );
}
