"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { videoEmbed } from "@/lib/media";
import type { Attachment } from "@/lib/types";
import { Icon } from "../Icon";
import { Lift } from "./Lift";

/**
 * A card's video or picture, grown out of its thumbnail (the same spring a student's card opens with): a video plays at
 * once with its controls (full screen too), a picture shows large. Esc, the ✕ or a click outside puts it back.
 */
export function MediaLift({ a, title, from, open, onClose, onGone }: {
  a: Attachment; title: string; from: DOMRect; open: boolean; onClose: () => void; onGone: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  // Esc closes this only, not the card panel behind it too.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  // Start where the teacher chose, and stop as it closes.
  useEffect(() => { if (!open) video.current?.pause(); }, [open]);
  const embed = a.kind === "link" ? videoEmbed(a.url, a.start, a.end) : null;
  // On the page itself, not inside the map (a transformed parent would trap a fixed overlay inside it).
  return createPortal(
    <Lift from={from} open={open} label={title} onBackdrop={onClose} landing={() => from} onGone={onGone} z={90} wide={a.kind === "image" ? "max-w-4xl" : "max-w-5xl"}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{title || a.name || "Media"}</span>
        <button onClick={onClose} aria-label="Close" className="btn btn-quiet press h-9 w-9 justify-center px-0"><Icon name="x" size={17} /></button>
      </div>
      <div className="bg-black">
        {a.kind === "video" && (
          <video ref={video} src={a.url} controls autoPlay playsInline className="mx-auto block max-h-[78vh] w-full bg-black"
            onLoadedMetadata={(e) => { if (a.start) e.currentTarget.currentTime = a.start; }}
            onTimeUpdate={(e) => { if (a.end && e.currentTarget.currentTime >= a.end) e.currentTarget.pause(); }} />
        )}
        {a.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.url} alt={a.name ?? ""} className="mx-auto block max-h-[80vh] w-full bg-[#fafaf9] object-contain" />
        )}
        {embed && (
          <div className="relative aspect-video">
            <iframe src={`${embed.src}&autoplay=1`} title={a.name || `${embed.provider} video`} className="absolute inset-0 h-full w-full" allowFullScreen
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
          </div>
        )}
      </div>
    </Lift>,
    document.body,
  );
}
