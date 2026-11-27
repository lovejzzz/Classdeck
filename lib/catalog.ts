// What each AI model is, from a live public catalog (OpenRouter's model list: no key, nothing about the teacher is
// sent): when it came out, what it costs, whether it takes video, and its maker's one-line description. The services'
// own model lists say little (Google's names Gemini 4 models by codename only), so Settings uses this to recommend
// models that are current, not whatever matches an old naming pattern.
import type { AiModel, AiProvider } from "./aimeta";

type Entry = { created: number; price: { in: number; out: number }; video: boolean; generates: boolean; description?: string };
const URL = "https://openrouter.ai/api/v1/models";
const MAKER: Record<string, AiProvider> = { google: "gemini", anthropic: "anthropic", openai: "openai" };
const g = globalThis as unknown as { __aicatalog?: { at: number; byId: Map<string, Entry> } };

/** The same model, however each place writes its id ("claude-sonnet-5-5-20260928" and "claude-sonnet-5.5"). */
export const sameId = (provider: AiProvider, id: string) => `${provider}:${id.toLowerCase().replace(/-\d{8}$/, "").replace(/\./g, "-")}`;

async function catalog(): Promise<Map<string, Entry> | null> {
  const fresh = g.__aicatalog && Date.now() - g.__aicatalog.at < 6 * 3600_000;
  if (fresh) return g.__aicatalog!.byId;
  try {
    const r = await fetch(URL, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { data?: { id: string; created?: number; description?: string; pricing?: { prompt?: string; completion?: string }; architecture?: { input_modalities?: string[]; output_modalities?: string[] } }[] };
    const byId = new Map<string, Entry>();
    for (const m of j.data ?? []) {
      const [maker, rest] = m.id.split("/");
      const provider = MAKER[maker];
      if (!provider || !rest || rest.includes(":")) continue;
      byId.set(sameId(provider, rest), {
        created: (m.created ?? 0) * 1000,
        price: { in: Number(m.pricing?.prompt ?? 0) * 1e6, out: Number(m.pricing?.completion ?? 0) * 1e6 },
        video: !!m.architecture?.input_modalities?.includes("video"),
        generates: (m.architecture?.output_modalities ?? ["text"]).some((x) => x !== "text"),
        description: m.description,
      });
    }
    g.__aicatalog = { at: Date.now(), byId };
    return byId;
  } catch {
    // Offline or changed: the last copy if there is one, else the services' own lists alone.
    return g.__aicatalog?.byId ?? null;
  }
}

/** The models a key can use, with what the catalog knows; models that make images or video (not feedback) left out. */
export async function enrich(provider: AiProvider, models: AiModel[]): Promise<AiModel[]> {
  const byId = await catalog();
  if (!byId) return models;
  return models.flatMap((m) => {
    const e = byId.get(sameId(provider, m.id));
    if (!e) return [m];
    if (e.generates) return [];
    return [{ ...m, created: e.created || m.created, price: e.price, video: e.video, description: e.description || m.description }];
  });
}
