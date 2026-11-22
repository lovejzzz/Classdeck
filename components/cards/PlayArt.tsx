"use client";

import { useEffect, useRef, useState } from "react";
import { hash } from "@/lib/cards";
import { videoEmbed } from "@/lib/media";
import type { Attachment } from "@/lib/types";

/** Whether a card's main media can be played right on its face (a video, a recording, a YouTube link). */
export const playableArt = (a?: Attachment) =>
  !!a && (a.kind === "video" || a.kind === "audio" || (a.kind === "link" && !!videoEmbed(a.url)?.src.includes("youtube")));

const PlayDot = ({ playing = false }: { playing?: boolean }) => (
  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-[0_2px_10px_rgba(0,0,0,0.2)] transition-transform group-hover:scale-110">
    {playing
      ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5h2.4v9H2.5zM7.1 1.5h2.4v9H7.1z" fill="#1b1b1a" /></svg>
      : <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="#1b1b1a" /></svg>}
  </span>
);

/**
 * A card's artwork that plays: a video plays in place with its controls (fullscreen included), a recording plays and
 * pauses with its waveform filling as it goes, a YouTube link swaps in the player.
 */
export function PlayArt({ a, cover }: { a: Attachment; cover: string }) {
  const [on, setOn] = useState(false);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (a.kind === "video") {
    if (on) {
      return (
        <div className="relative h-full w-full bg-black" onPointerDown={stop} onClick={stop}>
          <video src={a.url} controls autoPlay playsInline className="h-full w-full object-contain" />
          <FullButton />
        </div>
      );
    }
    return (
      <button type="button" onClick={(e) => { stop(e); setOn(true); }} onPointerDown={stop} aria-label="Play the video" className="group relative block h-full w-full bg-[#dfe6ec]">
        <video src={`${a.url}#t=1.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center"><PlayDot /></span>
      </button>
    );
  }

  if (a.kind === "link") {
    const src = videoEmbed(a.url)!.src;
    const id = src.match(/embed\/([\w-]+)/)?.[1];
    if (on) {
      return (
        <iframe src={`${src}&autoplay=1`} title="Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
          className="h-full w-full border-0 bg-black" onPointerDown={stop} />
      );
    }
    return (
      <button type="button" onClick={(e) => { stop(e); setOn(true); }} onPointerDown={stop} aria-label="Play the video" className="group relative block h-full w-full bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {id && <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" draggable={false} className="h-full w-full object-cover opacity-90" />}
        <span className="absolute inset-0 flex items-center justify-center"><PlayDot /></span>
      </button>
    );
  }

  return <Recording a={a} cover={cover} />;
}

/** Fullscreen for the video in this box (Safari on iPhone only lets the video element itself go fullscreen). */
function FullButton() {
  const go = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = (e.currentTarget.parentElement?.querySelector("video") ?? null) as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();
  };
  return (
    <button type="button" onClick={go} aria-label="Full screen" title="Full screen"
      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/55 text-white hover:bg-black/75">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </svg>
    </button>
  );
}

function Recording({ a, cover }: { a: Attachment; cover: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [len, setLen] = useState(0);
  useEffect(() => () => ref.current?.pause(), []);
  const seed = hash(a.id);
  const done = len ? at / len : 0;
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {}); else el.pause();
  };
  return (
    <div className="group relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden" onClick={toggle} onPointerDown={(e) => e.stopPropagation()}
      role="button" aria-label={playing ? "Pause the recording" : "Play the recording"} tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e as unknown as React.MouseEvent); } }}>
      <div className="absolute inset-[-30%] blur-[16px]" style={{ background: cover }} />
      <div className="relative flex h-1/2 items-center gap-[3px]">
        {Array.from({ length: 18 }, (_, i) => {
          const h = 0.25 + Math.abs(Math.sin(i * 1.7 + seed * 9)) * 0.75;
          return <span key={i} className={`w-[3px] rounded-full transition-colors ${i / 18 < done ? "bg-[#4b56a8]" : "bg-ink/40"}`} style={{ height: `${h * 100}%` }} />;
        })}
      </div>
      <span className="absolute inset-0 flex items-center justify-center"><PlayDot playing={playing} /></span>
      {(playing || at > 0) && len > 0 && (
        <span className="mono absolute bottom-1.5 right-2 rounded bg-white/80 px-1 text-[10px] text-ink-2">{clock(at)} / {clock(len)}</span>
      )}
      <audio ref={ref} src={a.url} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setAt(0); }}
        onLoadedMetadata={(e) => setLen(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)} />
    </div>
  );
}
