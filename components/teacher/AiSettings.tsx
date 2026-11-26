"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { AI_PROVIDERS, providerMeta, rankModels, type AiModel, type AiProvider, type AiSetup, type AiStatus } from "@/lib/aimeta";
import { toast } from "@/lib/toast";

type Reply = { ok: boolean; error?: string; ai?: AiSetup; models?: AiModel[] };
const post = (body: object): Promise<Reply> =>
  fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));

/** A saved key's state, in words, with its light. */
function StatusLine({ status, busy, model }: { status?: AiStatus; busy: boolean; model?: string }) {
  const [dot, text] = busy ? ["bg-ink-3 animate-pulse", "Saving and checking your key…"]
    : !status ? ["bg-ok", `Saved${model ? ` · ${model}` : ""}`]
    : status.state === "ready" ? ["bg-ok", `Saved · ${model ?? ""} · ready, the key has credit`]
    : status.state === "no_credit" ? ["bg-bad", "Saved, but the key has no credit left (or is over its limit). Add credit at the service and AI feedback starts working."]
    : status.state === "bad_key" ? ["bg-bad", "The service no longer accepts this key. Paste a new one."]
    : ["bg-warn", `Saved, but the service didn’t answer the check${status.message ? ` (${status.message})` : ""}. It may work later.`];
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-ink-2" role="status">
      <span className={`h-2 w-2 flex-none rounded-full ${dot}`} />{text}
    </p>
  );
}

/**
 * The teacher's own AI for feedback. Pick a service (each keeps its own saved key, so switching never loses one), paste
 * its key (checked and saved as soon as it's pasted), pick a model (saved as soon as it's picked). The light says
 * whether the key has credit.
 */
export function AiSettings() {
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
  return (
    <section id="ai" className="card p-6">
      <div className="flex items-center gap-2">
        <Icon name="sparkles" size={16} />
        <h2 className="flex-1 text-[16px] font-semibold">AI feedback</h2>
        {setup?.active && <span className="chip h-6 bg-ok/10 text-[11.5px] text-ok">In use · {providerMeta(setup.active).name}</span>}
      </div>
      <p className="mt-1 text-[13px] text-ink-3">Connect your own AI account. Then, on any question card, turn on <span className="font-medium text-ink-2">Allow AI feedback</span> (in the card’s Access) and students get feedback from it as soon as they hand in. You pay the AI service for what it uses.</p>

      <div className="mt-4 grid gap-2.5 md:grid-cols-3" role="radiogroup" aria-label="AI service">
        {AI_PROVIDERS.map((p) => {
          const has = setup?.providers[p.id];
          return (
            <button key={p.id} role="radio" aria-checked={provider === p.id} onClick={() => pick(p.id)}
              className={`press flex flex-col rounded-xl border p-3.5 text-left transition-[border-color,box-shadow] ${provider === p.id ? "border-[#4b56a8] shadow-[0_0_0_3px_rgba(75,86,168,0.15)]" : "border-line hover:border-line-strong"}`}>
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-semibold">{p.name}</span>
                <span className="text-[12px] text-ink-3">{p.company}</span>
                <span className="flex-1" />
                {has && <span className="flex items-center gap-1 text-[11px] text-ink-3"><span className={`h-1.5 w-1.5 rounded-full ${has.status?.state === "no_credit" || has.status?.state === "bad_key" ? "bg-bad" : "bg-ok"}`} />Key saved</span>}
              </span>
              <span className="mt-2.5 flex flex-wrap gap-1.5">
                {p.labels.map((l) => (
                  <span key={l.text} className={`inline-flex h-6 items-center rounded-full px-2 text-[11.5px] ${l.tone === "good" ? "bg-ok/10 text-[#256e44]" : l.tone === "note" ? "bg-[#fbf3dd] text-[#8f630b]" : "bg-lane text-ink-2"}`}>{l.text}</span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <span className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
          Your {meta.company} API key
          <a href={meta.keyUrl} target="_blank" rel="noreferrer" data-tip={`Get a key from ${meta.company}`} aria-label={`Get a ${meta.company} API key`}
            className="grid h-4 w-4 place-items-center rounded-full bg-lane text-[10px] font-semibold text-ink-2 hover:bg-[#4b56a8] hover:text-white">i</a>
        </span>
        {showInput ? (
          <input key={provider} type="password" autoComplete="off" autoFocus={replacing} value={drafts[provider] ?? ""} onChange={(e) => typeKey(e.target.value)}
            placeholder={`Paste it here (${meta.keyHint.replace(/^S/, "s")}). It’s checked and saved straight away.`} aria-label={`${meta.company} API key`} className="field h-9 w-full py-0 font-mono text-[12.5px]" />
        ) : (
          <div className="flex h-9 items-center gap-3 rounded-[10px] border border-line bg-[#fafaf9] px-3 font-mono text-[12.5px] text-ink-2">
            <span className="flex-1">•••••••••••••••• {saved!.keyTail}</span>
            <button onClick={() => setReplacing(true)} className="font-sans text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink">Replace</button>
            <button onClick={remove} className="font-sans text-[12px] text-ink-3 underline underline-offset-2 hover:text-bad">Remove</button>
          </div>
        )}
      </div>

      {saved && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[12.5px] font-medium text-ink-2">Model <span className="font-normal text-ink-3">(the ones your key can use, from {meta.company}, most used first)</span></span>
          <select value={model} onChange={(e) => void send({ model: e.target.value })} disabled={!list.length || busy} className="field h-9 w-full py-0 text-[13px]">
            {!list.length && <option value={model}>{model || "Loading the models…"}</option>}
            {ranked.top.length > 0 && <optgroup label="Most used">{ranked.top.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
            {ranked.more.length > 0 && <optgroup label={`Other models (${ranked.more.length})`}>{ranked.more.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
          </select>
          {/* What the picked model is, in the service's own words when it gives them, and whether it can analyze video. */}
          {picked && (
            <span className="mt-1.5 block text-[12px] leading-relaxed text-ink-3">
              {picked.note ? `${picked.note}. ` : ""}{picked.video ? "Can analyze students’ videos." : "Reads writing and the transcripts of recordings; can’t analyze video."}
            </span>
          )}
        </label>
      )}

      <div className="mt-4 space-y-1">
        {error && <p className="flex items-center gap-2 text-[12.5px] text-bad" role="alert"><span className="h-2 w-2 flex-none rounded-full bg-bad" />{error}</p>}
        {(saved || busy) && !error && <StatusLine status={saved?.status} busy={busy} model={picked?.name ?? model} />}
        <p className="text-[11.5px] text-ink-3">Keys are stored encrypted and never shown again. Checking for credit sends the service one word (a fraction of a cent).</p>
      </div>
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
