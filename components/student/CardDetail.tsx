"use client";

import { MathText, hasMath, plainMath } from "../MathText";
import { useEffect, useRef, useState } from "react";
import { EarlierFeedback } from "../FeedbackHistory";
import { op } from "@/lib/client";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { useShortcuts } from "@/lib/shortcuts";
import { asked, dueInfo, optionOrder } from "@/lib/grading";
import { toast } from "@/lib/toast";
import { TYPE_META, suitOfCard } from "@/lib/ui";
import { faceMeta, familyOf, isPoll, kindOf, sharedDoc, writesOwn } from "@/lib/kinds";
import { docKey } from "@/lib/shared";
import { SharedDoc } from "../SharedDoc";
import { RichBodyEditor } from "../teacher/RichBodyEditor";
import { DocNotes } from "./DocNotes";
import type { AnswerValue, Attachment, Course, Lesson, Module, Post, Progress, Student } from "@/lib/types";
import { MediaView } from "../cards/Media";
import { Icon, StatusIcon } from "../Icon";
import { ReadAloud } from "../ReadAloud";
import { ToolTray } from "../ToolTray";
import { WallBoard } from "../WallBoard";
import { CardForm } from "./CardForm";
import { Checklist, HighlightableText, Playlist, Prompts, promptsToText, ReviewNote, UpdatesNote } from "./CardExtras";
import { RichText } from "../RichText";
import { isRich, plainText } from "@/lib/markdown";
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
  /** The card is one of a card group's: where it sits, and the group's next card to go to (none on the last). */
  group?: { title: string; index: number; total: number; next?: { title: string; go: () => void }; score?: number; opened?: string[]; part?: { title: string; score?: number; opened: string[] }; parts?: { title: string; score: number }[];
    /** A group with tries: which try this is, how many, the best score so far, and how to start the next. */
    tries?: { attempt: number; attempts: number; best?: number; retake?: () => void } };
}

/** What's on the card once it's lifted out of the hand. */
export function CardDetail(p: DetailProps) {
  const { module: m } = p;
  const meta = TYPE_META[m.type];
  // A Text card each student writes in: their own copy, starting from the teacher's text.
  const personal = writesOwn(m);
  // A Text card a group (or the class) writes in together: one shared copy, live.
  const shared = sharedDoc(m);
  const sharedKey = shared ? docKey(p.course, m, p.studentId) : null;
  // A group copy whose groups come from a sign-up poll: that poll (to pick a group on, before writing).
  const pollFor = m.grouping?.startsWith("gs-") ? p.course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules)).find((x) => `gs-${x.id}` === m.grouping && x.signup) : undefined;
  const [output, setOutput] = useState(p.progress?.output ?? (personal ? m.body : ""));
  const prompts = m.prompts?.filter((x) => x.trim()) ?? [];
  const [responses, setResponses] = useState<string[]>(p.progress?.responses ?? []);
  const checklist = m.checklist?.filter((x) => x.trim()) ?? [];
  const [checks, setChecks] = useState<number[]>(p.progress?.checks ?? []);
  const [highlights, setHighlights] = useState(p.progress?.highlights ?? []);
  const [watched, setWatched] = useState<string[]>(p.progress?.watched ?? []);
  // The writing last sent to the server (null after a failed save), and whether "Done" is waiting on the server.
  const [savedText, setSavedText] = useState<string | null>(p.progress?.output ?? (personal ? m.body : ""));
  // Saves of this card's writing still on their way to the server.
  const [inFlight, setInFlight] = useState(0);
  // Bumped when a save fails, so unsaved writing is tried again a little later without more typing.
  const [retry, setRetry] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const mustWatch = (m.playlist ?? []).filter((x) => !x.optional);
  const [now] = useState(() => Date.now());
  const due = p.progress?.status === "done" ? undefined : dueInfo(m.due, now);
  const review = p.progress?.review;
  const kind = kindOf(m);
  // Only a Q&A card has a box to write in. A Content card is to take in (it gets a plain Done button), and a Choice
  // card is done once it's answered.
  const hasOutput = (!!meta.outputLabel && kind === "answer") || personal;
  const doneOnly = familyOf(kind) === "content" && !personal && !shared;
  // A vote or a multiple-choice answer is the whole response: no recording or file box under it.
  const showWork = WORK_TYPES.has(m.type) && !m.choice && kind !== "choice";
  const skills = (m.skills ?? []).map((id) => p.course.skills?.find((s) => s.id === id)?.name).filter(Boolean);
  const starred = !!p.progress?.starred;
  // When this card is one of several paths, the others, side by side.
  const paths = m.choice ? p.lesson.modules.filter((x) => x.choice?.slot === m.choice!.slot) : [];
  useShortcuts([{ keys: "mod+enter", label: "Mark done", run: () => save("done"), enabled: hasOutput && !m.choice }]);

  async function star() {
    const r = await op<{ ok: boolean; error?: string }>(p.courseId, { op: "star", studentId: p.studentId, moduleId: m.id, starred: !starred });
    if (!r.ok) return toast(r.error ?? "Couldn’t star", { icon: "star", tone: "plain" });
    p.optimistic({ starred: !starred });
    p.onChanged();
    toast(starred ? "Unstarred" : "Starred: find it under Starred at the top of your board", { icon: "star" });
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

  async function handInShared() {
    setFinishing(true);
    const r = await op<{ ok?: boolean; error?: string; handedIn?: number }>(p.courseId, { op: "handInShared", studentId: p.studentId, moduleId: m.id });
    setFinishing(false);
    if (r.ok === false) return toast(r.error ?? "Couldn’t hand it in", { icon: "x", tone: "plain" });
    p.optimistic({ status: "done" });
    await p.onChanged();
    p.onClose(true);
    toast(m.writers === "group" && (r.handedIn ?? 1) > 1 ? `Handed in “${m.title}” for your group` : m.writers === "class" ? `Done: “${m.title}”` : `Handed in “${m.title}”`);
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
    setInFlight((n) => n + 1);
    const sent = op<{ ok?: boolean; error?: string }>(p.courseId, { op: "setProgress", studentId: p.studentId, moduleId: m.id, ...patch, status });
    void sent.finally(() => setInFlight((n) => n - 1));
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
      toast(m.type === "submit" || personal ? `Handed in “${m.title}”` : `Finished “${m.title}”`);
    });
  }

  // Save while typing (a moment after the last keystroke), and warn before leaving with unsaved writing.
  const draftText = prompts.length ? promptsToText(prompts, responses) : output;
  // The same card open in two tabs: writing saved in the other one shows here too, as long as nothing is waiting to
  // be saved here (so an old copy here can't be typed on and saved over the newer one). Not while this tab's own save
  // is on its way, when a copy read a moment earlier may still arrive.
  const serverText = p.progress?.output;
  useEffect(() => {
    if (serverText === undefined || serverText === savedText || inFlight > 0) return;
    if (draftText !== (savedText ?? "")) return;
    // Not while they're writing in it here: an older copy read a moment before their last save could still arrive.
    const el = typeof document !== "undefined" ? document.activeElement : null;
    if (el && (el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable) && document.visibilityState === "visible") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- taking in a newer copy from the server
    setOutput(serverText);
    if (p.progress?.responses) setResponses(p.progress.responses);
    setSavedText(serverText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverText]);
  const dirty = hasOutput && !m.choice && draftText !== (savedText ?? p.progress?.output ?? (personal ? m.body : ""));
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => save(), retry ? 12000 : 1500);
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { clearTimeout(t); window.removeEventListener("beforeunload", warn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftText, dirty, retry]);

  // Students only see tools that are ready to use; one that still needs a key from the site owner is left out.
  // Tools on cards were cut in the simplification; any still saved on a card stay out of sight.
  const tools: typeof m.tools = [];

  return (
    <div className={`grid ${tools.length && !m.choice ? "md:grid-cols-[1fr_20rem]" : ""}`}>
      <div className="min-w-0 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: suitOfCard(m).tint }}>
              <Icon name={faceMeta(m).icon} size={13} strokeWidth={2} /> {suitOfCard(m).name}<span className="font-normal normal-case tracking-normal text-ink-3">· {faceMeta(m).name}</span>
              {m.personal && <span className="chip ml-1 h-5 normal-case tracking-normal">For you</span>}
            </div>
            <h2 className={`mt-2 font-semibold tracking-tight ${p.big ? "text-[28px]" : "text-[22px]"}`}>{m.title}</h2>
          </div>
          {!m.choice && (
            <button onClick={star} aria-pressed={starred} aria-label={starred ? "Unstar" : "Star this card"} title={starred ? "Starred: it's under Starred on your board" : "Star it to find it later under Starred"}
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
            {m.submitTo === "personal" && <span className="chip"><Icon name="board" size={12} />Keep on your personal board</span>}
            {skills.map((s) => <span key={s} className="chip bg-[#eef3f7] text-[#3d6f91]">{s}</span>)}
          </div>
        )}

        {review && !m.choice && <ReviewNote review={review} big={p.big} skills={p.course.skills} levels={p.course.levels} />}
        {!m.choice && <EarlierFeedback earlier={p.progress?.earlier} />}
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
                  <p className="mt-1.5 line-clamp-[8] flex-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">{plainText(x.body)}</p>
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

        {m.body && !m.choice && !personal && !shared && (
          <>
            <div className="mt-5"><ReadAloud text={`${m.title}. ${plainMath(plainText(m.body))}`} big={p.big} /></div>
            {/* data-prompt: words selected here can be quoted in a discussion post or reply. */}
            <div className="mt-3" data-prompt>
              {/* Math is typeset; highlighting works on plain text, so a card with math shows it without highlights. */}
              {isRich(m.body) ? <RichText text={m.body} className={`leading-[1.7] text-[#353532] ${body}`} /> : hasMath(m.body) ? <div className={`whitespace-pre-wrap leading-[1.7] text-[#353532] ${body}`}><MathText text={m.body} /></div> : <HighlightableText text={m.body} highlights={highlights} className={`whitespace-pre-wrap leading-[1.7] text-[#353532] ${body}`}
                onChange={(h) => {
                  setHighlights(h);
                  p.optimistic({ highlights: h });
                  op(p.courseId, { op: "setProgress", studentId: p.studentId, moduleId: m.id, highlights: h }).then(p.onChanged);
                }} />}
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



        {/* Groups made by a sign-up poll the student hasn't answered yet: they pick a group first, so what they write
            goes in their group's copy (not one of their own, left behind when they join). */}
        {shared && sharedKey?.includes(":g:solo-") && pollFor && (
          <p className="mt-6 rounded-xl bg-lane px-4 py-3 text-[13.5px] text-ink-2">
            You write this with your group. Pick a group on <span className="font-medium text-ink">“{pollFor.title}”</span> first, then come back to write together.
          </p>
        )}
        {shared && sharedKey && !m.choice && !(sharedKey.includes(":g:solo-") && pollFor) && (
          <div className="mt-6">
            <div className="eyebrow mb-1.5">{m.writers === "class" ? "The class’s copy · everyone writes in it" : "Your group’s copy · you write in it together"}</div>
            <SharedDoc courseId={p.courseId} docKey={sharedKey} template={m.body} name={p.course.students.find((x) => x.id === p.studentId)?.name ?? "A student"} />
            <DocNotes notes={p.progress?.notes ?? []} me="student" courseId={p.courseId} studentId={p.studentId} moduleId={m.id} onChanged={p.onChanged} names={Object.fromEntries(p.students.map((x) => [x.id, x.name]))} />
          </div>
        )}

        {personal && !m.choice && (
          <div className="mt-6">
            <div className="eyebrow mb-1.5">Your copy · it saves as you go</div>
            <RichBodyEditor value={output} onChange={setOutput} placeholder="Write here." label={`Your copy of ${m.title}`} />
            <DocNotes notes={p.progress?.notes ?? []} me="student" courseId={p.courseId} studentId={p.studentId} moduleId={m.id} onChanged={p.onChanged} names={Object.fromEntries(p.students.map((x) => [x.id, x.name]))} />
          </div>
        )}

        {hasOutput && !m.choice && !personal && (
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
              {(p.progress?.work?.length ?? 0) > 0 ? "Your files" : "Add a recording, file, or link"}
              {m.submitTo === "personal" ? " · saved to your personal board" : ""}
            </div>
            <WorkComposer courseId={p.courseId} studentId={p.studentId} moduleId={m.id} work={p.progress?.work ?? []} onChanged={p.onChanged} />
          </div>
        )}

        {(hasOutput || doneOnly || shared) && !m.choice && !(sharedKey?.includes(":g:solo-") && pollFor) && (
          // Stays in view at the bottom of the card while you scroll through long content.
          <div className="sticky -bottom-3 z-10 -mx-6 -mb-6 mt-7 flex flex-wrap items-center gap-3 rounded-b-[inherit] border-t border-line bg-white/95 px-6 pb-6 pt-3 backdrop-blur sm:-bottom-8 sm:-mx-8 sm:-mb-8 sm:px-8 sm:pb-11">
            <button onClick={() => (shared ? void handInShared() : save("done"))} disabled={finishing} className={`btn btn-dark press ${p.big ? "h-11 px-5 text-[15px]" : "h-9 px-4"}`}>
              <Icon name="check" size={14} /> {doneOnly ? (p.progress?.status === "done" ? "Done" : meta.doneLabel) : p.progress?.status === "done" ? "Save changes" : review?.verdict === "revise" ? "Hand in revision" : personal || (shared && m.writers === "group") ? "Hand in" : shared ? "Done" : meta.doneLabel}
            </button>
            {p.progress?.status !== "done" && (
              // Not now: close it without finishing (anything written is kept). It stays in your hand for later.
              <button onClick={() => { if (hasOutput) save(); p.onClose(false); }} className={`btn btn-ghost press ${p.big ? "h-11 px-5 text-[15px]" : "h-9 px-4"}`} title="Close it for now; it stays in your hand, not done">
                <Icon name="clock" size={14} /> Later
              </button>
            )}
            {checklist.length > 0 && p.progress?.status !== "done" && (
              <span className={`mono text-[11.5px] ${checks.length === checklist.length ? "text-ok" : ""}`}>{checks.length}/{checklist.length} steps</span>
            )}
            {p.progress?.status === "done" ? (
              doneOnly ? null : <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><StatusIcon status="done" size={13} /> Done. You can still edit.</span>
            ) : doneOnly ? null : (
              <span className="text-[12.5px] text-ink-3">Saves as you type<span className="[@media(pointer:coarse)]:hidden"> · {typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl"}↵ to finish</span></span>
            )}
          </div>
        )}
        {p.group && (
          // A card group's cards are answered one after another: say where this one is, and go on to the next.
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <span className="flex flex-1 items-center gap-1.5 text-[12.5px] text-ink-3"><Icon name="layers" size={13} />{p.group.title}{p.group.part && <> › {p.group.part.title}</>} · {p.group.index} of {p.group.total}{p.group.tries && p.group.tries.attempts > 1 ? ` · try ${p.group.tries.attempt} of ${p.group.tries.attempts}` : ""}</span>
            {p.group.part?.score !== undefined && (p.group.next || p.group.score === undefined) && (
              // The last card of a group inside the group: that group's own score.
              <span className="basis-full text-[13px] text-ink-2 sm:order-first">
                <span className="font-medium text-ink">{p.group.part.title} score {p.group.part.score}%.</span>{" "}
                {p.group.part.opened.length ? <>It opened {p.group.part.opened.map((t, i) => <span key={t}>{i ? ", " : ""}“{t}”</span>)} on your board.</> : null}
              </span>
            )}
            {!p.group.next && p.group.score !== undefined && (
              <span className="basis-full text-[13px] text-ink-2 sm:order-first">
                <span className="font-medium text-ink">Group score {p.group.score}%.</span>{" "}
                {p.group.tries && p.group.tries.attempts > 1 && p.group.tries.best !== undefined && p.group.tries.best !== p.group.score ? <span className="text-ink-3">Your best is {p.group.tries.best}%, and that’s the one that counts. </span> : null}
                {p.group.parts?.length ? <span className="text-ink-3">({p.group.parts.map((x) => `${x.title} ${x.score}%`).join(" · ")}) </span> : null}
                {(() => { const all = [...new Set([...(p.group.part?.opened ?? []), ...(p.group.opened ?? [])])]; return all.length ? <>It opened {all.map((t, i) => <span key={t}>{i ? ", " : ""}“{t}”</span>)} on your board.</> : "Nothing extra to do: on to the next card."; })()}
              </span>
            )}
            {!p.group.next && p.group.score !== undefined && p.group.tries?.retake && p.group.tries.attempt < p.group.tries.attempts && (
              <span className="flex basis-full flex-wrap items-center gap-2 sm:order-first">
                <button onClick={p.group.tries.retake} className="btn btn-ghost press h-8"><Icon name="reset" size={13} /> Try again ({p.group.tries.attempts - p.group.tries.attempt} left)</button>
                <span className="text-[12.5px] text-ink-3">Your best try counts. The answers to the ones you missed show after your last try.</span>
              </span>
            )}
            {p.group.next ? (
              <button onClick={p.group.next.go} className="btn btn-dark press h-9 px-4">Next: {p.group.next.title} <Icon name="arrow" size={13} /></button>
            ) : (
              <button onClick={() => p.onClose(p.progress?.status === "done")} className="btn btn-ghost press h-9 px-4">Finish the group</button>
            )}
          </div>
        )}
      </div>

      {tools.length > 0 && !m.choice && (
        <aside className="min-w-0 border-t border-line bg-[#fafaf9] p-5 md:border-l md:border-t-0">
          <ToolTray
            tools={tools}
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
  const set = asked(m);
  const total = set.length;
  // In a card group with tries, each question is answered once a try; the answers to missed ones show after the last.
  const tried = (p.group?.tries?.attempts ?? 1) > 1;
  const [pending, setPending] = useState<Record<string, AnswerValue>>({});
  const [drafts, setDrafts] = useState<Record<string, AnswerValue>>({});
  // The cards each question's answer just opened (said on the card, so they're easy to find, even after a wrong answer).
  const [opened, setOpened] = useState<Record<string, { id: string; title: string }[]>>({});
  const answers: Record<string, AnswerValue> = { ...(progress?.answers ?? {}), ...pending };
  const results = progress?.results ?? {};
  const reveal = progress?.reveal ?? {};

  /** Card tree: an answer dealt new cards onto this student's board. */
  function announceDealt(dealt?: { id: string; title: string; lesson?: string }[]) {
    if (!dealt?.length) return;
    const first = dealt[0];
    const text = dealt.length === 1 ? `New card${first.lesson ? ` in ${first.lesson}` : ""}: “${first.title}”`
      : dealt.length <= 3 ? `New cards: ${dealt.map((d) => `“${d.title}”`).join(dealt.length === 2 ? " and " : ", ")}` : `${dealt.length} new cards on your board`;
    const show = () => window.dispatchEvent(new CustomEvent("questhand:show-card", { detail: first.id }));
    // The board deals them into place (flying in once this card closes) and marks them New.
    window.dispatchEvent(new CustomEvent("questhand:dealt", { detail: dealt.map((d) => d.id) }));
    setTimeout(() => toast(text, { icon: "split", action: { label: "Show", run: show } }), 900);
  }

  async function answer(qid: string, value: AnswerValue) {
    const q = set.find((x) => x.id === qid)!;
    setPending((x) => ({ ...x, [qid]: value }));
    const payload = q.kind === "short" ? { text: value } : q.kind === "multi" ? { multi: value } : q.kind === "order" ? { order: value } : { choice: value };
    const r = await op<{ ok: boolean; error?: string; dealt?: { id: string; title: string; lesson?: string }[]; groupDealt?: { id: string; title: string; lesson?: string }[] }>(p.courseId, { op: "answer", studentId: p.studentId, moduleId: m.id, qid, ...payload });
    if (!r.ok) toast(r.error ?? "Couldn’t save that answer", { icon: "quiz", tone: "plain" });
    // Cards this answer dealt are said under it; cards the group's score dealt are said with the group's score.
    announceDealt([...(r.dealt ?? []), ...(r.groupDealt ?? [])]);
    if (r.dealt?.length) setOpened((x) => ({ ...x, [qid]: r.dealt! }));
    await p.onChanged();
    setPending((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== qid)));
  }

  const has = (v: AnswerValue | undefined) => v !== undefined && (Array.isArray(v) ? true : String(v).trim() !== "");
  const optBtn = (on: boolean, extra = "") => `press flex items-center gap-2.5 rounded-[10px] border px-3 text-left ${p.big ? "py-3.5 text-[16px]" : "py-2.5 text-[14px]"} ${extra || (on ? "border-ink bg-white" : "border-line bg-white hover:border-line-strong hover:bg-[#fafaf9]")}`;

  return (
    <div className="space-y-6">
      {set.map((q, qi) => {
        const picked = answers[q.id];
        const showResult = !(q.id in pending) && has(picked);
        const right = results[q.id];
        const rv = reveal[q.id];
        // The right answer, shown after the last try of a group with tries.
        const keyIn = !!rv && (rv.answer !== undefined || !!rv.answerSet || !!rv.order || !!rv.accept);
        const locked = right === true || (tried && right !== undefined && !(q.id in pending));
        // Questions with a right answer are always mixed per student, so the answer isn’t always the first option. Polls keep the teacher’s order.
        const order = optionOrder(q, p.studentId, !isPoll(m));
        return (
          <fieldset key={q.id}>
            <legend className={`font-medium ${p.big ? "text-[18px]" : "text-[15px]"}`}>
              {/* One question: no number. With no words of its own, the card's title asks it. */}
              {set.length > 1 && <span className="mono mr-2">{String(qi + 1).padStart(2, "0")}</span>}
              <MathText text={q.text.trim() || (set.length > 1 ? m.title : "")} />
              {q.kind === "multi" && <span className="ml-2 text-[12px] font-normal text-ink-3">Choose all that apply</span>}
            </legend>

            {q.kind === "short" ? (() => {
              const draft = String(drafts[q.id] ?? (typeof picked === "string" ? picked : ""));
              return (
                <form className="mt-2.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) answer(q.id, draft.trim()); }}>
                  <input value={draft} disabled={locked}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    placeholder="Type your answer" aria-label={`Answer to question ${qi + 1}`}
                    className={`field ${p.big ? "h-12 text-[16px]" : "h-10"} ${showResult ? (right ? "border-ok/50 bg-ok/[0.04]" : "border-bad/45") : ""}`} />
                  {!locked && <button className="btn btn-ghost press h-10 flex-none" disabled={!draft.trim()}>Check</button>}
                  {showResult && <span className={`pop flex items-center ${right ? "text-ok" : "text-bad"}`}><Icon name={right ? "check" : "x"} size={16} strokeWidth={2.2} /></span>}
                </form>
              );
            })() : q.kind === "multi" ? (() => {
              const cur = (drafts[q.id] ?? picked ?? []) as number[];
              const key = (rv?.answerSet ?? []) as number[];
              const toggle = (oi: number) => {
                const next = cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi];
                setDrafts((d) => ({ ...d, [q.id]: next }));
              };
              return (
                <div className="mt-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {order.map((oi) => {
                      const on = cur.includes(oi);
                      const tone = keyIn && key.length ? (key.includes(oi) ? (on ? "border-ok/50 bg-ok/[0.06]" : "border-dashed border-ok/60 bg-white") : on ? "border-bad/45 bg-bad/[0.05]" : "") : "";
                      return (
                        <button key={oi} onClick={() => !locked && toggle(oi)} disabled={locked} aria-pressed={on} className={optBtn(on, tone)}>
                          <span className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${on ? "border-ink bg-ink text-white" : "border-line-strong"}`}>{on && <Icon name="check" size={10} strokeWidth={3} />}</span>
                          <span className="flex-1"><MathText text={q.options[oi]} /></span>
                        </button>
                      );
                    })}
                  </div>
                  {!locked && (
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => answer(q.id, cur)} disabled={!cur.length} className="btn btn-ghost press h-8">Check</button>
                      {showResult && <span className={`pop flex items-center gap-1 text-[13px] ${right ? "text-ok" : "text-bad"}`}><Icon name={right ? "check" : "x"} size={14} strokeWidth={2.2} />{right ? "Right" : ""}</span>}
                    </div>
                  )}
                  {locked && showResult && <p className={`pop mt-1.5 flex items-center gap-1 text-[13px] ${right ? "text-ok" : "text-bad"}`}><Icon name={right ? "check" : "x"} size={14} strokeWidth={2.2} /> {right ? "Right" : "Not right"}</p>}
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
                      <li key={t} className={`flex items-center gap-2 rounded-[10px] border bg-white px-2 py-1.5 transition-transform ${correct ? (correct[i] === t ? "border-ok/50" : "border-bad/45") : "border-line"} ${p.big ? "text-[16px]" : "text-[14px]"}`}>
                        <span className="mono w-5 text-center">{i + 1}</span>
                        <span className="flex-1"><MathText text={t} /></span>
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
                      <button onClick={() => answer(q.id, cur)} className="btn btn-ghost press h-8">Check</button>
                      {showResult && <span className={`pop flex items-center gap-1 text-[13px] ${right ? "text-ok" : "text-bad"}`}><Icon name={right ? "check" : "x"} size={14} strokeWidth={2.2} /></span>}
                    </div>
                  )}
                  {locked && showResult && !right && <p className="pop mt-1.5 flex items-center gap-1 text-[13px] text-bad"><Icon name="x" size={14} strokeWidth={2.2} /> Not right</p>}
                  {correct && !right && <p className="rise mt-1.5 text-[12.5px] text-ink-2">Correct order: {correct.join(" → ")}</p>}
                </div>
              );
            })() : m.signupView ? (
              // A sign-up: each option is a group. Pick one to join it (and pick another to move, until the groups are locked).
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {q.options.map((opt, oi) => {
                  const v = m.signupView!;
                  const mine = v.mine === oi;
                  const full = !!v.max && v.counts[oi] >= v.max && !mine;
                  return (
                    <button key={oi} onClick={() => !mine && answer(q.id, oi)} disabled={v.locked || full || q.id in pending} aria-pressed={mine}
                      className={`press flex flex-col items-stretch gap-1.5 rounded-xl border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed ${mine ? "border-[#4b56a8]/50 bg-[#eef0fb]" : full ? "border-line bg-lane/60 opacity-60" : "border-line bg-white hover:border-line-strong"}`}>
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 font-medium"><MathText text={opt} /></span>
                        <span className={`mono text-[12px] ${full ? "text-bad" : "text-ink-3"}`}>{v.counts[oi]}{v.max ? `/${v.max}` : ""}</span>
                      </span>
                      {v.names && v.names[oi].length > 0 && <span className="text-[12px] leading-snug text-ink-3">{v.names[oi].join(", ")}</span>}
                      {mine ? <span className="text-[11.5px] font-medium text-[#4b56a8]">Your group</span> : full ? <span className="text-[11.5px] text-bad">Full</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {order.map((oi) => {
                  const opt = q.options[oi];
                  // A poll: pick (pick it again to clear it), then submit. Once in, the vote can't change.
                  const voted = m.poll && progress?.answers?.[q.id] !== undefined;
                  const isPicked = m.poll ? (voted ? progress!.answers![q.id] === oi : drafts[q.id] === oi) : picked === oi;
                  const isKey = keyIn && rv?.answer === oi && !isPicked;
                  let tone = "";
                  if (m.poll) tone = isPicked ? "border-[#4b56a8]/50 bg-[#eef0fb]" : voted ? "opacity-60" : "";
                  else if (isPicked && showResult) tone = right ? "border-ok/50 bg-ok/[0.06]" : "border-bad/45 bg-bad/[0.05] shake";
                  else if (isKey) tone = "border-dashed border-ok/60 bg-white";
                  return (
                    <button key={`${oi}-${isPicked && showResult && !m.poll ? (right ? "y" : "n") : ""}`}
                      onClick={() => (m.poll ? !voted && setDrafts((d) => { const n = { ...d }; if (n[q.id] === oi) delete n[q.id]; else n[q.id] = oi; return n; }) : answer(q.id, oi))}
                      disabled={m.poll ? voted : locked} aria-pressed={isPicked} className={optBtn(isPicked, tone)}>
                      <span className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${isPicked ? "border-ink bg-ink" : "border-line-strong"}`}>
                        {isPicked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="min-w-0 flex-1"><MathText text={opt} /></span>
                      {isPicked && showResult && !m.poll && <span className={`pop ${right ? "text-ok" : "text-bad"}`}><Icon name={right ? "check" : "x"} size={15} strokeWidth={2.2} /></span>}
                      {isPicked && voted && <span className="text-[11.5px] font-medium text-[#4b56a8]">Your vote</span>}
                      {isKey && <span className="text-[11.5px] text-ok">Answer</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {m.poll && !m.signupView && (!q.kind || q.kind === "choice") && progress?.answers?.[q.id] === undefined && (
              <div className="mt-2.5 flex items-center gap-3">
                <button onClick={() => { const v = drafts[q.id]; if (typeof v === "number") answer(q.id, v); }} disabled={typeof drafts[q.id] !== "number" || q.id in pending}
                  className="btn btn-dark press h-9 px-4">{q.id in pending ? "Sending…" : "Submit vote"}</button>
                <span className="text-[12.5px] text-ink-3">{typeof drafts[q.id] === "number" ? "You can't change it once it's in." : "Pick one. Pick it again to clear it."}</span>
              </div>
            )}
            {m.signupView && (
              <p className="mt-2 text-[12.5px] text-ink-3">
                {m.signupView.locked ? "The groups are set." : m.signupView.mine === undefined ? "Pick the group you want to join." : "You can switch until your teacher locks the groups."}
              </p>
            )}
            {m.poll && !m.signupView && progress?.answers?.[q.id] !== undefined && m.tally && (() => {
              // How the class voted, once you have.
              const tally = m.tally!, all = Math.max(1, tally.reduce((a, b) => a + b, 0));
              return (
                <div className="rise mt-3 space-y-1.5 rounded-xl bg-lane p-3">
                  <div className="text-[12px] text-ink-3">How the class voted · {tally.reduce((a, b) => a + b, 0)} vote{tally.reduce((a, b) => a + b, 0) === 1 ? "" : "s"}</div>
                  {q.options.map((o, oi) => (
                    <div key={oi} className="flex items-center gap-2 text-[12.5px]">
                      <span className="w-28 flex-none truncate text-ink-2"><MathText text={o} /></span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-[#4b56a8] transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${(100 * (tally[oi] ?? 0)) / all}%` }} /></span>
                      <span className="mono w-8 text-right">{tally[oi] ?? 0}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {showResult && !right && tried && !m.poll && !keyIn && (
              <p className="rise mt-1.5 text-[12.5px] text-bad">Not quite. <span className="text-ink-3">The right answers show after your last try.</span>{opened[q.id] ? <> Your answer opened <CardLinks cards={opened[q.id]} />.</> : null}</p>
            )}
            {showResult && !right && !tried && !m.poll && (!q.kind || q.kind === "choice" || q.kind === "short") && (
              opened[q.id] ? (
                <p className="rise mt-1.5 text-[12.5px] text-ink-2">
                  <span className="text-bad">Not quite.</span> Your answer opened <CardLinks cards={opened[q.id]} /> to help. You can also have another go here.
                </p>
              ) : (
                <p className="rise mt-1.5 text-[12.5px] text-bad">{p.group ? "Not quite. Try again if you like: the group’s score counts your first answer." : "Not quite. Have another go."}</p>
              )
            )}
            {/* A vote, or a right answer, that dealt cards: say which, so they're easy to find. */}
            {opened[q.id] && (m.poll || (showResult && right)) && (
              <p className="rise mt-1.5 flex items-start gap-1.5 text-[12.5px] text-ink-2">
                <Icon name="split" size={12} className="mt-[3px] flex-none text-[#4b56a8]" />
                <span>Your answer opened <CardLinks cards={opened[q.id]} /> on your board.</span>
              </p>
            )}
            {keyIn && q.kind === "short" && !right && rv?.accept && (
              <p className="rise mt-1.5 text-[12.5px] text-ink-2">Accepted answer: <span className="font-medium text-ok">{rv.accept}</span></p>
            )}
            {(showResult || keyIn) && rv?.explain && (
              <p className="rise mt-2 flex gap-2 rounded-lg bg-lane px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                <Icon name="sparkles" size={13} className="mt-[3px] flex-none text-ink-3" /><span><span className="font-medium text-ink">Why: </span><MathText text={rv.explain} /></span>
              </p>
            )}
          </fieldset>
        );
      })}
      {m.poll && (m.signupView ? m.signupView.mine !== undefined : set.every((q) => progress?.answers?.[q.id] !== undefined)) && (
        // All voted: the card is done (closing it ticks it too); Done just closes it.
        <div className="flex items-center gap-3">
          <button onClick={() => p.onClose(true)} className={`btn btn-dark press ${p.big ? "h-11 px-5 text-[15px]" : "h-9 px-4"}`}><Icon name="check" size={14} /> Done</button>
          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><StatusIcon status="done" size={13} /> {m.signupView ? `You’re in ${m.questions?.[0]?.options[m.signupView.mine!] ?? "a group"}` : "Your vote is in"}</span>
        </div>
      )}
      {!m.poll && progress?.status === "done" && (
        <div className="pop flex flex-wrap items-center gap-3 text-[14px]">
          <span className="flex items-center gap-2">
            {(progress?.score ?? 0) >= total ? <StatusIcon status="done" size={15} /> : <Icon name="quiz" size={15} className="text-ink-3" />}
            Score <span className="font-mono">{progress?.score ?? 0} / {total}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** Cards an answer opened, each a link that shows it on the board: “A”, “B” and “C”. */
function CardLinks({ cards }: { cards: { id: string; title: string }[] }) {
  return (
    <>
      {cards.map((c, i) => (
        <span key={c.id}>
          {i > 0 && (i === cards.length - 1 ? " and " : ", ")}
          <button onClick={() => window.dispatchEvent(new CustomEvent("questhand:show-card", { detail: c.id }))} className="font-medium text-[#4b56a8] underline underline-offset-2">“{c.title}”</button>
        </span>
      ))}
    </>
  );
}
