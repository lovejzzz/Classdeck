"use client";

import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import type { Editor } from "@tiptap/react";
import { RichBodyEditor } from "./teacher/RichBodyEditor";
import { RichText } from "./RichText";
import { Avatar, Icon } from "./Icon";

const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const COLORS = ["#4b56a8", "#1f8a5b", "#b5542b", "#8a3fa0", "#0f7c8c", "#a8326b", "#6b6b14", "#2f6fb5"];
const colorOf = (name: string) => COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];

/**
 * Keeps a Yjs doc in step with everyone else who has it open: local edits go to the server (a few at a time), the
 * others' edits and cursors arrive by server-sent events. `seed` says this page should put in the starting text.
 */
class Provider {
  awareness: Awareness;
  private es: EventSource;
  private queue: Uint8Array[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private listener = Math.floor(Math.random() * 1e9);
  /** The doc changed here since the text was last sent. */
  dirty = false;
  constructor(private courseId: string, private key: string, public doc: Y.Doc, onInit: (seed: boolean) => void, onPeers: () => void) {
    this.awareness = new Awareness(doc);
    doc.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      this.dirty = true;
      this.queue.push(u);
      this.flushSoon();
    });
    this.awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === "remote") return onPeers();
      if (![...added, ...updated, ...removed].includes(doc.clientID)) return;
      void this.post({ cursor: { client: doc.clientID, update: b64(encodeAwarenessUpdate(this.awareness, [doc.clientID])) } });
    });
    this.es = new EventSource(`/api/collab/${encodeURIComponent(courseId)}?doc=${encodeURIComponent(key)}&listener=${this.listener}`);
    this.es.addEventListener("init", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { state: string; cursors: string[]; seed: boolean };
      Y.applyUpdate(doc, unb64(d.state), this);
      for (const c of d.cursors) applyAwarenessUpdate(this.awareness, unb64(c), "remote");
      onInit(d.seed);
    });
    this.es.addEventListener("update", (e) => Y.applyUpdate(doc, unb64(JSON.parse((e as MessageEvent).data)), this));
    this.es.addEventListener("cursor", (e) => applyAwarenessUpdate(this.awareness, unb64(JSON.parse((e as MessageEvent).data)), "remote"));
  }
  post(body: object) {
    return fetch(`/api/collab/${encodeURIComponent(this.courseId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc: this.key, listener: this.listener, ...body }), keepalive: true })
      .then((r) => r.ok).catch(() => false);
  }
  private flushSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 120);
  }
  private async flush() {
    if (!this.queue.length) return;
    const merged = Y.mergeUpdates(this.queue.splice(0));
    // Kept until it's in: a change that didn't reach the server is sent again with the next one.
    if (!(await this.post({ update: b64(merged) }))) { this.queue.unshift(merged); this.timer = setTimeout(() => void this.flush(), 3000); }
  }
  destroy() {
    clearTimeout(this.timer);
    void this.flush();
    removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    this.es.close();
  }
}

type Version = { at: number; md: string; by: string[] };

/**
 * A shared Text card's document (Who writes: Each group, or Whole class): everyone in it writes together, seeing
 * each other's cursors with names. History lists the versions kept as they wrote (every few minutes), with who wrote
 * in each, to look at or go back to.
 */
export function SharedDoc({ courseId, docKey, template, name, readOnly, onText }: {
  courseId: string; docKey: string; template: string; name: string; readOnly?: boolean;
  /** The text as Markdown, whenever it changes here. */
  onText?: (md: string) => void;
}) {
  const [setup, setSetup] = useState<{ doc: Y.Doc; provider: Provider } | null>(null);
  const [ready, setReady] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [history, setHistory] = useState<Version[] | null>(null);
  const [viewing, setViewing] = useState<Version | null>(null);
  const editor = useRef<Editor | null>(null);
  const prov = useRef<Provider | null>(null);
  const seedWanted = useRef(false);
  const textTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const doc = new Y.Doc();
    let provider: Provider | null = null;
    const peersNow = () => setPeers([...(provider?.awareness.getStates() ?? new Map()).entries()].filter(([c]) => c !== doc.clientID).map(([, s]) => (s as { user?: { name?: string } }).user?.name).filter((x): x is string => !!x));
    provider = new Provider(courseId, docKey, doc, (seed) => {
      seedWanted.current = seed;
      setReady(true);
      seedIfEmpty();
    }, peersNow);
    prov.current = provider;
    setSetup({ doc, provider });
    return () => { provider?.destroy(); doc.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, docKey]);

  /** The first writer to open an empty document puts the card's starting text in. */
  function seedIfEmpty() {
    const e = editor.current;
    if (!e || !seedWanted.current || readOnly) return;
    seedWanted.current = false;
    if (e.isEmpty && template.trim()) {
      e.commands.setContent(template, { contentType: "markdown" });
      sendText(e, true);
    }
  }
  function sendText(e: Editor, keep = false) {
    clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => {
      const md = e.getMarkdown();
      onText?.(md);
      void prov.current?.post({ md, keep });
    }, keep ? 0 : 1500);
  }
  async function openHistory() {
    const r = await fetch(`/api/collab/${encodeURIComponent(courseId)}?doc=${encodeURIComponent(docKey)}&history=1`).then((x) => x.json()).catch(() => null);
    setHistory(r?.history ?? []);
    setViewing(null);
  }
  function restore(v: Version) {
    const e = editor.current;
    if (!e) return;
    e.commands.setContent(v.md, { contentType: "markdown" });
    sendText(e, true);
    setHistory(null);
    setViewing(null);
  }
  const when = (at: number) => new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  if (!setup) return <div className="h-40 animate-pulse rounded-xl bg-lane" />;
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${ready ? "bg-ok" : "bg-line-strong"}`} />{ready ? "Live" : "Connecting…"}
        </span>
        {peers.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="flex -space-x-1.5">{peers.slice(0, 5).map((p, i) => <span key={i} className="rounded-full ring-2 ring-white"><Avatar name={p} size={18} /></span>)}</span>
            {peers.length === 1 ? `${peers[0]} is here` : `${peers.slice(0, 2).join(", ")}${peers.length > 2 ? ` and ${peers.length - 2} more` : ""} are here`}
          </span>
        )}
        <span className="flex-1" />
        <button onClick={() => (history ? setHistory(null) : void openHistory())} className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="clock" size={12} /> History</button>
      </div>
      {history && (
        <div className="pop mb-2 rounded-xl border border-line bg-white p-2 text-[13px]">
          {viewing ? (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <button onClick={() => setViewing(null)} className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="back" size={12} /> Versions</button>
                <span className="flex-1 text-[12.5px] text-ink-2">{when(viewing.at)}{viewing.by.length ? ` · ${viewing.by.join(", ")}` : ""}</span>
                {!readOnly && <button onClick={() => restore(viewing)} className="btn btn-dark press h-7 px-2.5 text-[12px]">Restore this version</button>}
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg bg-lane/60 px-3 py-2"><RichText text={viewing.md} className="text-[13px] leading-relaxed" /></div>
            </div>
          ) : history.length ? (
            <div className="max-h-56 overflow-y-auto">
              {history.map((v, i) => (
                <button key={v.at} onClick={() => setViewing(v)} className="press flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-lane">
                  <span className="mono w-32 flex-none text-[12px] text-ink-2">{when(v.at)}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{v.by.length ? v.by.join(", ") : "Starting text"}</span>
                  {i === 0 && <span className="chip h-5 text-[11px]">Latest</span>}
                </button>
              ))}
            </div>
          ) : <p className="px-2 py-1.5 text-[12.5px] text-ink-3">No versions yet. One is kept every few minutes while people write.</p>}
        </div>
      )}
      <RichBodyEditor placeholder="Write here, together." label={readOnly ? "Shared text" : "Shared text, written together"} collab={{
        doc: setup.doc,
        provider: setup.provider,
        user: { name, color: colorOf(name) },
        readOnly,
        onReady: (e) => { editor.current = e; seedIfEmpty(); },
        onLocalChange: (e) => sendText(e),
      }} />
    </div>
  );
}
