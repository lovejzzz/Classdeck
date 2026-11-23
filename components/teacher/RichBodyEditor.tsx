"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extensions";
import { mergeAttributes, Node, nodeInputRule } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import type { Doc } from "yjs";
import { Icon } from "../Icon";
import { RichText } from "../RichText";

// $…$ and $$…$$ (as MathText reads them; "$5 and $10" stays money).
const MATH_AT_START = /^(?:\$\$[\s\S]+?\$\$|\$(?=[^\s$])(?:\\\$|[^$\n])*?[^\s\\$]\$(?!\d))/;

/**
 * Math as one piece in the editor: a chip showing its $…$ source, written back to Markdown exactly as it was (the
 * Markdown writer would otherwise escape its _ and \). Typing $…$ makes one; clicking one edits it.
 */
const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() { return { src: { default: "" } }; },
  parseHTML() { return [{ tag: "span[data-math]", getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute("data-math") ?? "" }) }]; },
  renderHTML({ HTMLAttributes, node }) { return ["span", mergeAttributes(HTMLAttributes, { "data-math": node.attrs.src, class: "math-chip", title: "Math: click to change it" }), node.attrs.src]; },
  markdownTokenName: "mathInline",
  markdownTokenizer: {
    name: "mathInline",
    level: "inline",
    start: (src: string) => src.indexOf("$"),
    tokenize: (src: string) => {
      const m = src.match(MATH_AT_START);
      return m ? { type: "mathInline", raw: m[0], text: m[0] } : undefined;
    },
  },
  parseMarkdown: (token: { raw?: string }) => ({ type: "mathInline", attrs: { src: token.raw ?? "" } }),
  renderMarkdown: (node: { attrs?: { src?: string } }) => node.attrs?.src ?? "",
  addInputRules() {
    return [nodeInputRule({ find: /(?<![\\$\w])(\$(?:[^\s$]|[^\s$][^$\n]*?[^\s\\$])\$)$/, type: this.type, getAttributes: (m) => ({ src: m[1] }) })];
  },
});

/** A button on the editor's toolbar. */
function Tool({ on, label, title, onClick, children }: { on?: boolean; label: string; title?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={title ?? label} aria-pressed={on} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={`press flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[12.5px] transition-colors ${on ? "bg-ink text-white" : "text-ink-2 hover:bg-lane hover:text-ink"}`}>
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }),
      b: e.isActive("bold"), i: e.isActive("italic"), s: e.isActive("strike"),
      ul: e.isActive("bulletList"), ol: e.isActive("orderedList"), q: e.isActive("blockquote"),
      link: e.isActive("link"), table: e.isActive("table"),
    }),
  });
  const c = () => editor.chain().focus();
  /** The table the cursor is in: where it starts, and the node. */
  const tableHere = () => {
    const { $from } = editor.state.selection;
    for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") return { pos: $from.before(d), node: $from.node(d) };
    return null;
  };
  // A row at the end that adds up each column (=SUM), which students see worked out.
  const addTotal = () => {
    const t = tableHere();
    if (!t) return;
    const { tableRow, tableCell, paragraph } = editor.state.schema.nodes;
    const cols = t.node.firstChild?.childCount ?? 1;
    const cell = (text: string) => tableCell.create(null, paragraph.create(null, editor.state.schema.text(text)));
    const row = tableRow.create(null, Array.from({ length: cols }, (_, i) => cell(i === 0 ? "Total" : "=SUM")));
    editor.view.dispatch(editor.state.tr.insert(t.pos + t.node.nodeSize - 1, row));
  };
  // A chart of the table, right under it.
  const addChart = (kind: "bar" | "line" | "pie") => {
    const t = tableHere();
    if (!t) return;
    const { paragraph } = editor.state.schema.nodes;
    editor.view.dispatch(editor.state.tr.insert(t.pos + t.node.nodeSize, paragraph.create(null, editor.state.schema.text(`[chart: ${kind}]`))));
  };
  const link = () => {
    if (st.link) return c().unsetLink().run();
    const url = window.prompt("Link to (https://…)", "https://");
    if (url && /^(https?:\/\/|mailto:)/i.test(url.trim())) c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
      <Tool label="Heading" on={st.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}><span className="font-semibold">H</span></Tool>
      <Tool label="Small heading" on={st.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}><span className="text-[11px] font-semibold">H</span></Tool>
      <span className="mx-1 h-4 w-px bg-line" />
      <Tool label="Bold" title="Bold (⌘B)" on={st.b} onClick={() => c().toggleBold().run()}><span className="font-bold">B</span></Tool>
      <Tool label="Italic" title="Italic (⌘I)" on={st.i} onClick={() => c().toggleItalic().run()}><span className="font-serif italic">I</span></Tool>
      <Tool label="Strikethrough" on={st.s} onClick={() => c().toggleStrike().run()}><s>S</s></Tool>
      <Tool label={st.link ? "Remove link" : "Link"} on={st.link} onClick={link}><Icon name="link" size={13} /></Tool>
      <span className="mx-1 h-4 w-px bg-line" />
      <Tool label="Bulleted list" on={st.ul} onClick={() => c().toggleBulletList().run()}><span className="text-[15px] leading-none">•</span></Tool>
      <Tool label="Numbered list" on={st.ol} onClick={() => c().toggleOrderedList().run()}><span className="font-mono text-[11px]">1.</span></Tool>
      <Tool label="Callout" title="Callout: a highlighted box, for a tip or a key idea" on={st.q} onClick={() => c().toggleBlockquote().run()}><Icon name="sparkles" size={13} /></Tool>
      <Tool label="Divider" onClick={() => c().setHorizontalRule().run()}><span className="font-mono">—</span></Tool>
      <Tool label="Table" title="Add a table" on={st.table} onClick={() => (st.table ? undefined : c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}><Icon name="board" size={13} /></Tool>
      {st.table && (
        <span className="ml-1 flex flex-wrap items-center gap-0.5 rounded-lg bg-lane/70 px-1">
          <Tool label="Add a row" onClick={() => c().addRowAfter().run()}>+ Row</Tool>
          <Tool label="Add a column" onClick={() => c().addColumnAfter().run()}>+ Column</Tool>
          <Tool label="Delete this row" onClick={() => c().deleteRow().run()}>− Row</Tool>
          <Tool label="Delete this column" onClick={() => c().deleteColumn().run()}>− Column</Tool>
          <Tool label="Add a total row" title="A row that adds up each column (=SUM). Change it to =AVERAGE, =COUNT, =MIN or =MAX" onClick={addTotal}>Σ Total</Tool>
          <Tool label="Bar chart of this table" title="A bar chart of this table, under it" onClick={() => addChart("bar")}><Icon name="chart" size={12} /> Bar</Tool>
          <Tool label="Line chart of this table" onClick={() => addChart("line")}>Line</Tool>
          <Tool label="Pie chart of this table" onClick={() => addChart("pie")}>Pie</Tool>
          <Tool label="Delete the table" onClick={() => c().deleteTable().run()}><Icon name="trash" size={12} /></Tool>
        </span>
      )}
    </div>
  );
}

/**
 * The card's text, written like a document: headings, bold and italic, lists, callouts, dividers, links and tables
 * (paste one from Google Sheets, Excel or Docs and it stays a table). It's stored as Markdown, so plain text from
 * before needs no change, and $math$ still works.
 */
/** Writing together: the shared Yjs doc, its provider (with everyone's cursors), and who this writer is. */
export type CollabSetup = {
  doc: Doc;
  provider: { awareness: unknown };
  user: { name: string; color: string };
  /** The editor is ready (to put the starting text in, or to restore a version). */
  onReady?: (editor: Editor) => void;
  /** This writer changed the text. */
  onLocalChange?: (editor: Editor) => void;
  /** Read only (a viewer). */
  readOnly?: boolean;
};

export function RichBodyEditor({ value = "", onChange, placeholder, collab, compact = false, label = "Body", onSubmit }: {
  value?: string; onChange?: (md: string) => void; placeholder?: string; collab?: CollabSetup;
  /** A smaller box (a post or a reply). */
  compact?: boolean;
  label?: string;
  /** ⌘/Ctrl + Enter. */
  onSubmit?: () => void;
}) {
  // What this editor last sent, so a change from outside (undo in the card panel, another card) is told apart.
  const sent = useRef(value);
  const [focused, setFocused] = useState(false);
  const [preview, setPreview] = useState("");
  // The latest ⌘↵ handler (the editor is made once).
  const submit = useRef(onSubmit);
  useEffect(() => { submit.current = onSubmit; });
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showPreview = (e: Editor) => { clearTimeout(previewTimer.current); previewTimer.current = setTimeout(() => setPreview(e.getMarkdown()), 400); };
  const editor = useEditor({
    extensions: [
      // Writing together, undo is the shared doc's own (each writer undoes only their own changes).
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, underline: false, link: { openOnClick: false, autolink: true, protocols: ["mailto"] }, ...(collab ? { undoRedo: false } : {}) }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
      MathInline,
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      ...(collab ? [Collaboration.configure({ document: collab.doc }), CollaborationCaret.configure({ provider: collab.provider, user: collab.user })] : []),
    ],
    editable: !collab?.readOnly,
    ...(collab ? {} : { content: value }),
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: { "aria-label": label, class: `rich-editor-content ${compact ? "min-h-[3.25rem]" : "min-h-[7.5rem]"} px-3 py-2.5 outline-none` },
      handleKeyDown: (_view, e) => { if (submit.current && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { submit.current(); return true; } return false; },
      // Click a math chip to change its source.
      handleClickOn: (view, pos, node) => {
        if (node.type.name !== "mathInline") return false;
        const next = window.prompt("Math (between $ signs)", node.attrs.src);
        if (next === null) return true;
        const t = next.trim();
        const tr = view.state.tr;
        if (!t) tr.delete(pos, pos + node.nodeSize);
        else tr.setNodeMarkup(pos, undefined, { src: /^\$[\s\S]*\$$/.test(t) ? t : `$${t}$` });
        view.dispatch(tr);
        return true;
      },
    },
    onCreate: ({ editor: e }) => { collab?.onReady?.(e); showPreview(e); },
    onUpdate: ({ editor: e, transaction }) => {
      showPreview(e);
      if (collab) {
        // Only this writer's own changes (not ones arriving from the others).
        if (!transaction.getMeta("y-sync$")) collab.onLocalChange?.(e);
        return;
      }
      const md = e.getMarkdown();
      sent.current = md;
      onChange?.(md);
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  });
  useEffect(() => {
    if (!editor || collab || value === sent.current) return;
    sent.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    // `collab` is set once, when the editor is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);
  return (
    <div className={`rich-editor overflow-hidden rounded-xl border bg-white transition-colors ${focused ? "border-[#4b56a8]/50 ring-2 ring-[#4b56a8]/15" : "border-line"}`}>
      {editor && <Toolbar editor={editor} />}
      <div className="max-h-[28rem] overflow-y-auto text-[13.5px] leading-relaxed">
        <EditorContent editor={editor} />
      </div>
      {/(^|\|)\s*=(SUM|AVERAGE|AVG|COUNT|MIN|MAX)\s*(\||$)|\\?\[chart/im.test(preview) && (
        <div className="border-t border-line bg-lane/40 px-3 py-2.5">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">How it looks</div>
          <RichText text={preview} className="text-[13px] leading-relaxed" />
        </div>
      )}
    </div>
  );
}
