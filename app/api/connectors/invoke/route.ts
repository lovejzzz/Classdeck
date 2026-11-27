import { canBeStudent, canTeach, DEMO, getSession, teacherOf } from "@/lib/auth";
import { clientIp } from "@/lib/origin";
import { getConnector } from "@/lib/connectors/registry";
import { ConnectorError } from "@/lib/connectors/types";
import { findLesson, visibleModules } from "@/lib/profile";
import { db, logEvent, save } from "@/lib/store";
import { treeView } from "@/lib/branching";
import { aiOf, courseAi } from "@/lib/aifeedback";

// 网关：浏览器永远不直接访问外部 API。所有调用都从这里走，在这里做四件事：
//   1. 这门课启用了这个连接器吗？
//   2. 学生调用时，老师把这个工具挂在这个模块上了吗？这个模块是这个学生能看到的吗？
//   3. 限速。
//   4. 记一笔，老师能看到谁用了什么。
// 密钥只在服务器上。

const WINDOW_MS = 60_000;
const LIMIT = 20;
const hits = new Map<string, number[]>();

function rateLimited(key: string, limit = LIMIT) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) return true;
  recent.push(now);
  hits.set(key, recent);
  return false;
}

const STATUS: Record<string, number> = {
  // Nothing found is an answer, not a failure: it comes back as one (so the browser logs no error).
  bad_input: 400, forbidden: 403, not_found: 200, rate_limited: 429, not_configured: 503, upstream: 502,
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { courseId, studentId, moduleId, lessonId, connector: connectorId, action } = body as Record<string, string>;
    const course = db().courses[courseId];
    if (!course) throw new ConnectorError("bad_input", "No such course");
    const connector = getConnector(connectorId);
    if (!connector) throw new ConnectorError("bad_input", "No such connector");
    const spec = connector.actions.find((a) => a.id === action);
    if (!spec) throw new ConnectorError("bad_input", "No such action");

    const session = getSession(request);
    // The open demo lets anyone act as its teacher; for tools they get only what a student would.
    const visitor = course.id === DEMO && !teacherOf(session);
    const input: Record<string, string> = {};
    for (const [k, v] of Object.entries((body.input ?? {}) as Record<string, unknown>)) {
      input[k] = String(v ?? "").slice(0, studentId || visitor ? 2000 : 20000);
    }

    if (studentId ? !canBeStudent(session, course, studentId) : !canTeach(session, course)) {
      throw new ConnectorError("forbidden", "Sign in first");
    }
    // Every caller has a limit, per visitor address and per teacher.
    if (rateLimited(`ip:${clientIp(request)}`, visitor ? 10 : 40)) throw new ConnectorError("rate_limited", "Slow down a little. Try again in a minute.");
    if (!studentId) {
      if (visitor && (spec.teacherOnly || !course.enabledConnectors.includes(connectorId))) throw new ConnectorError("forbidden", "Sign in as a teacher to use this tool");
      const t = teacherOf(session);
      if (t && rateLimited(`t:${t.id}`, 30)) throw new ConnectorError("rate_limited", "Slow down a little. Try again in a minute.");
    }
    let ctx = {};
    if (studentId) {
      if (!course.enabledConnectors.includes(connectorId)) throw new ConnectorError("forbidden", "Your teacher hasn't turned on this tool for the course");
      if (spec.teacherOnly) throw new ConnectorError("forbidden", "Only teachers can use this tool");
      if (!course.students.some((s) => s.id === studentId)) throw new ConnectorError("forbidden", "Not a student in this course");
      const lesson = findLesson(course, lessonId);
      const mod = lesson && visibleModules(lesson, studentId, db().choices[courseId]?.[studentId], treeView(course.weeks, db().progress[courseId]?.[studentId]), course).find((m) => m.id === moduleId);
      if (!mod) throw new ConnectorError("forbidden", "You can't see this card");
      if (!mod.tools.some((t) => t.connector === connectorId && t.action === action)) {
        throw new ConnectorError("forbidden", "This card doesn't have that tool");
      }
      if (rateLimited(`${courseId}:${studentId}`)) throw new ConnectorError("rate_limited", "Slow down a little. Try again in a minute.");
      // Where the card sits (unseen by the student): the course, the lesson and its goal, the next lessons.
      const week = course.weeks.find((w) => w.lessons.some((l) => l.id === lesson!.id));
      const flat = course.weeks.flatMap((w) => w.lessons.map((l) => ({ w, l })));
      const at = flat.findIndex((x) => x.l.id === lesson!.id);
      const name = (w: { title: string }, l: { title: string; goal?: string }) => `${w.title.split(" · ")[0]} · ${l.title}${l.goal ? ` (${l.goal})` : ""}`;
      ctx = {
        moduleTitle: mod.title, moduleBody: mod.body, moduleCriteria: mod.criteria, courseTitle: course.title,
        lesson: week ? name(week, lesson!) : lesson!.title,
        upcoming: flat.slice(at + 1, at + 4).map((x) => name(x.w, x.l)),
      };
    }

    // AI tools run on the teacher's own AI: their own when they use it themselves, the course owner's for students.
    const ai = (!studentId ? aiOf(teacherOf(session)) : null) ?? courseAi(course);
    const result = await connector.invoke(action, input, { ...ctx, ...(ai ? { ai } : {}) });

    if (studentId) {
      const log = (db().toolLog[courseId] ??= []);
      log.push({ studentId, moduleId, connector: connectorId, action, at: Date.now() });
      if (log.length > 2000) log.splice(0, log.length - 2000);
      const label = input[spec.inputs[0]?.name ?? ""]?.slice(0, 40);
      logEvent(courseId, {
        kind: "tool", studentId, moduleId,
        text: `Used “${spec.title}”${label ? `: ${label}` : ""}`,
      });
      save();
    }
    return Response.json({ ok: true, result });
  } catch (e) {
    if (e instanceof ConnectorError) {
      return Response.json({ ok: false, code: e.code, error: e.message }, { status: STATUS[e.code] ?? 500 });
    }
    console.error(e);
    return Response.json({ ok: false, code: "upstream", error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
