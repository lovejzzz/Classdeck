"use client";

import { useEffect, useRef, useState } from "react";
import { fileExt, formatSize, hash, hostOf } from "@/lib/cards";
import { fmtTime, videoEmbed } from "@/lib/media";
import type { Attachment } from "@/lib/types";
import { Icon } from "../Icon";

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

/** An audio player whose waveform fills in as it plays and bounces while playing. */
export function AudioPlayer({ a }: { a: Attachment }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const seed = hash(a.id);
  const bars = 44;
  const progress = dur ? t / dur : 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      setT(el.currentTime);
      raf = requestAnimationFrame(tick);
    };
    const on = () => {
      setPlaying(true);
      raf = requestAnimationFrame(tick);
    };
    const off = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      setT(el.currentTime);
    };
    el.addEventListener("play", on);
    el.addEventListener("pause", off);
    el.addEventListener("ended", off);
    el.addEventListener("loadedmetadata", () => setDur(el.duration));
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", on);
      el.removeEventListener("pause", off);
      el.removeEventListener("ended", off);
    };
  }, []);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-[#fafaf9] px-3 py-2.5">
      <audio ref={ref} src={a.url} preload="metadata" />
      <button
        onClick={() => (playing ? ref.current?.pause() : ref.current?.play())}
        aria-label={playing ? "Pause" : "Play"}
        className="press flex h-9 w-9 flex-none items-center justify-center rounded-full bg-ink text-white"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          {playing ? <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" fill="currentColor" /> : <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />}
        </svg>
      </button>
      <div
        className="flex h-9 flex-1 cursor-pointer items-center gap-[2px]"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (ref.current && dur) ref.current.currentTime = ((e.clientX - r.left) / r.width) * dur;
        }}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(t)}
      >
        {Array.from({ length: bars }, (_, i) => {
          const base = 0.2 + Math.abs(Math.sin(i * 1.3 + seed * 11)) * 0.8;
          const live = playing ? 0.75 + 0.25 * Math.sin(t * 9 + i * 0.9) : 1;
          const on = i / bars < progress;
          return (
            <span
              key={i}
              className="flex-1 rounded-full transition-[height,background-color] duration-150"
              style={{ height: `${base * live * 100}%`, background: on ? "#1b1b1a" : "#cfcfca" }}
            />
          );
        })}
      </div>
      <span className="mono w-16 flex-none text-right">{fmt(t)} / {fmt(dur)}</span>
    </div>
  );
}

const previews = new Map<string, Promise<{ ok: boolean; title?: string; description?: string; image?: string; site?: string }>>();
function loadPreview(url: string) {
  if (!previews.has(url)) previews.set(url, fetch(`/api/unfurl?url=${encodeURIComponent(url)}`).then((r) => r.json()).catch(() => ({ ok: false })));
  return previews.get(url)!;
}

/** A rich preview card for an ordinary link: image, title, description, and site. */
function LinkPreview({ a }: { a: Attachment }) {
  const [p, setP] = useState<{ ok: boolean; title?: string; description?: string; image?: string; site?: string } | null>(null);
  useEffect(() => {
    let live = true;
    loadPreview(a.url).then((d) => live && setP(d));
    return () => {
      live = false;
    };
  }, [a.url]);
  const title = a.name || p?.title || hostOf(a.url);
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="card card-hover press flex overflow-hidden">
      {p?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image} alt="" className="fade h-auto w-28 flex-none border-r border-line object-cover sm:w-36" />
      ) : (
        <span className="flex w-14 flex-none items-center justify-center bg-lane text-ink-2"><Icon name="globe" size={18} /></span>
      )}
      <span className="min-w-0 flex-1 px-3.5 py-3">
        <span className="block truncate text-[13.5px] font-medium">{title}</span>
        {p === null ? <span className="skeleton mt-1.5 block h-3 w-3/4" /> : p.description && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-ink-2">{p.description}</span>}
        <span className="mono mt-1 flex items-center gap-1 truncate">{p?.site || hostOf(a.url)} <Icon name="external" size={11} /></span>
      </span>
    </a>
  );
}

function Segment({ a }: { a: Attachment }) {
  if (a.start === undefined && a.end === undefined) return null;
  return (
    <span className="chip mt-1.5 h-6 bg-[#eef3f7] text-[#3d6f91]">
      <Icon name="clock" size={12} />Watch {a.start !== undefined ? fmtTime(a.start) : "0:00"}{a.end !== undefined ? `–${fmtTime(a.end)}` : " onward"}
    </span>
  );
}

/** A video file that starts at the chosen segment and pauses at its end. */
function SegmentVideo({ a }: { a: Attachment }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onMeta = () => {
      if (a.start) v.currentTime = a.start;
    };
    const onTime = () => {
      if (a.end && v.currentTime >= a.end) v.pause();
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [a.start, a.end]);
  return <video ref={ref} src={a.url} controls playsInline preload="metadata" className="w-full rounded-xl border border-line bg-black" />;
}

export function MediaView({ a }: { a: Attachment }) {
  if (a.kind === "image") {
    return (
      <figure>
        <a href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line bg-[#fafaf9]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.url} alt={a.name ?? ""} className="max-h-[22rem] w-full object-contain" />
        </a>
        {a.credit && <figcaption className="mt-1 text-[11.5px] text-ink-3">{a.credit}</figcaption>}
      </figure>
    );
  }
  if (a.kind === "video") {
    return <div><SegmentVideo a={a} /><Segment a={a} /></div>;
  }
  if (a.kind === "audio") return <AudioPlayer a={a} />;
  if (a.kind === "file") {
    return (
      <a href={a.url} download={a.name} className="card card-hover press flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-9 w-8 flex-none items-end justify-center rounded-md border border-line bg-white pb-1">
          <span className="rounded-sm bg-ink px-0.5 font-mono text-[8px] text-white">{fileExt(a)}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{a.name ?? "File"}</span>
          <span className="mono">{formatSize(a.size) || fileExt(a)}</span>
        </span>
        <Icon name="download" size={15} className="text-ink-2" />
      </a>
    );
  }
  const embed = videoEmbed(a.url, a.start, a.end);
  if (embed) {
    return (
      <div>
        <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-black">
          <iframe src={embed.src} title={a.name || `${embed.provider} video`} className="absolute inset-0 h-full w-full" loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segment a={a} />
          {a.name && <span className="mt-1.5 text-[12.5px] text-ink-2">{a.name}</span>}
        </div>
      </div>
    );
  }
  return <div><LinkPreview a={a} /><Segment a={a} /></div>;
}
