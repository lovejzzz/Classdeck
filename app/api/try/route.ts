import fs from "fs/promises";
import path from "path";
import { getSession, startSession, teacherOf, throttled } from "@/lib/auth";
import { r2Ready, remove } from "@/lib/blob";
import { clientIp } from "@/lib/origin";
import { fromPreset, uid } from "@/lib/profile";
import { SAMPLE_HOURS, SAMPLE_TITLE, sampleWeeks } from "@/lib/sample";
import { db, removeCourse, save } from "@/lib/store";
import { randomCode, UPLOAD_DIR } from "@/lib/uploads";
import type { Course } from "@/lib/types";

/** Most visitor copies alive at once; past this, new visitors are asked to come back later. */
const MAX_LIVE = 500;

/**
 * Try Questhand as a student: a private copy of the sample course with one student, "You", signed in on this browser.
 * Copies are gone after a day (cleared here, whenever someone starts a new one). Not offered to a signed-in teacher,
 * whose session it would replace.
 */
export async function POST(request: Request) {
  const session = getSession(request);
  if (teacherOf(session)) return Response.json({ ok: false, error: "You’re signed in as a teacher. Sign out first, or open the sample in a private window." }, { status: 409 });
  if (throttled(`try:${clientIp(request)}`, 8, 60 * 60_000)) return Response.json({ ok: false, error: "That’s a lot of samples. Try again in a while." }, { status: 429 });
  const d = db();
  const now = Date.now();

  // Clear copies that have expired, with any files their visitors added.
  const old = Object.values(d.courses).filter((c) => c.sample && c.sample < now);
  const files = old.flatMap((c) => removeCourse(c.id));
  await Promise.all(files.map((f) => (r2Ready() ? remove(f) : fs.unlink(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, f))).catch(() => {})));
  if (Object.values(d.courses).filter((c) => c.sample).length >= MAX_LIVE) {
    if (old.length) save();
    return Response.json({ ok: false, error: "The sample is busy right now. Try again in a few minutes." }, { status: 503 });
  }

  let id = "";
  do id = `sample-${randomCode(8).toLowerCase()}`; while (d.courses[id]);
  const codes = new Set(Object.values(d.courses).map((c) => c.joinCode));
  let code = "";
  do code = randomCode(6); while (codes.has(code));
  const weeks = sampleWeeks();
  const you = { id: uid("s-"), name: "You", joinedAt: now };
  const course: Course = {
    id,
    title: SAMPLE_TITLE,
    subtitle: "A sample course: your answers decide which cards you get",
    createdAt: now,
    sample: now + SAMPLE_HOURS * 3600_000,
    joinCode: code,
    // Nobody else can join a visitor's copy, and nobody owns it (so no one can edit it).
    access: { joinOpen: false },
    profile: { ...fromPreset("secondary"), preset: "custom", horizon: "term" },
    students: [you],
    skills: [],
    groups: [{ id: uid("g-"), name: "Studio A", studentIds: [you.id] }],
    currentLessonId: weeks[0].lessons[0].id,
    enabledConnectors: [],
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
  return Response.json({ ok: true, courseId: id, studentId: you.id }, { headers: { "Set-Cookie": startSession({ kind: "student", courseId: id, studentId: you.id }, 1) } });
}
