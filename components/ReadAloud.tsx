"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * Reads a card's text aloud with the device's own voices (no service involved),
 * highlighting progress through the text. Works offline; speed is adjustable.
 */
export function ReadAloud({ text, big }: { text: string; big?: boolean }) {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [rate, setRate] = useState(1);
  const [progress, setProgress] = useState(0);
  const [supported] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);
  const utter = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  if (!supported || !text.trim()) return null;

  function play(from = 0, speed = rate) {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(from));
    u.rate = speed;
    u.lang = document.documentElement.lang || "en-US";
    const voice = synth.getVoices().find((v) => v.lang.startsWith(u.lang.slice(0, 2)) && /natural|premium|enhanced|google/i.test(v.name)) ?? synth.getVoices().find((v) => v.lang.startsWith(u.lang.slice(0, 2)));
    if (voice) u.voice = voice;
    u.onboundary = (e) => setProgress((from + e.charIndex) / text.length);
    u.onend = () => {
      setState("idle");
      setProgress(0);
    };
    utter.current = u;
    synth.speak(u);
    setState("playing");
  }

  function toggle() {
    const synth = window.speechSynthesis;
    if (state === "playing") {
      synth.pause();
      setState("paused");
    } else if (state === "paused") {
      synth.resume();
      setState("playing");
    } else play();
  }

  function speed(r: number) {
    setRate(r);
    // Changing speed mid-way restarts from roughly where we were.
    if (state !== "idle") play(Math.floor(progress * text.length), r);
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-white p-0.5 pr-1">
      <button onClick={toggle} aria-label={state === "playing" ? "Pause reading" : "Read this card aloud"}
        className={`press flex items-center gap-1.5 rounded-full px-2.5 ${big ? "h-9 text-[14px]" : "h-7 text-[12.5px] pointer-coarse:h-10 pointer-coarse:text-[14px]"} ${state === "idle" ? "text-ink-2 hover:text-ink" : "bg-ink text-white"}`}>
        <Icon name={state === "playing" ? "pause" : "audio"} size={13} />
        {state === "idle" ? "Read aloud" : state === "playing" ? "Pause" : "Resume"}
      </button>
      {state !== "idle" && (
        <>
          <span className="h-1 w-14 overflow-hidden rounded-full bg-lane" aria-hidden="true">
            <span className="block h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
          </span>
          <button onClick={() => { window.speechSynthesis.cancel(); setState("idle"); setProgress(0); }} aria-label="Stop reading" className="press flex h-7 w-7 pointer-coarse:h-10 pointer-coarse:w-10 items-center justify-center rounded-full text-ink-2 hover:text-ink"><Icon name="stop" size={11} /></button>
        </>
      )}
      <select value={rate} onChange={(e) => speed(Number(e.target.value))} aria-label="Reading speed" className="h-7 pointer-coarse:h-10 rounded-full bg-transparent px-1 font-mono text-[11.5px] text-ink-2 outline-none">
        {[0.75, 1, 1.25].map((r) => <option key={r} value={r}>{r}×</option>)}
      </select>
    </div>
  );
}
