// Card text as Markdown, checked without a server: npx tsx tests/markdown.test.ts
import { blocks, chartData, computed, inline, isRich, plainText } from "../lib/markdown";

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

// Tables that add up, and charts of tables.
const tb = blocks("| Trial | Time | Note |\n|---|---|---|\n| 1 | 4.2 s | ok |\n| 2 | 3.8 | |\n| 3 | | |\n| Total | =SUM | =COUNT |\n| Mean | =AVERAGE | |\n\n\\[chart: line\\]");
const tt = tb[0].k === "table" ? computed(tb[0]) : null;
check("=SUM adds the numbers above (units ignored)", tt?.rows[3][1] === "8");
check("=COUNT counts the numbers above", tt?.rows[3][2] === "0");
check("=AVERAGE skips the total row above it", tt?.rows[4][1] === "4");
check("an escaped [chart: line] after a table is a chart", tb[1]?.k === "chart" && tb[1].kind === "line");
const cd = tb[0].k === "table" ? chartData(tb[0]) : null;
check("a chart leaves out the total rows and empty columns", cd?.labels.join() === "1,2,3" && cd.series.length === 1 && cd.series[0].values.join() === "4.2,3.8,");
check("a [chart] line alone isn't a chart", blocks("[chart: bar]")[0].k === "p");
check("plain text shows the worked-out total", plainText("| a | b |\n|---|---|\n| x | 2 |\n| y | 3 |\n| t | =SUM |").includes("t · 5"));

for (const [name, ok] of rows) console.log(`${ok ? "✓" : "✗"} ${name}`);
const failed = rows.filter(([, ok]) => !ok).length;
console.log(`\n${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
