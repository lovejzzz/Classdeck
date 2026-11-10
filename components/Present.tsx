"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Attachment } from "@/lib/types";
import { MediaView } from "./cards/Media";
import { Avatar, Icon } from "./Icon";

export interface Slide {
  id: string;
  author: string;
  text: string;
  work?: Attachment[];
  votes?: number;
  likes?: number;
  note?: string;
}

/**
 * Full-screen slideshow of posts for the shared screen in class.
 * Arrow keys, space, or clicking the left/right half move between slides. New posts that arrive
 * while presenting are added to the end with a small badge.
 */
export function Present({ title, subtitle, code, slides, onClose }: { title: string; subtitle?: string; code?: string; slides: Slide[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const seen = useRef(slides.length);
  const [fresh, setFresh] = useState(0);
  const total = slides.length + 1; // title slide first

  useEffect(() => {
    if (slides.length > seen.current) {
      setFresh(slides.length - seen.current);
    }
  }, [slides.length]);

  const go = (n: number) => {
    const next = Math.max(0, Math.min(total - 1, n));
    if (next === i) return;
    setDir(next > i ? 1 : -1);
    setI(next);
    if (next >= seen.current) {
      seen.current = Math.max(seen.current, next);
      setFresh(Math.max(0, slides.length - seen.current));
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(i + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(i - 1);
      }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(total - 1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  });

  const s = i > 0 ? slides[i - 1] : undefined;
  const size = s ? (s.text.length > 320 ? "text-[26px]" : s.text.length > 160 ? "text-[34px]" : "text-[44px]") : "";

  return createPortal(
    <div className="fade fixed inset-0 z-[70] flex flex-col bg-[#f4f3ef]" role="dialog" aria-modal="true" aria-label={`Presenting ${title}`}>
      <div className="flex h-14 flex-none items-center gap-3 px-6 text-[13px] text-ink-2">
        <span className="font-medium text-ink">{title}</span>
        <span className="mono">{i}/{slides.length}</span>
        {fresh > 0 && (
          <button onClick={() => go(slides.length - fresh + 1)} className="pop chip h-6 bg-ok/10 text-ok">{fresh} new</button>
        )}
        <span className="flex-1" />
        <span className="hidden text-ink-3 sm:inline">← → to move · Esc to exit</span>
        <button onClick={onClose} aria-label="Stop presenting" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={16} /></button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <button aria-label="Previous" onClick={() => go(i - 1)} className="absolute inset-y-0 left-0 z-10 w-1/4 cursor-w-resize" tabIndex={-1} />
        <button aria-label="Next" onClick={() => go(i + 1)} className="absolute inset-y-0 right-0 z-10 w-1/4 cursor-e-resize" tabIndex={-1} />
        <div key={i} className="absolute inset-0 flex items-center justify-center overflow-y-auto px-[8vw] py-6" style={{ animation: `${dir > 0 ? "slide-in-r" : "slide-in-l"} 0.5s var(--ease-out) both` }}>
          {!s ? (
            <div className="text-center">
              <div className="text-[14px] font-medium uppercase tracking-[0.14em] text-ink-3">{subtitle}</div>
              <h1 className="mt-4 text-[56px] font-semibold leading-[1.05] tracking-tight">{title}</h1>
              <p className="mt-6 text-[18px] text-ink-2">{slides.length} post{slides.length === 1 ? "" : "s"}</p>
              {code && (
                <div className="mt-10 inline-flex items-center gap-4 rounded-2xl bg-white px-6 py-4 shadow-[0_10px_30px_-16px_rgba(20,20,18,0.35)]">
                  <span className="text-[14px] text-ink-3">Join with code</span>
                  <span className="font-mono text-[40px] tracking-[0.2em]">{code}</span>
                </div>
              )}
            </div>
          ) : (
            <div className={`grid w-full max-w-6xl items-center gap-10 ${s.work?.length ? "lg:grid-cols-[1fr_1fr]" : ""}`}>
              <div>
                {s.text && <p className={`whitespace-pre-wrap font-medium leading-[1.3] tracking-tight ${size}`}>{s.text}</p>}
                <div className="mt-8 flex items-center gap-3 text-[16px] text-ink-2">
                  <Avatar name={s.author} size={34} />
                  <span>{s.author}</span>
                  {!!s.votes && <span className="chip h-7 bg-[#eef0fb] text-[13px] text-[#4b56a8]">▲ {s.votes}</span>}
                  {!!s.likes && <span className="chip h-7 text-[13px] text-[#bf3f39]">♥ {s.likes}</span>}
                </div>
                {s.note && <p className="mt-4 text-[15px] text-ink-3">{s.note}</p>}
              </div>
              {!!s.work?.length && <div className="relative z-20 space-y-3">{s.work.map((a) => <MediaView key={a.id} a={a} />)}</div>}
            </div>
          )}
        </div>
      </div>

      <div className="flex h-12 flex-none items-center justify-center gap-1.5">
        {Array.from({ length: total }, (_, k) => (
          <button key={k} onClick={() => go(k)} aria-label={k ? `Slide ${k}` : "Title slide"}
            className={`h-1.5 rounded-full transition-all duration-300 ${k === i ? "w-6 bg-ink" : "w-1.5 bg-line-strong hover:bg-ink-3"}`} />
        ))}
      </div>
    </div>,
    document.body,
  );
}
