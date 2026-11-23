import { clientIp } from "@/lib/origin";
import { canTeach, checkSecret, endSession, getSession, hashSecret, roleOf, startSession, teacherOf, throttled } from "@/lib/auth";
import { uid } from "@/lib/profile";
import { verifyGoogle } from "@/lib/google";
import { findInvite } from "@/lib/hooks";
import { db, save } from "@/lib/store";
import { giveStarterCourse } from "@/lib/newcourse";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/** Who is signed in on this browser. */
export async function GET(request: Request) {
  const s = getSession(request);
  const t = teacherOf(s);
  // The Google client id is public: it's what the "Sign in with Google" button needs.
  const google = process.env.GOOGLE_CLIENT_ID || null;
  // An account (it can teach some courses and be a student in others). "teacher" is its kind for older pages.
  if (t) return Response.json({ kind: "teacher", name: t.name, email: t.email, picture: t.picture ?? null, firstRole: t.firstRole ?? null, google });
  if (s?.kind === "student" && s.courseId) {
    const c = db().courses[s.courseId];
    const st = c?.students.find((x) => x.id === s.studentId) ?? c?.waiting?.find((x) => x.id === s.studentId);
    if (c && st) return Response.json({ kind: "student", courseId: c.id, courseTitle: c.title, studentId: st.id, name: st.name, google });
  }
  return Response.json({ kind: null, google });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ip = clientIp(request);
  const d = db();

  switch (body.action) {
    case "signup": {
      const email = String(body.email ?? "").trim().toLowerCase();
      const name = String(body.name ?? "").trim().slice(0, 60);
      const password = String(body.password ?? "");
      if (!EMAIL.test(email)) return fail("Enter a valid email address");
      if (!name) return fail("Enter your name");
      if (password.length < 8) return fail("Use a password of at least 8 characters");
      // A whole class often signs up at once from one school address, so the limit per address is generous.
      if (throttled(`signup:${ip}`, 80)) return fail("Too many attempts. Try again in a few minutes.", 429);
      if (Object.values(d.users).some((u) => u.email === email)) return fail("There’s already an account with that email. Sign in instead.");
      const id = uid("u-");
      d.users[id] = { id, email, name, ...hashSecret(password), firstRole: body.as === "student" ? "student" : "teacher", createdAt: Date.now() };
      // A new teacher starts with Questhand 101 in their courses: a short course on Questhand, to try and to copy from.
      if (body.as !== "student") giveStarterCourse(id);
      save();
      return Response.json({ ok: true }, { headers: { "Set-Cookie": startSession({ kind: "teacher", userId: id }) } });
    }
    case "login": {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (throttled(`login:${ip}:${email}`, 8)) return fail("Too many attempts. Try again in a few minutes.", 429);
      const u = Object.values(d.users).find((x) => x.email === email);
      if (u && !u.hash) return fail("This account signs in with Google. Use “Sign in with Google”.", 401);
      if (!u || !checkSecret(String(body.password ?? ""), u.salt, u.hash)) return fail("That email and password don’t match", 401);
      return Response.json({ ok: true }, { headers: { "Set-Cookie": startSession({ kind: "teacher", userId: u.id }) } });
    }
    case "student":
    case "join":
      // Before accounts, students signed in with a name and a PIN, or added themselves by name. Now everyone has an
      // account: sign in, then join with the class code (under As Student) or from the invitation email.
      return fail("Sign in to Questhand first (or make an account), then enter the class code under As Student.", 410);
    case "joinCode": {
      // A signed-in account joins a class with its code, if the teacher lets people join that way.
      const u = teacherOf(getSession(request));
      if (!u) return fail("Sign in first", 401);
      if (throttled(`code:${u.id}`, 20)) return fail("Too many attempts. Try again in a few minutes.", 429);
      const code = String(body.code ?? "").trim().toUpperCase();
      const course = code ? Object.values(d.courses).find((c) => c.joinCode === code && !c.sample) : undefined;
      if (!course) return fail("That class code doesn’t match a class", 404);
      const session = getSession(request);
      if (roleOf(session, course)) return fail("You teach this course. To see it as a student, use Student View.", 409);
      const mine = course.students.find((x) => x.userId === u.id);
      if (mine) return Response.json({ ok: true, courseId: course.id, studentId: mine.id });
      const waitingAs = course.waiting?.find((x) => x.userId === u.id);
      if (waitingAs) return Response.json({ ok: true, courseId: course.id, studentId: waitingAs.id, waiting: true });
      if (course.access?.joinOpen === false) return fail("This class isn’t accepting new students right now", 403);
      if (course.access?.passcode && body.passcode !== course.access.passcode) return Response.json({ ok: false, needPasscode: true, error: body.passcode ? "That passcode isn’t right" : "This class also needs a passcode" }, { status: 403 });
      const mode = course.access?.selfJoin;
      if (!mode) return fail("This class only takes students invited by email. Ask your teacher for an invitation.", 403);
      if (course.students.length + (course.waiting?.length ?? 0) >= 500) return fail("This class is full", 403);
      const st = { id: uid("s-"), name: u.name, email: u.email, userId: u.id, joinedAt: Date.now() };
      if (mode === "approve") (course.waiting ??= []).push(st);
      else {
        course.students.push(st);
        const g = course.groups?.length ? [...course.groups].sort((a, b) => a.studentIds.length - b.studentIds.length)[0] : undefined;
        g?.studentIds.push(st.id);
      }
      save();
      return Response.json({ ok: true, courseId: course.id, studentId: st.id, waiting: mode === "approve" });
    }
    case "invite": {
      // A student's own link (emailed, copied, or from a form). Signed in, it links their place on the class list to
      // this account, for good; not signed in, it says whose invitation it is so they can sign in or make an account.
      if (throttled(`invite:${ip}`, 200)) return fail("Too many attempts. Try again in a few minutes.", 429);
      const course = d.courses[body.courseId];
      const st = course && findInvite(course, String(body.token ?? ""));
      if (!course || !st) return fail("This link has expired or your teacher turned it off. Ask your teacher to send you a new one.", 404);
      const session = getSession(request);
      const u = teacherOf(session);
      const owner = course.ownerId ? d.users[course.ownerId] : undefined;
      if (!u) return Response.json({ ok: false, needAccount: true, courseTitle: course.title, teacher: owner?.name ?? null, name: st.name, email: st.email ?? null }, { status: 401 });
      if (canTeach(session, course) && course.id !== "demo") return fail("You teach this course, so this invitation is for one of your students. To see the course as a student, use Student View.", 409);
      if (st.userId && st.userId !== u.id) return fail("This invitation has already been used by another account. If that wasn’t you, ask your teacher to send a new one.", 409);
      // Already in this class under another name (joined with the code, say): keep that place.
      const other = course.students.find((x) => x.userId === u.id && x.id !== st.id);
      if (other) return Response.json({ ok: true, courseId: course.id, studentId: other.id });
      st.userId = u.id;
      save();
      return Response.json({ ok: true, courseId: course.id, studentId: st.id });
    }
    case "google": {
      // Anyone signs in (or signs up) with Google. An existing account with the same email is the same person.
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) return fail("Google sign-in isn’t set up on this site");
      if (throttled(`google:${ip}`, 200)) return fail("Too many attempts. Try again in a few minutes.", 429);
      const who = await verifyGoogle(String(body.credential ?? ""), clientId).catch(() => null);
      if (!who) return fail("Google sign-in didn’t work. Try again.", 401);
      let u = Object.values(d.users).find((x) => x.google === who.sub) ?? Object.values(d.users).find((x) => x.email === who.email);
      if (!u) {
        const id = uid("u-");
        u = d.users[id] = { id, email: who.email, name: who.name, hash: "", salt: "", google: who.sub, picture: who.picture, firstRole: body.as === "student" ? "student" : "teacher", createdAt: Date.now() };
        if (body.as !== "student") giveStarterCourse(id);
      } else if (u.google && u.google !== who.sub) {
        return fail("That email belongs to a different Google account here.", 401);
      } else if (!u.google) {
        // First Google sign-in on an account made with a password. Google has shown this person owns the email;
        // whoever chose the password may not have (sign-up doesn't check email), so the password stops working
        // and every other session on the account ends.
        u.hash = "";
        u.salt = "";
        for (const [k, s] of Object.entries(d.sessions)) if (s.userId === u.id) delete d.sessions[k];
      }
      u.google = who.sub;
      u.picture = who.picture;
      save();
      return Response.json({ ok: true }, { headers: { "Set-Cookie": startSession({ kind: "teacher", userId: u.id }) } });
    }
    case "logout":
      return Response.json({ ok: true }, { headers: { "Set-Cookie": endSession(request) } });
    default:
      return fail("Unknown action");
  }
}
