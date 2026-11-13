import { publicOrigin } from "@/lib/origin";
import { throttled } from "@/lib/auth";
import { applyMany, checkHookKey } from "@/lib/hooks";
import { db, save } from "@/lib/store";

// Incoming updates from outside tools, e.g. a Google Form's Apps Script.
//   POST /api/hooks/<courseId>
//   Authorization: Bearer <course key>
//   { "items": [ ... ] }  or one item / { "row": {...} } on its own
// See docs/google-forms.md for the format.

type Ctx = { params: Promise<{ courseId: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { courseId } = await params;
  const who = `hook:${courseId}:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`;
  const course = db().courses[courseId];
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
  if (!course || !checkHookKey(course, token)) {
    // Slow down guessing; a wrong key and an unknown course look the same.
    if (throttled(who, 20)) return Response.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });
    return Response.json({ ok: false, error: "Wrong or missing key. Create one in Settings → Google Forms and other tools." }, { status: 401 });
  }
  if (throttled(`${who}:ok`, 600, 60_000)) return Response.json({ ok: false, error: "Too many requests. Send rows in batches of up to 300." }, { status: 429 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Send JSON" }, { status: 400 });
  }
  const b = body as { items?: unknown[] };
  const items = Array.isArray(b?.items) ? b.items : Array.isArray(body) ? body : [body];
  const results = applyMany(courseId, course, items, publicOrigin(request));
  const hook = course.access!.hook!;
  hook.lastUsed = Date.now();
  hook.uses = (hook.uses ?? 0) + 1;
  save();
  return Response.json({ ok: results.every((r) => r.ok), course: course.title, results });
}
