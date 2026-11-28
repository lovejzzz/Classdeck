"use client";

import { useEffect, useState } from "react";
import { invokeTool, op, uploadFile } from "@/lib/client";
import { coverOf } from "@/lib/coverlib";
import { toast } from "@/lib/toast";
import type { Course } from "@/lib/types";
import { CourseCover, PaperCover } from "../CourseCover";
import { Icon } from "../Icon";

type Idea = { motif: string; color: string; seed: number };
type Photo = { image: string; credit?: string; title?: string };
type Look = "paper" | "photo" | "drawn";

/**
 * The course's cover: a big preview and three ways to change it. Paper: four paper covers your AI picks from what the
 * course teaches (or its name does, without AI). Photo: open photos to search, the words already filled in. Drawn: a
 * picture your Google key draws (only with one). Or upload your own, or go back to the automatic one.
 */
export function CoverPicker({ course, onChanged, readOnly }: { course: Course; onChanged: () => void; readOnly?: boolean }) {
  const [look, setLook] = useState<Look>("paper");
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [byAi, setByAi] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const [scene, setScene] = useState("");
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [drawn, setDrawn] = useState<{ url: string; by: string }[]>([]);
  const [google, setGoogle] = useState(false);
  const now = coverOf(course);

  // Whether the teacher has a Google key (for Drawn).
  useEffect(() => {
    let live = true;
    fetch("/api/ai").then((r) => r.json()).then((j) => live && setGoogle(!!j?.ai?.providers?.gemini)).catch(() => {});
    return () => { live = false; };
  }, []);

  async function set(cover: Course["cover"] | null, note = "Cover changed") {
    const r = await op<{ ok?: boolean; error?: string }>(course.id, { op: "setCover", cover });
    onChanged();
    if (r.ok === false) toast(r.error ?? "That didn’t save", { icon: "x", tone: "bad" });
    else toast(note, { icon: "image" });
  }
  async function suggest() {
    setBusy("ideas");
    const r = await op<{ ok?: boolean; covers?: Idea[]; photo?: string; scene?: string; byAi?: boolean }>(course.id, { op: "suggestCovers" });
    setBusy(null);
    if (!r.covers) { toast("Couldn’t make covers. Try again.", { icon: "x", tone: "bad" }); return null; }
    setIdeas(r.covers);
    setByAi(!!r.byAi);
    if (r.photo && !words) setWords(r.photo);
    if (r.scene) setScene(r.scene);
    return r;
  }
  async function search(q = words) {
    if (!q.trim()) return;
    setBusy("photos");
    // Very specific words find few open photos: with fewer than four, try again with the last word left off.
    let words = q.trim().split(/\s+/), items: Photo[] = [];
    for (;;) {
      const r = await invokeTool({ courseId: course.id, connector: "openverse", action: "search", input: { q: words.join(" ") } });
      if (!r.ok) { setBusy(null); setPhotos([]); return toast(r.error, { icon: "x", tone: "bad" }); }
      const found = ((r.result as { items?: Photo[] }).items ?? []).filter((x) => x.image);
      if (found.length > items.length) items = found;
      if (items.length >= 4 || words.length < 2) break;
      words = words.slice(0, -1);
    }
    setBusy(null);
    setPhotos(items.slice(0, 8));
  }
  async function draw() {
    setBusy("draw");
    const r = await op<{ ok?: boolean; url?: string; by?: string; error?: string }>(course.id, { op: "drawCover", scene: scene || course.title });
    setBusy(null);
    if (!r.url) return toast(r.error ?? "Couldn’t draw a cover", { icon: "x", tone: "bad" });
    setDrawn((d) => [{ url: r.url!, by: r.by ?? "" }, ...d].slice(0, 4));
  }
  async function pickLook(l: Look) {
    setLook(l);
    // The first time: the AI reads the course once, for paper ideas and the words to search photos with.
    if (!ideas && busy !== "ideas") {
      const r = await suggest();
      if (l === "photo" && r?.photo) void search(r.photo);
    } else if (l === "photo" && !photos) void search();
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first four ideas come with the section
    if (!readOnly) void suggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const same = (i: Idea) => !now.image && now.motif === i.motif && now.color === i.color;
  const tab = (id: Look, label: string) => (
    <button key={id} type="button" onClick={() => pickLook(id)} aria-pressed={look === id}
      className={`press h-7 rounded-full border px-3 text-[12.5px] ${look === id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-line-strong"}`}>{label}</button>
  );

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[12px] border border-line">
        <CourseCover c={course} />
        {now.credit && <span className="absolute bottom-1.5 right-2 max-w-[80%] truncate rounded bg-white/85 px-1.5 text-[10.5px] text-ink-3">{now.credit}</span>}
      </div>
      {!readOnly && (
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {tab("paper", "Paper")}
            {tab("photo", "Photo")}
            {google && tab("drawn", "Drawn")}
          </div>

          {look === "paper" && (
            <>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {(ideas ?? Array.from({ length: 4 }, () => null)).map((i, k) => i ? (
                  <button key={k} type="button" onClick={() => set({ motif: i.motif, color: i.color, seed: i.seed })} aria-label={`Use paper cover ${k + 1}`}
                    className={`press aspect-[16/10] overflow-hidden rounded-[8px] border ${same(i) ? "border-ink ring-2 ring-ink/80" : "border-line hover:border-line-strong"}`}>
                    <PaperCover motif={i.motif} color={i.color} seed={i.seed} />
                  </button>
                ) : <span key={k} className="aspect-[16/10] animate-pulse rounded-[8px] bg-lane" />)}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => suggest()} disabled={busy === "ideas"} className="btn btn-ghost press h-8 px-3 text-[12.5px]">
                  <Icon name="sparkles" size={12} /> {busy === "ideas" ? "Thinking…" : "Four more"}
                </button>
                {ideas && <span className="text-[11.5px] text-ink-3">{byAi ? "Picked by your AI from the course" : "From the course’s name"}</span>}
              </div>
            </>
          )}

          {look === "photo" && (
            <>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
                <input value={words} onChange={(e) => setWords(e.target.value)} placeholder="Search open photos" aria-label="Search photos" className="field h-8 min-w-0 flex-1 py-0 text-[13px]" />
                <button className="btn btn-ghost press h-8 px-3 text-[12.5px]" disabled={busy === "photos"}>{busy === "photos" ? "Searching…" : "Search"}</button>
              </form>
              <div className="mt-2.5 grid grid-cols-4 gap-2">
                {busy === "photos" || !photos ? Array.from({ length: 8 }, (_, k) => <span key={k} className="aspect-[16/10] animate-pulse rounded-[8px] bg-lane" />)
                  : photos.length ? photos.map((p) => (
                    <button key={p.image} type="button" onClick={() => set({ image: p.image, credit: p.credit })} title={p.credit} aria-label={`Use photo: ${p.title ?? "photo"}`}
                      className={`press aspect-[16/10] overflow-hidden rounded-[8px] border ${now.image === p.image ? "border-ink ring-2 ring-ink/80" : "border-line hover:border-line-strong"}`}>
                      {/* A photo the site no longer serves leaves the grid instead of showing an empty box. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt="" className="h-full w-full object-cover" onError={() => setPhotos((ps) => ps?.filter((x) => x.image !== p.image) ?? ps)} />
                    </button>
                  )) : <span className="col-span-4 text-[12.5px] text-ink-3">No photos for that. Try other words.</span>}
              </div>
            </>
          )}

          {look === "drawn" && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {drawn.map((d) => (
                  <button key={d.url} type="button" onClick={() => set({ image: d.url, credit: d.by })} aria-label="Use this drawing"
                    className={`press aspect-[16/10] overflow-hidden rounded-[8px] border ${now.image === d.url ? "border-ink ring-2 ring-ink/80" : "border-line hover:border-line-strong"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
                {busy === "draw" && <span className="aspect-[16/10] animate-pulse rounded-[8px] bg-lane" />}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={draw} disabled={busy === "draw" || busy === "ideas"} className="btn btn-ghost press h-8 px-3 text-[12.5px]">
                  <Icon name="sparkles" size={12} /> {busy === "draw" ? "Drawing…" : drawn.length ? "Draw another" : "Draw one"}
                </button>
                <span className="text-[11.5px] text-ink-3">With your Google key (a few cents a picture)</span>
              </div>
            </>
          )}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <label className="btn btn-quiet press h-8 cursor-pointer px-2.5 text-[12.5px]">
              <Icon name="upload" size={12} /> {busy === "upload" ? "Uploading…" : "Upload"}
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusy("upload");
                const r = await uploadFile(f);
                setBusy(null);
                if (!r.ok) return toast(r.error, { icon: "x", tone: "bad" });
                if (r.kind !== "image") return toast("That isn’t a picture", { icon: "x", tone: "bad" });
                await set({ image: r.url });
              }} />
            </label>
            {course.cover && <button type="button" onClick={() => set(null, "Back to the automatic cover")} className="btn btn-quiet press h-8 px-2.5 text-[12.5px]"><Icon name="reset" size={12} /> Automatic</button>}
          </div>
        </div>
      )}
    </div>
  );
}
