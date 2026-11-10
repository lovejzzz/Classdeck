"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { ago } from "@/lib/time";
import { toast } from "@/lib/toast";
import type { Attachment, Course, Feedback, Module, Progress, StudioPost } from "@/lib/types";
import { MediaView } from "../cards/Media";
import { Avatar, Icon, StatusIcon } from "../Icon";
import { WorkComposer } from "./WorkComposer";

const GOAL = 2;

function FeedbackForm({ onSend, skillName, levels }: { onSend: (f: { observed: string; effect: string; next: string; level?: number }) => Promise<boolean>; skillName?: string; levels: Course["levels"] }) {
  const [f, setF] = useState({ observed: "", effect: "", next: "" });
  const [level, setLevel] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof f, label: string, placeholder: string) => (
    <label className="block">
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      <textarea value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} rows={2} placeholder={placeholder} className="field mt-1 resize-none" />
    </label>
  );
  return (
    <form
      className="rise mt-3 space-y-2.5 rounded-xl border border-line bg-[#fafaf9] p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onSend({ ...f, level });
        setBusy(false);
        if (ok) setF({ observed: "", effect: "", next: "" });
      }}
    >
      {field("observed", "What I observed", "A specific sentence, moment, or timestamp. “At 0:12 you paused before…”")}
      {field("effect", "Its effect on me", "How it changed what I understood or felt.")}
      {field("next", "Try next", "One concrete thing to try in the next version.")}
      {skillName && levels && (
        <div>
          <span className="text-[12px] font-medium text-ink-2">{skillName}, on the rubric (optional)</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {levels.map((l) => (
              <button type="button" key={l.n} onClick={() => setLevel(level === l.n ? undefined : l.n)} aria-pressed={level === l.n}
                className={`press h-7 rounded-full border px-2.5 text-[12px] ${level === l.n ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-line-strong"}`}>
                {l.n} · {l.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="submit" disabled={busy || !f.observed.trim() || !f.next.trim()} className="btn btn-dark press">{busy ? "Sending…" : "Send feedback"}</button>
    </form>
  );
}

function PostView({ post, feedback, course, mine, me, onFeedback }: {
  post: StudioPost; feedback: Feedback[]; course: Course; mine: boolean; me: string;
  onFeedback?: (f: { observed: string; effect: string; next: string; level?: number }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const name = (id: string) => course.students.find((s) => s.id === id)?.name ?? "Peer";
  const skill = course.skills?.find((s) => s.id === post.skill)?.name;
  const given = feedback.some((f) => f.fromId === me);
  return (
    <article className="pop card overflow-hidden">
      <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <Avatar name={name(post.studentId)} size={26} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium">{post.title}</div>
          <div className="mono">{ago(post.updatedAt)}{skill ? ` · feedback on ${skill.toLowerCase()}` : ""}</div>
        </div>
        {given ? <span className="chip h-5 bg-ok/10 text-[11px] text-ok"><Icon name="check" size={11} /> You replied</span>
          : !mine && onFeedback && <span className="chip h-5 bg-[#fbf3ee] text-[11px] text-[#c25a35]">Needs your feedback</span>}
      </header>
      <div className="space-y-3 px-4 py-3">
        {(post.audience || post.purpose) && (
          <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-[13px]">
            {post.audience && <><dt className="text-ink-3">Audience</dt><dd>{post.audience}</dd></>}
            {post.purpose && <><dt className="text-ink-3">Purpose</dt><dd>{post.purpose}</dd></>}
          </dl>
        )}
        {post.text && <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{post.text}</p>}
        {post.work.map((w) => <MediaView key={w.id} a={w} />)}
        {post.question && (
          <p className="flex gap-2 rounded-lg bg-[#fbf3ee] px-3 py-2 text-[13.5px]"><Icon name="message" size={14} className="mt-0.5 text-[#c25a35]" /><span><span className="font-medium">Question: </span>{post.question}</span></p>
        )}
      </div>
      {(feedback.length > 0 || onFeedback) && (
        <div className="border-t border-line bg-[#fcfcfb] px-4 py-3">
          <div className="text-[12px] font-medium text-ink-3">{feedback.length ? `${feedback.length} feedback` : mine ? "No feedback yet" : ""}</div>
          <div className="mt-2 space-y-2.5">
            {feedback.map((f) => (
              <div key={f.id} className="flex gap-2.5 text-[13px]">
                <Avatar name={name(f.fromId)} size={20} />
                <div className="min-w-0 flex-1 space-y-0.5 leading-relaxed">
                  <div className="text-[12px] text-ink-3">{name(f.fromId)}{f.fromId === me ? " (you)" : ""} · {ago(f.createdAt)}{f.level ? ` · level ${f.level}` : ""}</div>
                  <p><span className="text-ink-3">Observed:</span> {f.observed}</p>
                  {f.effect && <p><span className="text-ink-3">Effect:</span> {f.effect}</p>}
                  <p><span className="text-ink-3">Try next:</span> {f.next}</p>
                </div>
              </div>
            ))}
          </div>
          {onFeedback && !mine && (
            open ? (
              <FeedbackForm skillName={skill} levels={course.levels} onSend={async (f) => {
                const ok = await onFeedback(f);
                if (ok) setOpen(false);
                return ok;
              }} />
            ) : (
              <button onClick={() => setOpen(true)} className="btn btn-ghost press mt-3"><Icon name="message" size={13} /> Give feedback</button>
            )
          )}
        </div>
      )}
    </article>
  );
}

/** Collab Studio: post your work to your group, then give structured feedback to at least two peers. */
export function Studio({
  courseId, studentId, module: m, course, lessonTitle, weekTitle, posts, feedback, progress, lessonWork, onChanged,
}: {
  courseId: string; studentId: string; module: Module; course: Course; lessonTitle: string; weekTitle: string;
  posts: StudioPost[]; feedback: Feedback[]; progress?: Progress; lessonWork: { from: string; a: Attachment }[]; onChanged: () => void;
}) {
  const me = course.students.find((s) => s.id === studentId)!;
  const group = course.groups?.find((g) => g.studentIds.includes(studentId));
  const mine = posts.find((p) => p.moduleId === m.id && p.studentId === studentId);
  // Peers you haven't replied to come first, so the next person to help is always at the top.
  const replied = (postId: string) => feedback.some((f) => f.postId === postId && f.fromId === studentId);
  const peers = posts
    .filter((p) => p.moduleId === m.id && p.studentId !== studentId)
    .sort((a, b) => Number(replied(a.id)) - Number(replied(b.id)) || a.createdAt - b.createdAt);
  const [editing, setEditing] = useState(!mine);
  const weekN = weekTitle.match(/Week (\d+)/)?.[1] ?? "";
  const [form, setForm] = useState({
    title: mine?.title ?? `${me.name} · Week ${weekN} · ${lessonTitle}`,
    audience: mine?.audience ?? "",
    purpose: mine?.purpose ?? "",
    skill: mine?.skill ?? m.skills?.[0] ?? course.skills?.[0]?.id ?? "",
    question: mine?.question ?? "",
    text: mine?.text ?? "",
  });
  const [picked, setPicked] = useState<string[]>(mine?.work.map((w) => w.url) ?? lessonWork.slice(-1).map((x) => x.a.url));
  const given = new Set(feedback.filter((f) => f.fromId === studentId && peers.some((p) => p.id === f.postId)).map((f) => f.postId)).size;
  const goal = Math.min(GOAL, Math.max((group?.studentIds.length ?? 1) - 1, 0));
  const done = progress?.status === "done";
  const options = [...lessonWork, ...(progress?.work ?? []).map((a) => ({ from: "This card", a }))].filter((x, i, arr) => arr.findIndex((y) => y.a.url === x.a.url) === i);

  if (!group) return <p className="rounded-xl border border-line bg-[#fafaf9] p-4 text-[13.5px] text-ink-2">You aren’t in a Collab Studio group yet. Your teacher will add you.</p>;

  async function post() {
    const work = options.filter((x) => picked.includes(x.a.url)).map((x) => x.a);
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "studioPost", studentId, moduleId: m.id, post: { ...form, work } });
    if (!r.ok) return toast(r.error ?? "Couldn’t post", { icon: "x", tone: "bad" });
    setEditing(false);
    onChanged();
    toast(mine ? "Updated your post" : `Posted to ${group!.name}`, { icon: "studio" });
  }

  const input = (k: keyof typeof form, label: string, placeholder = "") => (
    <label className="block">
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={placeholder} className="field mt-1" />
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
        <span className="flex -space-x-1.5">{group.studentIds.map((id) => <span key={id} className="rounded-full ring-2 ring-white"><Avatar name={course.students.find((s) => s.id === id)?.name ?? "?"} size={22} /></span>)}</span>
        <span className="text-[13.5px] font-medium">{group.name}</span>
        <span className="flex-1" />
        <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <StatusIcon status={mine ? "done" : "todo"} size={13} /> Posted
          <span className="mx-1 text-line-strong">·</span>
          <span className="flex gap-1">{Array.from({ length: goal }, (_, i) => <span key={i} className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${i < given ? "bg-ok" : "bg-line-strong"}`} />)}</span>
          Feedback given {Math.min(given, goal)}/{goal}
        </span>
        {done && <span className="chip h-6 bg-ok/10 text-ok"><Icon name="check" size={12} /> Done</span>}
      </div>

      <section>
        <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">Your post</h3>
        {editing ? (
          <div className="rise space-y-3 rounded-xl border border-line p-4">
            {input("title", "Title")}
            <div className="grid gap-3 sm:grid-cols-2">
              {input("audience", "Audience", "Who is this for?")}
              {input("purpose", "Purpose", "What should they do or think afterwards?")}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[12px] font-medium text-ink-2">Feedback on</span>
                <select value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })} className="field mt-1">
                  {course.skills?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              {input("question", "Your question for the group", "One specific question")}
            </div>
            <label className="block">
              <span className="text-[12px] font-medium text-ink-2">Notes (activities you chose, what changed since last time)</span>
              <textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} rows={2} className="field mt-1 resize-none" />
            </label>
            <div>
              <span className="text-[12px] font-medium text-ink-2">Attach your work</span>
              {options.length > 0 && (
                <div className="mt-1.5 space-y-1.5">
                  {options.map((x) => {
                    const on = picked.includes(x.a.url);
                    return (
                      <label key={x.a.url} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors ${on ? "border-ink" : "border-line hover:border-line-strong"}`}>
                        <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((u) => u !== x.a.url) : [...picked, x.a.url])} className="accent-[#1b1b1a]" />
                        <Icon name={x.a.kind} size={13} className="text-ink-3" />
                        <span className="flex-1 truncate">{x.a.name ?? x.a.url}</span>
                        <span className="mono truncate">{x.from}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="mt-2">
                <WorkComposer courseId={courseId} studentId={studentId} moduleId={m.id} work={[]} onChanged={onChanged} hint="Record here, or attach a take from this week’s cards above." />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={post} className="btn btn-dark press h-9 px-4"><Icon name="studio" size={13} /> {mine ? "Update post" : `Post to ${group.name}`}</button>
              {mine && <button onClick={() => setEditing(false)} className="btn btn-quiet press h-9">Cancel</button>}
            </div>
          </div>
        ) : (
          mine && (
            <div>
              <PostView post={mine} feedback={feedback.filter((f) => f.postId === mine.id)} course={course} mine me={studentId} />
              <button onClick={() => setEditing(true)} className="btn btn-quiet press mt-2"><Icon name="practice" size={13} /> Edit post</button>
            </div>
          )
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">Your group</h3>
        {peers.length === 0 ? (
          <div className="hatch flex h-24 items-center justify-center text-[13px] text-ink-3">No one in {group.name} has posted yet.</div>
        ) : (
          <div className="space-y-3">
            {peers.map((p) => (
              <PostView key={p.id} post={p} feedback={feedback.filter((f) => f.postId === p.id)} course={course} mine={false} me={studentId}
                onFeedback={async (f) => {
                  const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "feedback", studentId, postId: p.id, ...f });
                  if (!r.ok) {
                    toast(r.error ?? "Couldn’t send", { icon: "x", tone: "bad" });
                    return false;
                  }
                  onChanged();
                  toast(`Feedback sent to ${course.students.find((s) => s.id === p.studentId)?.name}`, { icon: "message" });
                  return true;
                }} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
