import { checkSecret, endSession, getSession, hashSecret, startSession, teacherOf, throttled } from "@/lib/auth";
import { uid } from "@/lib/profile";
import { db, save } from "@/lib/store";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/** Who is signed in on this browser. */
export async function GET(request: Request) {
  const s = getSession(request);
  const t = teacherOf(s);
  if (t) return Response.json({ kind: "teacher", name: t.name, email: t.email });
  if (s?.kind === "student" && s.courseId) {
    const c = db().courses[s.courseId];
    const st = c?.students.find((x) => x.id === s.studentId);
    if (c && st) return Response.json({ kind: "student", courseId: c.id, courseTitle: c.title, studentId: st.id, name: st.name });
  }
  return Response.json({ kind: null });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const d = db();

  switch (body.action) {
    case "signup": {
      const email = String(body.email ?? "").trim().toLowerCase();
      const name = String(body.name ?? "").trim().slice(0, 60);
      const password = String(body.password ?? "");
      if (!EMAIL.test(email)) return fail("Enter a valid email address");
      if (!name) return fail("Enter your name");
      if (password.length < 8) return fail("Use a password of at least 8 characters");
      if (throttled(`signup:${ip}`, 10)) return fail("Too many attempts. Try again in a few minutes.", 429);
      if (Object.values(d.users).some((u) => u.email === email)) return fail("There’s already an account with that email. Sign in instead.");
      const id = uid("u-");
      d.users[id] = { id, email, name, ...hashSecret(password), createdAt: Date.now() };
      save();
      return Response.json({ ok: true }, { headers: { "Set-Cookie": startSession({ kind: "teacher", userId: id }) } });
    }
    case "login": {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (throttled(`login:${ip}:${email}`, 8)) return fail("Too many attempts. Try again in a few minutes.", 429);
      const u = Object.values(d.users).find((x) => x.email === email);
      if (!u || !checkSecret(String(body.password ?? ""), u.salt, u.hash)) return fail("That email and password don’t match", 401);
      return Response.json({ ok: true }, { headers: { "Set-Cookie": startSession({ kind: "teacher", userId: u.id }) } });
    }
    case "student": {
      const course = d.courses[body.courseId];
      if (!course || course.joinCode !== String(body.code ?? "").trim().toUpperCase()) return fail("That class code doesn’t match", 403);
      if (course.access?.passcode && body.passcode !== course.access.passcode) return fail("That passcode isn’t right", 403);
      const st = course.students.find((s) => s.id === body.studentId);
      if (!st) return fail("Pick your name from the list");
      const pin = String(body.pin ?? "");
      if (!/^\d{4}$/.test(pin)) return fail("Your PIN is 4 digits");
      if (throttled(`pin:${course.id}:${st.id}`, 8)) return fail("Too many tries. Ask your teacher to reset your PIN, or wait a few minutes.", 429);
      const pins = (d.pins[course.id] ??= {});
      if (!pins[st.id]) {
        const h = hashSecret(pin);
        pins[st.id] = `${h.salt}:${h.hash}`;
        save();
      } else {
        const [salt, hash] = pins[st.id].split(":");
        if (!checkSecret(pin, salt, hash)) return fail("That PIN isn’t right. If you forgot it, ask your teacher to reset it.", 401);
      }
      return Response.json({ ok: true, studentId: st.id }, { headers: { "Set-Cookie": startSession({ kind: "student", courseId: course.id, studentId: st.id }) } });
    }
    case "logout":
      return Response.json({ ok: true }, { headers: { "Set-Cookie": endSession(request) } });
    default:
      return fail("Unknown action");
  }
}
