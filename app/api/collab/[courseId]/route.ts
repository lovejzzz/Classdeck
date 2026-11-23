import { canSeeTeacher, canTeach, getSession, teacherOf } from "@/lib/auth";
import { applyEdit, cardOf, entryOf, listen, moveCursor, setText, writersOf } from "@/lib/collab";
import { db } from "@/lib/store";
import type { Course } from "@/lib/types";

// A shared Text card's document (lib/collab.ts), for the students who write in it and the course's teachers.
//   GET  ?doc=<key>&listener=<n>     server-sent events: init (state, cursors, seed), update, cursor
//   GET  ?doc=<key>&history=1        { md, history }
//   POST { doc, listener, update?, cursor?: { client, update }, md?, keep? }

type Ctx = { params: Promise<{ courseId: string }> };
const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/** Who is asking about this document, and whether they may write in it. */
function access(request: Request, course: Course, key: string): { name: string; write: boolean } | null {
  const m = course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules)).find((x) => x.id === cardOf(key));
  if (!m || (m.writers !== "group" && m.writers !== "class")) return null;
  if (!(m.writers === "class" ? key === `${m.id}:class` : key.startsWith(`${m.id}:g:`))) return null;
  const session = getSession(request);
  const writers = writersOf(course, key);
  const u = teacherOf(session);
  const seat = u ? course.students.find((s) => s.userId === u.id) : session?.kind === "student" && session.courseId === course.id ? course.students.find((s) => s.id === session.studentId) : undefined;
  if (seat && writers.includes(seat.id)) return { name: seat.name, write: true };
  if (canSeeTeacher(session, course)) return { name: u?.name ? `${u.name} (teacher)` : "Teacher", write: canTeach(session, course) };
  return null;
}

export async function GET(request: Request, { params }: Ctx) {
  const { courseId } = await params;
  const course = db().courses[courseId];
  const q = new URL(request.url).searchParams;
  const key = q.get("doc") ?? "";
  if (!course || !access(request, course, key)) return fail("You can’t open this document", 403);
  if (q.get("history")) {
    const e = entryOf(courseId, key);
    return Response.json({ md: e?.md ?? "", history: [...(e?.history ?? [])].reverse() });
  }
  const listener = Number(q.get("listener")) || Math.floor(Math.random() * 1e9);
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { cleanup(); }
      };
      controller.enqueue(enc.encode("retry: 2000\n\n"));
      const off = listen(courseId, key, listener, send);
      const ping = setInterval(() => { try { controller.enqueue(enc.encode(": ping\n\n")); } catch { cleanup(); } }, 25_000);
      cleanup = () => { off(); clearInterval(ping); };
      request.signal.addEventListener("abort", () => { cleanup(); try { controller.close(); } catch {} });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

export async function POST(request: Request, { params }: Ctx) {
  const { courseId } = await params;
  const course = db().courses[courseId];
  const body = await request.json().catch(() => ({}));
  const key = String(body.doc ?? "");
  const who = course && access(request, course, key);
  if (!course || !who) return fail("You can’t open this document", 403);
  const listener = Number(body.listener) || 0;
  if (body.cursor && typeof body.cursor.update === "string" && body.cursor.update.length < 20_000) moveCursor(courseId, key, listener, Number(body.cursor.client) || 0, body.cursor.update);
  if (body.update !== undefined || body.md !== undefined) {
    if (!who.write) return fail("You can only read this document", 403);
    if (typeof body.update === "string") {
      if (body.update.length > 2_000_000) return fail("That change is too big");
      try { applyEdit(courseId, key, listener, body.update, who.name); } catch { return fail("That change didn’t fit the document"); }
    }
    if (typeof body.md === "string") setText(courseId, key, body.md, body.keep === true);
  }
  return Response.json({ ok: true });
}
