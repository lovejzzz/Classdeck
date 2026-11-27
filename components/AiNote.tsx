"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { RichText } from "./RichText";
import { tidyFeedback } from "@/lib/aiprompt";
import type { Progress } from "@/lib/types";

/** AI feedback on a student's latest hand-in: still coming, the feedback itself, or why there's none. */
export function AiNote({ ai: given, teacher = false }: { ai: NonNullable<Progress["ai"]>; teacher?: boolean }) {
  // Still "working" after 15 minutes means it stopped (the server restarted midway, say): say so rather than wait forever.
  const [now] = useState(() => Date.now());
  const ai: typeof given = given.state === "working" && now - given.at > 15 * 60_000
    ? { ...given, state: "error", error: "The AI feedback stopped before it finished. Hand it in again to retry." } : given;
  return (
    <section aria-label="AI feedback" className="mt-6 rounded-2xl border border-[#d9dcf1] bg-[#f6f7fd] px-4 py-3.5">
      <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-[#4b56a8]">
        <Icon name="sparkles" size={13} />
        <span className="flex-1">AI feedback{ai.watched ? " · analyzed the video" : ""}</span>
        {ai.model && <span className="font-mono text-[10.5px] normal-case tracking-normal text-ink-3">{ai.model}</span>}
      </div>
      {ai.state === "working" ? (
        <p className="mt-2 flex items-center gap-2 text-[13.5px] text-ink-2" role="status">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#4b56a8]" />
          {ai.watched ? "Analyzing your video and reading your work…" : "Reading your work…"} {teacher ? "" : "It appears here in a moment."}
        </p>
      ) : ai.state === "done" && ai.text ? (
        <div className="mt-2 text-[14px] leading-relaxed text-ink"><RichText text={tidyFeedback(ai.text).replace(/^(Your question|Works well|Try next|Delivery|Your next step):/gm, "**$1:**")} /></div>
      ) : (
        <p className="mt-2 text-[13px] text-ink-3">{teacher ? ai.error ?? "The AI couldn’t give feedback." : "The AI couldn’t give feedback this time. Your teacher will still see your work."}</p>
      )}
      {!teacher && ai.state === "done" && <p className="mt-2 text-[11.5px] text-ink-3">From an AI, not your teacher. Your teacher sees your work too.</p>}
    </section>
  );
}
