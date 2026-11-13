import { throttled } from "@/lib/auth";
import { clientIp } from "@/lib/origin";
import { db } from "@/lib/store";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  // Class codes can't be guessed by trying thousands; a whole class sharing one address still fits easily.
  if (throttled(`code:${clientIp(request)}`, 120)) return Response.json({ error: "Too many tries. Wait a few minutes and try again." }, { status: 429 });
  const code = (q.get("code") ?? "").trim().toUpperCase();
  const course = Object.values(db().courses).find((c) => c.joinCode === code);
  if (!course) return Response.json({ error: "No class with that code" }, { status: 404 });
  if (course.access?.joinOpen === false) return Response.json({ error: "This class isn’t accepting new students right now" }, { status: 403 });
  if (course.access?.passcode && (q.get("passcode") ?? "") !== course.access.passcode) {
    return Response.json({ error: q.get("passcode") ? "That passcode isn’t right" : "This class needs a passcode", needPasscode: true }, { status: 403 });
  }
  const pins = db().pins[course.id] ?? {};
  return Response.json({ courseId: course.id, title: course.title, demo: course.id === "demo", selfJoin: course.access?.selfJoin ?? null, students: course.students.map((s) => ({ id: s.id, name: s.name, hasPin: !!pins[s.id] })) });
}
