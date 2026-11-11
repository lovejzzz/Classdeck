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

/** May this visitor change this course and see everyone's work? */
export function canTeach(session: Session | null, course: Course): boolean {
  if (course.id === DEMO) return true;
  return session?.kind === "teacher" && !!session.userId && course.ownerId === session.userId;
}

/** May this visitor act as this student in this course? */
export function canBeStudent(session: Session | null, course: Course, studentId: string): boolean {
  if (course.id === DEMO || canTeach(session, course)) return true;
  return session?.kind === "student" && session.courseId === course.id && session.studentId === studentId;
}

/** Any signed-in visitor of this course (for live updates). */
export function canView(session: Session | null, course: Course): boolean {
  return course.id === DEMO || canTeach(session, course) || (session?.kind === "student" && session.courseId === course.id);
}

// —— simple in-memory throttle for sign-in attempts ——
const attempts = new Map<string, number[]>();
export function throttled(key: string, limit = 10, windowMs = 10 * 60_000) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > limit;
}

export const unauthorized = (who: "teacher" | "student", msg?: string) =>
  Response.json({ ok: false, error: msg ?? (who === "teacher" ? "Sign in as this course’s teacher" : "Sign in to this class first"), needAuth: who }, { status: 401 });
