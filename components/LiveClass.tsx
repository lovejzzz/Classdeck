"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { CourseState, Student } from "@/lib/types";
import { Avatar, Icon } from "./Icon";

const PRESETS: [string, string[]][] = [
  ["How are you doing with this?", ["Got it", "Mostly", "Lost"]],
  ["Ready to move on?", ["Yes", "Need a minute"]],
  ["Which should we do next?", ["Practice", "Another example", "Questions"]],
];

function Bars({ options, counts, mine }: { options: string[]; counts: number[]; mine?: number }) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="space-y-1.5">
      {options.map((o, i) => (
        <div key={i} className="relative overflow-hidden rounded-lg border border-line bg-white px-3 py-2 text-[13px]">
          <div className="absolute inset-y-0 left-0 bg-[#e9edf9] transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${(counts[i] / total) * 100}%` }} />
          <div className="relative flex items-center gap-2">
            <span className="flex-1">{o}{mine === i && <span className="ml-1.5 text-[11.5px] text-[#4b56a8]">· your vote</span>}</span>
            <span className="font-mono text-[12px] text-ink-2">{counts[i]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The teacher's live-class drawer: a quick poll, the hands queue, and a random picker. */
export function TeacherLive({ courseId, state, onChanged }: { courseId: string; state: CourseState; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const live = state.live ?? { hands: {} };
  const hands = Object.entries(live.hands).sort((a, b) => a[1].at - b[1].at);
  const poll = live.poll;
  const counts = poll ? poll.options.map((_, i) => Object.values(poll.votes).filter((v) => v === i).length) : [];
  const voted = poll ? Object.keys(poll.votes).length : 0;
  const name = (id: string) => state.course.students.find((s) => s.id === id)?.name ?? "Student";
  const [q, setQ] = useState(PRESETS[0][0]);
  const [opts, setOpts] = useState(PRESETS[0][1].join("\n"));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async (body: Record<string, unknown>) => {
    const r = await op<{ ok: boolean; error?: string }>(courseId, body);
    if (r.ok === false) toast(r.error ?? "Couldn’t do that", { icon: "x", tone: "bad" });
    onChanged();
    return r.ok !== false;
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-quiet press relative h-8 px-2.5" aria-label={`Live class${hands.length ? `, ${hands.length} hands up` : ""}`}>
        <span className={`h-2 w-2 rounded-full ${poll?.open || hands.length ? "animate-pulse bg-bad" : "bg-line-strong"}`} /> Live
        {hands.length > 0 && <span className="pop ml-0.5 rounded-full bg-bad px-1.5 font-mono text-[10.5px] text-white">{hands.length}</span>}
      </button>
      {open && createPortal(
        <aside className="fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-[26rem] flex-col border-l border-line bg-white shadow-[-24px_0_60px_-30px_rgba(20,20,18,0.35)]" style={{ animation: "panel-in 0.38s var(--ease-out) both" }} aria-label="Live class">
          <div className="flex h-14 flex-none items-center gap-2 border-b border-line px-5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-bad" />
            <span className="flex-1 text-[14px] font-medium">Live class</span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={15} /></button>
          </div>
          <div className="flex-1 space-y-7 overflow-y-auto p-5">
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="flex-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">Hands</h3>
                {hands.length > 0 && <button onClick={() => send({ op: "clearHand", all: true })} className="btn btn-quiet press h-7 px-2 text-[12px]">Clear all</button>}
              </div>
              {hands.length === 0 ? <p className="text-[13px] text-ink-3">No hands up. Students can raise one, or say they’re stuck, from their page.</p> : (
                <ul className="space-y-1.5">
                  {hands.map(([sid, h], i) => (
                    <li key={sid} className="pop flex items-start gap-2.5 rounded-lg border border-line px-3 py-2" style={{ "--i": i } as React.CSSProperties}>
                      <span className="mono mt-0.5 w-4">{i + 1}</span>
                      <Avatar name={name(sid)} size={22} />
                      <span className="min-w-0 flex-1 text-[13px]">
                        <span className="font-medium">{name(sid)}</span>
                        <span className={`ml-1.5 text-[11.5px] ${h.kind === "stuck" ? "text-bad" : "text-[#4b56a8]"}`}>{h.kind === "stuck" ? "stuck" : "question"}</span>
                        {h.note && <span className="block text-ink-2">{h.note}</span>}
                      </span>
                      <button onClick={() => send({ op: "clearHand", studentId: sid })} className="btn btn-quiet press h-7 px-2 text-[12px]">Done</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">Quick poll</h3>
              {poll ? (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-[14px] font-medium">{poll.question}</p>
                    <span className={`chip h-5 text-[11px] ${poll.open ? "bg-ok/10 text-ok" : ""}`}>{poll.open ? "Open" : "Closed"}</span>
                  </div>
                  <Bars options={poll.options} counts={counts} />
                  <p className="text-[12px] text-ink-3">{voted} of {state.course.students.length} voted</p>
                  <div className="flex gap-2">
                    {poll.open && <button onClick={() => send({ op: "closePoll" })} className="btn btn-dark press h-8">Close voting</button>}
                    <button onClick={() => send({ op: "closePoll", clear: true })} className="btn btn-ghost press h-8">{poll.open ? "Cancel" : "New poll"}</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map(([pq, po]) => (
                      <button key={pq} onClick={() => { setQ(pq); setOpts(po.join("\n")); }} className={`press h-7 rounded-full border px-2.5 text-[12px] ${q === pq ? "border-ink" : "border-line text-ink-2 hover:border-line-strong"}`}>{po.join(" / ")}</button>
                    ))}
                  </div>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Question" aria-label="Poll question" className="field" />
                  <textarea value={opts} onChange={(e) => setOpts(e.target.value)} rows={3} placeholder="One option per line" aria-label="Poll options" className="field resize-none" />
                  <button onClick={() => send({ op: "startPoll", question: q, options: opts.split("\n") })} className="btn btn-dark press h-9 px-4">Start poll</button>
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">Random picker</h3>
              <Picker students={state.course.students} />
            </section>
          </div>
        </aside>,
        document.body,
      )}
    </>
  );
}

/** Spins through names and lands on one. Optionally skips students already picked today. */
function Picker({ students }: { students: Student[] }) {
  const [shown, setShown] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [fresh, setFresh] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function spin() {
    const pool = students.filter((s) => !fresh || !picked.includes(s.id));
    if (!pool.length) return toast("Everyone has had a turn. Reset to start over.", { icon: "users", tone: "plain" });
    const winner = pool[Math.floor(Math.random() * pool.length)];
    setSpinning(true);
    let step = 0;
    const steps = 14;
    const tick = () => {
      step++;
      // Slows down like a wheel, then lands on the winner.
      if (step < steps) {
        setShown(students[Math.floor(Math.random() * students.length)].name);
        timer.current = window.setTimeout(tick, 40 + step * step * 1.6);
      } else {
        setShown(winner.name);
        setPicked((p) => [...p, winner.id]);
        setSpinning(false);
      }
    };
    tick();
  }

  return (
    <div className="space-y-2.5">
      <div className={`flex h-20 items-center justify-center rounded-xl border border-line bg-[#fafaf9] text-[26px] font-semibold tracking-tight ${spinning ? "text-ink-3" : ""}`} aria-live="polite">
        {shown ? <span key={shown} className={spinning ? "" : "pop"}>{shown}</span> : <span className="text-[13px] font-normal text-ink-3">Press Pick</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={spin} disabled={spinning} className="btn btn-dark press h-9 px-5">Pick</button>
        <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2"><input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} className="accent-[#1b1b1a]" />Skip students already picked</label>
        {picked.length > 0 && <button onClick={() => { setPicked([]); setShown(null); }} className="btn btn-quiet press h-7 px-2 text-[12px]">Reset ({picked.length})</button>}
      </div>
    </div>
  );
}

/** For students: the open poll as a banner, and a button to raise a hand or say you're stuck. */
export function StudentLive({ courseId, studentId, state, onChanged }: { courseId: string; studentId: string; state: CourseState; onChanged: () => void }) {
  const live = state.live ?? { hands: {} };
  const poll = live.poll;
  const hand = live.hands[studentId];
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState("");
  const [dismissed, setDismissed] = useState<string | null>(null);

  async function vote(i: number) {
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "vote", studentId, pollId: poll!.id, choice: i });
    if (r.ok === false) toast(r.error ?? "Couldn’t vote", { icon: "x", tone: "plain" });
    onChanged();
  }
  async function raise(kind: "question" | "stuck" | null) {
    await op(courseId, kind ? { op: "hand", studentId, kind, note } : { op: "hand", studentId, down: true });
    setMenu(false);
    setNote("");
    onChanged();
    if (kind) toast(kind === "stuck" ? "Your teacher knows you’re stuck" : "Hand raised", { icon: "user" });
  }

  return (
    <>
      {poll && dismissed !== poll.id && (poll.open || live.counts) && (
        <div className="fixed inset-x-0 top-3 z-40 flex justify-center px-4" role="dialog" aria-label="Poll from your teacher">
          <div className="pop w-full max-w-md rounded-2xl border border-line bg-white p-4 shadow-[0_24px_60px_-24px_rgba(20,20,18,0.45)]">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-bad" />
              <span className="flex-1 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3">Poll from your teacher{!poll.open ? " · closed" : ""}</span>
              <button onClick={() => setDismissed(poll.id)} aria-label="Hide poll" className="text-ink-3 hover:text-ink"><Icon name="x" size={14} /></button>
            </div>
            <p className="mt-1.5 text-[15px] font-medium">{poll.question}</p>
            <div className="mt-3">
              {live.counts ? <Bars options={poll.options} counts={live.counts} mine={live.myVote} /> : (
                <div className="grid gap-2">
                  {poll.options.map((o, i) => <button key={i} onClick={() => vote(i)} className="press rounded-lg border border-line px-3 py-2.5 text-left text-[14px] hover:border-ink">{o}</button>)}
                </div>
              )}
            </div>
            {live.counts && poll.open && <p className="mt-2 text-[12px] text-ink-3">You can change your vote while the poll is open.</p>}
            {live.counts && poll.open && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">{poll.options.map((o, i) => i !== live.myVote && <button key={i} onClick={() => vote(i)} className="btn btn-quiet press h-7 px-2 text-[12px]">Switch to “{o}”</button>)}</div>
            )}
          </div>
        </div>
      )}

      <div className="no-print fixed bottom-5 right-5 z-30 flex flex-col items-end gap-2">
        {menu && !hand && (
          <div className="pop w-64 rounded-xl border border-line bg-white p-3 shadow-[0_18px_40px_-20px_rgba(20,20,18,0.4)]">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What about? (optional)" aria-label="Note for your teacher" className="field h-8 py-0 text-[13px]" autoFocus />
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button onClick={() => raise("question")} className="btn btn-ghost press h-8 justify-center text-[12.5px]">I have a question</button>
              <button onClick={() => raise("stuck")} className="btn btn-ghost press h-8 justify-center text-[12.5px] text-bad">I’m stuck</button>
            </div>
          </div>
        )}
        {hand ? (
          <button onClick={() => raise(null)} className="btn press h-10 rounded-full bg-ink px-4 text-white shadow-lg">
            <span className="animate-pulse">✋</span> {hand.kind === "stuck" ? "Stuck" : "Hand up"} · Lower
          </button>
        ) : (
          <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} className="btn btn-ghost press h-10 rounded-full bg-white px-4 shadow-[0_8px_24px_-12px_rgba(20,20,18,0.35)]">
            ✋ Raise hand
          </button>
        )}
      </div>
    </>
  );
}
