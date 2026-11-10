// Image search through Openverse (openly licensed images). Returns thumbnails, full URLs, and credit lines.
// Openverse is free and keyless but sometimes slow, so results are cached and a slow request is retried once.

interface Result { id: string; title: string; url: string; thumb: string; credit: string; source?: string }
const cache = new Map<string, { at: number; results: Result[] }>();

async function search(q: string, timeout: number): Promise<Result[]> {
  const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=18&mature=false`, {
    headers: { "User-Agent": "classdeck-prototype/0.1" },
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as { results?: { id: string; title?: string; url: string; thumbnail?: string; creator?: string; license?: string; license_version?: string; foreign_landing_url?: string }[] };
  return (data.results ?? [])
    .filter((r) => r.url?.startsWith("https://"))
    .map((r) => ({
      id: r.id,
      title: r.title ?? "Image",
      url: r.url,
      thumb: r.thumbnail ?? r.url,
      credit: `${r.title ?? "Image"}${r.creator ? ` by ${r.creator}` : ""} · CC ${String(r.license ?? "").toUpperCase()} ${r.license_version ?? ""}`.trim(),
      source: r.foreign_landing_url,
    }));
}

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  if (!q) return Response.json({ ok: true, results: [] });
  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < 10 * 60_000) return Response.json({ ok: true, results: hit.results });
  for (const timeout of [5000, 7000]) {
    try {
      const results = await search(q, timeout);
      cache.set(q, { at: Date.now(), results });
      return Response.json({ ok: true, results });
    } catch {}
  }
  return Response.json({ ok: false, error: "Image search is slow right now. Try again in a moment." });
}
