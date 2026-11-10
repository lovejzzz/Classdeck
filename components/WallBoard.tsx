"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { wallOf } from "@/lib/profile";
import { ago } from "@/lib/time";
import { toast } from "@/lib/toast";
import type { Attachment, Module, Post, Student } from "@/lib/types";
import { AttachMenu } from "./AttachMenu";
import { MediaView } from "./cards/Media";
import { Avatar, Icon } from "./Icon";

type Who = string; // a student id, or "teacher"

function Heart({ on }: { on: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" />
    </svg>
  );
}
function Up({ on }: { on: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4 13h5v8h6v-8h5z" />
    </svg>
  );
}

function PostCard({ post, me, teacher, module: m, students, courseId, onChanged, index }: {
  post: Post; me: Who; teacher: boolean; module: Module; students: Student[]; courseId: string; onChanged: () => void; index: number;
}) {
  const w = wallOf(m);
  const [local, setLocal] = useState<{ likes?: string[]; votes?: string[] }>({});
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const likes = local.likes ?? post.likes ?? [];
  const votes = local.votes ?? post.votes ?? [];
  const name = (id: string) => (id === "teacher" ? "Teacher" : students.find((s) => s.id === id)?.name ?? "Classmate");
  const author = post.studentId === "teacher" ? "Teacher" : post.mine ? "You" : post.studentId ? name(post.studentId) : "Anonymous";
  const comments = post.comments ?? [];
  const showLikes = w.reactions === "likes" || w.reactions === "both";
  const showVotes = w.reactions === "votes" || w.reactions === "both";
  const canComment = w.comments || teacher;

  async function react(kind: "like" | "vote") {
    const key = kind === "like" ? "likes" : "votes";
    const cur = key === "likes" ? likes : votes;
    setLocal((l) => ({ ...l, [key]: cur.includes(me) ? cur.filter((x) => x !== me) : [...cur, me] }));
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "react", who: me, kind, target: "post", id: post.id });
    if (!r.ok) toast(r.error ?? "Couldn’t react", { icon: "x", tone: "bad" });
    await onChanged();
    setLocal({});
  }

  async function comment() {
    if (!text.trim()) return;
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "comment", who: me, postId: post.id, text });
    if (!r.ok) return toast(r.error ?? "Couldn’t comment", { icon: "x", tone: "bad" });
    setText("");
    onChanged();
  }

  const moderate = async (patch: Record<string, unknown>, note: string) => {
    await op(courseId, { op: "moderatePost", postId: post.id, ...patch });
    onChanged();
    toast(note, { icon: "check", tone: "plain" });
  };

  return (
    <article className={`pop card mb-3 break-inside-avoid overflow-hidden ${post.approved === false ? "border-dashed border-warn/60" : ""} ${post.pinned ? "ring-1 ring-[#d39b1f]/60" : ""}`} style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
      <div className="px-4 pt-3.5">
        <div className="flex items-center gap-2 text-[12px] text-ink-3">
          {post.studentId && post.studentId !== "teacher" ? <Avatar name={author === "You" ? name(post.studentId) : author} size={20} /> : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lane"><Icon name={post.studentId === "teacher" ? "user" : "eye"} size={11} /></span>}
          <span className="font-medium text-ink-2">{author}</span>
          {teacher && post.anonymous && <span className="chip h-5 text-[10.5px]">anonymous to class</span>}
          <span className="mono">{ago(post.createdAt)}</span>
          <span className="flex-1" />
          {post.pinned && <span className="chip h-5 bg-[#fbf3dd] text-[10.5px] text-[#9a6b0c]">Pinned</span>}
          {post.approved === false && <span className="chip h-5 bg-warn/10 text-[10.5px] text-warn">Waiting for approval</span>}
        </div>
        {post.text && <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed">{post.text}</p>}
        {post.work?.map((a) => <div key={a.id} className="mt-2.5"><MediaView a={a} /></div>)}
      </div>
      <div className="mt-2 flex items-center gap-1 px-2.5 pb-2">
        {showVotes && (
          <button onClick={() => react("vote")} aria-pressed={votes.includes(me)} aria-label="Vote"
            className={`press flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] ${votes.includes(me) ? "bg-[#eef0fb] text-[#4b56a8]" : "text-ink-2 hover:bg-lane"}`}>
            <span key={votes.length} className="pop"><Up on={votes.includes(me)} /></span><span className="font-mono">{votes.length}</span>
          </button>
        )}
        {showLikes && (
          <button onClick={() => react("like")} aria-pressed={likes.includes(me)} aria-label="Like"
            className={`press flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] ${likes.includes(me) ? "text-[#d0453f]" : "text-ink-2 hover:bg-lane"}`}>
            <span key={likes.length} className="pop"><Heart on={likes.includes(me)} /></span><span className="font-mono">{likes.length}</span>
          </button>
        )}
        {(canComment || comments.length > 0) && (
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="press flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-ink-2 hover:bg-lane">
            <Icon name="message" size={14} /><span className="font-mono">{comments.length}</span>
          </button>
        )}
        <span className="flex-1" />
        {teacher && (
          <span className="flex items-center gap-0.5">
            {post.approved === false && <button onClick={() => moderate({ approved: true }, "Approved")} className="btn btn-dark press h-7 px-2.5 text-[12px]">Approve</button>}
            <button onClick={() => moderate({ pinned: !post.pinned }, post.pinned ? "Unpinned" : "Pinned to the top")} className="btn btn-quiet press h-7 px-2 text-[12px]">{post.pinned ? "Unpin" : "Pin"}</button>
            <button onClick={() => confirm("Delete this post for everyone?") && moderate({ remove: true }, "Post deleted")} aria-label="Delete post" className="btn btn-quiet press h-7 w-7 justify-center px-0 hover:!text-bad"><Icon name="trash" size={13} /></button>
          </span>
        )}
      </div>
      <div className={`fold ${open ? "fold-open" : ""}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2.5 border-t border-line bg-[#fcfcfb] px-4 py-3">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2 text-[13px]">
                <Avatar name={name(c.from)} size={18} />
                <p className="leading-relaxed"><span className="font-medium">{c.from === me ? "You" : name(c.from)}</span> <span className="text-ink-3">· {ago(c.at)}</span><br />{c.text}</p>
              </div>
            ))}
            {canComment && (
              <div className="flex gap-2">
                <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && comment()} placeholder="Add a comment…" aria-label="Comment" className="field h-8 py-0" />
                <button onClick={comment} disabled={!text.trim()} className="btn btn-dark press h-8">Send</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/** A shared wall: post with any media, react, comment, and (for teachers) moderate. */
export function WallBoard({ courseId, me, teacher = false, module: m, posts, students, onChanged, header }: {
  courseId: string; me: Who; teacher?: boolean; module: Module; posts: Post[]; students: Student[]; onChanged: () => void; header?: React.ReactNode;
}) {
  const w = wallOf(m);
  const [text, setText] = useState("");
  const [work, setWork] = useState<Omit<Attachment, "id">[]>([]);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<"new" | "top">(w.reactions === "votes" ? "top" : "new");
  const canPost = teacher || w.posting === "students";
  const score = (p: Post) => (p.votes?.length ?? 0) * 2 + (p.likes?.length ?? 0);
  const list = posts
    .filter((p) => p.moduleId === m.id)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (sort === "top" ? score(b) - score(a) : 0) || b.createdAt - a.createdAt);

  async function post() {
    if (!text.trim() && !work.length) return;
    setBusy(true);
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "addPost", studentId: me, moduleId: m.id, text, work });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "Couldn’t post", { icon: "x", tone: "bad" });
    setText("");
    setWork([]);
    onChanged();
    toast(w.approval && !teacher ? "Posted. Your teacher will approve it." : "Posted to the wall", { icon: "wall" });
  }

  return (
    <div>
      {header}
      {canPost ? (
        <div className="rounded-xl border border-line bg-white p-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={teacher ? "Post to the wall as the teacher…" : "Write something for the wall…"} aria-label="New post"
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && post()} className="w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-ink-3" />
          {work.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {work.map((a, i) => (
                <span key={i} className="pop chip h-7 pr-1"><Icon name={a.kind} size={12} />{a.name ?? a.kind}
                  <button onClick={() => setWork(work.filter((_, k) => k !== i))} aria-label="Remove attachment" className="press ml-0.5 rounded p-0.5 hover:bg-black/5"><Icon name="x" size={11} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
            <AttachMenu compact onAdd={(a) => setWork((x) => [...x, a].slice(0, 4))} />
            <span className="flex-1" />
            <button onClick={post} disabled={busy || (!text.trim() && !work.length)} className="btn btn-dark press h-8 px-4">{busy ? "Posting…" : "Post"}</button>
          </div>
          {(w.anonymous || w.approval) && !teacher && (
            <p className="mt-2 text-[12px] text-ink-3">
              {w.anonymous && "Your name is hidden from classmates; your teacher can see it. "}
              {w.approval && "Your teacher approves posts before classmates see them."}
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-[#fafaf9] px-4 py-3 text-[13px] text-ink-3">Only your teacher posts on this wall. You can still react{w.comments ? " and comment" : ""}.</p>
      )}

      <div className="mb-3 mt-5 flex items-center gap-2">
        <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">{list.length} post{list.length === 1 ? "" : "s"}</span>
        <span className="flex-1" />
        {w.reactions !== "none" && (
          <div className="inline-flex rounded-lg bg-lane p-0.5">
            {(["top", "new"] as const).map((k) => (
              <button key={k} onClick={() => setSort(k)} aria-pressed={sort === k}
                className={`press h-6 rounded-md px-2.5 text-[12px] ${sort === k ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2"}`}>{k === "top" ? "Top" : "Newest"}</button>
            ))}
          </div>
        )}
      </div>
      {list.length === 0 ? (
        <div className="hatch flex h-24 items-center justify-center text-[13px] text-ink-3">The wall is empty. Be the first to post.</div>
      ) : (
        <div className="columns-1 gap-3 sm:columns-2">
          {list.map((p, i) => <PostCard key={p.id} post={p} me={me} teacher={teacher} module={m} students={students} courseId={courseId} onChanged={onChanged} index={i} />)}
        </div>
      )}
    </div>
  );
}
