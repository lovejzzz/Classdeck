import { canTeach, getSession, teacherOf, throttled } from "@/lib/auth";
import { uid } from "@/lib/profile";
import { db, save } from "@/lib/store";
import type { Course, DirectMessage, Nudge } from "@/lib/types";

// The signed-in account's messages, across all its courses: as a teacher, a conversation with each student who has
// one; as a student, one with the teacher and (when the teacher allows it) one with each classmate.
//   GET  /api/inbox                       → { threads, contacts }
//   GET  /api/inbox?course=&me=&with=     → { messages } of one conversation
//   POST { action: "send", course, me, with, text }   ·   POST { action: "read", course, me, with }
// `me` is "teacher" or the account's student id in that course; `with` is the other side ("teacher" or a student id).

type Msg = { id: string; text: string; at: number; mine: boolean; read: boolean };
type Thread = { key: string; course: string; courseTitle: string; me: string; with: string; name: string; role: "teacher" | "student"; last?: Msg; unread: number };

const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });
const peersOk = (c: Course) => c.peerMessages !== false;
const teacherName = (c: Course) => (c.ownerId ? db().users[c.ownerId]?.name : undefined) ?? "Your teacher";

/** Who the account is in a course: "teacher", its student id, or null. */
function seatOf(session: ReturnType<typeof getSession>, c: Course): string[] {
  const out: string[] = [];
  if (c.id !== "demo" && canTeach(session, c)) out.push("teacher");
  const u = teacherOf(session);
  const st = u ? c.students.find((s) => s.userId === u.id) : session?.kind === "student" && session.courseId === c.id ? c.students.find((s) => s.id === session.studentId) : undefined;
  if (st) out.push(st.id);
  return out;
}

/** One conversation's messages, from `me`'s side. */
function messages(c: Course, me: string, other: string): Msg[] {
  const d = db();
  if (me === "teacher" || other === "teacher") {
    const sid = me === "teacher" ? other : me;
    return (d.nudges[c.id] ?? []).filter((n: Nudge) => n.studentId === sid).map((n) => {
      const byStudent = n.from === "student";
      return { id: n.id, text: n.text, at: n.at, mine: me === "teacher" ? !byStudent : byStudent, read: !!n.read };
    });
  }
  return (d.dms[c.id] ?? []).filter((m) => (m.from === me && m.to === other) || (m.from === other && m.to === me))
    .map((m) => ({ id: m.id, text: m.text, at: m.at, mine: m.from === me, read: !!m.read }));
}

function allowed(c: Course, me: string, other: string): string | null {
  if (me === other) return "That's you";
  if (other !== "teacher" && !c.students.some((s) => s.id === other)) return "No such student";
  if (me !== "teacher" && other !== "teacher" && !peersOk(c)) return "Your teacher has turned off messages between students in this class";
  return null;
}

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) return fail("Sign in first", 401);
  const d = db();
  const q = new URL(request.url).searchParams;
  if (q.get("course")) {
    const c = d.courses[q.get("course")!];
    const me = q.get("me") ?? "", other = q.get("with") ?? "";
    if (!c || !seatOf(session, c).includes(me)) return fail("Not your conversation", 403);
    const why = allowed(c, me, other);
    if (why) return fail(why, 403);
    return Response.json({ messages: messages(c, me, other).sort((a, b) => a.at - b.at) });
  }
  const threads: Thread[] = [];
  const contacts: { course: string; courseTitle: string; me: string; with: string; name: string; role: "teacher" | "student" }[] = [];
  for (const c of Object.values(d.courses)) {
    if (c.sample) continue;
    for (const me of seatOf(session, c)) {
      const others = me === "teacher"
        ? c.students.map((s) => s.id)
        : ["teacher", ...(peersOk(c) ? c.students.filter((s) => s.id !== me).map((s) => s.id) : [])];
      for (const other of others) {
        const name = other === "teacher" ? teacherName(c) : c.students.find((s) => s.id === other)?.name ?? "Student";
        const role = other === "teacher" ? "teacher" : "student";
        contacts.push({ course: c.id, courseTitle: c.title, me, with: other, name, role });
        const ms = messages(c, me, other);
        if (!ms.length) continue;
        const last = ms.reduce((a, b) => (b.at > a.at ? b : a));
        threads.push({ key: `${c.id}:${me}:${other}`, course: c.id, courseTitle: c.title, me, with: other, name, role, last, unread: ms.filter((m) => !m.mine && !m.read).length });
      }
    }
  }
  threads.sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0));
  return Response.json({ threads, contacts, unread: threads.reduce((n, t) => n + t.unread, 0) });
}

export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return fail("Sign in first", 401);
  const body = await request.json().catch(() => ({}));
  const d = db();
  const c = d.courses[String(body.course ?? "")];
  const me = String(body.me ?? ""), other = String(body.with ?? "");
  if (!c || !seatOf(session, c).includes(me)) return fail("Not your conversation", 403);
  const why = allowed(c, me, other);
  if (why) return fail(why, 403);
  if (body.action === "send") {
    const text = String(body.text ?? "").trim().slice(0, 2000);
    if (!text) return fail("Write a message");
    if (throttled(`dm:${session.key}`, 120, 10 * 60_000)) return fail("Too many messages. Try again in a few minutes.", 429);
    if (me === "teacher" || other === "teacher") {
      const list = (d.nudges[c.id] ??= []);
      list.push({ id: uid("n-"), studentId: me === "teacher" ? other : me, text, at: Date.now(), ...(me === "teacher" ? {} : { from: "student" as const }) });
      if (list.length > 3000) list.splice(0, list.length - 3000);
    } else {
      const list = (d.dms[c.id] ??= []);
      list.push({ id: uid("dm-"), from: me, to: other, text, at: Date.now() } satisfies DirectMessage);
      if (list.length > 5000) list.splice(0, list.length - 5000);
    }
    save(c.id);
    return Response.json({ ok: true });
  }
  if (body.action === "read") {
    if (me === "teacher" || other === "teacher") {
      const sid = me === "teacher" ? other : me;
      // The other side's messages: the student's (read by the teacher) or the teacher's (read by the student).
      for (const n of d.nudges[c.id] ?? []) if (n.studentId === sid && (me === "teacher" ? n.from === "student" : !n.from)) n.read = true;
    } else for (const m of d.dms[c.id] ?? []) if (m.from === other && m.to === me) m.read = true;
    save(c.id);
    return Response.json({ ok: true });
  }
  return fail("Unknown action");
}
