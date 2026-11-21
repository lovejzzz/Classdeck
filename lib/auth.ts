import crypto from "crypto";
import { db, save, type Session, type User } from "./store";
import type { Course } from "./types";

// Accounts and sessions.
// Teachers sign in with email and password. Students sign in to one course with the class code,
// their name, and a 4-digit PIN they choose the first time. The CaPS demo course is open to
// everyone as a sandbox. Sessions are an opaque token in an HttpOnly cookie; only its SHA-256
// is stored.

export const COOKIE = "cd_s";
const DAY = 86400_000;
const TEACHER_DAYS = 30;
const STUDENT_DAYS = 120;
export const DEMO = "demo";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function hashSecret(secret: string, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(secret, salt, 64).toString("hex") };
}
export function checkSecret(secret: string, salt: string, hash: string) {
  const got = crypto.scryptSync(secret, salt, 64);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function readCookie(request: Request, name: string) {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function getSession(request: Request): (Session & { key: string }) | null {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  const key = sha(token);
  const s = db().sessions[key];
  if (!s) return null;
  if (s.exp < Date.now()) {
    delete db().sessions[key];
    return null;
  }
  return { ...s, key };
}

/** Start a session and return the Set-Cookie header for it. */
export function startSession(s: Omit<Session, "exp">, days = s.kind === "teacher" ? TEACHER_DAYS : STUDENT_DAYS): string {
  const d = db();
  // Drop expired sessions while we're here.
  const now = Date.now();
  for (const [k, v] of Object.entries(d.sessions)) if (v.exp < now) delete d.sessions[k];
  // Keep anonymous demo sessions from piling up.
  const demos = Object.entries(d.sessions).filter(([, v]) => v.kind === "demo").sort((a, b) => a[1].exp - b[1].exp);
  for (const [k] of demos.slice(0, Math.max(0, demos.length - 2000))) delete d.sessions[k];
  const token = crypto.randomBytes(32).toString("base64url");
  d.sessions[sha(token)] = { ...s, exp: now + days * DAY };
  save();
  return cookieHeader(token, days * 86400);
}

export function endSession(request: Request): string {
  const s = getSession(request);
  if (s) {
    delete db().sessions[s.key];
    save();
  }
  return cookieHeader("", 0);
}

function cookieHeader(token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function teacherOf(session: Session | null): User | undefined {
  return session?.kind === "teacher" && session.userId ? db().users[session.userId] : undefined;
}

/** The site owner(s), by email in ADMIN_EMAILS. On a computer without it set (development), every teacher counts. */
export function isAdmin(session: Session | null): boolean {
  const t = teacherOf(session);
  if (!t) return false;
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return process.env.NODE_ENV !== "production";
  return list.includes(t.email.toLowerCase());
}

export type Role = "owner" | "editor" | "viewer";

/**
 * This teacher's role in a course. A co-teacher counts only once they've signed in with Google using the invited
 * address: a password account could claim any email, so it never matches an invite.
 */
export function roleOf(session: Session | null, course: Course): Role | null {
  if (session?.kind !== "teacher" || !session.userId) return null;
  if (course.ownerId === session.userId) return "owner";
  const u = db().users[session.userId];
  if (!u?.google || !course.people?.length) return null;
  const email = u.email.toLowerCase();
  return course.people.find((p) => p.email.toLowerCase() === email)?.role ?? null;
}

/** May this visitor change this course and see everyone's work? (Its owner, or an editor.) */
export function canTeach(session: Session | null, course: Course): boolean {
  if (course.id === DEMO) return true;
  const r = roleOf(session, course);
  return r === "owner" || r === "editor";
}

/** May this visitor see the teacher's view of this course? (Also viewers, who can't change anything.) */
export function canSeeTeacher(session: Session | null, course: Course): boolean {
  return canTeach(session, course) || roleOf(session, course) === "viewer";
}

/** May this visitor act as this student in this course? */
export function canBeStudent(session: Session | null, course: Course, studentId: string): boolean {
  if (course.id === DEMO || canTeach(session, course)) return true;
  return session?.kind === "student" && session.courseId === course.id && session.studentId === studentId;
}

/** Any signed-in visitor of this course (for live updates). */
export function canView(session: Session | null, course: Course): boolean {
  return course.id === DEMO || canSeeTeacher(session, course) || (session?.kind === "student" && session.courseId === course.id);
}

// —— simple in-memory throttle for sign-in attempts ——
const attempts = new Map<string, number[]>();
export function throttled(key: string, limit = 10, windowMs = 10 * 60_000) {
  const now = Date.now();
  // Forget old entries now and then, so the list can't grow without end.
  if (attempts.size > 20000) for (const [k, v] of attempts) if (now - v[v.length - 1] > windowMs) attempts.delete(k);
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > limit;
}

export const unauthorized = (who: "teacher" | "student", msg?: string, detail?: string) =>
  Response.json({ ok: false, error: msg ?? (who === "teacher" ? "Sign in as this course’s teacher" : "Sign in to this class first"), needAuth: who, detail }, { status: 401 });

/**
 * Why a signed-in teacher can't open a course's teacher view, in words they can act on (none if they aren't signed
 * in). An invited address only counts once its owner signs in with Google, since a password account can't prove it.
 */
export function teacherAccessHint(session: Session | null, course: Course): string | undefined {
  const t = teacherOf(session);
  if (!t) return undefined;
  const invited = course.people?.some((p) => p.email.toLowerCase() === t.email.toLowerCase());
  if (invited && !t.google) return `This course was shared with ${t.email}. To open it, sign in with Google using that address: an email-and-password account can’t prove it owns the address.`;
  return `You’re signed in as ${t.email}, and this course isn’t shared with that account. Ask its owner to add you, or sign in with the account they shared it with.`;
}
