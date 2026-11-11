import { DEMO, getSession, teacherOf, unauthorized } from "@/lib/auth";
import { cloneWeek } from "@/lib/clone";
import { fromPreset, uid } from "@/lib/profile";
import { seedCourse } from "@/lib/seed";
import { db, listCourses, save } from "@/lib/store";
import { standardWeek } from "@/lib/templates";
import type { Course } from "@/lib/types";

/** The signed-in teacher's courses, plus the open demo. */
export async function GET(request: Request) {
  const t = teacherOf(getSession(request));
  const all = listCourses();
  return Response.json({
    courses: all.filter((c) => c.id === DEMO || (t && c.ownerId === t.id)),
    // Courses made before accounts existed have no owner yet; a signed-in teacher can claim them.
    unclaimed: t ? all.filter((c) => c.id !== DEMO && !c.ownerId).map((c) => ({ id: c.id, title: c.title, students: c.students })) : [],
  });
}

/** Create a course: blank, from the standard weekly template, or as a copy of the CaPS course's weeks. */
export async function POST(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in to create a course");
  const body = await request.json().catch(() => ({}));
  if (body.claim) {
    const c = db().courses[String(body.claim)];
    if (!c || c.id === DEMO || c.ownerId) return Response.json({ ok: false, error: "That course can’t be claimed" }, { status: 400 });
    c.ownerId = t.id;
    save();
    return Response.json({ ok: true, id: c.id });
  }
  const title = String(body.title ?? "").trim().slice(0, 80);
  if (!title) return Response.json({ ok: false, error: "Give the course a name" }, { status: 400 });
  const d = db();
  const caps = seedCourse();
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "course";
  let id = slug;
  while (d.courses[id]) id = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
  const codes = new Set(Object.values(d.courses).map((c) => c.joinCode));
  let code = "";
  do code = Math.random().toString(36).slice(2, 8).toUpperCase(); while (codes.has(code) || code.length < 6);

  const start = body.start === "caps" ? "caps" : body.start === "template" ? "template" : "blank";
  const weeks =
    start === "caps"
      ? caps.weeks.map((w) => cloneWeek(w, w.title))
      : start === "template"
        ? Array.from({ length: Math.max(1, Math.min(12, Number(body.weeks) || 3)) }, (_, i) => cloneWeek(standardWeek(`Topic ${i + 1}`, i + 1), `Week ${i + 1}`))
        : [{ id: uid("w-"), title: "Week 1", lessons: [{ id: uid("l-"), title: "Lesson 1", modules: [], branches: {} }] }];

  const course: Course = {
    id,
    ownerId: t.id,
    title,
    subtitle: String(body.subtitle ?? "").trim().slice(0, 120) || undefined,
    createdAt: Date.now(),
    joinCode: code,
    access: { joinOpen: true },
    profile: { ...fromPreset("secondary"), preset: "custom", horizon: "term" },
    students: [],
    skills: caps.skills,
    levels: caps.levels,
    groups: [{ id: uid("g-"), name: "Studio A", studentIds: [] }],
    currentLessonId: weeks[0].lessons[0].id,
    enabledConnectors: ["wikipedia", "dictionary", "ai"],
    weeks,
  };
  d.courses[id] = course;
  d.progress[id] = {};
  d.posts[id] = [];
  d.toolLog[id] = [];
  d.events[id] = [];
  d.choices[id] = {};
  d.studio[id] = { posts: [], feedback: [] };
  save();
  return Response.json({ ok: true, id });
}
