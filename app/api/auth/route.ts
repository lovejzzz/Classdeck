import { checkSecret, endSession, getSession, hashSecret, startSession, teacherOf, throttled } from "@/lib/auth";
import { uid } from "@/lib/profile";
import { findInvite } from "@/lib/hooks";
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
    const st = c?.students.find((x) => x.id === s.studentId) ?? c?.waiting?.find((x) => x.id === s.studentId);
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
      // Someone added from a form sets up through their own link, so no one else can claim their name first.
      if (!pins[st.id] && st.invite && st.invite.exp > Date.now()) return fail("Use your own setup link from your teacher to set up your board. Lost it? Ask your teacher for a new one.", 403);
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
    case "join": {
      // Someone not on the class list adds themselves with the class code, if the teacher allows it.
      // A whole class often shares one school address, so the limit is per class and generous.
      if (throttled(`join:${ip}:${body.courseId}`, 60)) return fail("Too many attempts. Try again in a few minutes.", 429);
      const course = d.courses[body.courseId];
      if (!course || course.joinCode !== String(body.code ?? "").trim().toUpperCase()) return fail("That class code doesn’t match", 403);
      if (course.access?.joinOpen === false) return fail("This class isn’t accepting new students right now", 403);
      if (course.access?.passcode && body.passcode !== course.access.passcode) return fail("That passcode isn’t right", 403);
      const mode = course.access?.selfJoin;
      if (!mode) return fail("Ask your teacher to add you to the class list", 403);
      const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (name.length < 2) return fail("Enter your name");
      const same = (x: { name: string }) => x.name.toLowerCase() === name.toLowerCase();
      const taken = course.students.find(same) ?? course.waiting?.find(same);
      if (taken) return fail(`${taken.name} is already on the class list. If that’s you, go back and pick your name. If not, add your last name or initial.`);
      if (course.students.length + (course.waiting?.length ?? 0) >= 500) return fail("This class is full", 403);
      const pin = String(body.pin ?? "");
      if (!/^\d{4}$/.test(pin)) return fail("Your PIN is 4 digits");
      const st = { id: uid("s-"), name, joinedAt: Date.now() };
      if (mode === "approve") (course.waiting ??= []).push(st);
      else {
        course.students.push(st);
        const g = course.groups?.length ? [...course.groups].sort((a, b) => a.studentIds.length - b.studentIds.length)[0] : undefined;
        g?.studentIds.push(st.id);
      }
      const h = hashSecret(pin);
      (d.pins[course.id] ??= {})[st.id] = `${h.salt}:${h.hash}`;
      save();
      return Response.json({ ok: true, studentId: st.id, waiting: mode === "approve" }, { headers: { "Set-Cookie": startSession({ kind: "student", courseId: course.id, studentId: st.id }) } });
    }
    case "invite": {
      // A one-time link from a form: check it, then (with a PIN) set the PIN and sign in.
      if (throttled(`invite:${ip}`, 30)) return fail("Too many attempts. Try again in a few minutes.", 429);
      const course = d.courses[body.courseId];
      const st = course && findInvite(course, String(body.token ?? ""));
      if (!course || !st) return fail("This link has expired or was already used. Sign in with your class code, or ask your teacher for a new link.", 404);
      if (body.pin === undefined) return Response.json({ ok: true, name: st.name, courseTitle: course.title });
      const pin = String(body.pin);
      if (!/^\d{4}$/.test(pin)) return fail("Your PIN is 4 digits");
      const h = hashSecret(pin);
      (d.pins[course.id] ??= {})[st.id] = `${h.salt}:${h.hash}`;
      st.invite = undefined;
      save();
      return Response.json({ ok: true, studentId: st.id }, { headers: { "Set-Cookie": startSession({ kind: "student", courseId: course.id, studentId: st.id }) } });
    }
    case "logout":
      return Response.json({ ok: true }, { headers: { "Set-Cookie": endSession(request) } });
    default:
      return fail("Unknown action");
  }
}
