import { db } from "@/lib/store";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const code = (q.get("code") ?? "").trim().toUpperCase();
  const course = Object.values(db().courses).find((c) => c.joinCode === code);
  if (!course) return Response.json({ error: "No class with that code" }, { status: 404 });
  if (course.access?.joinOpen === false) return Response.json({ error: "This class isn’t accepting new students right now" }, { status: 403 });
  if (course.access?.passcode && (q.get("passcode") ?? "") !== course.access.passcode) {
    return Response.json({ error: q.get("passcode") ? "That passcode isn’t right" : "This class needs a passcode", needPasscode: true }, { status: 403 });
  }
  return Response.json({ courseId: course.id });
}
