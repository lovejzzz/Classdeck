import { canTeach, getSession, teacherOf, throttled } from "@/lib/auth";
import { uid } from "@/lib/profile";
import { db, save, type Letter, type User } from "@/lib/store";
import { verified } from "@/lib/verify";
import { info, MAX_TEMPLATES } from "@/lib/mytemplates";
import type { Course, DirectMessage, Nudge } from "@/lib/types";

// The inbox: the account's conversations, one per person. A conversation with someone you share a course with also
// holds what you wrote each other in that course (each message says which course); anything written from the inbox
// is a message between the two accounts. People without an account yet (students added by name) stay a course
// conversation, as before.
//   GET  /api/inbox                         → { threads, contacts, unread }
//   GET  /api/inbox?person=<userId>         → { messages } with that person (course ones tagged)
//   GET  /api/inbox?find=<email>            → { person } a confirmed account by its exact address (you confirmed too)
//   GET  /api/inbox?course=&me=&with=       → { messages } of one course conversation (pages inside a course)
//   POST { action: "send", person, text, share? }  ·  { action: "read", person }  ·  { action: "addTemplate", letter }
//   POST { action: "send" | "read", course, me, with, text }   (inside a course)

type Msg = { id: string; text: string; at: number; mine: boolean; read: boolean; course?: { id: string; title: string }; share?: unknown; added?: string | null; letter?: string };
type Thread = {
  key: string; kind: "person" | "course"; name: string; context: string; courses: { id: string; title: string }[]; last?: Msg; unread: number;
  person?: string; email?: string; course?: string; me?: string; with?: string;
};
type Contact = Omit<Thread, "last" | "unread">;

const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });
const peersOk = (c: Course) => c.peerMessages !== false;
const teacherName = (c: Course) => (c.ownerId ? db().users[c.ownerId]?.name : undefined) ?? "Your teacher";
const pairKey = (a: string, b: string) => [a, b].sort().join("~");

/** Who the account is in a course: "teacher", its student id, or both. */
function seatOf(session: ReturnType<typeof getSession>, c: Course): string[] {
  const out: string[] = [];
  if (c.id !== "demo" && canTeach(session, c)) out.push("teacher");
  const u = teacherOf(session);
  const st = u ? c.students.find((s) => s.userId === u.id) : session?.kind === "student" && session.courseId === c.id ? c.students.find((s) => s.id === session.studentId) : undefined;
  if (st) out.push(st.id);
  return out;
}

/** One course conversation's messages, from `me`'s side. */
function courseMessages(c: Course, me: string, other: string): Msg[] {
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

function markCourseRead(c: Course, me: string, other: string) {
  const d = db();
  if (me === "teacher" || other === "teacher") {
    const sid = me === "teacher" ? other : me;
    for (const n of d.nudges[c.id] ?? []) if (n.studentId === sid && (me === "teacher" ? n.from === "student" : !n.from)) n.read = true;
  } else for (const m of d.dms[c.id] ?? []) if (m.from === other && m.to === me) m.read = true;
}

/** A message in a course conversation: to or from the teacher's side (nudges), or between classmates (dms). */
function writeCourse(c: Course, seat: string, other: string, text: string) {
  const d = db();
  if (seat === "teacher" || other === "teacher") {
    const list = (d.nudges[c.id] ??= []);
    list.push({ id: uid("n-"), studentId: seat === "teacher" ? other : seat, text, at: Date.now(), ...(seat === "teacher" ? {} : { from: "student" as const }) });
    if (list.length > 3000) list.splice(0, list.length - 3000);
  } else {
    const list = (d.dms[c.id] ??= []);
    list.push({ id: uid("dm-"), from: seat, to: other, text, at: Date.now() } satisfies DirectMessage);
    if (list.length > 5000) list.splice(0, list.length - 5000);
  }
}

function allowed(c: Course, me: string, other: string): string | null {
  if (me === other) return "That's you";
  if (other !== "teacher" && !c.students.some((s) => s.id === other)) return "No such student";
  if (me !== "teacher" && other !== "teacher" && !peersOk(c)) return "Your teacher has turned off messages between students in this class";
  return null;
}

/**
 * Every course conversation the account has, with who's on the other side: their account (if they have one), their
 * name, and how you know them ("Student", "Teacher", "Classmate" in that course).
 */
function coursePairs(session: ReturnType<typeof getSession>) {
  const d = db();
  const out: { c: Course; me: string; other: string; account?: string; name: string; role: "Student" | "Teacher" | "Classmate"; canWrite: boolean }[] = [];
  for (const c of Object.values(d.courses)) {
    if (c.sample) continue;
    for (const me of seatOf(session, c)) {
      const others = me === "teacher" ? c.students.map((s) => s.id) : ["teacher", ...c.students.filter((s) => s.id !== me).map((s) => s.id)];
      for (const other of others) {
        const st = other === "teacher" ? undefined : c.students.find((s) => s.id === other);
        out.push({
          c, me, other,
          account: other === "teacher" ? c.ownerId : st?.userId,
          name: other === "teacher" ? teacherName(c) : st?.name ?? "Student",
          role: other === "teacher" ? "Teacher" : me === "teacher" ? "Student" : "Classmate",
          canWrite: !allowed(c, me, other),
        });
      }
    }
  }
  return out;
}

/** The template a message carries, for the reader: drawn small, and whether they've added it. */
function shareView(l: Letter, light: boolean) {
  const s = l.share ? db().shares[l.share] : undefined;
  if (!s) return null;
  // The list only needs its name; a conversation draws it. Which course it came from stays with the sender.
  if (light) return { name: s.template.name };
  const { from: _from, ...rest } = info(s.template); // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

function letterMsgs(me: string, other: string, light = false): Msg[] {
  return (db().letters[pairKey(me, other)] ?? []).map((l) => ({ id: l.id, letter: l.id, text: l.text, at: l.at, mine: l.from === me, read: !!l.read, ...(l.share ? { share: shareView(l, light), added: l.from === me ? null : l.added ?? null } : {}) }));
}

const nameOf = (u?: User) => u?.name ?? "Someone";

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) return fail("Sign in first", 401);
  const d = db();
  d.letters ??= {}; d.shares ??= {};
  const me = teacherOf(session);
  const q = new URL(request.url).searchParams;

  if (q.get("course")) {
    const c = d.courses[q.get("course")!];
    const seat = q.get("me") ?? "", other = q.get("with") ?? "";
    if (!c || !seatOf(session, c).includes(seat)) return fail("Not your conversation", 403);
    const why = allowed(c, seat, other);
    if (why) return fail(why, 403);
    return Response.json({ messages: courseMessages(c, seat, other).sort((a, b) => a.at - b.at) });
  }

  if (q.get("find") !== null) {
    // A confirmed account by its exact address (both of you confirmed): a name search never lists strangers.
    if (!me) return fail("Sign in first", 401);
    if (!verified(me)) return fail("Confirm your email first (Settings), then you can write to anyone by theirs.", 403);
    if (throttled(`find:${me.id}`, 60, 10 * 60_000)) return fail("Too many look-ups. Try again in a few minutes.", 429);
    const email = String(q.get("find")).trim().toLowerCase();
    const u = Object.values(d.users).find((x) => x.email === email);
    if (!u || u.id === me.id || !verified(u)) return Response.json({ person: null });
    return Response.json({ person: { person: u.id, name: u.name, email: u.email } });
  }

  if (q.get("person")) {
    if (!me) return fail("Sign in first", 401);
    const other = q.get("person")!;
    const msgs: Msg[] = letterMsgs(me.id, other);
    for (const p of coursePairs(session)) if (p.account === other) msgs.push(...courseMessages(p.c, p.me, p.other).map((m) => ({ ...m, course: { id: p.c.id, title: p.c.title } })));
    return Response.json({ messages: msgs.sort((a, b) => a.at - b.at) });
  }

  // The list: one thread per person (course history and letters together), and who you can write to.
  const people = new Map<string, Thread>();
  const legacy: Thread[] = [];
  const contacts: Contact[] = [];
  const lastOf = (ms: Msg[]) => (ms.length ? ms.reduce((a, b) => (b.at > a.at ? b : a)) : undefined);
  const person = (id: string): Thread | undefined => {
    if (!me || id === me.id || !d.users[id]) return undefined;
    let t = people.get(id);
    if (!t) { t = { key: `p:${id}`, kind: "person", person: id, name: nameOf(d.users[id]), email: d.users[id].email, context: "", courses: [], unread: 0 }; people.set(id, t); }
    return t;
  };
  for (const p of coursePairs(session)) {
    const ms = courseMessages(p.c, p.me, p.other);
    const t = p.account ? person(p.account) : undefined;
    if (t) {
      if (!t.courses.some((x) => x.id === p.c.id)) t.courses.push({ id: p.c.id, title: p.c.title });
      if (!t.context) t.context = `${p.role} · ${p.c.title}`;
      else if (!t.context.includes(p.c.title)) t.context = `${t.context.split(" · ")[0]} · ${t.courses.length} courses`;
      const last = lastOf(ms);
      if (last && (!t.last || last.at > t.last.at)) t.last = { ...last, course: { id: p.c.id, title: p.c.title } };
      t.unread += ms.filter((m) => !m.mine && !m.read).length;
      if (p.canWrite && !contacts.some((x) => x.person === t.person)) contacts.push({ key: t.key, kind: "person", person: t.person, name: t.name, email: t.email, context: "", courses: [] });
    } else {
      // No account on the other side yet (a student added by name): the course conversation, as before.
      const base = { key: `c:${p.c.id}:${p.me}:${p.other}`, kind: "course" as const, course: p.c.id, me: p.me, with: p.other, name: p.name, context: `${p.role} · ${p.c.title}`, courses: [{ id: p.c.id, title: p.c.title }] };
      if (p.canWrite) contacts.push(base);
      if (ms.length) legacy.push({ ...base, last: lastOf(ms), unread: ms.filter((m) => !m.mine && !m.read).length });
    }
  }
  if (me) {
    for (const k of Object.keys(d.letters)) {
      const [a, b] = k.split("~");
      if (a !== me.id && b !== me.id) continue;
      const t = person(a === me.id ? b : a);
      if (!t) continue;
      const ms = letterMsgs(me.id, t.person!, true);
      const last = lastOf(ms);
      if (last && (!t.last || last.at > t.last.at)) t.last = last;
      t.unread += ms.filter((m) => !m.mine && !m.read).length;
    }
  }
  // Contacts carry the same context line as their thread.
  for (const c of contacts) { const t = c.person ? people.get(c.person) : undefined; if (t) { c.context = t.context; c.courses = t.courses; } }
  const threads = [...[...people.values()].filter((t) => t.last), ...legacy].sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0));
  return Response.json({ threads, contacts, unread: threads.reduce((n, t) => n + t.unread, 0), verified: me ? verified(me) : false });
}

export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return fail("Sign in first", 401);
  const body = await request.json().catch(() => ({}));
  const d = db();
  d.letters ??= {}; d.shares ??= {};
  const me = teacherOf(session);

  if (body.person !== undefined || body.action === "addTemplate") {
    if (!me) return fail("Sign in first", 401);
    if (body.action === "addTemplate") {
      // A template someone sent: a copy of it into the reader's own templates.
      const id = String(body.letter ?? "");
      const [k, l] = Object.entries(d.letters).flatMap(([k, list]) => (k.split("~").includes(me.id) ? list.filter((x) => x.id === id && x.from !== me.id).map((x) => [k, x] as const) : []))[0] ?? [];
      const s = l?.share ? d.shares[l.share] : undefined;
      if (!k || !l || !s) return fail("That template isn’t there any more", 404);
      if (l.added && (d.templates[me.id] ?? []).some((t) => t.id === l.added)) return Response.json({ ok: true, template: l.added });
      const list = ((d.templates ??= {})[me.id] ??= []);
      if (list.length >= MAX_TEMPLATES) return fail(`You have ${MAX_TEMPLATES} templates, the most there can be. Delete one in Settings → Templates first.`);
      const t = { ...structuredClone(s.template), id: uid("tp-"), at: Date.now(), from: undefined };
      list.push(t);
      l.added = t.id;
      save(me.id); save(k);
      return Response.json({ ok: true, template: t.id, name: t.name });
    }
    const other = String(body.person);
    const them = d.users[other];
    if (!them || other === me.id) return fail("That person isn’t on Questhand");
    const pairs = coursePairs(session).filter((p) => p.account === other);
    if (body.action === "read") {
      for (const l of d.letters[pairKey(me.id, other)] ?? []) if (l.from === other) l.read = true;
      for (const p of pairs) markCourseRead(p.c, p.me, p.other);
      save();
      return Response.json({ ok: true });
    }
    if (body.action === "send") {
      const text = String(body.text ?? "").trim().slice(0, 2000);
      const shareId = body.share ? String(body.share) : undefined;
      if (!text && !shareId) return fail("Write a message");
      // Someone you share a course with (by its rules), or anyone by their confirmed address once yours is confirmed.
      const known = pairs.some((p) => p.canWrite);
      if (!known && !(verified(me) && verified(them))) return fail(verified(me) ? "You can only write to people who have confirmed their email" : "Confirm your email first (Settings), then you can write to anyone by theirs.", 403);
      if (throttled(`letter:${me.id}`, 120, 10 * 60_000)) return fail("Too many messages. Try again in a few minutes.", 429);
      if (throttled(`letter-day:${me.id}`, 400, 24 * 60 * 60_000)) return fail("That’s a lot of messages for one day. Try again tomorrow.", 429);
      if (shareId && d.shares[shareId]?.by !== me.id) return fail("That template isn’t yours to send");
      // Someone you share a course with: it goes through that course (the course you last wrote in), so the course's
      // own views see it too (a teacher's class list, the course page, co-teachers on the teacher's side).
      const via = shareId ? undefined : pairs.filter((p) => p.canWrite).map((p) => ({ p, at: Math.max(0, ...courseMessages(p.c, p.me, p.other).map((m) => m.at)) })).sort((a, b) => b.at - a.at)[0]?.p;
      if (via) {
        writeCourse(via.c, via.me, via.other, text);
        save(via.c.id);
        return Response.json({ ok: true });
      }
      const key = pairKey(me.id, other);
      const list = (d.letters[key] ??= []);
      const l: Letter = { id: uid("lt-"), from: me.id, text, at: Date.now(), ...(shareId ? { share: shareId } : {}) };
      list.push(l);
      if (list.length > 3000) list.splice(0, list.length - 3000);
      save(key);
      return Response.json({ ok: true, id: l.id });
    }
    return fail("Unknown action");
  }

  // Inside a course: the course conversation, as before.
  const c = d.courses[String(body.course ?? "")];
  const seat = String(body.me ?? ""), other = String(body.with ?? "");
  if (!c || !seatOf(session, c).includes(seat)) return fail("Not your conversation", 403);
  const why = allowed(c, seat, other);
  if (why) return fail(why, 403);
  if (body.action === "send") {
    const text = String(body.text ?? "").trim().slice(0, 2000);
    if (!text) return fail("Write a message");
    if (throttled(`dm:${session.key}`, 120, 10 * 60_000)) return fail("Too many messages. Try again in a few minutes.", 429);
    writeCourse(c, seat, other, text);
    save(c.id);
    return Response.json({ ok: true });
  }
  if (body.action === "read") {
    markCourseRead(c, seat, other);
    save(c.id);
    return Response.json({ ok: true });
  }
  return fail("Unknown action");
}
