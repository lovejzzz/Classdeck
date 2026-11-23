"use client";

import { useEffect, useState } from "react";
import { op } from "@/lib/client";
import { wallOf } from "@/lib/profile";
import { wallProgress } from "@/lib/grading";
import { ago } from "@/lib/time";
import { toast } from "@/lib/toast";
import type { Attachment, Comment, Module, Post, Student } from "@/lib/types";
import { AttachMenu } from "./AttachMenu";
import { MediaView } from "./cards/Media";
import { Avatar, Icon } from "./Icon";
import { RichText } from "./RichText";
import { MentionPeople, RichBodyEditor } from "./teacher/RichBodyEditor";

type Who = string; // a student id, or "teacher"
type Draft = Omit<Attachment, "id"> & { id?: string };

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

/** The words a student selected in the card's prompt (marked data-prompt), to quote in a post or a reply. */
function usePromptSelection() {
  const [quote, setQuote] = useState("");
  useEffect(() => {
    const on = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const node = sel.getRangeAt(0).commonAncestorContainer;
      const el = node instanceof Element ? node : node.parentElement;
      if (!el?.closest("[data-prompt]")) return;
      const t = sel.toString().replace(/\s+/g, " ").trim();
      if (t.length >= 3) setQuote(t.slice(0, 400));
    };
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, []);
  return [quote, setQuote] as const;
}

/**
 * Write a post or a reply: the same text box as a card (formatting, lists, tables, math), and media (record audio,
 * video or the screen, a photo, upload, draw, a link). It can quote the words selected in the card's prompt.
 */
/** The three parts of structured feedback on a classmate's post, in order. */
const PARTS = [
  { key: "noticed", label: "What I noticed", hint: "Something specific in their work", required: true },
  { key: "effect", label: "The effect it had on me", hint: "How it landed for you (optional)", required: false },
  { key: "next", label: "One thing to try next", hint: "One concrete suggestion", required: true },
] as const;

function Composer({ placeholder, onSend, compact, topics, onCancel, autoFocusLabel, structured = false }: {
  /** Feedback on a classmate's post, in three parts (the discussion asks for structured feedback). */
  structured?: boolean;
  placeholder: string;
  onSend: (text: string, work: Draft[], topic?: string) => Promise<boolean>;
  compact?: boolean;
  topics?: string[];
  onCancel?: () => void;
  autoFocusLabel?: string;
}) {
  const [text, setText] = useState("");
  const [work, setWork] = useState<Draft[]>([]);
  const [topic, setTopic] = useState(topics?.[0]);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = usePromptSelection();
  const [parts, setParts] = useState<Record<string, string>>({});
  const empty = structured ? PARTS.some((x) => x.required && !parts[x.key]?.trim()) : !text.trim() && !work.length;
  async function send() {
    if (empty || busy) return;
    setBusy(true);
    // Structured feedback goes in as one reply, its parts as labelled paragraphs.
    const body = structured ? PARTS.filter((x) => parts[x.key]?.trim()).map((x) => `**${x.label}:** ${parts[x.key].trim()}`).join("\n\n") : text;
    const ok = await onSend(body, work, topic);
    setBusy(false);
    if (ok) { setText(""); setWork([]); setParts({}); }
  }
  return (
    <div className={compact ? "" : "rounded-xl border border-line bg-white p-2.5"}>
      {structured ? (
        <div className="space-y-2 rounded-xl border border-line bg-[#fafaf9] p-2.5">
          {PARTS.map((x, i) => (
            <label key={x.key} className="block">
              <span className="text-[12px] font-medium text-ink-2">{x.label}{x.required ? "" : <span className="font-normal text-ink-3"> (optional)</span>}</span>
              <textarea autoFocus={i === 0} value={parts[x.key] ?? ""} onChange={(e) => setParts((p) => ({ ...p, [x.key]: e.target.value }))} rows={2} placeholder={x.hint}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
                className="field mt-1 resize-y bg-white text-[13.5px] leading-relaxed" />
            </label>
          ))}
        </div>
      ) : (
        <RichBodyEditor value={text} onChange={setText} placeholder={placeholder} compact label={autoFocusLabel ?? "Write a post"} onSubmit={() => void send()} />
      )}
      {work.length > 0 && (
        <div className="mt-2 space-y-2">
          {work.map((a, i) => (
            <div key={i} className="rounded-xl border border-line bg-white p-2">
              <div className="mb-1.5 flex items-center gap-2 text-[12px] text-ink-3">
                <span className="min-w-0 flex-1 truncate">{a.name ?? a.kind}</span>
                <button onClick={() => setWork(work.filter((_, k) => k !== i))} aria-label="Remove this attachment" className="hover:text-bad"><Icon name="x" size={12} /></button>
              </div>
              <MediaView a={{ ...a, id: a.id ?? `w-${i}` } as Attachment} />
            </div>
          ))}
        </div>
      )}
      {topics && topics.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
          Topic
          {topics.map((x) => (
            <button key={x} onClick={() => setTopic(x)} aria-pressed={topic === x}
              className={`press h-6 rounded-full border px-2.5 pointer-coarse:h-9 ${topic === x ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-line-strong"}`}>#{x}</button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <AttachMenu compact onAdd={(a) => setWork((x) => [...x, a].slice(0, 6))} />
        {quote && (
          <button onClick={() => { setText((t) => `> ${quote}\n\n${t}`); setQuote(""); window.getSelection()?.removeAllRanges(); }} title={`Quote: “${quote}”`}
            className="btn btn-quiet press h-8 max-w-[14rem] px-2 text-[12px]"><Icon name="sparkles" size={12} /><span className="truncate">Quote “{quote}”</span></button>
        )}
        <span className="flex-1" />
        {onCancel && <button onClick={onCancel} className="btn btn-quiet press h-8 px-2.5 text-[12.5px]">Cancel</button>}
        <button onClick={() => void send()} disabled={busy || empty} className="btn btn-dark press h-8 px-4">{busy ? "Sending…" : compact ? "Reply" : "Post"}</button>
      </div>
    </div>
  );
}

/** Text and media of a post or a reply. */
function Body({ text, work, edited }: { text: string; work?: Attachment[]; edited?: number }) {
  return (
    <>
      {text && <RichText text={text} className="text-[14px] leading-relaxed text-[#2a2a28]" />}
      {edited && <span className="text-[11px] text-ink-3">(edited)</span>}
      {work?.map((a) => <div key={a.id} className="mt-2"><MediaView a={a} /></div>)}
    </>
  );
}

/** A reply, with the replies under it (a thread), as deep as it goes. */
function Reply({ c, all, depth, ctx }: { c: Comment; all: Comment[]; depth: number; ctx: ThreadCtx }) {
  const [replying, setReplying] = useState(false);
  const under = all.filter((x) => x.replyTo === c.id).sort((a, b) => a.at - b.at);
  const who = c.from === ctx.me ? "You" : ctx.name(c.from);
  return (
    <div className="relative">
      <div className="flex gap-2.5">
        <div className="flex flex-col items-center">
          <Avatar name={ctx.name(c.from)} size={26} />
          {(under.length > 0 || replying) && <span className="mt-1 w-px flex-1 bg-line" />}
        </div>
        <div className="min-w-0 flex-1 pb-3">
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            <span className="font-medium text-ink-2">{who}</span>
            {c.from === "teacher" && <span className="chip h-4 text-[10px]">Teacher</span>}
            <span className="mono">{ago(c.at)}</span>
            {c.helpful && <span className="chip h-5 gap-1 bg-ok/10 text-[10.5px] text-ok"><Icon name="check" size={10} />Helpful</span>}
          </div>
          <div className="mt-0.5"><Body text={c.text} work={c.work} /></div>
          <div className="mt-1 flex items-center gap-1">
            {/* The post's author marks feedback on their work helpful (or not). */}
            {ctx.structured && !c.replyTo && ctx.author === ctx.me && c.from !== ctx.me && (
              <button onClick={() => ctx.helpful(c)} aria-pressed={!!c.helpful} className={`press flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] hover:bg-lane ${c.helpful ? "text-ok" : "text-ink-3 hover:text-ink"}`}>
                <Icon name="check" size={12} />{c.helpful ? "Marked helpful" : "Helpful"}
              </button>
            )}
            {ctx.canReply && <button onClick={() => setReplying((r) => !r)} className="press flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] text-ink-3 hover:bg-lane hover:text-ink"><Icon name="message" size={12} /> Reply</button>}
            {(ctx.teacher || c.from === ctx.me) && (
              <button onClick={() => ctx.remove(c)} aria-label="Delete this reply" className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-lane hover:text-bad"><Icon name="trash" size={12} /></button>
            )}
          </div>
          {replying && (
            <div className="mt-1.5">
              <Composer compact placeholder={`Reply to ${who === "You" ? "yourself" : who}…`} autoFocusLabel="Write a reply" onCancel={() => setReplying(false)}
                onSend={async (text, work) => { const ok = await ctx.send(text, work, c.id); if (ok) setReplying(false); return ok; }} />
            </div>
          )}
        </div>
      </div>
      {under.length > 0 && (
        // Deep threads stop indenting after a few levels, so a long back-and-forth stays readable.
        <div className={depth < 3 ? "pl-[2.1rem]" : ""}>
          {under.map((x) => <Reply key={x.id} c={x} all={all} depth={depth + 1} ctx={ctx} />)}
        </div>
      )}
    </div>
  );
}

type ThreadCtx = { me: Who; teacher: boolean; canReply: boolean; name: (id: string) => string; send: (text: string, work: Draft[], replyTo?: string) => Promise<boolean>; remove: (c: Comment) => void;
  /** Structured feedback: the post's author can mark a reply to their post helpful. */
  structured: boolean; author?: string; helpful: (c: Comment) => void };

/** One post in the feed: who wrote it, its text and media, reactions, and its replies as threads. */
function PostCard({ post, me, teacher, readOnly = false, module: m, students, courseId, onChanged, index, groupName }: {
  post: Post; me: Who; teacher: boolean; readOnly?: boolean; module: Module; students: Student[]; courseId: string; onChanged: () => void; index: number; groupName?: (id: string) => string;
}) {
  const w = wallOf(m);
  const [local, setLocal] = useState<{ likes?: string[]; votes?: string[] }>({});
  const [replying, setReplying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const own = !teacher && (post.mine || post.studentId === me);
  const sections = w.sections?.filter((x) => x.trim()) ?? [];
  const likes = local.likes ?? post.likes ?? [];
  const votes = local.votes ?? post.votes ?? [];
  const name = (id: string) => (id === "teacher" ? "Teacher" : students.find((s) => s.id === id)?.name ?? "Classmate");
  const author = post.studentId === "teacher" ? "Teacher" : post.mine ? "You" : post.studentId ? name(post.studentId) : "Anonymous";
  const comments = post.comments ?? [];
  const top = comments.filter((c) => !c.replyTo || !comments.some((x) => x.id === c.replyTo)).sort((a, b) => a.at - b.at);
  const shown = showAll || top.length <= 3 ? top : top.slice(-2);
  const showLikes = w.reactions === "likes" || w.reactions === "both";
  const showVotes = w.reactions === "votes" || w.reactions === "both";
  const canComment = !readOnly && (w.comments || teacher);

  async function react(kind: "like" | "vote") {
    if (readOnly) return;
    const key = kind === "like" ? "likes" : "votes";
    const cur = key === "likes" ? likes : votes;
    setLocal((l) => ({ ...l, [key]: cur.includes(me) ? cur.filter((x) => x !== me) : [...cur, me] }));
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "react", who: me, kind, target: "post", id: post.id });
    if (!r.ok) toast(r.error ?? "Couldn’t react", { icon: "x", tone: "bad" });
    await onChanged();
    setLocal({});
  }
  const ctx: ThreadCtx = {
    me, teacher: teacher && !readOnly, canReply: canComment, name,
    structured: !!w.structured, author: post.studentId,
    async helpful(c) {
      const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "comment", who: me, postId: post.id, helpful: c.id });
      if (!r.ok) return toast(r.error ?? "Couldn’t mark it", { icon: "x", tone: "bad" });
      onChanged();
    },
    async send(text, work, replyTo) {
      const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "comment", who: me, postId: post.id, text, work, replyTo });
      if (!r.ok) { toast(r.error ?? "Couldn’t send your reply", { icon: "x", tone: "bad" }); return false; }
      setShowAll(true);
      onChanged();
      return true;
    },
    async remove(c) {
      if (!confirm(c.from === me ? "Delete your reply (and the replies to it)?" : "Delete this reply (and the replies to it) for everyone?")) return;
      const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "comment", who: teacher ? "teacher" : me, postId: post.id, remove: c.id });
      if (!r.ok) return toast(r.error ?? "Couldn’t delete the reply", { icon: "x", tone: "bad" });
      toast("Reply deleted", { icon: "trash", tone: "plain" });
      onChanged();
    },
  };
  const moderate = async (patch: Record<string, unknown>, note: string) => {
    await op(courseId, { op: "moderatePost", postId: post.id, ...patch });
    onChanged();
    toast(note, { icon: "check", tone: "plain" });
  };

  return (
    <article className={`pop border-b border-line px-4 py-4 last:border-b-0 ${post.approved === false ? "bg-warn/[0.04]" : ""} ${post.pinned ? "bg-[#fbf3dd]/50" : ""}`} style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
      <div className="flex gap-3">
        {post.studentId && post.studentId !== "teacher" ? <Avatar name={author === "You" ? name(post.studentId) : author} size={36} /> : <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-lane"><Icon name={post.studentId === "teacher" ? "user" : "eye"} size={15} /></span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-ink-3">
            <span className="font-semibold text-ink">{author}</span>
            {post.studentId === "teacher" && <span className="chip h-4 text-[10px]">Teacher</span>}
            {teacher && post.anonymous && <span className="chip h-5 text-[10.5px]">anonymous to class</span>}
            {teacher && post.groupId && groupName && <span className="chip h-5 bg-[#eef0fb] text-[10.5px] text-[#4b56a8]">{groupName(post.groupId)}</span>}
            <span className="mono">{ago(post.createdAt)}</span>
            {sections.length > 1 && post.section && <span className="text-[#4b56a8]">#{post.section}</span>}
            <span className="flex-1" />
            {post.pinned && <span className="chip h-5 bg-[#fbf3dd] text-[10.5px] text-[#8f630b]">Pinned</span>}
            {post.approved === false && <span className="chip h-5 bg-warn/10 text-[10.5px] text-warn">Waiting for approval</span>}
          </div>
          {editing !== null ? (
            <div className="mt-2">
              <RichBodyEditor value={editing} onChange={setEditing} compact label="Edit your post" />
              <div className="mt-1.5 flex gap-1.5">
                <button onClick={async () => {
                  const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "editPost", postId: post.id, studentId: me, text: editing });
                  if (!r.ok) return toast(r.error ?? "Couldn’t save", { icon: "x", tone: "bad" });
                  setEditing(null);
                  onChanged();
                }} className="btn btn-dark press h-7 px-3 text-[12px]">Save</button>
                <button onClick={() => setEditing(null)} className="btn btn-quiet press h-7 px-2 text-[12px]">Cancel</button>
              </div>
            </div>
          ) : <div className="mt-1"><Body text={post.text} work={post.work} edited={post.editedAt} /></div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {canComment && (
              <button onClick={() => setReplying((r) => !r)} aria-expanded={replying} className="press flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-ink-2 hover:bg-lane">
                <Icon name="message" size={14} /><span className="font-mono">{comments.length}</span>{!own && !teacher && <span className="font-medium">Reply</span>}
              </button>
            )}
            {showVotes && (
              <button onClick={() => react("vote")} aria-pressed={votes.includes(me)} aria-label="Vote"
                className={`press flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] ${votes.includes(me) ? "bg-[#eef0fb] text-[#4b56a8]" : "text-ink-2 hover:bg-lane"}`}>
                <span key={votes.length} className="pop"><Up on={votes.includes(me)} /></span><span className="font-mono">{votes.length}</span>
              </button>
            )}
            {showLikes && (
              <button onClick={() => react("like")} aria-pressed={likes.includes(me)} aria-label="Like"
                className={`press flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] ${likes.includes(me) ? "text-[#bf3f39]" : "text-ink-2 hover:bg-lane"}`}>
                <span key={likes.length} className="pop"><Heart on={likes.includes(me)} /></span><span className="font-mono">{likes.length}</span>
              </button>
            )}
            <span className="flex-1" />
            {own && editing === null && (
              <span className="flex items-center gap-0.5">
                <button onClick={() => setEditing(post.text)} className="btn btn-quiet press h-7 px-2 text-[12px]">Edit</button>
                <button onClick={async () => {
                  if (!confirm("Delete your post?")) return;
                  await op(courseId, { op: "editPost", postId: post.id, studentId: me, remove: true });
                  onChanged();
                  toast("Post deleted", { icon: "trash", tone: "plain" });
                }} aria-label="Delete your post" className="btn btn-quiet press h-7 w-7 justify-center px-0 hover:!text-bad"><Icon name="trash" size={13} /></button>
              </span>
            )}
            {teacher && !readOnly && (
              <span className="flex items-center gap-0.5">
                {sections.length > 1 && (
                  <select value={post.section ?? sections[0]} onChange={(e) => moderate({ section: e.target.value }, `Moved to #${e.target.value}`)} aria-label="Move to topic" className="h-7 max-w-28 rounded-md bg-transparent px-1 text-[12px] text-ink-2 outline-none hover:bg-lane">
                    {sections.map((x) => <option key={x} value={x}>#{x}</option>)}
                  </select>
                )}
                {post.approved === false && <button onClick={() => moderate({ approved: true }, "Approved")} className="btn btn-dark press h-7 px-2.5 text-[12px]">Approve</button>}
                <button onClick={() => moderate({ pinned: !post.pinned }, post.pinned ? "Unpinned" : "Pinned to the top")} className="btn btn-quiet press h-7 px-2 text-[12px]">{post.pinned ? "Unpin" : "Pin"}</button>
                <button onClick={() => confirm("Delete this post for everyone?") && moderate({ remove: true }, "Post deleted")} aria-label="Delete post" className="btn btn-quiet press h-7 w-7 justify-center px-0 hover:!text-bad"><Icon name="trash" size={13} /></button>
              </span>
            )}
          </div>
          {replying && (
            <div className="mt-2">
              <Composer compact structured={!!w.structured && !own && !teacher} placeholder={`Reply to ${author === "You" ? "your post" : author}…`} autoFocusLabel="Write a reply" onCancel={() => setReplying(false)}
                onSend={async (text, work) => { const ok = await ctx.send(text, work); if (ok) setReplying(false); return ok; }} />
            </div>
          )}
          {top.length > 0 && (
            <div className="mt-3">
              {shown.length < top.length && (
                <button onClick={() => setShowAll(true)} className="mb-2 text-[12.5px] font-medium text-[#4b56a8] hover:text-ink">Show {top.length - shown.length} earlier {top.length - shown.length === 1 ? "reply" : "replies"}</button>
              )}
              {shown.map((c) => <Reply key={c.id} c={c} all={comments} depth={0} ctx={ctx} />)}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * A discussion: a feed of posts, newest (or top) first, each with its replies as threads, like a forum. Posts and
 * replies are written like cards: formatted text, tables and math, recordings, pictures, files and links. Topics
 * (when the teacher set some) filter the feed.
 */
type WallProps = Parameters<typeof Feed>[0];

/** A discussion. Anyone in it can @mention classmates and the teacher in posts and replies. */
export function WallBoard(props: WallProps) {
  const people = [...props.students.map(({ id, name }) => ({ id, name })), { id: "teacher", name: "Teacher" }].filter((x) => x.id !== props.me && x.name);
  return <MentionPeople.Provider value={people}><Feed {...props} /></MentionPeople.Provider>;
}

function Feed({ courseId, me, teacher = false, readOnly = false, module: m, posts, students, onChanged, header, groupName }: {
  courseId: string; me: Who; teacher?: boolean; module: Module; posts: Post[]; students: Student[]; onChanged: () => void; header?: React.ReactNode;
  /** A co-teacher who can only view: they read the discussion (with what a teacher sees) but don't post, reply or moderate. */
  readOnly?: boolean;
  /** A discussion by groups: a group's name, shown to the teacher on each post. */
  groupName?: (id: string) => string;
}) {
  const w = wallOf(m);
  const [sort, setSort] = useState<"new" | "top">(w.reactions === "votes" ? "top" : "new");
  const topics = w.sections?.filter((x) => x.trim()) ?? [];
  const [filter, setFilter] = useState<string | null>(null);
  const canPost = !readOnly && (teacher || w.posting === "students");
  const score = (p: Post) => (p.votes?.length ?? 0) * 2 + (p.likes?.length ?? 0) + (p.comments?.length ?? 0) * 0.5;
  const all = posts.filter((p) => p.moduleId === m.id);
  const list = all
    .filter((p) => !filter || (p.section ?? topics[0]) === filter)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (sort === "top" ? score(b) - score(a) : 0) || b.createdAt - a.createdAt);

  async function post(text: string, work: Draft[], topic?: string) {
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "addPost", studentId: me, moduleId: m.id, text, work, section: topic });
    if (!r.ok) { toast(r.error ?? "Couldn’t post", { icon: "x", tone: "bad" }); return false; }
    onChanged();
    toast(w.approval && !teacher ? "Posted. Your teacher will approve it." : "Posted", { icon: "wall" });
    return true;
  }

  const needed = w.replies ?? 0;
  const prog = !teacher && needed > 0 ? wallProgress(posts, m.id, me, needed) : null;

  return (
    <div>
      {header}
      {/* Peer review: what's left before this card is done. */}
      {prog && (
        <div className={`mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-3.5 py-2.5 text-[13px] ${prog.done ? "border-ok/35 bg-ok/[0.05]" : "border-line bg-white"}`}>
          <span className={`flex items-center gap-1.5 ${prog.posted ? "text-ok" : "text-ink-2"}`}><Icon name={prog.posted ? "check" : "wall"} size={13} />{prog.posted ? "You posted" : "Post once"}</span>
          <span className={`flex items-center gap-1.5 ${prog.replied >= needed ? "text-ok" : "text-ink-2"}`}><Icon name={prog.replied >= needed ? "check" : "message"} size={13} />Replied to {Math.min(prog.replied, needed)} of {needed} classmate{needed === 1 ? "" : "s"}</span>
          {prog.done ? <span className="font-medium text-ok">Done</span> : <span className="text-ink-3">Reply to a classmate’s post with words, a video or a voice note.</span>}
        </div>
      )}
      {canPost ? (
        <Composer placeholder={teacher ? "Post to the discussion as the teacher…" : "Share something with the class…"} topics={topics} onSend={post} />
      ) : (
        <p className="rounded-xl border border-line bg-[#fafaf9] px-4 py-3 text-[13px] text-ink-3">{readOnly ? "You can view this discussion; posting, replying and approving are for the course’s editors." : `Only your teacher starts posts here. You can still react${w.comments ? " and reply" : ""}.`}</p>
      )}
      {(w.anonymous || w.approval) && !teacher && canPost && (
        <p className="mt-1.5 text-[12px] text-ink-3">
          {w.anonymous && "Your name is hidden from classmates; your teacher can see it. "}
          {w.approval && "Your teacher approves posts before classmates see them."}
        </p>
      )}
      {!teacher && canPost && <p className="mt-1.5 text-[11.5px] text-ink-3">Tip: select words in the card above to quote them.</p>}

      <div className="mb-1 mt-5 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">{all.length} post{all.length === 1 ? "" : "s"}</span>
        {topics.length > 1 && (
          <span className="flex flex-wrap gap-1">
            <button onClick={() => setFilter(null)} aria-pressed={!filter} className={`press h-6 rounded-full px-2.5 text-[12px] ${!filter ? "bg-ink text-white" : "bg-lane text-ink-2 hover:text-ink"}`}>All</button>
            {topics.map((t) => (
              <button key={t} onClick={() => setFilter(filter === t ? null : t)} aria-pressed={filter === t}
                className={`press h-6 rounded-full px-2.5 text-[12px] ${filter === t ? "bg-ink text-white" : "bg-lane text-ink-2 hover:text-ink"}`}>#{t}</button>
            ))}
          </span>
        )}
        <span className="flex-1" />
        <div className="inline-flex rounded-lg bg-lane p-0.5">
          {(["new", "top"] as const).map((k) => (
            <button key={k} onClick={() => setSort(k)} aria-pressed={sort === k}
              className={`press h-6 rounded-md px-2.5 text-[12px] pointer-coarse:h-9 pointer-coarse:text-[13px] ${sort === k ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"}`}>{k === "new" ? "Newest" : "Top"}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="hatch flex h-24 items-center justify-center text-[13px] text-ink-3">{filter ? `Nothing in #${filter} yet.` : "No posts yet. Be the first."}</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          {list.map((p, i) => <PostCard key={p.id} post={p} me={me} teacher={teacher} readOnly={readOnly} module={m} students={students} courseId={courseId} onChanged={onChanged} index={i} groupName={groupName} />)}
        </div>
      )}
    </div>
  );
}
