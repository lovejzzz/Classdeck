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
      const q = new URLSearchParams({ rel: "0", modestbranding: "1" });
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
