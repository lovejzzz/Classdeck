/** "1:20" → 80, "95" → 95, "" → undefined. */
export function parseTime(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const parts = t.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function fmtTime(s?: number) {
  if (s === undefined) return "";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** If a link is a YouTube or Vimeo video, the embeddable player URL for it (with the segment applied). */
export function videoEmbed(url: string, start?: number, end?: number): { provider: string; src: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = u.searchParams.get("v") ?? (u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/)?.[1] ?? "");
      if (start === undefined && u.searchParams.get("t")) start = parseInt(u.searchParams.get("t")!, 10) || undefined;
    }
    if (id && /^[\w-]{6,20}$/.test(id)) {
      // enablejsapi: so the page can turn it down before it closes (see quietly).
      const q = new URLSearchParams({ rel: "0", modestbranding: "1", enablejsapi: "1" });
      if (start) q.set("start", String(start));
      if (end) q.set("end", String(end));
      return { provider: "YouTube", src: `https://www.youtube-nocookie.com/embed/${id}?${q}` };
    }
    if (host === "vimeo.com" && /^\/\d+/.test(u.pathname)) {
      const vid = u.pathname.match(/^\/(\d+)/)![1];
      return { provider: "Vimeo", src: `https://player.vimeo.com/video/${vid}${start ? `#t=${start}s` : ""}` };
    }
  } catch {}
  return null;
}

/** A player address with one more setting, before any #fragment (a Vimeo start time is one): "?" or "&" as it needs. */
export function withParam(src: string, param: string) {
  const [base, hash] = src.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}${param}${hash !== undefined ? `#${hash}` : ""}`;
}

/**
 * Fades a playing video or sound out, then pauses it. Stopping sound at once (pausing, or taking the player off the page)
 * cuts the wave mid-swing, which is heard as a click or pop; a short fade doesn't. Where a browser won't set the volume
 * (iPhone), it just pauses.
 */
export function fadeOut(el: HTMLMediaElement, ms = 160) {
  if (el.paused || el.muted || el.volume === 0 || (el as HTMLMediaElement & { _fading?: boolean })._fading) { el.pause(); return; }
  const f = el as HTMLMediaElement & { _fading?: boolean };
  f._fading = true;
  const from = el.volume, t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    try { el.volume = from * (1 - k) * (1 - k); } catch {}
    if (k < 1 && !el.paused) { requestAnimationFrame(step); return; }
    el.pause();
    try { el.volume = from; } catch {}
    f._fading = false;
  };
  requestAnimationFrame(step);
}

/** Turns down every video and sound inside this element (an embedded YouTube or Vimeo player too) as it closes. */
export function quietly(root: HTMLElement | null, ms = 160) {
  if (!root) return;
  root.querySelectorAll("video, audio").forEach((m) => fadeOut(m as HTMLMediaElement, ms));
  root.querySelectorAll("iframe").forEach((f) => {
    const w = f.contentWindow;
    if (!w) return;
    const yt = /youtube/.test(f.src), vimeo = /vimeo/.test(f.src);
    if (!yt && !vimeo) return;
    const send = (msg: object) => { try { w.postMessage(JSON.stringify(msg), "*"); } catch {} };
    const steps = 6;
    for (let i = 1; i <= steps; i++) setTimeout(() => {
      const v = (1 - i / steps) ** 2;
      if (yt) send({ event: "command", func: "setVolume", args: [Math.round(v * 100)] });
      else send({ method: "setVolume", value: v });
      if (i === steps) send(yt ? { event: "command", func: "pauseVideo", args: [] } : { method: "pause" });
    }, (ms / steps) * i);
  });
}

/**
 * A recording made in a browser (webm) often carries no length, so a player shows 0:00 and can't seek. Ask the
 * browser to find its end once (it reads the file to get there), then go back to the start.
 */
export function knowLength(el: HTMLMediaElement) {
  if (el.duration !== Infinity) return;
  const back = () => {
    if (!Number.isFinite(el.duration)) return;
    el.removeEventListener("durationchange", back);
    el.currentTime = 0;
  };
  el.addEventListener("durationchange", back);
  el.currentTime = 1e101;
}

/** A link to a video meeting (Zoom, Google Meet, Teams, Webex, Whereby): the service's name, so it shows as Join. */
export function meetingOf(url: string): string | undefined {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
  if (host === "zoom.us" || host.endsWith(".zoom.us") || host === "zoom.com" || host.endsWith(".zoom.com")) return "Zoom";
  if (host === "meet.google.com") return "Google Meet";
  if (host === "teams.microsoft.com" || host === "teams.live.com") return "Microsoft Teams";
  if (host.endsWith(".webex.com")) return "Webex";
  if (host === "whereby.com") return "Whereby";
  return undefined;
}
