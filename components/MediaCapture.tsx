"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/** The browser's built-in speech recognition (Chrome, Edge, Safari). Not in TypeScript's DOM types. */
interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
function makeRecognizer(): Recognizer | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

function pickType(video: boolean) {
  const options = video ? ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"] : ["audio/webm", "audio/mp4"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

/**
 * Record audio or video in the browser. Video shows a live, mirrored preview while recording.
 * After stopping you can play it back, then keep it, redo it, or throw it away.
 */
export function MediaCapture({ video, screen = false, onKeep, onCancel, label, closer = false }: {
  video: boolean; screen?: boolean; onKeep: (file: File, transcript?: string, duration?: number, fps?: number) => void; onCancel: () => void; label?: string;
  /** Offer "look closely at gestures": the AI watching the video samples more frames a second. */
  closer?: boolean;
}) {
  const [close, setClose] = useState(false);
  const [phase, setPhase] = useState<"ready" | "recording" | "review">("ready");
  const [error, setError] = useState<string | null>(() =>
    typeof navigator !== "undefined" && !navigator.mediaDevices ? "This browser can’t record. Try uploading a file instead." : null,
  );
  const [secs, setSecs] = useState(0);
  // The microphone or camera is open. Until then Start waits, and after a few seconds says why.
  const [live, setLive] = useState(false);
  const [slow, setSlow] = useState(false);
  const [levels, setLevels] = useState<number[]>(Array(32).fill(0.08));
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const raf = useRef(0);
  // Live captions: final phrases plus the one still being heard.
  const [said, setSaid] = useState("");
  const [hearing, setHearing] = useState("");
  const recog = useRef<Recognizer | null>(null);
  const listening = useRef(false);
  const [captions] = useState(() => !!makeRecognizer() && !screen);

  // Open the camera/microphone right away so the preview is live before you press record.
  useEffect(() => {
    let cancelled = false;
    // Screen recording: the shared screen plus your microphone, mixed into one stream.
    const open = screen
      ? async () => {
          const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
          return new MediaStream([...display.getVideoTracks(), ...(mic?.getAudioTracks() ?? display.getAudioTracks())]);
        }
      : () => navigator.mediaDevices.getUserMedia(video ? { audio: true, video: { width: 1280, height: 720, facingMode: "user" } } : { audio: true });
    (navigator.mediaDevices ? open() : Promise.reject())
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        setLive(true);
        if (preview.current) preview.current.srcObject = s;
      })
      .catch(() => setError(screen ? "Screen sharing was cancelled or blocked." : video ? "Couldn’t use the camera. Check this site’s camera and microphone permission." : "Couldn’t use the microphone. Check this site’s microphone permission."));
    const wait = setTimeout(() => setSlow(true), 5000);
    return () => {
      cancelled = true;
      clearTimeout(wait);
      listening.current = false;
      recog.current?.stop();
      cancelAnimationFrame(raf.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [video, screen]);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  function start() {
    const s = stream.current;
    if (!s) return;
    const type = pickType(video);
    // Kept small so uploads are quick on school Wi-Fi: about 7 MB a minute for 720p video, under 1 MB a minute for audio.
    const r = new MediaRecorder(s, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 64_000, ...(video ? { videoBitsPerSecond: screen ? 1_200_000 : 900_000 } : {}) });
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    if (captions) {
      setSaid("");
      setHearing("");
      const sr = makeRecognizer();
      if (sr) {
        sr.continuous = true;
        sr.interimResults = true;
        sr.lang = navigator.language || "en-US";
        sr.onresult = (e) => {
          let fin = "";
          let live = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) fin += res[0].transcript;
            else live += res[0].transcript;
          }
          if (fin) setSaid((x) => `${x} ${fin}`.trim());
          setHearing(live);
        };
        // Recognition stops by itself after silences; keep it going while recording.
        sr.onend = () => {
          if (listening.current) try { sr.start(); } catch {}
        };
        sr.onerror = () => {};
        listening.current = true;
        try { sr.start(); } catch {}
        recog.current = sr;
      }
    }
    r.onstop = () => {
      listening.current = false;
      recog.current?.stop();
      setHearing("");
      const b = new Blob(chunks, { type: r.mimeType || (video ? "video/webm" : "audio/webm") });
      setBlob(b);
      setUrl(URL.createObjectURL(b));
      setPhase("review");
    };
    r.start(250);
    rec.current = r;
    setPhase("recording");
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 64;
    ctx.createMediaStreamSource(s).connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    const t0 = performance.now();
    const tick = () => {
      an.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      setLevels((l) => [...l.slice(1), Math.max(0.08, Math.min(1, peak * 2.4))]);
      setSecs((performance.now() - t0) / 1000);
      if (r.state === "recording") raf.current = requestAnimationFrame(tick);
      else ctx.close();
    };
    raf.current = requestAnimationFrame(tick);
  }

  function keep() {
    if (!blob) return;
    const ext = blob.type.includes("mp4") ? (video ? "mp4" : "m4a") : video ? "webm" : "weba";
    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).replace(":", "");
    onKeep(new File([blob], `${screen ? "screen" : video ? "video" : "recording"}-${stamp}.${ext}`, { type: blob.type }), said.trim() || undefined, Math.round(secs), closer && close ? 4 : undefined);
  }

  const mmss = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

  return (
    <div className="rise overflow-hidden rounded-xl border border-line bg-[#fafaf9]">
      {video && (
        <div className="relative aspect-video bg-ink">
          {phase !== "review" ? (
            <video ref={preview} autoPlay muted playsInline className={`h-full w-full ${screen ? "object-contain" : "-scale-x-100 object-cover"}`} />
          ) : (
            url && <video src={url} controls playsInline className="h-full w-full object-contain" />
          )}
          {phase === "recording" && (
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[12px] text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-bad" /> {mmss}
            </span>
          )}
        </div>
      )}
      <div className="p-3">
        {label && phase === "ready" && <p className="mb-2 text-[12.5px] text-ink-3">{label}</p>}
        {phase === "ready" && (
          <div className="flex items-center gap-2">
            <button onClick={start} disabled={!!error || !live} className="btn btn-dark press disabled:opacity-60"><span className={`h-2 w-2 rounded-full bg-bad ${live ? "" : "animate-pulse"}`} /> {live ? `Start ${screen ? "screen recording" : video ? "video" : "recording"}` : `Waiting for the ${screen ? "screen" : video ? "camera" : "microphone"}…`}</button>
            <button onClick={onCancel} className="btn btn-quiet press">Cancel</button>
          </div>
        )}
        {phase === "recording" && (
          <div className="flex items-center gap-3">
            <button onClick={() => rec.current?.stop()} className="btn btn-dark press"><Icon name="stop" size={12} /> Stop</button>
            <div className="flex h-8 flex-1 items-center gap-[2px]" aria-hidden="true">
              {levels.map((v, i) => <span key={i} className="flex-1 rounded-full bg-bad/80 transition-[height] duration-75" style={{ height: `${v * 100}%` }} />)}
            </div>
            <span className="mono w-10 text-right text-bad">{mmss}</span>
          </div>
        )}
        {captions && (phase === "recording" || (phase === "review" && said)) && (
          <p className="mt-2.5 max-h-24 overflow-y-auto rounded-lg bg-white px-3 py-2 text-[13px] leading-relaxed text-ink-2" aria-live="polite">
            <span className="mr-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{phase === "recording" ? "Live transcript" : "Transcript"}</span>
            {said} <span className="text-ink-3">{hearing}</span>
            {phase === "recording" && !said && !hearing && <span className="text-ink-3">Start speaking…</span>}
          </p>
        )}
        {phase === "review" && url && (
          <div className="mt-2 space-y-2">
            {!video && <audio src={url} controls className="h-9 w-full" />}
            {closer && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-white px-3 py-2 text-[12.5px] text-ink-2">
                <input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1b1b1a]" />
                <span><span className="font-medium text-ink">Look closely at my gestures</span><span className="block text-[11.5px] text-ink-3">The AI watches more frames a second, so it catches quick hand movements. Its feedback takes a little longer.</span></span>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={keep} className="btn btn-dark press"><Icon name="check" size={13} /> Keep this take</button>
              <button onClick={() => { setPhase("ready"); setBlob(null); setSecs(0); }} className="btn btn-ghost press">Redo</button>
              <button onClick={onCancel} className="btn btn-quiet press">Discard</button>
            </div>
          </div>
        )}
        {error && <p className="mt-2 text-[12.5px] text-bad">{error}</p>}
        {!error && !live && slow && phase === "ready" && (
          <p className="mt-2 text-[12.5px] text-ink-3" role="status">
            {screen ? "Pick a screen or window to share in your browser’s prompt." : `Allow the ${video ? "camera and microphone" : "microphone"} when your browser asks. If nothing asks, check this site’s permissions in the address bar, or cancel and upload a recording instead.`}
          </p>
        )}
      </div>
    </div>
  );
}
