"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/** Take a still photo with the camera, review it, then keep it or retake. */
export function PhotoCapture({ onKeep, onCancel }: { onKeep: (file: File) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 1280, height: 960, facingMode: "user" } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError("Couldn’t use the camera. Check this site’s camera permission."));
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function take() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    c.toBlob((b) => b && setShot({ url: URL.createObjectURL(b), blob: b }), "image/jpeg", 0.88);
    setFlash((f) => f + 1);
  }

  return (
    <div className="rise overflow-hidden rounded-xl border border-line bg-[#fafaf9]">
      <div className="relative aspect-[4/3] bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {shot ? <img src={shot.url} alt="Your photo" className="h-full w-full object-contain" /> : <video ref={video} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />}
        {flash > 0 && <span key={flash} className="fade pointer-events-none absolute inset-0 bg-white" style={{ animation: "fade 0.35s ease reverse both" }} />}
      </div>
      <div className="flex flex-wrap gap-2 p-3">
        {shot ? (
          <>
            <button onClick={() => onKeep(new File([shot.blob], `photo-${Date.now().toString(36)}.jpg`, { type: "image/jpeg" }))} className="btn btn-dark press"><Icon name="check" size={13} /> Use this photo</button>
            <button onClick={() => setShot(null)} className="btn btn-ghost press">Retake</button>
          </>
        ) : (
          <button onClick={take} disabled={!!error} className="btn btn-dark press"><Icon name="camera" size={13} /> Take photo</button>
        )}
        <button onClick={onCancel} className="btn btn-quiet press">Cancel</button>
      </div>
      {error && <p className="px-3 pb-3 text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}
