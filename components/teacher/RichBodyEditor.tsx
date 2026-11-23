"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extensions";
import { mergeAttributes, Node, nodeInputRule } from "@tiptap/core";
import { Icon } from "../Icon";

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
export function RichBodyEditor({ value, onChange, placeholder }: { value: string; onChange: (md: string) => void; placeholder?: string }) {
  // What this editor last sent, so a change from outside (undo in the card panel, another card) is told apart.
  const sent = useRef(value);
  const [focused, setFocused] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, underline: false, link: { openOnClick: false, autolink: true, protocols: ["mailto"] } }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
      MathInline,
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: { "aria-label": "Body", class: "rich-editor-content min-h-[7.5rem] px-3 py-2.5 outline-none" },
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
    onUpdate: ({ editor: e }) => {
      const md = e.getMarkdown();
      sent.current = md;
      onChange(md);
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  });
  useEffect(() => {
    if (!editor || value === sent.current) return;
    sent.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);
  return (
    <div className={`rich-editor overflow-hidden rounded-xl border bg-white transition-colors ${focused ? "border-[#4b56a8]/50 ring-2 ring-[#4b56a8]/15" : "border-line"}`}>
      {editor && <Toolbar editor={editor} />}
      <div className="max-h-[28rem] overflow-y-auto text-[13.5px] leading-relaxed">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
