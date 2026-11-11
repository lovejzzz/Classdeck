import { canTeach, getSession, unauthorized } from "@/lib/auth";
import { ai, complete } from "@/lib/connectors/ai";
import { IMPORT_PROMPT, outlineToWeeks, readOutline, weeksFromAI } from "@/lib/docimport";
import { db } from "@/lib/store";

/**
 * Read a course plan (.docx, .md, .txt) and propose weeks of cards. Nothing is saved here:
 * the teacher previews the result and adds the weeks they want.
 */
export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const course = db().courses[courseId];
  if (!course) return Response.json({ ok: false, error: "No such course" }, { status: 404 });
  if (!canTeach(getSession(request), course)) return unauthorized("teacher");
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "Choose a file" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return Response.json({ ok: false, error: "Use a file under 8 MB" }, { status: 413 });
  let lines;
  try {
    lines = readOutline(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Couldn’t read that file" }, { status: 400 });
  }
  if (!lines.length) return Response.json({ ok: false, error: "That file looks empty" }, { status: 400 });

  // With an AI key, let the model read the plan; fall back to headings if it can't.
  if (form?.get("mode") !== "outline" && ai.configured()) {
    try {
      const text = lines.map((l) => (l.level ? `${"#".repeat(Math.ceil(l.level))} ${l.text}` : l.bullet ? `- ${l.text}` : l.text)).join("\n").slice(0, 60000);
      const weeks = weeksFromAI(await complete(IMPORT_PROMPT, text));
      if (weeks.length) return Response.json({ ok: true, method: "ai", weeks });
    } catch {}
  }
  const weeks = outlineToWeeks(lines);
  if (!weeks.length) return Response.json({ ok: false, error: "Couldn’t find weeks or sections. Use headings like “Week 1: Topic”." }, { status: 422 });
  return Response.json({ ok: true, method: "outline", weeks });
}
