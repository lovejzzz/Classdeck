"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CARD_SIZE, formatSize, heroOf, hostOf } from "@/lib/cards";
import { LookPanel, LookTrigger } from "./CardLookMenu";
import { audienceStudents, groupByRef, groupsOf, studentsOf, uid } from "@/lib/profile";
import { fmtTime, parseTime, videoEmbed } from "@/lib/media";
import { DueCalendar } from "./DueCalendar";
import { useShortcuts } from "@/lib/shortcuts";
import { toast } from "@/lib/toast";
import { ask } from "../Confirm";
import { Clearable } from "../Clearable";
import { clearOlder, olderSettings } from "@/lib/cardmodel";
import { MathPreview } from "../MathText";
import { RichBodyEditor } from "./RichBodyEditor";
import { ANSWER_FORMS, FAMILIES, addNextQuestion, addToGroup, kindMeta, asKind, faceMeta, familyOf, isPoll, kindOf, newCard, type CardKind } from "@/lib/kinds";
import type { Attachment, Course, Lesson, Module, Question, Skill, Student } from "@/lib/types";
import { GroupingPicker, SignupGroups } from "./Groupings";
import { parentOf, SCORE, scoreCount, sharedOnly, targetsOf, triesFor, wiresOf } from "@/lib/branching";
import { CardFace } from "../cards/CardFace";
import { AudioPlayer } from "../cards/Media";
import { MediaLift } from "../cards/MediaLift";
import { ImageEditor } from "../ImageEditor";
import { uploadFile } from "@/lib/client";
import { playableArt } from "../cards/PlayArt";
import { Avatar, Icon } from "../Icon";
import { AttachMenu } from "../AttachMenu";
import { GroupHand } from "./GroupHand";
import { KindPick, copyOfSaved } from "./KindPick";
import { useLibrary } from "./NewCardFan";
import { groupingsOf, signupGroupingId } from "@/lib/shared";

/** A card preview that tilts toward the pointer, so teachers see exactly what students will hold. */
function TiltPreview({ m, onLook }: { m: Module; onLook?: (look: Module["look"]) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = CARD_SIZE.deck;
  // A card whose video or recording plays here holds still, so its controls are easy to hit.
  const still = playableArt(heroOf(m));
  const [menu, setMenu] = useState(false);
  return (
    <div
      className="group/look relative z-10 mx-auto [perspective:900px]"
      style={{ width: w, height: h }}
      onPointerMove={(e) => {
        if (still) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        if (ref.current) ref.current.style.transform = `rotateX(${-y * 18}deg) rotateY(${x * 18}deg) translateY(-6px) scale(1.03)`;
      }}
      onPointerLeave={() => {
        if (ref.current) ref.current.style.transform = "";
      }}
    >
      <div ref={ref} className="relative h-full w-full rounded-[14px] shadow-[0_18px_36px_-16px_rgba(20,20,18,0.35)] transition-transform duration-300 ease-[var(--ease-spring)]">
        <CardFace m={m} index={0} playable />
        {/* The ⋮ is on the card, so it tilts with it. */}
        {onLook && <LookTrigger open={menu} onToggle={() => setMenu((v) => !v)} />}
      </div>
      {onLook && menu && <LookPanel m={m} onLook={onLook} onClose={() => setMenu(false)} />}
    </div>
  );
}

/** Who fills in a worksheet. */
const FILLERS = [["each", "Each student"], ["group", "Each group"], ["class", "Whole class"]] as const;

/** The cards an answer deals, as chips: the first by name, any more as “+N” (each opens its card). */
function Dealt({ ids, titleOf, onGo, onTree }: { ids: string[]; titleOf: (id: string) => string; onGo?: (id: string) => void; onTree?: () => void }) {
  if (!ids.length) return null;
  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); if (onGo) onGo(id); else onTree?.(); };
  return (
    <>
      <button type="button" onClick={go(ids[0])} title={ids.length > 1 ? `Students who pick this get ${ids.map((x) => `“${titleOf(x)}”`).join(" and ")}. Click to open the first.` : "Students who pick this get this card. Click to open it."} className="chip h-6 max-w-[40%] flex-none gap-1 truncate bg-[#eef0fb] px-2 text-[11px] text-[#4b56a8]">
        <Icon name="split" size={11} /> <span className="truncate">{titleOf(ids[0])}</span>
      </button>
      {ids.length > 1 && (
        <button type="button" onClick={go(ids[1])} title={ids.slice(1).map((x) => titleOf(x)).join(", ")} className="chip h-6 flex-none bg-[#eef0fb] px-1.5 text-[11px] text-[#4b56a8]">+{ids.length - 1}</button>
      )}
    </>
  );
}

/** A compact segmented control. */
function Seg({ value, options, onPick }: { value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <div className="inline-flex w-fit rounded-lg bg-lane p-0.5">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onPick(v)} aria-pressed={value === v}
          className={`press h-7 rounded-md px-2.5 text-[12.5px] ${value === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"}`}>{label}</button>
      ))}
    </div>
  );
}

export function CardEditor({
  lesson, module: m, students, open, onChange, onClose, onDelete, onDeleteCard, onDuplicate, onSaveToLibrary, onPrev, onNext, position, started = 0, onTree, onOpen, allCards, neighbors, undoBar, onGo, back, course, onCourseChanged,
}: {
  /** Delete another card (one in this group's hand): asks first, and offers Undo. */
  onDeleteCard?: (id: string) => void;
  /** The course, for the groups a card can use (Each group); and refreshing it after groups change. */
  course?: Course;
  onCourseChanged?: () => unknown;
  /** Shown at the top of the panel: where this card sits in the course's card tree. */
  neighbors?: React.ReactNode;
  /** The course's undo, redo and history, shown in the editor's top bar (they cover the card's changes too). */
  undoBar?: React.ReactNode;
  /** Open another card (in any lesson): the card an answer deals. */
  onGo?: (id: string) => void;
  /** Came here from an answer on another card: a way back to it. */
  back?: { title: string; note: string; go: () => void };
  /** Every card in the course (a card tree can deal cards in later lessons). */
  allCards?: Module[];
  /** Open the lesson's card tree (to wire answers to follow-up cards). */
  onTree?: () => void;
  /** Switch the editor to another card in this lesson (one just added). */
  onOpen?: (id: string) => void;
  onDuplicate: () => void;
  /** Keep a copy among the teacher's saved cards, to reuse in any course. */
  onSaveToLibrary?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: { index: number; total: number; lesson: string };
  skills?: Skill[];
  /** How many students have already worked on this card (changing what comes back doesn't move their work). */
  started?: number;
  lesson: Lesson;
  module: Module;
  students: Student[];
  open: boolean;
  onChange: (lesson: Lesson) => void;
  onClose: () => void;
  onDelete: () => void;
}) {

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useShortcuts([
    { keys: "mod+d", label: "Duplicate card", run: onDuplicate, enabled: open },
    { keys: "[", label: "Previous card", run: () => onPrev?.(), enabled: open && !!onPrev },
    { keys: "]", label: "Next card", run: () => onNext?.(), enabled: open && !!onNext },
  ]);
  const lessonRef = useRef(lesson);
  useEffect(() => { lessonRef.current = lesson; });
  /** Put a version of this card in place, in the latest copy of its lesson. */
  const put = (next: Module) => onChange({ ...lessonRef.current, modules: lessonRef.current.modules.map((x) => (x.id === next.id ? next : x)) });

  // Changes go through the course's own undo and history (in the bar above the map), like every other edit.
  const set = (patch: Partial<Module>) => put({ ...m, ...patch });
  const attachments = m.attachments ?? [];
  // A card group: which of its cards is picked in the hand (and edited under it).
  const [handSel, setHandSel] = useState<string | null>(null);
  // The group's "Add a card" picker is open under its hand.
  const [adding, setAdding] = useState(false);
  const saved = useLibrary(adding);
  // An attachment opened to check it: a video or picture grown big, or a recording playing under its row.
  const [viewing, setViewing] = useState<{ a: Attachment; from: DOMRect; open: boolean } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  // A picture being edited (crop, text, drawing on it); saving uploads the result in its place.
  const [editing, setEditing] = useState<Attachment | null>(null);
  async function saveEdited(x: Attachment, f: File) {
    setEditing(null);
    const r = await uploadFile(f);
    if (!r.ok) return toast(r.error, { icon: "x", tone: "bad" });
    set({ attachments: (lessonRef.current.modules.find((c) => c.id === m.id)?.attachments ?? attachments).map((y) => (y.id === x.id ? { ...y, url: r.url, size: r.size } : y)) });
    toast(`Saved ${x.name || "the picture"}`, { icon: "image" });
  }
  const playNow = useCallback((el: HTMLMediaElement | null) => { el?.play().catch(() => {}); }, []);
  const openAttachment = (x: Attachment, el: HTMLElement) => {
    if (x.kind === "audio") return setPlaying((p) => (p === x.id ? null : x.id));
    if (x.kind === "image" || x.kind === "video" || (x.kind === "link" && videoEmbed(x.url))) return setViewing({ a: x, from: el.getBoundingClientRect(), open: true });
    window.open(x.url, "_blank", "noopener");
  };
  const addAttachment = (a: Omit<Attachment, "id">) => set({ attachments: [...attachments, { ...a, id: uid("a-") }] });
  const a = m.audience;
  const chosen = studentsOf(a);
  const chosenGroups = groupsOf(a).filter((ref) => !course || groupByRef(course, ref));
  /** Some students: pick or unpick a student (by id) or a group (by "groupingId~groupId"). */
  const pickSome = (ids: string[], groups: string[]) => set({ audience: { kind: "student", studentId: ids[0] ?? "", studentIds: ids, groups: groups.length ? groups : undefined } });
  // The groups a card can go to: every grouping's groups that have someone in them.
  const pickableGroups = course ? groupingsOf(course).flatMap((gs) => gs.groups.filter((g) => g.studentIds.length).map((g) => ({ ref: `${gs.id}~${g.id}`, name: g.name, of: gs.name, n: g.studentIds.length }))) : [];
  const someLabel = (() => {
    const names = [...chosenGroups.map((ref) => groupByRef(course!, ref)!.group.name), ...chosen.map((id) => students.find((s) => s.id === id)?.name ?? "a student")];
    if (names.length <= 2) return names.join(" and ");
    return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  })();
  const reachIds = course ? audienceStudents(course, a).filter((id) => students.some((s) => s.id === id)) : chosen;
  const reach = reachIds.length;
  // Who a card for some groups reaches today, listed when asked (folded by default).
  const [showReach, setShowReach] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const kind = kindOf(m);
  const older = olderSettings(m);
  // The answers (or score ranges) that deal this card, or the card group it's in: who gets it is set on the map.
  const everyCard = allCards ?? lesson.modules;
  const inGroup = everyCard.find((g) => g.type === "group" && g.members?.includes(m.id))?.id;
  const dealtBy = wiresOf(everyCard).filter((w) => w.to === m.id || (!!inGroup && w.to === inGroup)).map((w) => {
    const from = everyCard.find((c) => c.id === w.from);
    const title = `“${from?.title || "Untitled card"}”`;
    if (w.q === SCORE) return { from: w.from, label: `a score of ${w.score ? `${w.score.min}–${Math.min(100, w.score.max - 1)}%` : "a range"} on ${title}` };
    return { from: w.from, label: `answer ${String.fromCharCode(65 + w.option)} on ${title}` };
  });

  /** Turn the card into another kind or answer form. Its words and media stay; what only the old one used goes. */
  async function toKind(k: CardKind) {
    if (k === kind) return;
    const losing = (m.questions ?? []).filter((q) => q.text.trim() || q.options.some((o) => o.trim()));
    const deals = losing.reduce((n, q) => n + q.options.reduce((k, _, i) => k + targetsOf(q, i).length, 0), 0);
    const parts: string[] = [];
    if (k !== "choice" && losing.length) parts.push(`Its question and choices go${deals ? `, and the ${deals === 1 ? "card an answer deals goes" : `${deals} cards its answers deal go`} to everyone` : ""}.`);
    if (started > 0) parts.push(`${started === 1 ? "1 student has" : `${started} students have`} already worked on this card. What they handed in stays where it is and won’t move.`);
    if (parts.length && !(await ask({ title: familyOf(k) === familyOf(kind) ? `Answer with ${kindMeta(k).name.toLowerCase()} instead?` : `Make it a ${FAMILIES.find((f) => f.id === familyOf(k))!.name} card?`, body: parts.join(" "), confirm: "Change it" }))) return;
    set(asKind(m, k));
  }
  const family = familyOf(kind);
  const other = FAMILIES.find((f) => f.id !== family)!;

  // Rendered into <body> so no animated ancestor can become its positioning box.
  return createPortal(
    <aside
      className={`fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-[30rem] flex-col border-l border-line bg-white shadow-[-24px_0_60px_-30px_rgba(20,20,18,0.35)] transition-transform duration-500 ease-[var(--ease-out)] ${open ? "translate-x-0" : "translate-x-[105%]"}`}
      aria-label="Edit card"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="flex h-14 flex-none items-center gap-1 border-b border-line pl-4 pr-2.5">
        <div className="flex items-center rounded-lg bg-lane p-0.5">
          <button onClick={onPrev} disabled={!onPrev} aria-label="Previous card ([)" title="Previous card ([)" className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-white disabled:opacity-30"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
          <button onClick={onNext} disabled={!onNext} aria-label="Next card (])" title="Next card (])" className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-white disabled:opacity-30"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>
        </div>
        {/* Which card this is, short ("4/9"): the header also holds undo, Duplicate, Collect and Delete. */}
        <span className="mono flex-none px-1 text-[12px] text-ink-2" title={position ? `Card ${position.index + 1} of ${position.total} · ${position.lesson}` : undefined}>{position ? `${position.index + 1}/${position.total}` : ""}</span>
        <span className="min-w-0 flex-1" />
        {undoBar && <span className="flex items-center">{undoBar}</span>}
        <button onClick={onDuplicate} className="btn btn-quiet press h-8 gap-1 px-1.5"><Icon name="layers" size={13} /> Duplicate</button>
        {/* Collect: a copy kept in My cards, to reuse in any course. */}
        {onSaveToLibrary && <button onClick={onSaveToLibrary} className="btn btn-quiet press h-8 gap-1 px-1.5" title="Keep a copy in My cards, to reuse in any of your courses"><Icon name="star" size={13} /> Collect</button>}
        <button onClick={onDelete} className="btn btn-quiet press h-8 gap-1 px-1.5 hover:!text-bad"><Icon name="trash" size={13} /> Delete</button>
        <button onClick={onClose} aria-label="Close editor" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f7f7f5]">
        {back && (
          <div className="px-4 pt-3">
            <button onClick={back.go} className="press flex w-full min-w-0 items-center gap-2 rounded-xl bg-[#eef0fb] px-3 py-2 text-left text-[12.5px] text-[#4b56a8] hover:bg-[#e3e6f8]">
              <Icon name="arrow" size={12} className="flex-none rotate-180" />
              <span className="min-w-0 flex-1 truncate">Back to <b className="font-semibold">{back.title}</b><span className="text-[#4b56a8]/70"> · {back.note}</span></span>
            </button>
          </div>
        )}
        {neighbors && <div key={m.id} className="rise px-4 pt-4">{neighbors}</div>}
        {/* The card on the table. */}
        <div className="relative px-5 pb-4 pt-6">
          <TiltPreview m={m} onLook={(look) => set({ look })} />
          {kind !== "group" && (
            <button onClick={() => toKind(other.start)} title={`Make it a ${other.name} card`} aria-label={`Make it a ${other.name} card`}
              className="press absolute right-5 top-1/2 flex w-[4.5rem] -translate-y-1/2 flex-col items-center gap-1.5 text-[11.5px] leading-tight text-ink-2 hover:text-ink">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white shadow-sm"><Icon name="swap" size={16} /></span>
              {other.name}
            </button>
          )}
        </div>

        <div className="space-y-2.5 px-4 pb-8">
          <Panel n={1} title="Content">
            <Clearable><input value={m.title} onChange={(e) => set({ title: e.target.value })} placeholder="Title" aria-label="Title" className="field text-[14px] font-medium" /></Clearable>
            <div className="mt-2"><RichBodyEditor key={m.id} value={m.body} onChange={(body) => set({ body })} placeholder={kind === "worksheet" ? "The worksheet students fill in: headings, prompts, a table with empty cells…" : "What students should read, watch or do"} /></div>
            <MathPreview text={m.body} />
            <div className="mt-3">
          {attachments.length > 0 && <div className="mb-1.5 px-0.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-3">Attachments</div>}
          <div className="space-y-1.5">
            {attachments.map((x, i) => {
              const timed = x.kind === "video" || (x.kind === "link" && !!videoEmbed(x.url));
              return (
                <div key={x.id} className="pop rounded-lg border border-line px-2.5 py-2" style={{ "--i": i } as React.CSSProperties}>
                  <div className="flex items-center gap-2.5">
                    <button type="button" onClick={(e) => openAttachment(x, e.currentTarget)}
                      aria-label={x.kind === "audio" ? `${playing === x.id ? "Hide" : "Play"} ${x.name || "the recording"}` : x.kind === "image" ? `Open ${x.name || "the picture"} big` : x.kind === "video" || videoEmbed(x.url) ? `Play ${x.name || "the video"}` : `Open ${x.name || x.url}`}
                      title={x.kind === "audio" ? "Listen" : x.kind === "image" ? "Open big" : x.kind === "video" || videoEmbed(x.url) ? "Play" : "Open"}
                      className="press group relative flex h-11 w-14 flex-none items-center justify-center overflow-hidden rounded-md bg-lane text-ink-2 ring-[#4b56a8]/40 hover:ring-2">
                      {x.kind === "image"
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={x.url} alt="" className="h-full w-full object-cover" />
                        : x.kind === "video" ? <video src={`${x.url}#t=1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                        : <Icon name={x.kind === "audio" && playing === x.id ? "pause" : x.kind} size={14} />}
                      {(x.kind === "video" || x.kind === "audio" || (x.kind === "link" && !!videoEmbed(x.url))) && playing !== x.id && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-90 group-hover:bg-black/20">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/95 shadow-sm"><Icon name="play" size={9} className="translate-x-[0.5px] text-ink" /></span>
                        </span>
                      )}
                    </button>
                    <span className="min-w-0 flex-1">
                      <Clearable><input key={`${x.id}:${x.name ?? ""}`} defaultValue={x.name ?? ""} placeholder={x.kind === "link" ? hostOf(x.url) : "Label"} aria-label="Label"
                        onBlur={(e) => e.target.value !== (x.name ?? "") && set({ attachments: attachments.map((y) => (y.id === x.id ? { ...y, name: e.target.value || undefined } : y)) })}
                        className="block w-full truncate rounded border border-transparent bg-transparent px-1 text-[13px] hover:border-line focus:border-line-strong focus:bg-white focus:outline-none" /></Clearable>
                      <span className="mono block truncate px-1 text-[11px]">{x.kind}{x.size ? ` · ${formatSize(x.size)}` : ""}{i === 0 ? " · cover" : ""}</span>
                    </span>
                    {x.kind === "image" && (
                      <button onClick={() => setEditing(x)} className="btn btn-quiet press h-7 px-2 text-[11.5px]" title="Crop it, add text, or draw on it"><Icon name="practice" size={11} /> Edit</button>
                    )}
                    {i > 0 && (
                      <button onClick={() => set({ attachments: [x, ...attachments.filter((y) => y.id !== x.id)] })} className="btn btn-quiet press h-7 px-2 text-[11.5px]" title="Use as the card's artwork">Make cover</button>
                    )}
                    <button onClick={() => set({ attachments: attachments.filter((y) => y.id !== x.id) })} aria-label={`Remove ${x.name ?? x.kind}`} className="btn btn-quiet press h-7 w-7 justify-center px-0"><Icon name="x" size={13} /></button>
                  </div>
                  {x.kind === "audio" && playing === x.id && <div className="mt-2"><AudioPlayer a={x} onMedia={playNow} /></div>}
                  {timed && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-9 text-[12px] text-ink-2">
                      Watch from
                      <input defaultValue={fmtTime(x.start)} placeholder="0:00" aria-label="Start time" className="field h-7 w-16 px-2 py-0 font-mono text-[12px]"
                        onBlur={(e) => set({ attachments: attachments.map((y) => (y.id === x.id ? { ...y, start: parseTime(e.target.value) } : y)) })} />
                      to
                      <input defaultValue={fmtTime(x.end)} placeholder="end" aria-label="End time" className="field h-7 w-16 px-2 py-0 font-mono text-[12px]"
                        onBlur={(e) => set({ attachments: attachments.map((y) => (y.id === x.id ? { ...y, end: parseTime(e.target.value) } : y)) })} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2">
            <AttachMenu compact teacher onAdd={(a) => { addAttachment(a); toast(`Added ${a.name ?? a.kind}`, { icon: "upload" }); }} />
          </div>
            </div>
          </Panel>

          {kind === "content" ? null : kind === "group" ? (
          <Panel n={2} title="Cards in this group">
            {(() => {
              // The group's cards as a fanned hand; the picked one is edited right here.
              const members = (m.members ?? []).map((id) => lesson.modules.find((x) => x.id === id)).filter((x): x is Module => !!x);
              const cur = members.find((c) => c.id === handSel) ?? members[0];
              const i = cur ? members.indexOf(cur) : -1;
              const putMember = (id: string, patch: Partial<Module>) => onChange({ ...lessonRef.current, modules: lessonRef.current.modules.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
              // A new card at the end of the group: a blank one of a kind, or a copy of a saved card (as + Card on the map).
              const put = (card: Module) => {
                const { lesson: next } = addToGroup(lessonRef.current, m.id, card);
                onChange(next); setHandSel(card.id); setAdding(false);
                toast(`Added “${card.title || "a card"}” to the group`, { icon: "plus" });
              };
              return (
                <>
                  <GroupHand cards={members} selected={adding ? null : cur?.id ?? null} onSelect={(id) => { setAdding(false); setHandSel(id); }} adding={adding}
                    onAdd={() => setAdding((a) => !a)}
                    onReorder={(ids) => set({ members: ids })}
                    onDelete={onDeleteCard} />
                  {adding ? (
                    <div ref={(el) => { el?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }} className="hand-edit mt-1 rounded-xl border border-line bg-[#fbfbfa] p-3">
                      <p className="mb-2.5 text-[12.5px] text-ink-2">Add a card to the group:</p>
                      <KindPick saved={saved.filter((x) => !x.set)} onSaved={(sc) => put(copyOfSaved(sc))}
                        onKind={(t) => put(newCard(t, `New ${FAMILIES.find((f) => f.start === t)?.name ?? ""} card`))} />
                    </div>
                  ) : cur && (
                    <div key={cur.id} className="hand-edit mt-1 rounded-xl border border-line bg-[#fbfbfa] p-3">
                      <input value={cur.title} onChange={(e) => putMember(cur.id, { title: e.target.value })} placeholder="Title" aria-label={`Title of card ${i + 1}`} className="field font-semibold" />
                      {kindOf(cur) === "choice" && !isPoll(cur) ? (
                        <div className="mt-2.5">
                          <QuestionsEditor single questions={cur.questions ?? []} cards={allCards ?? lesson.modules} onTree={onTree} onGo={onGo}
                            onChange={(questions) => putMember(cur.id, { questions: questions.length ? questions : undefined })} />
                        </div>
                      ) : (
                        <p className="mt-2 text-[12.5px] text-ink-3">A {faceMeta(cur).name.toLowerCase()} card: open it to change what’s on it.</p>
                      )}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1 text-[12.5px]">
                        {onOpen && <button onClick={() => onOpen(cur.id)} className="mr-auto text-[#4b56a8] hover:underline">Edit this card</button>}
                        <button onClick={() => { set({ members: members.map((c) => c.id).filter((x) => x !== cur.id) }); setHandSel(null); }} className="btn btn-quiet press h-7 px-2 text-[12px] hover:!text-bad">Take out of the group</button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
            <p className="mt-2.5 text-[12px] text-ink-3">
              Students see these cards together. The group’s score counts its questions with a right answer (first answers); once they’re all answered, it can deal a card by score: set the ranges on the map. A group of fewer than two cards comes apart.
            </p>
            {scoreCount(m, lesson.modules) > 0 && (parentOf(lesson.modules).has(m.id) ? (
              <p className="mt-2 text-[12px] text-ink-3">Tries are set on the group this one is in.</p>
            ) : (
              <div className="mt-3 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink-2">Tries</span>
                  <Seg value={String(triesFor(m))} options={[["1", "One"], ["2", "2"], ["3", "3"]]} onPick={(v) => set({ attempts: v === "1" ? undefined : Number(v) })} />
                </div>
                <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
                  {triesFor(m) > 1
                    ? `Students answer each question once a try. After a try they can start the group again, up to ${triesFor(m)} tries; their best try counts, and its score deals cards (cards an earlier try dealt stay). The answers to questions they missed show after their last try.`
                    : "Students answer each question until they get it right; their first answers make the score."}
                </p>
              </div>
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
              {onTree && <button onClick={onTree} className="btn btn-ghost press h-8 px-3 text-[12.5px] text-[#4b56a8]"><Icon name="split" size={12} /> Branch by score on the map</button>}
              {/* Ungroup: the cards stay; in a group inside another, they stay in that outer group, in its place. */}
              <button onClick={() => { onChange({ ...lessonRef.current, modules: lessonRef.current.modules.filter((x) => x.id !== m.id).map((x) => (x.type === "group" && x.members?.includes(m.id) ? { ...x, members: x.members.flatMap((id) => (id === m.id ? m.members ?? [] : [id])) } : x)) }); onClose(); }} className="btn btn-ghost press h-8 px-3 text-[12.5px]">Ungroup (keep the cards)</button>
            </div>
          </Panel>
          ) : (
          <Panel n={2} title="How students answer">
            <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="How students answer">
              {ANSWER_FORMS.map((k) => (
                <button key={k.id} role="radio" aria-checked={kind === k.id} onClick={() => toKind(k.id)}
                  className={`press flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[12.5px] transition-colors ${kind === k.id ? "border-[#a0561f] bg-[#a0561f]/[0.06] font-medium text-ink shadow-[inset_0_0_0_1.5px_#a0561f]" : "border-line bg-white text-ink-2 hover:border-line-strong"}`}>
                  <Icon name={k.icon} size={16} />{k.name}
                </button>
              ))}
            </div>
            <div className="mt-3 border-t border-line pt-3">
              {kind === "answer" && <p className="text-[12.5px] text-ink-3">Students type an answer, record audio or video, or upload files and links. Only you see it, and you give feedback.</p>}
              {kind === "worksheet" && (
                // Your text above is the worksheet; students fill in a copy: each their own, or one shared per group or class.
                <div className="text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink-2">Who fills it in</span>
                    <Seg value={m.writers ?? "each"} options={FILLERS.map(([v, l]) => [v, l] as [string, string])} onPick={(v) => set({ writers: v as "each" | "group" | "class" })} />
                  </div>
                  <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
                    {(m.writers ?? "each") === "each" ? "Your text above is where each student starts. They fill in their own copy and hand it in; it waits for your feedback in Students, where you can comment on any passage."
                      : m.writers === "group" ? "Each group shares one copy and fills it in together, live, each with their cursor and name. Anyone in the group hands it in for the whole group."
                      : "The whole class shares one copy and fills it in together, live: good for a class table of results. Each student presses Hand in for themselves."}
                    {" "}History keeps a version every few minutes, with who wrote in it.
                  </p>
                  {(m.writers === "group" || m.writers === "class") && dealtBy.length > 0 && (
                    <p className="mt-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-[12px] text-warn">An answer deals this card, but a worksheet filled in together goes to everyone in the group or class. The answer won’t deal it any more.</p>
                  )}
                  {m.writers === "group" && course && <div className="mt-2"><GroupingPicker course={course} value={m.grouping} onPick={(id) => set({ grouping: id })} onChanged={() => onCourseChanged?.()} /></div>}
                </div>
              )}
              {kind === "choice" && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="text-ink-2">Has a right answer</span>
                  <Seg value={isPoll(m) ? "poll" : "right"} options={[["right", "Yes"], ["poll", "No (a poll)"]]}
                    onPick={(v) => { if ((v === "poll") !== isPoll(m)) set(asKind(m, "choice", v === "poll")); }} />
                </div>
              )}
              {kind === "choice" && !isPoll(m) && (
                <>
                  <QuestionsEditor single questions={m.questions ?? []} cards={allCards ?? lesson.modules} onTree={onTree} onGo={onGo} onChange={(questions) => set({ questions: questions.length ? questions : undefined })} />
                  {onOpen && (
                    <button onClick={() => {
                      const cur = lessonRef.current;
                      const dealt = (allCards ?? cur.modules).some((x) => (x.questions ?? []).some((q) => q.next?.includes(m.id)) || (x.bands ?? []).some((b) => b.next === m.id));
                      const { lesson: next, card, grouped } = addNextQuestion(cur, m.id, dealt);
                      onChange(next);
                      onOpen(card.id);
                      toast(grouped === "new" ? "Added the next question. The two cards are now a card group, answered together." : grouped ? `Added “${card.title}” to the card group` : "Added the next question as its own card, since an answer deals this one.", { icon: "plus" });
                    }} className="btn btn-ghost press mt-2"><Icon name="plus" size={13} /> Add the next question</button>
                  )}
                  <p className="mt-2 text-[12px] text-ink-3">One question per card. The next question goes on a new card, and the cards become a card group: students answer them together, and the total score can deal cards.</p>
                </>
              )}
              {isPoll(m) && <PollEditor question={m.questions?.[0]} cards={allCards ?? lesson.modules} onTree={onTree} onGo={onGo} onChange={(q) => set({ questions: [q] })} />}
              {isPoll(m) && (
                // A sign-up: each option is a group, and a student's vote puts them in it.
                <div className="mt-3 space-y-2 rounded-xl border border-line px-3 py-2.5 text-[12.5px]">
                  <label className="flex items-center gap-2 font-medium">
                    <input type="checkbox" checked={!!m.signup} onChange={(e) => set({ signup: e.target.checked ? { names: true } : undefined })} className="accent-[#4b56a8]" />
                    Make groups from the answers
                  </label>
                  {m.signup ? (
                    <>
                      <p className="text-ink-3">Each option is a group; students pick the one they want to join, and can change until you lock the groups. The groups are kept as “{m.title}”, for other cards (Each group) to use.</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-ink-2">At most</span>
                        <input type="number" min={1} max={200} value={m.signup.max ?? ""} placeholder="any" aria-label="At most this many in each group"
                          onChange={(e) => set({ signup: { ...m.signup, max: Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : undefined } })} className="field h-8 w-20 py-0 font-mono" />
                        <span className="text-ink-2">in each group</span>
                      </div>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={m.signup.names !== false} onChange={(e) => set({ signup: { ...m.signup, names: e.target.checked } })} className="accent-[#4b56a8]" /> Students see who’s in each group</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!m.signup.locked} onChange={(e) => set({ signup: { ...m.signup, locked: e.target.checked || undefined } })} className="accent-[#4b56a8]" /> Lock the groups (no more changes)</label>
                      {course && <SignupGroups course={course} groupingId={signupGroupingId(m.id)} onChanged={() => onCourseChanged?.()} />}
                    </>
                  ) : <p className="text-ink-3">For example: “Which project group do you want to join?”</p>}
                </div>
              )}
              {kind === "discussion" && (
                <div className="space-y-2.5 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink-2">Who discusses</span>
                    {/* One kind of discussion: a feed for the whole class, or one feed per group. */}
                    <Seg value={m.wall?.byGroup ? "groups" : "class"} options={[["class", "The whole class"], ["groups", "Each group"]]}
                      onPick={(v) => set(asKind({ ...m, type: "wall", submitTo: undefined, wall: { ...wallDefaults, ...m.wall, byGroup: v === "groups" || undefined } }, "discussion"))} />
                  </div>
                  {m.wall?.byGroup && course && <GroupingPicker course={course} value={m.grouping} onPick={(id) => set({ grouping: id })} onChanged={() => onCourseChanged?.()} />}
                  {m.wall?.byGroup && <p className="-mt-1 text-ink-3">Each group has its own feed; students see their group’s posts and yours. You see every group’s.</p>}
                  {m.type === "wall" && (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-ink-2">Reactions</span>
                        <Seg value={m.wall?.reactions ?? "likes"} options={[["likes", "Likes"], ["votes", "Votes"], ["none", "None"]]} onPick={(v) => set({ wall: { ...wallDefaults, ...m.wall, reactions: v as "likes" | "votes" | "none" } })} />
                      </div>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!m.wall?.anonymous} onChange={(e) => set({ wall: { ...wallDefaults, ...m.wall, anonymous: e.target.checked } })} className="accent-[#4b56a8]" /> Hide names from classmates</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-ink-2">Each student replies to</span>
                        <Seg value={String(m.wall?.replies ?? 0)} options={[["0", "No one"], ["1", "1 classmate"], ["2", "2"], ["3", "3"]]} onPick={(v) => set({ wall: { ...wallDefaults, ...m.wall, replies: Number(v) || undefined } })} />
                      </div>
                      {(m.wall?.replies ?? 0) > 0 && <p className="-mt-1 text-ink-3">The card counts as done once a student has posted and replied to {m.wall!.replies} classmate{m.wall!.replies === 1 ? "" : "s"}. Replies can be words, a video, a voice recording or a file.</p>}
                      <label className="flex items-start gap-2">
                        <input type="checkbox" checked={!!m.wall?.structured} onChange={(e) => set({ wall: { ...wallDefaults, ...m.wall, structured: e.target.checked || undefined } })} className="mt-0.5 accent-[#4b56a8]" />
                        <span><span className="text-ink-2">Structured feedback</span><span className="block text-ink-3">A reply to a classmate’s post has three parts: what I noticed, the effect it had on me, one thing to try next. The post’s author can mark a reply helpful. Good for peer review of work students post.</span></span>
                      </label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!m.wall?.approval} onChange={(e) => set({ wall: { ...wallDefaults, ...m.wall, approval: e.target.checked } })} className="accent-[#4b56a8]" /> I approve posts before others see them</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-ink-2">Topics</span>
                        <input defaultValue={(m.wall?.sections ?? []).join(", ")} placeholder="Optional, e.g. Questions, Ideas, What worked" aria-label="Topics, separated by commas"
                          onBlur={(e) => { const t = e.target.value.split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean).slice(0, 8); set({ wall: { ...wallDefaults, ...m.wall, sections: t.length > 1 ? t : undefined } }); }}
                          className="field h-8 min-w-[14rem] flex-1 py-0" />
                      </div>
                      <p className="-mt-1 text-ink-3">With two or more topics, students pick one for each post, and everyone can filter the discussion by topic.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </Panel>
          )}

          <Panel n={kind === "content" ? 2 : 3} title="Access">
            {/* Who gets it: set on the map (answers deal cards), so said here rather than picked; some students is the exception. */}
            <div className="flex items-start gap-2.5 text-[12.5px]">
              <span className="mt-[1px] flex h-6 w-6 flex-none items-center justify-center rounded-full bg-lane text-ink-2"><Icon name={dealtBy.length ? "split" : a.kind === "student" ? "user" : "users"} size={12} /></span>
              <span className="min-w-0 flex-1 pt-[3px] text-ink-2">
                {a.kind === "branch" ? (
                  <>Only students on the “{a.variant}” path get this card (set up before paths were removed). <button onClick={() => set({ audience: { kind: "all" } })} className="underline underline-offset-2 hover:text-ink">Give it to everyone</button></>
                ) : a.kind === "student" ? (
                  chosen.length || chosenGroups.length ? <>Only <span className="font-medium text-ink">{someLabel}</span> {chosen.length + chosenGroups.length === 1 ? "gets" : "get"} this card.{chosenGroups.length ? (
                    <button onClick={() => setShowReach((v) => !v)} aria-expanded={showReach}
                      className="press ml-1.5 inline-flex h-6 items-center gap-1 rounded-full bg-lane px-2 align-middle text-[11.5px] text-ink-2 hover:bg-black/[0.06] hover:text-ink">
                      {reach} student{reach === 1 ? "" : "s"}<Icon name="chevron" size={10} className={`transition-transform ${showReach ? "rotate-180" : ""}`} />
                    </button>
                  ) : null}
                  {chosenGroups.length > 0 && showReach && (
                    <span className="pop mt-1.5 block rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] leading-relaxed text-ink-2">
                      {reach ? reachIds.map((id) => students.find((s) => s.id === id)?.name ?? "A student").join(", ") : "No one is in these groups yet."}
                    </span>
                  )}</>
                    : <span className="text-[#a0561f]">No one gets this card yet: pick who does.</span>
                ) : dealtBy.length ? (
                  <>Students get it from {dealtBy.slice(0, 2).map((w, k) => (
                    <span key={k}>{k ? " or " : ""}<button onClick={() => (onGo ? onGo(w.from) : onTree?.())} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">{w.label}</button></span>
                  ))}{dealtBy.length > 2 ? ` and ${dealtBy.length - 2} more` : ""}.</>
                ) : (
                  <>Everyone gets this card.</>
                )}
                {a.kind === "all" && !dealtBy.length && !sharedOnly(m, everyCard) && (
                  <button onClick={() => set({ audience: { kind: "student", studentId: "", studentIds: [] } })} className="mt-1 block underline underline-offset-2 hover:text-ink">Only some students or groups…</button>
                )}
              </span>
            </div>
            {a.kind === "student" && (
              <div className="mt-2 pl-[34px]">
                {pickableGroups.length > 0 && (
                  <>
                    <p className="mb-1 text-[11.5px] text-ink-3">Groups</p>
                    <div className="mb-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Groups that get this card">
                      {pickableGroups.map((g) => {
                        const on = chosenGroups.includes(g.ref);
                        return (
                          <button key={g.ref} onClick={() => pickSome(chosen, on ? chosenGroups.filter((x) => x !== g.ref) : [...chosenGroups, g.ref])} aria-pressed={on} title={`${g.of}: ${g.n} student${g.n === 1 ? "" : "s"}`}
                            className={`press inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] ${on ? "border-ink bg-ink/[0.04] font-medium" : "border-line text-ink-2 hover:border-line-strong"}`}>
                            <Icon name="users" size={12} />{g.name}{on && <Icon name="check" size={11} />}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mb-1 text-[11.5px] text-ink-3">Students</p>
                  </>
                )}
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Students who get this card">
                  {students.map((s) => {
                    const on = chosen.includes(s.id);
                    return (
                      <button key={s.id} onClick={() => pickSome(on ? chosen.filter((x) => x !== s.id) : [...chosen, s.id], chosenGroups)} aria-pressed={on}
                        className={`press inline-flex h-7 items-center gap-1.5 rounded-full border pl-1 pr-2.5 text-[12.5px] ${on ? "border-ink bg-ink/[0.04] font-medium" : "border-line text-ink-2 hover:border-line-strong"}`}>
                        <Avatar name={s.name} size={20} />{s.name}{on && <Icon name="check" size={11} />}
                      </button>
                    );
                  })}
                  {!students.length && <span className="text-[12.5px] text-ink-3">No students yet.</span>}
                </div>
                <button onClick={() => set({ audience: { kind: "all" } })} className="mt-2 text-[12.5px] text-ink-2 underline underline-offset-2 hover:text-ink">Give it to everyone</button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-[12.5px]">
              <span className="mr-1 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-lane text-ink-2"><Icon name="clock" size={12} /></span>
              <span className="mr-0.5 text-ink-2">Due</span>
              {/* No due date is the default: picked until a date is set. */}
              <button onClick={() => set({ due: undefined })} aria-pressed={!m.due}
                className={`press inline-flex h-7 items-center whitespace-nowrap rounded-full border px-2.5 text-[12px] ${!m.due ? "border-ink bg-ink/[0.04] font-medium" : "border-line text-ink-2 hover:border-line-strong"}`}>No due date</button>
              {/* A date, typed or picked; the calendar button opens the whole course's calendar to pick it from. */}
              <span className={`inline-flex h-8 items-center overflow-hidden rounded-[10px] border bg-white ${m.due ? "border-ink" : "border-line"}`}>
                <input type="date" value={m.due ?? ""} onChange={(e) => set({ due: e.target.value || undefined })} aria-label="Due date" className="h-full w-[112px] bg-transparent pl-2 text-[12.5px] outline-none [&::-webkit-calendar-picker-indicator]:hidden" />
                {course && (
                  <button onClick={() => setCalendar(true)} aria-label="Open the calendar" title="Pick from the course calendar"
                    className="press grid h-full w-8 place-items-center border-l border-line text-ink-2 hover:bg-lane hover:text-ink"><Icon name="calendar" size={13} /></button>
                )}
              </span>
              {calendar && course && <DueCalendar course={course} moduleId={m.id} cardTitle={m.title} due={m.due} onPick={(day) => set({ due: day })} onClose={() => setCalendar(false)} />}
            </div>
          </Panel>


          {older.length > 0 && (
            <p className="px-1 text-[12px] text-ink-3">
              Older settings on this card still apply: {older.join(" · ")}.{" "}
              <button onClick={() => set(clearOlder(m))} className="underline underline-offset-2 hover:text-ink">Clear them</button>
            </p>
          )}
        </div>
      </div>
      {editing && <ImageEditor source={editing.url} title={`Edit ${editing.name || "picture"}`} onKeep={(f) => saveEdited(editing, f)} onCancel={() => setEditing(null)} />}
      {viewing && <MediaLift a={viewing.a} title={viewing.a.name || m.title} from={viewing.from} open={viewing.open} onClose={() => setViewing((v) => v && { ...v, open: false })} onGone={() => setViewing(null)} />}
    </aside>,
    document.body,
  );
}

/** One of the parts of a card, numbered in the order a teacher fills them in. */
function Panel({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section data-sec={title} className="rounded-xl border border-line bg-white px-4 py-3.5">
      <h3 className="mb-2.5 flex items-baseline gap-2 text-[13px] font-medium"><span className="font-mono text-[11px] font-normal text-ink-3">{n}</span>{title}</h3>
      {children}
    </section>
  );
}

function QuestionsEditor({ questions, onChange, cards = [], onTree, onGo, single }: { questions: Question[]; onChange: (q: Question[]) => void; cards?: Module[]; onTree?: () => void; onGo?: (id: string) => void; single?: boolean }) {
  const titleOf = (id: string) => cards.find((c) => c.id === id)?.title || "Untitled card";
  const set = (id: string, patch: Partial<Question>) => onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-2.5">
      <p className="text-[12px] text-ink-3">Tick the right answer (it starts as the first option). Each student sees the options in a different order. For a short answer, list every answer you’ll accept.</p>
      {questions.map((q, qi) => {
        const short = q.kind === "short";
        const multi = q.kind === "multi";
        const ordered = q.kind === "order";
        return (
          <div key={q.id} className="rise rounded-xl border border-line p-3">
            <div className="flex items-center gap-2">
              {questions.length > 1 && <span className="mono w-5">{String(qi + 1).padStart(2, "0")}</span>}
              <input value={q.text} onChange={(e) => set(q.id, { text: e.target.value })} placeholder={questions.length > 1 ? "Question" : "Question (leave empty to use the title)"} aria-label={`Question ${qi + 1}`} className="field" />
              <button onClick={() => onChange(questions.filter((x) => x.id !== q.id))} aria-label="Delete question" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={14} /></button>
            </div>
            <div className="mt-2 pl-7">
              <Seg value={q.kind ?? "choice"} options={[["choice", "One answer"], ["multi", "Several"], ["order", "Order"], ["short", "Short answer"]]}
                onPick={(v) => set(q.id,
                  v === "short" ? { kind: "short", accept: q.accept?.length ? q.accept : [""], next: undefined }
                  : v === "multi" ? { kind: "multi", options: q.options.length ? q.options : ["", ""], answerSet: q.answerSet ?? (q.answer !== undefined ? [q.answer] : []) }
                  : v === "order" ? { kind: "order", options: q.options.length >= 3 ? q.options : [...q.options, "", "", ""].slice(0, 3), next: undefined }
                  : { kind: undefined, options: q.options.length ? q.options : ["", ""], answer: q.answer ?? 0 })} />
            </div>
            <div className="pl-7"><MathPreview text={[q.text, ...(short ? [] : q.options)].filter((x) => x.trim()).join("  ·  ")} /></div>
            {short ? (
              <div className="mt-2 pl-7">
                <input value={(q.accept ?? []).join(", ")} onChange={(e) => set(q.id, { accept: e.target.value.split(",").map((x) => x.trimStart()) })}
                  placeholder="Accepted answers, separated by commas" aria-label={`Accepted answers for question ${qi + 1}`} className="field h-8 border-ok/40 py-0" />
                <p className="mt-1 text-[11.5px] text-ink-3">Capitals, spaces, and punctuation are ignored when checking.</p>
              </div>
            ) : (
              <>
                {ordered && <p className="mt-2 pl-7 text-[11.5px] text-ink-3">Write the items in the correct order. Students see them mixed up.</p>}
                <div className="mt-2 space-y-1.5 pl-7">
                  {q.options.map((opt, oi) => {
                    const correct = multi ? q.answerSet?.includes(oi) : !ordered && q.answer === oi;
                    return (
                      <label key={oi} className="flex items-center gap-2">
                        {ordered ? <span className="mono w-4 text-center">{oi + 1}</span>
                          : multi ? <input type="checkbox" checked={!!correct} onChange={() => set(q.id, { answerSet: correct ? (q.answerSet ?? []).filter((x) => x !== oi) : [...(q.answerSet ?? []), oi] })} aria-label={`Option ${oi + 1} is correct`} className="accent-[#247b46]" />
                          : <input type="radio" name={`ans-${q.id}`} checked={q.answer === oi} onChange={() => set(q.id, { answer: oi })} aria-label={`Option ${oi + 1} is correct`} className="accent-[#247b46]" />}
                        <input value={opt} onChange={(e) => set(q.id, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })} placeholder={ordered ? `Step ${oi + 1}` : `Option ${oi + 1}`} aria-label={`Option ${oi + 1}`} className={`field h-8 py-0 ${correct ? "border-ok/50" : ""}`} />
                        {/* The right answer says so in words, not only with a filled circle, so a default isn't missed. */}
                        {correct && <span className="chip h-6 flex-none gap-1 bg-ok/10 px-2 text-[11px] font-medium text-ok"><Icon name="check" size={11} />Right</span>}
                        {!ordered && <Dealt ids={targetsOf(q, oi)} titleOf={titleOf} onGo={onGo} onTree={onTree} />}
                        {q.options.length > 2 && (
                          <button onClick={() => set(q.id, { options: q.options.filter((_, k) => k !== oi), answer: q.answer !== undefined && q.answer > oi ? q.answer - 1 : q.answer === oi ? 0 : q.answer, answerSet: q.answerSet?.filter((x) => x !== oi).map((x) => (x > oi ? x - 1 : x)), next: q.next?.filter((_, k) => k !== oi) })} aria-label={`Remove option ${oi + 1}`} className="text-ink-3 hover:text-bad"><Icon name="x" size={12} /></button>
                        )}
                      </label>
                    );
                  })}
                </div>
                <div className="ml-6 mt-1 flex flex-wrap gap-1">
                  {q.options.length < 6 && (
                    <button onClick={() => set(q.id, { options: [...q.options, ""] })} className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="plus" size={12} /> Option</button>
                  )}
                </div>
              </>
            )}
            <div className="mt-2 pl-7">
              <input value={q.explain ?? ""} onChange={(e) => set(q.id, { explain: e.target.value || undefined })}
                placeholder="Why this is the answer (shown after answering, optional)" aria-label={`Explanation for question ${qi + 1}`} className="field h-8 py-0 text-[12.5px]" />
            </div>
          </div>
        );
      })}
      {!(single && questions.length >= 1) && <button onClick={() => onChange([...questions, { id: uid("q-"), text: "", options: ["", ""], answer: 0 }])} className="btn btn-ghost press"><Icon name="plus" size={13} /> Add a question</button>}
    </div>
  );
}


const wallDefaults = { posting: "students" as const, comments: true, reactions: "likes" as const, anonymous: false, approval: false };

/** A poll: one question and its choices, none of them right. Each choice can deal a card on the map. */
function PollEditor({ question, onChange, cards = [], onTree, onGo }: { question?: Question; onChange: (q: Question) => void; cards?: Module[]; onTree?: () => void; onGo?: (id: string) => void }) {
  const q: Question = question ?? { id: uid("q-"), text: "", options: ["", ""] };
  const titleOf = (id: string) => cards.find((c) => c.id === id)?.title || "Untitled card";
  return (
    <div className="space-y-2">
      <input value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} placeholder="What are you asking? (leave empty to use the title)" aria-label="Poll question" className="field" />
      <div className="space-y-1.5">
        {q.options.map((o, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-lane text-[10.5px] font-semibold text-ink-3">{String.fromCharCode(65 + oi)}</span>
            <input value={o} onChange={(e) => onChange({ ...q, options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })} placeholder={`Option ${oi + 1}`} aria-label={`Option ${oi + 1}`} className="field h-8 py-0" />
            <Dealt ids={targetsOf(q, oi)} titleOf={titleOf} onGo={onGo} onTree={onTree} />
            {q.options.length > 2 && (
              <button onClick={() => onChange({ ...q, options: q.options.filter((_, k) => k !== oi), next: q.next?.filter((_, k) => k !== oi) })} aria-label={`Remove choice ${oi + 1}`} className="text-ink-3 hover:text-bad"><Icon name="x" size={12} /></button>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {q.options.length < 6 && <button onClick={() => onChange({ ...q, options: [...q.options, ""] })} className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="plus" size={12} /> Option</button>}
      </div>
      <p className="text-[12px] text-ink-3">No right answer. After voting, students see how the class voted.</p>
    </div>
  );
}
