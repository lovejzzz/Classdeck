// Card text as Markdown, checked without a server: npx tsx tests/markdown.test.ts
import { blocks, inline, isRich, plainText } from "../lib/markdown";

const rows: [string, boolean][] = [];
const check = (name: string, ok: boolean) => rows.push([name, ok]);

// Plain text from before stays plain (and keeps its highlighting): nothing in it is Markdown.
check("plain text isn't rich", !isRich("Two lines\nof plain text.\n\nAnd a second paragraph."));
check("a list is rich", isRich("Steps:\n\n1. one\n2. two"));
check("an escape the editor wrote counts as rich", isRich("snake\\_case"));

// Math is kept whole: its _ and * are not italics.
const m = inline("Use $x_1 * y_2$ and _this_.");
check("math stays one piece", m.some((x) => x.t === "$x_1 * y_2$" && !x.i));
check("italics outside math", m.some((x) => x.t === "this" && x.i));
check("money isn't math or italics", inline("It costs $5 and $10.").map((x) => x.t).join("") === "It costs $5 and $10.");

// Links: only web and mail addresses become links.
check("a web link", inline("[site](https://example.com)").some((x) => x.href === "https://example.com"));
check("a javascript: link stays text", !inline("[bad](javascript:alert(1))").some((x) => x.href));
check("a bare address becomes a link", inline("see https://example.com.").some((x) => x.href === "https://example.com"));

// Escapes show as the character.
check("\\_ shows as _", inline("snake\\_case").map((x) => x.t).join("") === "snake_case");

// Tables.
const t = blocks("| A | B |\n|---|--:|\n| 1 | 2 |");
check("a table", t[0].k === "table" && t[0].head.join() === "A,B" && t[0].align[1] === "right");
const pasted = blocks("|  |  |\n| --- | --- |\n| Name | Score |\n| Ana | 9 |");
check("a pasted table's first row is its header", pasted[0].k === "table" && pasted[0].head.join() === "Name,Score" && pasted[0].rows.length === 1);
const inList = blocks("- a\n  \n  | x | y |\n  | --- | --- |\n  | 1 | 2 |");
check("a table inside a list item is still a table", inList.some((b) => b.k === "table"));

// Lists inside lists; numbering counts only the list's own items.
const ol = plainText("1. first\n   - inner\n2. second");
check("nested items don't take a number", ol.includes("2. second") && !ol.includes("3."));
check("quotes, headings and dividers", blocks("## H\n\n> tip\n\n---").map((b) => b.k).join() === "h,quote,hr");

for (const [name, ok] of rows) console.log(`${ok ? "✓" : "✗"} ${name}`);
const failed = rows.filter(([, ok]) => !ok).length;
console.log(`\n${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
