import { clientIp } from "@/lib/origin";
import { canTeach, checkSecret, endSession, getSession, hashSecret, roleOf, startSession, teacherOf, throttled } from "@/lib/auth";
import { uid } from "@/lib/profile";
import { verifyGoogle } from "@/lib/google";
import { findInvite } from "@/lib/hooks";
import { db, save } from "@/lib/store";
import { giveStarterCourse } from "@/lib/newcourse";
import { fullName, namePart, needsName, setAccountName, splitName } from "@/lib/names";
import { checkCode, issueCode, verified, verifyOn } from "@/lib/verify";
import { deliverPending } from "@/lib/pending";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/**
 * Names are how classmates find each other (to @mention them, in groups, in messages), so two students of a class
 * can't share one. Returns a reply asking for another name, or null if the name is free.
 */
function nameTaken(course: { students: { id: string; name: string }[]; waiting?: { id: string; name: string }[] }, name: string, self?: string) {
  const n = name.trim().toLowerCase();
  const other = [...course.students, ...(course.waiting ?? [])].find((x) => x.id !== self && x.name.trim().toLowerCase() === n);
  if (!other) return null;
  return Response.json({
    ok: false, needName: true, name,
    error: `Someone in this class is already called ${other.name}. Add something so classmates can tell you apart, like your last name or its first letter.`,
  }, { status: 409 });
}

/** Who is signed in on this browser. */
export async function GET(request: Request) {
  const s = getSession(request);
  const t = teacherOf(s);
  // The Google client id is public: it's what the "Sign in with Google" button needs.
  const google = process.env.GOOGLE_CLIENT_ID || null;
  // An account (it can teach some courses and be a student in others). "teacher" is its kind for older pages.
  // Templates sent to this address before it had a confirmed account arrive in the inbox now.
  if (t) deliverPending(t);
  if (t) return Response.json({ kind: "teacher", name: t.name, firstName: t.firstName ?? null, lastName: t.lastName ?? null, needsName: needsName(t), email: t.email, verified: verified(t), verifyNeeded: !!t.mustVerify && !verified(t), picture: t.picture ?? null, firstRole: t.firstRole ?? null, google, signIn: { password: !!t.hash, google: !!t.google }, since: t.createdAt });
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
      // A first and a last name (scripts that send one `name` have it split at its last space).
      const asked = body.firstName !== undefined || body.lastName !== undefined;
      const { first, last } = asked ? { first: namePart(body.firstName), last: namePart(body.lastName) } : splitName(String(body.name ?? ""));
      const password = String(body.password ?? "");
      if (!EMAIL.test(email)) return fail("Enter a valid email address");
      if (!first) return fail("Enter your first name");
      if (asked && !last) return fail("Enter your last name");
      if (password.length < 8) return fail("Use a password of at least 8 characters");
      // A whole class often signs up at once from one school address, so the limit per address is generous.
      if (throttled(`signup:${ip}`, 80)) return fail("Too many attempts. Try again in a few minutes.", 429);
      const taken = Object.values(d.users).find((u) => u.email === email);
      if (taken && (verified(taken) || !verifyOn() || taken.google)) return fail("There’s already an account with that email. Sign in instead.");
      if (taken) {
        // Someone signed up with this address but never confirmed it: whoever can read its email may take it over.
        if (!first || !last) return fail("Enter your first and last name");
        const sent = await issueCode(taken, { ...hashSecret(password), first, last });
        save();
        if (!sent.ok) return fail(sent.error, 429);
        return Response.json({ ok: false, needCode: true, email, devCode: sent.devCode, error: "This email already has an account that was never confirmed. We sent a code to it: type it here to make the account yours." }, { status: 409 });
      }
      const id = uid("u-");
      d.users[id] = { id, email, name: fullName(first, last), ...(first ? { firstName: first } : {}), ...(last ? { lastName: last } : {}), ...hashSecret(password), firstRole: body.as === "student" ? "student" : "teacher", createdAt: Date.now() };
      // A new teacher starts with Questhand 101 in their courses: a short course on Questhand, to try and to copy from.
      if (body.as !== "student") giveStarterCourse(id);
      // A new account confirms its address with a code before going on (lib/verify).
      let devCode: string | undefined;
      if (verifyOn()) {
        d.users[id].mustVerify = true;
        const sent = await issueCode(d.users[id]);
        if (sent.ok) devCode = sent.devCode;
      }
      save();
      return Response.json({ ok: true, verify: !!d.users[id].mustVerify, devCode }, { headers: { "Set-Cookie": startSession({ kind: "teacher", userId: id }) } });
    }
    case "claim": {
      // The code from a sign-up on an address whose account was never confirmed: the account becomes the new sign-up's
      // (its password and name), and whoever was signed in to it before is signed out.
      const email = String(body.email ?? "").trim().toLowerCase();
      if (throttled(`claim:${ip}`, 30)) return fail("Too many attempts. Try again in a few minutes.", 429);
      const u = Object.values(d.users).find((x) => x.email === email);
      if (!u || verified(u) || !u.verify?.claim) return fail("Start again: make the account once more.", 400);
      const ok = checkCode(u, String(body.code ?? ""));
      if (!ok.ok) { save(); return fail(ok.error); }
      const c = u.verify.claim;
      u.hash = c.hash; u.salt = c.salt;
      setAccountName(u, c.first, c.last);
      u.emailVerified = true; u.mustVerify = undefined; u.verify = undefined;
      for (const [k, s] of Object.entries(d.sessions)) if (s.userId === u.id) delete d.sessions[k];
      save();
      return Response.json({ ok: true }, { headers: { "Set-Cookie": startSession({ kind: "teacher", userId: u.id }) } });
    }
    case "sendCode": {
      const t = teacherOf(getSession(request));
      if (!t) return fail("Sign in first", 401);
      if (verified(t)) return Response.json({ ok: true, verified: true });
      // From Settings: an older account asks to confirm its address now (the code screen then opens).
      const sent = await issueCode(t);
      if (sent.ok && body.start) t.mustVerify = true;
      save();
      return sent.ok ? Response.json({ ok: true, devCode: sent.devCode }) : fail(sent.error, 429);
    }
    case "verifyCode": {
      const t = teacherOf(getSession(request));
      if (!t) return fail("Sign in first", 401);
      if (throttled(`verify:${t.id}`, 30)) return fail("Too many attempts. Try again in a few minutes.", 429);
      const ok = checkCode(t, String(body.code ?? ""));
      if (!ok.ok) { save(); return fail(ok.error); }
      t.emailVerified = true; t.mustVerify = undefined; t.verify = undefined;
      save();
      return Response.json({ ok: true });
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
      const name = String(body.name ?? "").trim().slice(0, 60) || u.name;
      const taken = nameTaken(course, name);
      if (taken) return taken;
      const st = { id: uid("s-"), name, email: u.email, userId: u.id, joinedAt: Date.now() };
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
      const chosen = String(body.name ?? "").trim().slice(0, 60);
      const taken = nameTaken(course, chosen || st.name, st.id);
      if (taken) return taken;
      if (chosen) st.name = chosen;
      // The place on the list takes the account's own name (rather than one made from the email), unless a classmate has it.
      else if (u.name && !nameTaken(course, u.name, st.id)) st.name = u.name;
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
        u = d.users[id] = { id, email: who.email, name: who.first && who.last ? fullName(who.first, who.last) : who.name, ...(who.first && who.last ? { firstName: who.first, lastName: who.last } : {}), hash: "", salt: "", google: who.sub, picture: who.picture, firstRole: body.as === "student" ? "student" : "teacher", createdAt: Date.now() };
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
      // Google has checked the address: nothing left to confirm.
      u.emailVerified = true; u.mustVerify = undefined; u.verify = undefined;
      if (!u.pictureOwn) u.picture = who.picture;
      // An account still without a first and last name takes Google's, if Google has both.
      if (needsName(u) && who.first && who.last) setAccountName(u, who.first, who.last);
      save();
      return Response.json({ ok: true }, { headers: { "Set-Cookie": startSession({ kind: "teacher", userId: u.id }) } });
    }
    case "logout":
      return Response.json({ ok: true }, { headers: { "Set-Cookie": endSession(request) } });
    case "setName": {
      // The account's own name (shown to co-teachers and on courses they make). Names in a class are set per class.
      const t = teacherOf(getSession(request));
      if (!t) return fail("Sign in first", 401);
      const { first, last } = body.firstName !== undefined || body.lastName !== undefined ? { first: namePart(body.firstName), last: namePart(body.lastName) } : splitName(String(body.name ?? ""));
      if (!first) return fail("Enter your first name");
      if (!last) return fail("Enter your last name");
      const u = db().users[t.id];
      setAccountName(u, first, last);
      save();
      return Response.json({ ok: true, name: u.name, firstName: first, lastName: last });
    }
    case "setPicture": {
      // A photo of their own: a picture this account uploaded (or none, to go back to Google's, or the initial).
      const t = teacherOf(getSession(request));
      if (!t) return fail("Sign in first", 401);
      const u = db().users[t.id];
      if (body.url === null) {
        u.picture = undefined;
        u.pictureOwn = undefined;
      } else {
        const m = /^\/api\/upload\/([a-z0-9]+\.(?:jpg|jpeg|png|webp|gif))$/.exec(String(body.url ?? ""));
        if (!m || db().uploads[m[1]]?.by !== `u:${t.id}`) return fail("That picture couldn’t be used");
        u.picture = body.url;
        u.pictureOwn = true;
      }
      save();
      return Response.json({ ok: true, picture: u.picture ?? null });
    }
    default:
      return fail("Unknown action");
  }
}
