import { getSession, unauthorized, canSeeTeacher } from "@/lib/auth";
import { db } from "@/lib/store";
import { toCourseFile } from "@/lib/coursefile";

// The course as a Questhand course file (weeks, lessons and cards; nothing about its students), to keep or to make
// another course from (New course → From a course file).
export async function GET(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const course = db().courses[courseId];
  if (!course) return new Response("No such course", { status: 404 });
  if (!canSeeTeacher(getSession(request), course)) return unauthorized("teacher");
  const name = `${course.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "course"}.questhand.json`;
  return new Response(JSON.stringify(toCourseFile(course), null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}` },
  });
}
