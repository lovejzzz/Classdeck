// A teacher's AI for feedback (Settings → AI): which service, which model, and their own key. The key goes in once and
// never comes back to the browser (only its last four characters).
import { getSession, teacherOf, unauthorized } from "@/lib/auth";
import { AiError, listModels, openKey, sealKey } from "@/lib/aifeedback";
import { isProvider, type AiSetup } from "@/lib/aimeta";
import { save } from "@/lib/store";

const setupOf = (ai?: { provider: AiSetup["provider"]; model: string; tail: string }): AiSetup | null => (ai ? { provider: ai.provider, model: ai.model, keyTail: ai.tail } : null);

export async function GET(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  return Response.json({ ok: true, ai: setupOf(t.ai) });
}

export async function POST(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  const body = await request.json().catch(() => ({}));
  if (!isProvider(body.provider)) return Response.json({ ok: false, error: "Pick an AI service" }, { status: 400 });
  // A new key typed in, or the saved one (same service).
  const typed = typeof body.key === "string" ? body.key.trim() : "";
  const key = typed || (t.ai && t.ai.provider === body.provider ? openKey(t.ai.key) : null);
  if (!key) return Response.json({ ok: false, error: "Paste your API key first" }, { status: 400 });
  if (key.length > 300 || /\s/.test(key)) return Response.json({ ok: false, error: "That doesn’t look like an API key" }, { status: 400 });
  // The model list doubles as the key check: a key the service refuses isn't saved.
  let models: { id: string; name: string }[];
  try {
    models = await listModels(body.provider, key);
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof AiError ? e.message : "Couldn’t check that key" }, { status: 400 });
  }
  if (body.action === "models") return Response.json({ ok: true, models });
  const model = typeof body.model === "string" && models.some((m) => m.id === body.model) ? body.model : models[0]?.id;
  if (!model) return Response.json({ ok: false, error: "That key has no models to use" }, { status: 400 });
  t.ai = { provider: body.provider, model, key: sealKey(key), tail: key.slice(-4) };
  save();
  return Response.json({ ok: true, ai: setupOf(t.ai), models });
}

export async function DELETE(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  t.ai = undefined;
  save();
  return Response.json({ ok: true });
}
