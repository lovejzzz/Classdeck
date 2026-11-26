// A teacher's AI for feedback (Settings → AI feedback). Each service keeps its own saved key, so switching between
// them never loses one; the one picked last is in use. A key goes in once and never comes back to the browser (only
// its last four characters). Pasting a key checks and saves it; picking a model saves it and checks the key has credit.
import { getSession, teacherOf, unauthorized } from "@/lib/auth";
import { AiError, listModels, openKey, probe, sealKey } from "@/lib/aifeedback";
import { isProvider, rankModels, type AiProvider, type AiSetup } from "@/lib/aimeta";
import type { User } from "@/lib/store";
import { save } from "@/lib/store";

type Saved = NonNullable<NonNullable<User["ai"]>["saved"]>;
/** Every saved key, by service (a setup from before keys were kept per service counts as its own). */
function savedOf(t: User): Saved {
  const s: Saved = { ...(t.ai?.saved ?? {}) };
  if (t.ai && !s[t.ai.provider]) s[t.ai.provider] = { key: t.ai.key, tail: t.ai.tail, model: t.ai.model };
  return s;
}
function setupOf(t: User): AiSetup {
  const s = savedOf(t);
  return {
    active: t.ai?.provider ?? null,
    providers: Object.fromEntries(Object.entries(s).map(([p, v]) => [p, { keyTail: v!.tail, model: v!.model, status: v!.status }])),
  };
}
/** Put a service in use (its saved key and model), keeping every saved key. */
function putInUse(t: User, saved: Saved, p: AiProvider) {
  const v = saved[p];
  if (!v?.model) { if (t.ai) t.ai.saved = saved; return; }
  t.ai = { provider: p, model: v.model, key: v.key, tail: v.tail, saved };
}

export async function GET(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  return Response.json({ ok: true, ai: setupOf(t) });
}

/**
 * - { provider, key? }: check a key (the one typed, or the saved one) and list its models; a key that works is saved.
 * - { provider, model }: use this service with this model, and check the key has credit.
 * - { provider, use: true }: use this service again (its saved key and model).
 */
export async function POST(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  const body = await request.json().catch(() => ({}));
  const p = body.provider;
  if (!isProvider(p)) return Response.json({ ok: false, error: "Pick an AI service" }, { status: 400 });
  const saved = savedOf(t);
  const typed = typeof body.key === "string" ? body.key.trim() : "";
  const key = typed || (saved[p] ? openKey(saved[p]!.key) : null);
  if (!key) return Response.json({ ok: false, error: "Paste your API key first" }, { status: 400 });
  if (key.length > 300 || /\s/.test(key)) return Response.json({ ok: false, error: "That doesn’t look like an API key" }, { status: 400 });

  if (body.use === true && !typed) {
    putInUse(t, saved, p);
    save();
    return Response.json({ ok: true, ai: setupOf(t) });
  }
  // The model list doubles as the key check: a key the service refuses isn't saved.
  let models;
  try {
    models = await listModels(p, key);
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof AiError ? e.message : "Couldn’t check that key" }, { status: 400 });
  }
  if (!models.length) return Response.json({ ok: false, error: "That key has no models to use" }, { status: 400 });
  const model = typeof body.model === "string" && models.some((m) => m.id === body.model) ? body.model
    : saved[p]?.model && models.some((m) => m.id === saved[p]!.model) ? saved[p]!.model!
    : rankModels(p, models).top[0]?.id ?? models[0].id;
  const pickedNow = typeof body.model === "string" || typed || !saved[p]?.model;
  saved[p] = { key: typed ? sealKey(key) : saved[p]!.key, tail: key.slice(-4), model, status: saved[p]?.status };
  // A new key or a new model: check it has credit (one tiny request), and use this service from now on.
  if (pickedNow || !saved[p]!.status) saved[p]!.status = await probe(p, key, model);
  putInUse(t, saved, p);
  save();
  return Response.json({ ok: true, ai: setupOf(t), models });
}

/** Remove one service's saved key (and stop using it). */
export async function DELETE(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  const p = new URL(request.url).searchParams.get("provider");
  const saved = savedOf(t);
  if (isProvider(p)) delete saved[p];
  else for (const k of Object.keys(saved)) delete saved[k as AiProvider];
  const next = (Object.keys(saved) as AiProvider[]).find((k) => saved[k]?.model);
  if (t.ai && (t.ai.provider === p || !isProvider(p))) t.ai = undefined;
  if (next && !t.ai) putInUse(t, saved, next);
  else if (t.ai) t.ai.saved = saved;
  save();
  return Response.json({ ok: true, ai: setupOf(t) });
}
