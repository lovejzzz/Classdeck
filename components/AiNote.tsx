"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { RichText } from "./RichText";
import { momentsIn, tidyFeedback } from "@/lib/aiprompt";
import type { Attachment, Progress } from "@/lib/types";

const LABELS = /^(Your question|Works well|Try next|Delivery|Your next step):/gm;
const clock = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

/**
 * The feedback, part by part. When the AI watched the student's video, each moment it names shows as a still from
 * that moment under its part; clicking one plays the video from there. The stills come from the video itself in the
 * browser (a media fragment), so nothing is stored and a file kept elsewhere still works.
 */
function Feedback({ text, video }: { text: string; video?: string }) {
  const [at, setAt] = useState<number | null>(null);
  const parts = tidyFeedback(text).split(/\n{2,}/);
  return (
    <div className="mt-2 space-y-2.5 text-[14px] leading-relaxed text-ink">
      {parts.map((part, i) => {
        const times = video ? momentsIn(part) : [];
        return (
          <div key={i}>
            <RichText text={part.replace(LABELS, "**$1:**")} />
            {times.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {times.map((t) => (
                  <button key={t} onClick={() => setAt(at === t ? null : t)} aria-label={`Play your video from ${clock(t)}`}
                    className={`group relative overflow-hidden rounded-lg border bg-black ${at === t ? "border-[#4b56a8] ring-2 ring-[#4b56a8]/30" : "border-[#d9dcf1]"}`}>
                    <video src={`${video}#t=${t + 0.3}`} preload="metadata" muted playsInline tabIndex={-1} className="pointer-events-none h-[68px] w-[120px] object-cover" />
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-px font-mono text-[10.5px] text-white">{clock(t)}</span>
                    <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100"><span className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink"><Icon name="play" size={12} /></span></span>
                  </button>
                ))}
              </div>
            )}
            {at !== null && times.includes(at) && video && (
              <video key={at} src={`${video}#t=${at}`} controls autoPlay playsInline className="mt-2 max-h-[320px] w-full rounded-xl bg-black" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** AI feedback on a student's latest hand-in: still coming, the feedback itself, or why there's none. */
export function AiNote({ ai: given, teacher = false, work }: { ai: NonNullable<Progress["ai"]>; teacher?: boolean; work?: Attachment[] }) {
  // Feedback from before the video was kept with it: the last video the student uploaded on the card.
  const video = given.video ?? work?.filter((w) => w.kind === "video" && /^\/api\/upload\//.test(w.url)).pop()?.url;
  // Still "working" after 15 minutes means it stopped (the server restarted midway, say): say so rather than wait forever.
  const [now] = useState(() => Date.now());
  const ai: typeof given = given.state === "working" && now - given.at > 15 * 60_000
    ? { ...given, state: "error", error: "The AI feedback stopped before it finished. Hand it in again to retry." } : given;
  return (
    <section aria-label="AI feedback" className="mt-6 rounded-2xl border border-[#d9dcf1] bg-[#f6f7fd] px-4 py-3.5">
      <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-[#4b56a8]">
        <Icon name="sparkles" size={13} />
        <span className="flex-1">AI feedback</span>
        {/* Which model wrote it matters to the teacher (their key, their choice), not to the student. */}
        {teacher && ai.model && <span className="font-mono text-[10.5px] normal-case tracking-normal text-ink-3">{ai.model}{ai.watched ? " · watched the video" : ""}</span>}
      </div>
      {ai.state === "working" ? (
        <p className="mt-2 flex items-center gap-2 text-[13.5px] text-ink-2" role="status">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#4b56a8]" />
          {ai.watched ? "Watching your video…" : "Reading your work…"}
        </p>
      ) : ai.state === "done" && ai.text ? (
        <Feedback text={ai.text} video={ai.watched ? video : undefined} />
      ) : (
        <p className="mt-2 text-[13px] text-ink-3">{teacher ? ai.error ?? "The AI couldn’t give feedback." : "The AI couldn’t give feedback this time. Your teacher will still see your work."}</p>
      )}
      {!teacher && ai.state === "done" && <p className="mt-2 text-[11.5px] text-ink-3">From AI. Your teacher sees your work too.</p>}
    </section>
  );
}
