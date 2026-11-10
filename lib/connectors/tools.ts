import { pick } from "./declarative";
import { fetchJson } from "./safety";
import { ConnectorError, type Connector, type ToolResult } from "./types";

// Code connectors: APIs that need more than one request, a POST, or some arithmetic
// before the result makes sense to a student.

const need = (v: string | undefined, label: string) => {
  const t = (v ?? "").trim();
  if (!t) throw new ConnectorError("bad_input", `Enter “${label}”`);
  return t;
};
const fmt = (n: number, digits = 0) => n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

// —— Word finder (Datamuse) ——

const POS: Record<string, string> = { n: "noun", v: "verb", adj: "adjective", adv: "adverb", u: "word" };

export const words: Connector = {
  id: "words",
  name: "Word finder",
  description: "Definitions, better words, synonyms, and rhymes (from Datamuse).",
  icon: "type",
  kind: "builtin",
  category: "Language & writing",
  host: "api.datamuse.com",
  actions: [
    { id: "define", title: "Define a word", inputs: [{ name: "word", label: "Word", placeholder: "e.g. persuade" }] },
    { id: "better", title: "Find a better word", description: "Words that mean roughly the same thing as a word or phrase.", inputs: [{ name: "phrase", label: "Word or phrase", placeholder: "e.g. very important" }] },
    { id: "rhyme", title: "Find rhymes", inputs: [{ name: "word", label: "Word", placeholder: "e.g. light" }] },
    { id: "describe", title: "Describing words", description: "Adjectives people often use with a noun.", inputs: [{ name: "noun", label: "Noun", placeholder: "e.g. audience" }] },
  ],
  configured: () => true,
  async invoke(action, input) {
    const q = (k: string, v: string, extra = "") => fetchJson(`https://api.datamuse.com/words?${k}=${encodeURIComponent(v)}&max=16${extra}`) as Promise<{ word: string; defs?: string[] }[]>;
    if (action === "define") {
      const w = need(input.word, "Word").toLowerCase();
      const [hit] = await q("sp", w, "&md=d");
      const defs = (hit?.word === w ? hit.defs : undefined) ?? [];
      if (!defs.length) throw new ConnectorError("not_found", `No definition found for “${w}”. Check the spelling.`);
      return { render: "list", items: defs.slice(0, 5).map((d) => { const [p, ...t] = d.split("\t"); return { title: POS[p] ?? p, text: t.join(" ").trim() }; }) };
    }
    const [key, value] =
      action === "better" ? ["ml", need(input.phrase, "Word or phrase")] :
      action === "rhyme" ? ["rel_rhy", need(input.word, "Word")] :
      action === "describe" ? ["rel_jjb", need(input.noun, "Noun")] : ["", ""];
    if (!key) throw new ConnectorError("bad_input", "Unknown action");
    const found = (await q(key, value)).filter((x) => !x.word.includes(" ") || action === "better").slice(0, 16);
    if (!found.length) throw new ConnectorError("not_found", "No words found. Try another word.");
    return { render: "list", items: found.map((x) => ({ title: x.word, text: "" })) };
  },
};

// —— Grammar and style (LanguageTool) ——

type LTMatch = { message: string; shortMessage?: string; replacements: { value: string }[]; context: { text: string; offset: number; length: number }; rule: { issueType: string; category?: { name: string } } };
const ISSUE: Record<string, string> = { misspelling: "Spelling", grammar: "Grammar", typographical: "Punctuation", style: "Style", duplication: "Repeated word", whitespace: "Spacing", uncategorized: "Check" };

export const grammar: Connector = {
  id: "grammar",
  name: "Grammar check",
  description: "Finds spelling, grammar, and style problems and suggests fixes (from LanguageTool).",
  icon: "spellcheck",
  kind: "builtin",
  category: "Language & writing",
  host: "api.languagetool.org",
  actions: [
    {
      id: "check", title: "Check my writing",
      inputs: [
        { name: "text", label: "Your text", type: "textarea", placeholder: "Paste a paragraph to check" },
        { name: "lang", label: "Language", type: "select", options: [["en-US", "English (US)"], ["en-GB", "English (UK)"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt-BR", "Portuguese (Brazil)"]] },
      ],
    },
  ],
  configured: () => true,
  async invoke(_a, input) {
    const text = need(input.text, "Your text").slice(0, 2000);
    const data = (await fetchJson("https://api.languagetool.org/v2/check", { form: { text, language: input.lang || "en-US", enabledOnly: "false" } })) as { matches: LTMatch[] };
    const matches = data.matches ?? [];
    if (!matches.length) return { render: "text", text: "No problems found. Nice work." };
    return {
      render: "list",
      items: matches.slice(0, 10).map((m) => {
        const bad = m.context.text.slice(m.context.offset, m.context.offset + m.context.length);
        const fix = m.replacements.slice(0, 2).map((r) => `“${r.value}”`).join(" or ");
        return { title: ISSUE[m.rule.issueType] ?? m.rule.category?.name ?? "Check", text: `“${bad}”${fix ? ` → ${fix}` : ""}. ${m.message}` };
      }),
    };
  },
};

// —— Speech coach (no outside service) ——

const FILLERS = ["um", "uh", "erm", "like", "you know", "basically", "actually", "literally", "kind of", "sort of", "i mean", "so yeah", "right?", "just"];
const STOP = new Set("the a an and or but of to in on at for with is are was were be been it this that these those i you we they he she my your our their as by from so if then than not no do does did have has had can will would could should about into over just very really also there here what which who when where how all any some more most".split(" "));

function syllables(w: string) {
  const s = w.toLowerCase().replace(/[^a-z]/g, "");
  if (s.length <= 3) return 1;
  return Math.max(1, s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g)?.length ?? 1);
}

export function analyzeScript(text: string, target: number): ToolResult {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => /\w/.test(s));
  const tokens = text.match(/[A-Za-z’']+/g) ?? [];
  const n = tokens.length;
  if (n < 5) throw new ConnectorError("bad_input", "Paste at least a few sentences of your script");
  const lower = ` ${text.toLowerCase().replace(/[^a-z’'? ]+/g, " ").replace(/\s+/g, " ")} `;
  const fillers = FILLERS.map((f) => [f, lower.split(` ${f} `).length - 1] as const).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  const lens = sentences.map((s) => (s.match(/[A-Za-z’']+/g) ?? []).length);
  const longest = Math.max(...lens);
  const syl = tokens.reduce((t, w) => t + syllables(w), 0);
  const ease = 206.835 - 1.015 * (n / Math.max(1, sentences.length)) - 84.6 * (syl / n);
  const easeLabel = ease >= 70 ? "easy to follow when spoken" : ease >= 50 ? "fine for most audiences" : ease >= 30 ? "dense; consider shorter sentences" : "very dense for listeners";
  const counts = new Map<string, number>();
  for (const w of tokens.map((t) => t.toLowerCase())) if (w.length > 3 && !STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const repeated = [...counts].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const at = (wpm: number) => Math.round((n / wpm) * 60);
  const sec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const rows: string[][] = [
    ["Words", fmt(n)],
    ["Speaking time", `${sec(at(150))} at a brisk pace · ${sec(at(130))} at a calm pace`],
  ];
  if (target) {
    const fit = Math.round((target / 60) * 140);
    rows.push(["Fits your time?", n <= fit ? `Yes. About ${fmt(fit - n)} words to spare for ${sec(target)}.` : `Cut about ${fmt(n - fit)} words to fit ${sec(target)} at a natural pace.`]);
  }
  rows.push(
    ["Sentences", `${sentences.length} · average ${fmt(n / Math.max(1, sentences.length), 1)} words · longest ${longest}`],
    ["Easy to listen to?", `Reading ease ${fmt(Math.max(0, Math.min(100, ease)))} / 100: ${easeLabel}`],
    ["Filler words", fillers.length ? fillers.map(([f, c]) => `“${f}” ×${c}`).join(", ") : "None found"],
  );
  if (repeated.length) rows.push(["Words you repeat", repeated.map(([w, c]) => `${w} ×${c}`).join(", ")]);
  if (longest > 30) rows.push(["Try this", `Split your longest sentence (${longest} words); listeners can’t reread.`]);
  return { render: "table", columns: ["Check", "Result"], rows };
}

export const speech: Connector = {
  id: "speech",
  name: "Speech coach",
  description: "Checks a script for speaking time, filler words, sentence length, and how easy it is to follow. Runs on the server; nothing is sent out.",
  icon: "mic",
  kind: "builtin",
  category: "Language & writing",
  host: "runs locally",
  actions: [
    {
      id: "analyze", title: "Check my script",
      inputs: [
        { name: "text", label: "Your script", type: "textarea", placeholder: "Paste what you plan to say" },
        { name: "target", label: "Time limit", type: "select", options: [["0", "No time limit"], ["60", "1 minute"], ["90", "1½ minutes"], ["120", "2 minutes"], ["180", "3 minutes"], ["300", "5 minutes"]] },
      ],
    },
  ],
  configured: () => true,
  async invoke(_a, input) {
    return analyzeScript(need(input.text, "Your script"), Number(input.target) || 0);
  },
};

// —— World Bank indicators ——

const INDICATORS: [string, string, (v: number) => string][] = [
  ["SP.POP.TOTL", "Population", (v) => fmt(v)],
  ["NY.GDP.PCAP.CD", "GDP per person (US$)", (v) => `$${fmt(v)}`],
  ["SP.DYN.LE00.IN", "Life expectancy (years)", (v) => fmt(v, 1)],
  ["SP.URB.TOTL.IN.ZS", "Urban population (%)", (v) => `${fmt(v, 1)}%`],
  ["IT.NET.USER.ZS", "Internet users (%)", (v) => `${fmt(v, 1)}%`],
  ["EG.ELC.ACCS.ZS", "Access to electricity (%)", (v) => `${fmt(v, 1)}%`],
];
let countryCache: { id: string; iso2: string; name: string }[] | null = null;

export const worldbank: Connector = {
  id: "worldbank",
  name: "World data",
  description: "Population, income, life expectancy, and more for any country over the last ten years (from the World Bank).",
  icon: "chart",
  kind: "builtin",
  category: "Science & data",
  host: "api.worldbank.org",
  actions: [
    {
      id: "indicator", title: "Look up country data",
      inputs: [
        { name: "country", label: "Country", placeholder: "e.g. Kenya" },
        { name: "indicator", label: "Measure", type: "select", options: INDICATORS.map(([id, label]) => [id, label]) },
      ],
    },
  ],
  configured: () => true,
  async invoke(_a, input) {
    const name = need(input.country, "Country").toLowerCase();
    if (!countryCache) {
      const data = (await fetchJson("https://api.worldbank.org/v2/country?format=json&per_page=400")) as [unknown, { id: string; iso2Code: string; name: string; region: { value: string } }[]];
      countryCache = (data[1] ?? []).filter((c) => c.region.value !== "Aggregates").map((c) => ({ id: c.id, iso2: c.iso2Code, name: c.name }));
    }
    const c =
      countryCache.find((x) => x.name.toLowerCase() === name || x.id.toLowerCase() === name || x.iso2.toLowerCase() === name) ??
      countryCache.find((x) => x.name.toLowerCase().startsWith(name)) ??
      countryCache.find((x) => x.name.toLowerCase().includes(name));
    if (!c) throw new ConnectorError("not_found", `Couldn’t find a country called “${input.country}”.`);
    const ind = INDICATORS.find(([id]) => id === input.indicator) ?? INDICATORS[0];
    const data = (await fetchJson(`https://api.worldbank.org/v2/country/${c.id}/indicator/${ind[0]}?format=json&per_page=60`)) as [unknown, { date: string; value: number | null }[] | null];
    const rows = (data[1] ?? []).filter((r) => r.value !== null).slice(0, 10);
    if (!rows.length) throw new ConnectorError("not_found", `No ${ind[1].toLowerCase()} data for ${c.name}.`);
    return { render: "table", columns: ["Year", `${ind[1]} · ${c.name}`], rows: rows.map((r) => [r.date, ind[2](r.value!)]) };
  },
};

// —— Earthquakes (USGS) ——

export const quakes: Connector = {
  id: "quakes",
  name: "Earthquakes",
  description: "Recent earthquakes around the world, updated every minute (from the US Geological Survey).",
  icon: "activity",
  kind: "builtin",
  category: "Science & data",
  host: "earthquake.usgs.gov",
  actions: [
    {
      id: "recent", title: "Show recent earthquakes",
      inputs: [
        { name: "size", label: "Size", type: "select", options: [["4.5", "Magnitude 4.5 and up"], ["2.5", "Magnitude 2.5 and up"], ["significant", "Significant only"]] },
        { name: "period", label: "Period", type: "select", options: [["day", "Past day"], ["week", "Past week"], ["month", "Past month"]] },
      ],
    },
  ],
  configured: () => true,
  async invoke(_a, input) {
    const size = ["4.5", "2.5", "significant"].includes(input.size) ? input.size : "4.5";
    const period = ["day", "week", "month"].includes(input.period) ? input.period : "day";
    const data = (await fetchJson(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${size}_${period}.geojson`)) as { features: { properties: { mag: number; place: string; time: number } }[] };
    const list = (data.features ?? []).slice(0, 12);
    if (!list.length) throw new ConnectorError("not_found", "No earthquakes of that size in this period.");
    return {
      render: "table",
      columns: ["When (UTC)", "Magnitude", "Where"],
      rows: list.map(({ properties: p }) => [new Date(p.time).toISOString().slice(0, 16).replace("T", " "), fmt(p.mag, 1), p.place ?? ""]),
    };
  },
};

// —— Species (iNaturalist) ——

export const species: Connector = {
  id: "species",
  name: "Species finder",
  description: "Photo, scientific name, and sightings count for any plant or animal (from iNaturalist).",
  icon: "leaf",
  kind: "builtin",
  category: "Science & data",
  host: "api.inaturalist.org",
  actions: [{ id: "lookup", title: "Look up a species", inputs: [{ name: "name", label: "Plant or animal", placeholder: "e.g. monarch butterfly" }] }],
  configured: () => true,
  async invoke(_a, input) {
    const q = need(input.name, "Plant or animal");
    const data = await fetchJson(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&per_page=1&locale=en`);
    const t = pick(data, "results.0") as { id: number; name: string; rank: string; preferred_common_name?: string; observations_count: number; default_photo?: { medium_url?: string }; iconic_taxon_name?: string } | undefined;
    if (!t) throw new ConnectorError("not_found", `Nothing found for “${q}”.`);
    return {
      render: "card",
      title: t.preferred_common_name ? `${t.preferred_common_name[0].toUpperCase()}${t.preferred_common_name.slice(1)}` : t.name,
      text: `Scientific name: ${t.name} (${t.rank}). Group: ${t.iconic_taxon_name ?? "unknown"}. People have recorded it ${fmt(t.observations_count)} times on iNaturalist.`,
      image: t.default_photo?.medium_url?.startsWith("https://") ? t.default_photo.medium_url : undefined,
      url: `https://www.inaturalist.org/taxa/${t.id}`,
    };
  },
};

// —— Chemistry (PubChem) ——

export const chemistry: Connector = {
  id: "chemistry",
  name: "Chemistry",
  description: "Formula, molecular weight, and structure of a chemical compound (from PubChem).",
  icon: "flask",
  kind: "builtin",
  category: "Science & data",
  host: "pubchem.ncbi.nlm.nih.gov",
  actions: [{ id: "compound", title: "Look up a compound", inputs: [{ name: "name", label: "Compound", placeholder: "e.g. caffeine" }] }],
  configured: () => true,
  async invoke(_a, input) {
    const q = need(input.name, "Compound");
    const base = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}`;
    const data = await fetchJson(`${base}/property/MolecularFormula,MolecularWeight,IUPACName/JSON`);
    const p = pick(data, "PropertyTable.Properties.0") as { CID: number; MolecularFormula: string; MolecularWeight: string; IUPACName?: string } | undefined;
    if (!p) throw new ConnectorError("not_found", `No compound called “${q}”.`);
    return {
      render: "card",
      title: q[0].toUpperCase() + q.slice(1),
      text: `Formula ${p.MolecularFormula} · molecular weight ${p.MolecularWeight} g/mol${p.IUPACName ? ` · IUPAC name: ${p.IUPACName}` : ""}`,
      image: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${p.CID}/PNG`,
      url: `https://pubchem.ncbi.nlm.nih.gov/compound/${p.CID}`,
    };
  },
};

// —— Currency (Frankfurter, European Central Bank rates) ——

const CURRENCIES: [string, string][] = [["USD", "US dollar"], ["EUR", "Euro"], ["GBP", "British pound"], ["JPY", "Japanese yen"], ["CNY", "Chinese yuan"], ["INR", "Indian rupee"], ["CAD", "Canadian dollar"], ["AUD", "Australian dollar"], ["MXN", "Mexican peso"], ["BRL", "Brazilian real"], ["KRW", "South Korean won"], ["CHF", "Swiss franc"]];

export const currency: Connector = {
  id: "currency",
  name: "Currency converter",
  description: "Convert between currencies at today’s reference rate (European Central Bank, via Frankfurter).",
  icon: "coins",
  kind: "builtin",
  category: "Science & data",
  host: "api.frankfurter.dev",
  actions: [
    {
      id: "convert", title: "Convert",
      inputs: [
        { name: "amount", label: "Amount", placeholder: "e.g. 25" },
        { name: "from", label: "From", type: "select", options: CURRENCIES },
        { name: "to", label: "To", type: "select", options: [CURRENCIES[1], CURRENCIES[0], ...CURRENCIES.slice(2)] },
      ],
    },
  ],
  configured: () => true,
  async invoke(_a, input) {
    const amount = Number(need(input.amount, "Amount").replace(/[, ]/g, ""));
    if (!(amount > 0 && amount < 1e12)) throw new ConnectorError("bad_input", "Enter a positive number");
    const from = CURRENCIES.some(([c]) => c === input.from) ? input.from : "USD";
    const to = CURRENCIES.some(([c]) => c === input.to) ? input.to : "EUR";
    if (from === to) return { render: "text", text: `${fmt(amount, 2)} ${from} is ${fmt(amount, 2)} ${to}.` };
    const data = (await fetchJson(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`)) as { date: string; rates: Record<string, number> };
    const rate = data.rates?.[to];
    if (!rate) throw new ConnectorError("upstream", "No rate available for that pair today");
    return {
      render: "table", columns: ["", ""],
      rows: [[`${fmt(amount, 2)} ${from}`, `${fmt(amount * rate, 2)} ${to}`], ["Rate", `1 ${from} = ${fmt(rate, 4)} ${to}`], ["Rate date", data.date]],
    };
  },
};

// —— NASA Image Library ——

export const nasa: Connector = {
  id: "nasa",
  name: "NASA images",
  description: "Search more than 140,000 photos from NASA missions: planets, launches, Earth from space (from the NASA Image and Video Library).",
  icon: "star",
  kind: "builtin",
  category: "Media",
  host: "images-api.nasa.gov",
  actions: [{ id: "search", title: "Find space images", inputs: [{ name: "q", label: "Search", placeholder: "e.g. Jupiter, Apollo 11, hurricane" }] }],
  configured: () => true,
  async invoke(_a, input) {
    const q = need(input.q, "Search");
    const data = (await fetchJson(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image&page_size=12`)) as {
      collection: { items: { data: { nasa_id: string; title: string; center?: string; date_created?: string }[]; links?: { href: string; rel: string }[] }[] };
    };
    const items = (data.collection?.items ?? [])
      .map((it) => {
        const d = it.data?.[0];
        const thumb = it.links?.find((l) => l.rel === "preview")?.href ?? "";
        return d && { title: d.title, image: thumb, url: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`, credit: `NASA${d.center ? ` ${d.center}` : ""}${d.date_created ? ` · ${d.date_created.slice(0, 4)}` : ""}` };
      })
      .filter((x): x is NonNullable<typeof x> => !!x && x.image.startsWith("https://"))
      .slice(0, 12);
    if (!items.length) throw new ConnectorError("not_found", "No NASA images found. Try different words.");
    return { render: "gallery", items };
  },
};

// —— Open images (Openverse) ——

const openverseCache = new Map<string, { at: number; result: ToolResult }>();

export const openverse: Connector = {
  id: "openverse",
  name: "Open images",
  description: "Find openly licensed photos and illustrations you can reuse, with credit (from Openverse). It can be slow; results are cached.",
  icon: "image",
  kind: "builtin",
  category: "Media",
  host: "api.openverse.org",
  actions: [{ id: "search", title: "Find images", inputs: [{ name: "q", label: "Search", placeholder: "e.g. volcano" }] }],
  configured: () => true,
  async invoke(_a, input) {
    const q = need(input.q, "Search").toLowerCase().slice(0, 100);
    const hit = openverseCache.get(q);
    if (hit && Date.now() - hit.at < 30 * 60_000) return hit.result;
    let last: unknown;
    // Openverse is often slow and sometimes times out at its gateway: one patient retry.
    for (const timeoutMs of [15_000, 20_000]) {
      try {
        const data = (await fetchJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=12&mature=false`, { timeoutMs })) as {
          results: { title?: string; thumbnail?: string; foreign_landing_url?: string; creator?: string; license?: string }[];
        };
        const items = (data.results ?? [])
          .filter((r) => r.thumbnail?.startsWith("https://"))
          .map((r) => ({ title: r.title ?? "Image", image: r.thumbnail!, url: r.foreign_landing_url?.startsWith("https://") ? r.foreign_landing_url : undefined, credit: `${r.creator ?? "Unknown"} · CC ${String(r.license ?? "").toUpperCase()}` }));
        if (!items.length) throw new ConnectorError("not_found", "No images found. Try different words.");
        const result: ToolResult = { render: "gallery", items };
        openverseCache.set(q, { at: Date.now(), result });
        return result;
      } catch (e) {
        if (e instanceof ConnectorError && e.code === "not_found") throw e;
        last = e;
      }
    }
    throw last instanceof ConnectorError ? last : new ConnectorError("upstream", "Image search is slow right now. Try again in a moment.");
  },
};

// —— YouTube search (needs a key) ——

export const youtube: Connector = {
  id: "youtube",
  name: "YouTube search",
  description: "Search YouTube for videos, with Safe Search on. Needs a YouTube Data API key in LMS_YOUTUBE_API_KEY.",
  icon: "video",
  kind: "builtin",
  category: "Media",
  host: "www.googleapis.com",
  requiresEnv: ["LMS_YOUTUBE_API_KEY"],
  actions: [{ id: "search", title: "Find videos", inputs: [{ name: "q", label: "Search", placeholder: "e.g. how to open a talk" }] }],
  configured: () => !!process.env.LMS_YOUTUBE_API_KEY,
  async invoke(_a, input) {
    const key = process.env.LMS_YOUTUBE_API_KEY;
    if (!key) throw new ConnectorError("not_configured", "LMS_YOUTUBE_API_KEY isn’t set on the server");
    const q = need(input.q, "Search");
    const data = (await fetchJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&safeSearch=strict&maxResults=8&q=${encodeURIComponent(q)}&key=${key}`)) as { items: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string } } } }[] };
    const items = (data.items ?? []).map((v) => ({ title: v.snippet.title.replace(/&#39;/g, "’").replace(/&quot;/g, "“").replace(/&amp;/g, "&"), image: v.snippet.thumbnails.medium?.url ?? "", url: `https://www.youtube.com/watch?v=${v.id.videoId}`, credit: v.snippet.channelTitle }));
    if (!items.length) throw new ConnectorError("not_found", "No videos found. Try different words.");
    return { render: "gallery", items };
  },
};
