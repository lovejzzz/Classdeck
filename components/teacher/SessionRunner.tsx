"use client";

import { useEffect, useRef, useState } from "react";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import { createPortal } from "react-dom";
import type { Course, Lesson, StudioPost } from "@/lib/types";
import { ICEBREAKERS } from "@/lib/onboarding";
import { rolesFor, sessionIndex } from "@/lib/roles";
import { Avatar, Icon } from "../Icon";
import { Present } from "../Present";

const fmt = (s: number) => {
  const neg = s < 0;
  const a = Math.abs(Math.round(s));
  return `${neg ? "+" : ""}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
};

function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.55);
    });
  } catch {}
}

function Ring({ total, left, size = 260 }: { total: number; left: number; size?: number }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const over = left < 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ececea" strokeWidth="10" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={over ? "var(--color-bad)" : frac < 0.15 ? "var(--color-warn)" : "#1b1b1a"} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-dashoffset 0.3s linear, stroke 0.4s ease" }} />
    </svg>
  );
}

/** A facilitator's run sheet for a Collab Studio session: the agenda, a timer, and a round-robin speaker queue. */
export function SessionRunner({ course, lesson, weekTitle, onClose, posts = [], live }: { course: Course; lesson: Lesson; weekTitle: string; onClose: () => void; posts?: StudioPost[]; live?: React.ReactNode }) {
  const plan = lesson.session!;
  const groups = course.groups ?? [];
  // Where the teacher is in the session (group, part, speaker, time, notes) is kept on this computer,
  // so closing by accident or reloading picks up where they left off.
  const saveKey = `qh-run:${course.id}:${lesson.id}`;
  // Only today's session is picked up again; an older one starts fresh.
  const [fresh] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(saveKey) ?? "null") as { groupId?: string; seg?: number; speaker?: number; elapsed?: number; notes?: Record<string, string>; finished?: number[]; at?: number } | null;
      return v && v.at && Date.now() - v.at < 12 * 3600_000 ? v : null;
    } catch {
      return null;
    }
  });
  const [groupId, setGroupId] = useState(fresh?.groupId && groups.some((g) => g.id === fresh.groupId) ? fresh.groupId : groups[0]?.id ?? "");
  const [seg, setSeg] = useState(Math.min(fresh?.seg ?? 0, Math.max(0, plan.agenda.length - 1)));
  const [speaker, setSpeaker] = useState(fresh?.speaker ?? 0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(fresh?.elapsed ?? 0);
  const [notes, setNotes] = useState<Record<string, string>>(fresh?.notes ?? {});
  // Parts finished with "Next part", ticked in the agenda. Jumping ahead doesn't tick the parts skipped.
  const [finished, setFinished] = useState<number[]>(fresh?.finished ?? []);
  useEffect(() => {
    try {
      localStorage.setItem(saveKey, JSON.stringify({ groupId, seg, speaker, elapsed: Math.round(elapsed), notes, finished, at: Date.now() }));
    } catch {}
  }, [saveKey, groupId, seg, speaker, elapsed, notes, finished]);
  const [presenting, setPresenting] = useState(false);
  // Full screen for the projector: the timer is drawn larger so the back row can read it.
  const shell = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const studioId = lesson.modules.find((m) => m.type === "studio")?.id;
  const last = useRef(0);
  const chimed = useRef(false);

  const group = groups.find((g) => g.id === groupId);
  const members = group?.studentIds.map((id) => course.students.find((s) => s.id === id)!).filter(Boolean) ?? [];
  const roles = plan.roles && group ? rolesFor(group.studentIds, sessionIndex(course, lesson.id)) : {};
  const part = plan.agenda[seg];
  const [ice, setIce] = useState(() => sessionIndex(course, lesson.id) * 2);
  const isIce = !!part && /ice ?breaker|warm-?up/i.test(part.label);
  const perSpeaker = part?.roundRobin && members.length ? (part.minutes * 60) / members.length : 0;
  const total = part ? (part.roundRobin ? perSpeaker : part.minutes * 60) : 0;
  const left = total - elapsed;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-label^="Presenting"], aside[aria-label="Live class"]')) return;
      if (e.key === "Escape") onClose();
      if (e.key === " " && (e.target as HTMLElement).tagName !== "TEXTAREA") {
        e.preventDefault();
        setRunning((r) => !r);
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    if (!running) return;
    last.current = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      setElapsed((e) => e + (now - last.current) / 1000);
      last.current = now;
    }, 200);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (left <= 0 && !chimed.current && running) {
      chimed.current = true;
      chime();
    }
  }, [left, running]);

  function reset() {
    setElapsed(0);
    chimed.current = false;
  }
  function next() {
    if (part?.roundRobin && speaker < members.length - 1) {
      setSpeaker(speaker + 1);
      reset();
      return;
    }
    setFinished((f) => (f.includes(seg) ? f : [...f, seg]));
    if (seg < plan.agenda.length - 1) {
      setSeg(seg + 1);
      setSpeaker(0);
      reset();
    } else setRunning(false);
  }

  // Notes for this group, sent as feedback on each student's Collab Studio card.
  const noteCount = members.filter((m) => notes[m.id]?.trim()).length;
  const [sending, setSending] = useState(false);
  async function sendNotes() {
    if (!studioId) return;
    setSending(true);
    const r = await op<{ ok?: boolean; sent?: number; error?: string }>(course.id, { op: "sessionNotes", moduleId: studioId, notes: Object.fromEntries(members.map((m) => [m.id, notes[m.id] ?? ""])) });
    setSending(false);
    if (r.ok === false) return toast(r.error ?? "Couldn’t send the notes", { icon: "x", tone: "bad" });
    toast(`Sent to ${r.sent ?? 0} student${r.sent === 1 ? "" : "s"}. They’ll see it on their Collab Studio card.`, { icon: "message" });
  }

  const doneMinutes = plan.agenda.slice(0, seg).reduce((n, a) => n + a.minutes, 0) + (part?.roundRobin ? speaker * (perSpeaker / 60) : 0) + Math.min(elapsed, total) / 60;
  const cur = part?.roundRobin ? members[speaker] : undefined;

  return createPortal(
    <div ref={shell} className="fade fixed inset-0 z-50 flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label="Run Collab Studio session">
      <header className="flex h-14 flex-none items-center gap-3 border-b border-line px-3 sm:px-5">
        <button onClick={onClose} className="btn btn-quiet press h-8 px-2.5" title="Back to the deck (Esc). Your place and notes are kept.">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          Back
        </button>
        <span className="h-5 w-px bg-line" aria-hidden="true" />
        <Icon name="studio" size={16} className="text-[#ae502f]" />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium">Collab Studio · {lesson.title}</div>
          <div className="mono">{weekTitle} · {plan.minutes} min</div>
        </div>
        <span className="flex-1" />
        {/* Hands, quick polls and the random picker, without leaving the session. */}
        {live}
        <button onClick={() => setPresenting(true)} className="btn btn-ghost press h-8"><Icon name="play" size={12} /> Present posts</button>
        {groups.length > 1 && (
          <div className="inline-flex rounded-lg bg-lane p-0.5">
            {groups.map((g) => (
              <button key={g.id} onClick={() => { setGroupId(g.id); setSpeaker(0); reset(); }} aria-pressed={g.id === groupId}
                className={`press h-7 rounded-md px-3 text-[12.5px] ${g.id === groupId ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2"}`}>{g.name}</button>
            ))}
          </div>
        )}
        {typeof document !== "undefined" && document.fullscreenEnabled && (
          <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : shell.current?.requestFullscreen())?.catch(() => {})} className="btn btn-ghost press hidden h-8 sm:inline-flex">
            <Icon name="board" size={12} /> {full ? "Exit full screen" : "Full screen"}
          </button>
        )}
      </header>
      <div className="h-1 flex-none bg-lane"><div className="h-full bg-ok transition-[width] duration-300" style={{ width: `${(doneMinutes / plan.minutes) * 100}%` }} /></div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[18rem_1fr]">
        <aside className="overflow-y-auto border-b border-line p-4 md:border-b-0 md:border-r">
          <ol className="space-y-1.5">
            {plan.agenda.map((a, i) => (
              <li key={i}>
                <button onClick={() => { setSeg(i); setSpeaker(0); reset(); }}
                  className={`press flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors ${i === seg ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-line" : "hover:bg-black/[0.03]"} ${i < seg ? "text-ink-3" : ""}`}>
                  <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-[11px] ${i === seg ? "bg-ink text-white" : finished.includes(i) ? "bg-ok text-white" : "bg-lane text-ink-2"}`}>
                    {i !== seg && finished.includes(i) ? <Icon name="check" size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="flex-1">{a.label}{a.roundRobin && <span className="block text-[11.5px] text-ink-3">{members.length ? `Round robin · ${Math.round((a.minutes / members.length) * 10) / 10} min each` : "Round robin · no one in this group yet"}</span>}</span>
                  <span className="mono">{a.minutes}m</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-4 px-1 text-[12px] text-ink-3">Space starts and pauses the timer. A chime plays when time is up.</p>
        </aside>

        <main className="flex min-h-0 flex-col items-center overflow-y-auto px-4 py-8">
          <div className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-3">{part?.label}</div>
          {cur && (
            <div key={cur.id} className="pop mt-2 flex items-center gap-2 text-[20px] font-semibold">
              <Avatar name={cur.name} size={28} /> {cur.name} is presenting
            </div>
          )}
          {isIce && (
            <div className="pop mt-4 w-full max-w-xl rounded-2xl border border-line bg-white px-6 py-5 text-center">
              <div className="eyebrow">Go around the group · 20 seconds each</div>
              <p className="mt-2 text-[22px] font-medium leading-snug">{ICEBREAKERS[ice % ICEBREAKERS.length]}</p>
              <button onClick={() => setIce(ice + 1)} className="btn btn-quiet press mt-2 h-8 px-3 text-[13px]"><Icon name="reset" size={12} /> Another prompt</button>
            </div>
          )}
          {part?.roundRobin && members.length === 0 ? (
            <div className="pop mt-6 w-full max-w-md rounded-2xl border border-line bg-white px-6 py-5 text-center text-[14px] text-ink-2">
              <p className="font-medium text-ink">{group ? `No one is in ${group.name} yet.` : "There are no Collab Studio groups yet."}</p>
              <p className="mt-1.5">This part splits {part.minutes} minutes between the presenters, so it needs students. Add them, or put them in groups, on the Students tab.</p>
            </div>
          ) : (
          <div className="relative mt-6">
            <Ring total={total} left={left} size={full ? 380 : 260} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {/* The last half minute turns amber, over time turns red. */}
              <span className={`font-mono tracking-tight ${full ? "text-[84px]" : "text-[52px]"} ${left < 0 ? "text-bad" : left <= 30 && running ? "text-warn" : ""}`}>{fmt(left)}</span>
              <span className={`text-ink-3 ${full ? "text-[16px]" : "text-[12.5px]"}`}>{left < 0 ? "over time" : running ? (left <= 30 ? "wrap up" : "remaining") : left >= total ? "ready" : "paused"}</span>
            </div>
          </div>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button onClick={() => setRunning((r) => !r)} className="btn btn-dark press h-11 px-6 text-[15px]">
              <Icon name={running ? "pause" : "play"} size={14} /> {running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}
            </button>
            <button onClick={() => setElapsed((e) => e - 60)} className="btn btn-ghost press h-11 px-4">+1 min</button>
            <button onClick={next} className="btn btn-ghost press h-11 px-4">
              {part?.roundRobin && speaker < members.length - 1 ? "Next speaker" : seg < plan.agenda.length - 1 ? "Next part" : "Finish"} <Icon name="arrow" size={13} />
            </button>
          </div>

          {part?.roundRobin && (
            <div className="mt-10 w-full max-w-3xl">
              <div className="flex flex-wrap justify-center gap-3">
                {members.map((s, i) => (
                  <button key={s.id} onClick={() => { setSpeaker(i); reset(); }}
                    className={`press flex w-28 flex-col items-center gap-2 rounded-2xl border bg-white px-3 py-4 transition-all duration-300 ${i === speaker ? "-translate-y-2 border-ink shadow-[0_16px_30px_-16px_rgba(20,20,18,0.45)]" : i < speaker ? "border-line opacity-50" : "border-line"}`}>
                    <Avatar name={s.name} size={34} />
                    <span className="text-[13px] font-medium">{s.name}</span>
                    {roles[s.id] && <span className="chip h-5 bg-[#fbf3ee] text-[10.5px] text-[#ae502f]" title={roles[s.id].job}>{roles[s.id].name}</span>}
                    <span className="mono">{i < speaker ? "done" : i === speaker ? "now" : `#${i + 1}`}</span>
                  </button>
                ))}
              </div>
              {cur && (
                <label className="mx-auto mt-6 block max-w-xl">
                  <span className="text-[12.5px] font-medium text-ink-2">Notes for {cur.name} (observed · effect · try next)</span>
                  <textarea value={notes[cur.id] ?? ""} onChange={(e) => setNotes({ ...notes, [cur.id]: e.target.value })} rows={3} className="field mt-1 resize-none" />
                </label>
              )}
              {studioId && (
                <div className="mx-auto mt-3 flex max-w-xl flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                  <span className="flex-1">{noteCount ? `Notes for ${noteCount} student${noteCount === 1 ? "" : "s"}` : "Notes stay on this computer until you send them."}</span>
                  <button onClick={sendNotes} disabled={!noteCount || sending} className="btn btn-ghost press h-8">
                    <Icon name="message" size={12} /> {sending ? "Sending…" : "Send notes to students"}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      {presenting && (
        <Present
          title={`${group?.name ?? "Collab Studio"} · ${lesson.title}`}
          subtitle={weekTitle}
          slides={posts
            .filter((p) => p.moduleId === studioId && !!group?.studentIds.includes(p.studentId))
            .map((p) => ({
              id: p.id,
              author: course.students.find((s) => s.id === p.studentId)?.name ?? "",
              text: [p.title, p.question && `Question: ${p.question}`].filter(Boolean).join("\n\n"),
              work: p.work,
              likes: p.likes?.length,
              note: [p.audience && `Audience: ${p.audience}`, p.purpose && `Purpose: ${p.purpose}`].filter(Boolean).join(" · "),
            }))}
          onClose={() => setPresenting(false)}
        />
      )}
    </div>,
    document.body,
  );
}
