"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { AI_PROVIDERS, providerMeta, type AiProvider, type AiSetup } from "@/lib/aimeta";
import { toast } from "@/lib/toast";

/** The teacher's own AI for feedback: the service is chosen with what each is good at, then their key and a model. */
export function AiSettings() {
  const [setup, setSetup] = useState<AiSetup | null | undefined>(undefined);
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [key, setKey] = useState("");
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState<"models" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only teachers set up AI (a student opening Settings doesn't see this).
  const [teacher, setTeacher] = useState(true);

  useEffect(() => {
    fetch("/api/ai").then((r) => { if (r.status === 401 || r.status === 403) setTeacher(false); return r.json(); }).then((j) => {
      setSetup(j.ai ?? null);
      if (j.ai) { setProvider(j.ai.provider); setModel(j.ai.model); }
    }).catch(() => setSetup(null));
  }, []);
  // With a key saved for this service, its models load straight away (the server uses the saved key).
  useEffect(() => {
    if (setup?.provider === provider && !models.length) void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, provider]);

  async function call(action?: "models") {
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, key: key.trim() || undefined, model, action }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));
    if (!r.ok) { setError(r.error ?? "That didn’t work"); return null; }
    setError(null);
    return r as { ai?: AiSetup; models?: { id: string; name: string }[] };
  }
  async function loadModels() {
    setBusy("models");
    const r = await call("models");
    setBusy(null);
    if (r?.models) { setModels(r.models); if (!r.models.some((m) => m.id === model)) setModel(r.models[0]?.id ?? ""); }
  }
  async function saveIt() {
    setBusy("save");
    const r = await call();
    setBusy(null);
    if (!r?.ai) return;
    setSetup(r.ai); setKey(""); setModel(r.ai.model); if (r.models) setModels(r.models);
    toast(`AI feedback uses ${providerMeta(r.ai.provider).name} · ${r.ai.model}`, { icon: "sparkles" });
  }
  async function remove() {
    await fetch("/api/ai", { method: "DELETE" });
    setSetup(null); setKey(""); setModels([]); setModel("");
    toast("Removed your AI key. Cards with AI feedback stop giving it.", { icon: "x", tone: "plain" });
  }

  if (!teacher) return null;
  const meta = providerMeta(provider);
  const savedHere = setup?.provider === provider;
  return (
    <section id="ai" className="card p-6">
      <div className="flex items-center gap-2">
        <Icon name="sparkles" size={16} />
        <h2 className="flex-1 text-[16px] font-semibold">AI feedback</h2>
        {setup && <span className="chip h-6 bg-ok/10 text-[11.5px] text-ok">On · {providerMeta(setup.provider).name}</span>}
      </div>
      <p className="mt-1 text-[13px] text-ink-3">Connect your own AI account. Then, on any question card, turn on <span className="font-medium text-ink-2">Allow AI feedback</span> (in the card’s Access) and students get feedback from it as soon as they hand in. You pay the AI service for what it uses.</p>

      <div className="mt-4 grid gap-2.5 md:grid-cols-3" role="radiogroup" aria-label="AI service">
        {AI_PROVIDERS.map((p) => (
          <button key={p.id} role="radio" aria-checked={provider === p.id} onClick={() => { setProvider(p.id); setModels([]); setError(null); setKey(""); }}
            className={`press flex flex-col rounded-xl border p-3.5 text-left transition-[border-color,box-shadow] ${provider === p.id ? "border-[#4b56a8] shadow-[0_0_0_3px_rgba(75,86,168,0.15)]" : "border-line hover:border-line-strong"}`}>
            <span className="flex items-center gap-2">
              <span className="text-[14px] font-semibold">{p.name}</span>
              <span className="text-[12px] text-ink-3">{p.company}</span>
              <span className="flex-1" />
              {p.watchesVideo && <span className="chip h-5 bg-[#eef0fb] text-[10.5px] text-[#4b56a8]"><Icon name="video" size={10} /> Watches video</span>}
            </span>
            <span className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{p.strengths}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
            Your {meta.company} API key
            <a href={meta.keyUrl} target="_blank" rel="noreferrer" data-tip={`Get a key from ${meta.company}`} aria-label={`Get a ${meta.company} API key`}
              className="grid h-4 w-4 place-items-center rounded-full bg-lane text-[10px] font-semibold text-ink-2 hover:bg-[#4b56a8] hover:text-white">i</a>
          </span>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)}
            placeholder={savedHere ? `Saved: ••••${setup!.keyTail} (paste a new one to replace it)` : meta.keyHint} className="field h-9 w-full py-0 font-mono text-[12.5px]" />
        </label>
        <div className="flex items-end">
          <button onClick={loadModels} disabled={busy !== null || (!key.trim() && !savedHere)} className="btn btn-ghost press h-9 whitespace-nowrap">{busy === "models" ? "Checking…" : "Check key"}</button>
        </div>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[12.5px] font-medium text-ink-2">Model <span className="font-normal text-ink-3">(the newest your key can use, from {meta.company})</span></span>
        <select value={model} onChange={(e) => setModel(e.target.value)} disabled={!models.length} className="field h-9 w-full py-0 text-[13px]">
          {!models.length && <option value="">{savedHere ? setup!.model : "Check your key to see the models"}</option>}
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}{m.name !== m.id ? ` (${m.id})` : ""}</option>)}
        </select>
      </label>

      {error && <p className="mt-2 text-[12.5px] text-bad" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={saveIt} disabled={busy !== null || (!key.trim() && !savedHere)} className="btn btn-dark press h-9">{busy === "save" ? "Saving…" : savedHere ? "Save" : `Use ${meta.name}`}</button>
        {setup && <button onClick={remove} className="btn btn-quiet press h-9 hover:!text-bad">Remove my key</button>}
        <span className="text-[12px] text-ink-3">Your key is stored encrypted and is never shown again, to you or anyone.</span>
      </div>
    </section>
  );
}

/** Whether this teacher has AI set up (for the card editor's switch). */
export function useAiSetup() {
  const [setup, setSetup] = useState<AiSetup | null | undefined>(undefined);
  useEffect(() => { fetch("/api/ai").then((r) => r.json()).then((j) => setSetup(j.ai ?? null)).catch(() => setSetup(null)); }, []);
  return setup;
}
