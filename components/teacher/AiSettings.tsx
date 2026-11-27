"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { AI_PROVIDERS, providerMeta, rankModels, type AiModel, type AiProvider, type AiSetup, type AiStatus } from "@/lib/aimeta";
import { toast } from "@/lib/toast";

type Reply = { ok: boolean; error?: string; ai?: AiSetup; models?: AiModel[] };
const post = (body: object): Promise<Reply> =>
  fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));

/** A saved key's state: a short word by the title, and (when something's wrong) what to do, in a line below. */
function statusOf(status: AiStatus | undefined, busy: boolean, connected: boolean): { dot: string; word: string; more?: string } {
  if (busy) return { dot: "bg-ink-3 animate-pulse", word: "Checking…" };
  if (!connected) return { dot: "bg-line-strong", word: "Not connected" };
  if (!status || status.state === "ready") return { dot: "bg-ok", word: "Ready" };
  if (status.state === "no_credit") return { dot: "bg-bad", word: "Over its limit", more: status.message ?? "The key has no credit left or is over its limit. Add credit at the service and AI feedback starts working again." };
  if (status.state === "bad_key") return { dot: "bg-bad", word: "Key not accepted", more: "The service no longer accepts this key. Paste a new one." };
  return { dot: "bg-warn", word: "Didn’t answer", more: `The service didn’t answer the check${status.message ? ` (${status.message})` : ""}. It may work later.` };
}

/**
 * The teacher's own AI for feedback. Pick a service (each keeps its own saved key, so switching never loses one), paste
 * its key (checked and saved as soon as it's pasted), pick a model (saved as soon as it's picked). The light says
 * whether the key has credit.
 */
export function AiSettings({ aiTools = [] }: { /** The AI tutor tool's actions: what a connected AI unlocks on cards. */ aiTools?: { id: string; title: string; teacherOnly?: boolean }[] }) {
  const [setup, setSetup] = useState<AiSetup | null | undefined>(undefined);
  const [teacher, setTeacher] = useState(true);
  const [provider, setProvider] = useState<AiProvider>("gemini");
  // What's typed for each service and not yet saved: switching services keeps it.
  const [drafts, setDrafts] = useState<Partial<Record<AiProvider, string>>>({});
  const [replacing, setReplacing] = useState(false);
  const [models, setModels] = useState<Partial<Record<AiProvider, AiModel[]>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch("/api/ai").then((r) => { if (r.status === 401 || r.status === 403) setTeacher(false); return r.json(); }).then((j) => {
      setSetup(j.ai ?? null);
      if (j.ai?.active) setProvider(j.ai.active);
    }).catch(() => setSetup(null));
  }, []);

  const saved = setup?.providers[provider];
  // A service with a saved key: its models load (with the saved key) the first time it's shown.
  useEffect(() => {
    if (!saved || models[provider]) return;
    void post({ provider }).then((r) => { if (r.models) setModels((m) => ({ ...m, [provider]: r.models })); if (r.ai) setSetup(r.ai); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, !!saved]);

  async function send(body: object) {
    setBusy(true);
    const r = await post({ provider, ...body });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "That didn’t work"); return false; }
    setError(null);
    if (r.ai) setSetup(r.ai);
    if (r.models) setModels((m) => ({ ...m, [provider]: r.models }));
    return true;
  }
  // Pasting or typing a key: checked and saved a moment after it stops changing.
  function typeKey(v: string) {
    setDrafts((d) => ({ ...d, [provider]: v }));
    clearTimeout(timer.current);
    const key = v.trim();
    if (key.length < 20) return;
    timer.current = setTimeout(async () => {
      if (await send({ key })) { setDrafts((d) => ({ ...d, [provider]: "" })); setReplacing(false); }
    }, 700);
  }
  // Clicking a service: it's the one in use from now on, if it has a key saved.
  function pick(p: AiProvider) {
    if (p === provider) return;
    clearTimeout(timer.current);
    setProvider(p); setError(null); setReplacing(false);
    if (setup?.providers[p]?.model && setup.active !== p) void post({ provider: p, use: true }).then((r) => { if (r.ai) setSetup(r.ai); });
  }
  async function remove() {
    const r = await fetch(`/api/ai?provider=${provider}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    if (r?.ai) setSetup(r.ai);
    setModels((m) => ({ ...m, [provider]: undefined }));
    toast(`Removed your ${providerMeta(provider).company} key`, { icon: "x", tone: "plain" });
  }

  if (!teacher) return null;
  const meta = providerMeta(provider);
  const list = models[provider] ?? [];
  const ranked = rankModels(provider, list);
  const model = saved?.model ?? "";
  const picked = [...ranked.top, ...ranked.more].find((m) => m.id === model);
  const showInput = !saved || replacing;
  const st = statusOf(saved?.status, busy, !!saved);
  const video = meta.watchesVideo;
  // What this service does on cards, the same row for each, so switching shows the difference.
  const can = [
    { icon: "pencil", text: "Writing", on: true },
    { icon: "mic", text: "Recordings", on: true },
    { icon: "video", text: "Video", on: video, tip: video ? "Watches students’ videos: framing, posture, gestures, eye contact, pace" : "Reads what students said in a recording, but can’t watch the video" },
    { icon: "tool", text: `${aiTools.length} card tools`, on: true, tip: aiTools.map((t) => t.title).join(" · ") },
  ];
  return (
    <section id="ai" className="card p-6">
      <div className="flex items-center gap-2">
        <Icon name="sparkles" size={16} />
        <h2 className="flex-1 text-[16px] font-semibold">AI</h2>
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-2" role="status"><span className={`h-2 w-2 rounded-full ${st.dot}`} />{st.word}</span>
      </div>
      <p className="mt-1 text-[13px] text-ink-3">Your own AI account, for AI feedback and card tools in all your courses.</p>

      {/* One switcher: each service keeps its own saved key, so switching never loses one. */}
      <div className="mt-4 inline-flex rounded-[10px] border border-line-strong p-0.5" role="radiogroup" aria-label="AI service">
        {AI_PROVIDERS.map((p) => {
          const has = setup?.providers[p.id];
          return (
            <button key={p.id} role="radio" aria-checked={provider === p.id} onClick={() => pick(p.id)}
              className={`press flex h-8 items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] ${provider === p.id ? "bg-[#eef0fb] font-medium text-[#3d4796]" : "text-ink-2 hover:text-ink"}`}>
              {p.name}
              {has && <span className={`h-1.5 w-1.5 rounded-full ${has.status?.state === "no_credit" || has.status?.state === "bad_key" ? "bg-bad" : "bg-ok"}`} aria-label="key saved" />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2.5 md:grid-cols-2">
        <div>
          <span className="mb-1 flex items-center justify-between text-[12px] text-ink-3">
            <span>{meta.company} API key</span>
            {showInput && <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="text-[#4b56a8] hover:underline">Get a key</a>}
          </span>
          {showInput ? (
            <input key={provider} type="password" autoComplete="off" autoFocus={replacing} value={drafts[provider] ?? ""} onChange={(e) => typeKey(e.target.value)}
              placeholder={`Paste it (${meta.keyHint.replace(/^S/, "s")})`} aria-label={`${meta.company} API key`} className="field h-9 w-full py-0 font-mono text-[12.5px]" />
          ) : (
            <div className="flex h-9 items-center gap-3 rounded-[10px] border border-line bg-[#fafaf9] px-3 font-mono text-[12.5px] text-ink-2" data-tip="Stored encrypted; never shown again">
              <span className="flex-1">•••• {saved!.keyTail}</span>
              <button onClick={() => setReplacing(true)} className="font-sans text-[12px] text-ink-3 hover:text-ink">Replace</button>
              <button onClick={remove} className="font-sans text-[12px] text-ink-3 hover:text-bad">Remove</button>
            </div>
          )}
        </div>
        <label className="block">
          <span className="mb-1 block text-[12px] text-ink-3">Model</span>
          <select value={model} onChange={(e) => void send({ model: e.target.value })} disabled={!saved || !list.length || busy} className="field h-9 w-full py-0 text-[13px]">
            {(!saved || !list.length) && <option value={model}>{!saved ? "After you paste a key" : model || "Loading the models…"}</option>}
            {ranked.top.length > 0 && <optgroup label="Suggested">{ranked.top.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role ? ` · ${m.role}` : ""}</option>)}</optgroup>}
            {ranked.more.length > 0 && <optgroup label={`Other models (${ranked.more.length})`}>{ranked.more.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
          </select>
        </label>
      </div>
      {picked?.note && <p className="mt-1.5 text-[12px] text-ink-3 md:ml-[calc(50%+5px)]">{picked.note}</p>}

      {/* What it does, the same row for each service: what it can't do is greyed. */}
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3.5 text-[13px]">
        {can.map((c) => (
          <li key={c.text} data-tip={c.tip} className={`flex items-center gap-1.5 ${c.on ? "text-ink-2" : "text-ink-3/70"}`}>
            <Icon name={c.icon} size={15} />{c.on ? c.text : <span className="line-through decoration-ink-3/50" aria-label={`No ${c.text.toLowerCase()}`}>{c.text}</span>}
          </li>
        ))}
      </ul>

      {(error || st.more || (!saved && meta.keyNote)) && (
        <div className="mt-3 space-y-1">
          {error && <p className="flex items-center gap-2 text-[12.5px] text-bad" role="alert"><span className="h-2 w-2 flex-none rounded-full bg-bad" />{error}</p>}
          {!error && st.more && <p className="text-[12.5px] text-ink-2">{st.more}</p>}
          {/* Free keys' limits matter before choosing one; once a key works, only a limit reached is shown. */}
          {!saved && meta.keyNote && <p className="text-[12px] text-ink-3">{meta.keyNote}</p>}
        </div>
      )}
    </section>
  );
}

/** Whether this teacher has AI in use (for the card editor's switch): which service and model. */
export function useAiSetup() {
  const [setup, setSetup] = useState<{ provider: AiProvider; model: string } | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/ai").then((r) => r.json()).then((j: { ai?: AiSetup }) => {
      const a = j.ai?.active;
      setSetup(a && j.ai?.providers[a]?.model ? { provider: a, model: j.ai.providers[a]!.model! } : null);
    }).catch(() => setSetup(null));
  }, []);
  return setup;
}
