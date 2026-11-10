"use client";

import { useState } from "react";
import { Icon } from "./Icon";

interface Result { id: string; title: string; url: string; thumb: string; credit: string }

/** Search openly licensed images (Openverse) and pick one; the credit line comes along. */
export function ImageSearch({ onPick, onCancel }: { onPick: (r: Result) => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/images?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => ({ ok: false, error: "Couldn’t search" }));
    setBusy(false);
    if (r.ok) setResults(r.results);
    else setError(r.error);
  }

  return (
    <div className="rise rounded-xl border border-line bg-[#fafaf9] p-3">
      <form onSubmit={search} className="flex gap-2">
        <div className="relative flex-1">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search openly licensed images" aria-label="Image search" className="field pr-9" />
          <Icon name="search" size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
        </div>
        <button type="submit" disabled={busy} className="btn btn-dark press h-auto">{busy ? "Searching…" : "Search"}</button>
        <button type="button" onClick={onCancel} className="btn btn-quiet press h-auto">Cancel</button>
      </form>
      {error && <p className="mt-2 text-[12.5px] text-bad">{error}</p>}
      {busy && !results && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton aspect-square" />)}</div>}
      {results && (
        results.length ? (
          <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {results.map((r, i) => (
              <button key={r.id} onClick={() => onPick(r)} title={r.credit} style={{ "--i": i } as React.CSSProperties}
                className="pop press group relative aspect-square overflow-hidden rounded-lg border border-line bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.thumb} alt={r.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-ink-3">No images found. Try another word.</p>
        )
      )}
      <p className="mt-2 text-[11.5px] text-ink-3">Images come from Openverse with their license and credit attached.</p>
    </div>
  );
}
