import { DEMO, getSession, isAdmin, roleOf, teacherOf, unauthorized } from "@/lib/auth";
import { cloneWeek } from "@/lib/clone";
import { uid } from "@/lib/profile";
import fs from "fs/promises";
import path from "path";
import { r2Ready, remove } from "@/lib/blob";
import { db, listCourses, removeCourse, save } from "@/lib/store";
import { UPLOAD_DIR } from "@/lib/uploads";
import { standardWeek } from "@/lib/templates";
import { makeCourse } from "@/lib/newcourse";
import { treeView } from "@/lib/branching";
import { visibleModules } from "@/lib/profile";

/**
 * The signed-in account's courses: the ones it teaches (its own and those shared with it), and the ones it's a student
 * in (or waiting to be let into). (The demo stays reachable by its address.)
 */
export async function GET(request: Request) {
  const session = getSession(request);
  const t = teacherOf(session);
  const all = listCourses();
  const d = db();
  type Studying = { id: string; title: string; studentId: string; teacher: string | null; done?: number; total?: number; waiting?: boolean };
  const studying = t ? Object.values(d.courses).flatMap((c): Studying[] => {
    if (c.id === DEMO || c.sample) return [];
    const owner = c.ownerId ? d.users[c.ownerId] : undefined;
    const st = c.students.find((x) => x.userId === t.id);
    if (st) {
      const mine = d.progress[c.id]?.[st.id] ?? {};
      const tree = treeView(c.weeks, mine);
      const cards = c.weeks.flatMap((w) => w.lessons.flatMap((l) => visibleModules(l, st.id, d.choices[c.id]?.[st.id], tree)));
      return [{ id: c.id, title: c.title, studentId: st.id, teacher: owner?.name ?? null, done: cards.filter((m) => mine[m.id]?.status === "done").length, total: cards.length }];
    }
    const w = c.waiting?.find((x) => x.userId === t.id);
    return w ? [{ id: c.id, title: c.title, studentId: w.id, teacher: owner?.name ?? null, waiting: true }] : [];
  }) : [];
  return Response.json({
    firstRole: t?.firstRole ?? null,
    studying,
    courses: t ? all.flatMap((c) => {
      if (c.id === DEMO) return [];
      const role = roleOf(session, db().courses[c.id]);
      return role ? [{ ...c, role }] : [];
    }) : [],
    // Courses made before accounts existed have no owner yet; only the site owner can claim them.
    unclaimed: t && isAdmin(session) ? all.filter((c) => c.id !== DEMO && !c.ownerId && !c.sample).map((c) => ({ id: c.id, title: c.title, students: c.students })) : [],
  });
}

/** Create a course: blank, from the standard weekly template, or as a copy of the CaPS course's weeks. */
export async function POST(request: Request) {
  const session = getSession(request);
  const t = teacherOf(session);
  if (!t) return unauthorized("teacher", "Sign in to create a course");
  const body = await request.json().catch(() => ({}));
  if (body.claim) {
    if (!isAdmin(session)) return Response.json({ ok: false, error: "Only the site owner can claim older courses" }, { status: 403 });
    const c = db().courses[String(body.claim)];
    if (!c || c.id === DEMO || c.ownerId || c.sample) return Response.json({ ok: false, error: "That course can’t be claimed" }, { status: 400 });
    c.ownerId = t.id;
    save();
    return Response.json({ ok: true, id: c.id });
  }
  const title = String(body.title ?? "").trim().slice(0, 80);
  if (!title) return Response.json({ ok: false, error: "Give the course a name" }, { status: 400 });
  // Blank, or the standard weekly template. (Copying the CaPS course and picking subject skills were retired.)
  const start = body.start === "template" ? "template" : "blank";
  const weeks =
    start === "template"
      ? Array.from({ length: Math.max(1, Math.min(12, Number(body.weeks) || 3)) }, (_, i) => cloneWeek(standardWeek(`Lesson ${i + 1}`, i + 1), `Week ${i + 1}`))
      : [{ id: uid("w-"), title: "Week 1", lessons: [{ id: uid("l-"), title: "Lesson 1", modules: [], branches: {} }] }];
  // New courses have no skills to rate; cards and reviews then leave skills out entirely.
  for (const w of weeks) for (const l of w.lessons) for (const m of l.modules) m.skills = undefined;
  const { id } = makeCourse(t.id, title, weeks, { subtitle: String(body.subtitle ?? "").trim().slice(0, 120) || undefined });
  save();
  return Response.json({ ok: true, id });
}

/** Delete one of your courses, with its students, their work, and the files uploaded to it. */
export async function DELETE(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  const body = await request.json().catch(() => ({}));
  const c = db().courses[String(body.id ?? "")];
  if (!c || c.id === DEMO || c.ownerId !== t.id) return Response.json({ ok: false, error: "You can only delete your own courses" }, { status: 403 });
  if (String(body.confirm ?? "").trim() !== c.title) return Response.json({ ok: false, error: "Type the course name exactly to confirm" }, { status: 400 });
  const files = removeCourse(c.id);
  // Files are removed after the course is gone; a file that fails to delete is only left behind in storage.
  await Promise.all(files.map((f) => (r2Ready() ? remove(f) : fs.unlink(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, f))).catch(() => {})));
  return Response.json({ ok: true, files: files.length });
}
