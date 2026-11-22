"use client";

import { useEffect, useRef, useState } from "react";
import { hash } from "@/lib/cards";

// A recording's real waveform: its loudness in a row of bars. Each file is decoded once (and only when it scrolls into
// view); until then, or if it can't be read (a link to another site that doesn't allow it), the bars are a stand-in.

const RES = 96;
const peaks = new Map<string, Promise<number[] | null>>();

/** Our own uploads are read through this site (online they live in storage on another host, which a page can't read). */
const source = (url: string) => (url.startsWith("/api/upload/") ? `${url}?wave=1` : url);

function load(url: string): Promise<number[] | null> {
  let p = peaks.get(url);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(source(url));
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
        if (!Ctx) return null;
        const audio = await new Promise<AudioBuffer>((ok, bad) => {
          const r = new Ctx(1, 1, 44100).decodeAudioData(buf, ok, bad);
          if (r && typeof (r as Promise<AudioBuffer>).catch === "function") (r as Promise<AudioBuffer>).catch(bad);
        });
        const ch = audio.getChannelData(0);
        const step = Math.max(1, Math.floor(ch.length / RES));
        const out: number[] = [];
        for (let i = 0; i < RES; i++) {
          let sum = 0, n = 0;
          // Loudness of this slice (root mean square), sampling every few frames: plenty for a picture.
          for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += 4) { sum += ch[j] * ch[j]; n++; }
          out.push(n ? Math.sqrt(sum / n) : 0);
        }
        const top = Math.max(...out);
        return top > 0 ? out.map((v) => v / top) : null;
      } catch {
        return null;
      }
    })();
    peaks.set(url, p);
  }
  return p;
}

/** The waveform's bar heights (0–1) for `url`, once it's visible and decoded; null until then. */
export function useWaveform(url: string, bars: number, el: React.RefObject<HTMLElement | null>) {
  const [hs, setHs] = useState<number[] | null>(null);
  useEffect(() => {
    let live = true;
    const node = el.current;
    const go = () => load(url).then((p) => {
      if (!live || !p) return;
      // Fold the fine slices into the bars asked for, keeping each group's loudest.
      const per = p.length / bars;
      setHs(Array.from({ length: bars }, (_, i) => Math.max(...p.slice(Math.floor(i * per), Math.max(Math.floor(i * per) + 1, Math.floor((i + 1) * per))))));
    });
    if (!node || typeof IntersectionObserver === "undefined") { go(); return () => { live = false; }; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: "200px" });
    io.observe(node);
    return () => { live = false; io.disconnect(); };
  }, [url, bars, el]);
  return hs;
}

/**
 * A row of bars showing a recording. `done` (0–1) colours the part already played. Sized by its parent: it fills the
 * height it's given.
 */
export function Waveform({ url, seed, bars = 18, done = 0, className = "", on = "bg-[#4b56a8]", off = "bg-ink/60" }: {
  url: string; seed: string; bars?: number; done?: number; className?: string; on?: string; off?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const real = useWaveform(url, bars, ref);
  const s = hash(seed);
  return (
    <div ref={ref} className={`relative flex items-center gap-[3px] ${className}`}>
      {Array.from({ length: bars }, (_, i) => {
        const h = real ? 0.12 + real[i] * 0.88 : 0.25 + Math.abs(Math.sin(i * 1.7 + s * 9)) * 0.75;
        return <span key={i} className={`w-[3px] rounded-full transition-[height,background-color] duration-500 ${done > 0 && i / bars < done ? on : off}`} style={{ height: `${h * 100}%` }} />;
      })}
    </div>
  );
}
