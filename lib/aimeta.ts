// The AI services a teacher can connect for feedback (safe to use in the browser: names, strengths, where to get a key).

export type AiProvider = "anthropic" | "openai" | "gemini";

/** A short fact about a service, shown as a label: "good" (what it does well), "plain", or "note" (a caution). */
export type AiLabel = { text: string; tone: "good" | "plain" | "note" };

export const AI_PROVIDERS: { id: AiProvider; name: string; company: string; keyUrl: string; watchesVideo: boolean; labels: AiLabel[]; keyHint: string; keyNote?: string }[] = [
  {
    id: "gemini", name: "Gemini", company: "Google", keyUrl: "https://aistudio.google.com/app/apikey", watchesVideo: true,
    labels: [
      { text: "Analyzes video", tone: "good" }, { text: "Posture & gestures", tone: "good" }, { text: "Eye contact", tone: "good" },
      { text: "Pace & filler words", tone: "good" }, { text: "Writing", tone: "plain" },
    ],
    keyHint: "Starts with AIza",
    keyNote: "For a class, turn on billing: free keys stop after ~20 feedbacks a day, and Google may use what they’re sent.",
  },
  {
    id: "anthropic", name: "Claude", company: "Anthropic", keyUrl: "https://console.anthropic.com/settings/keys", watchesVideo: false,
    labels: [
      { text: "Most specific feedback", tone: "good" }, { text: "Writing", tone: "good" }, { text: "Recording transcripts", tone: "good" },
      { text: "Structure & argument", tone: "good" }, { text: "Can’t analyze video", tone: "note" },
    ],
    keyHint: "Starts with sk-ant-",
  },
  {
    id: "openai", name: "ChatGPT", company: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", watchesVideo: false,
    labels: [
      { text: "Fast", tone: "good" }, { text: "Low cost", tone: "good" }, { text: "Writing", tone: "good" },
      { text: "Recording transcripts", tone: "good" }, { text: "Friendly coaching voice", tone: "plain" }, { text: "Can’t analyze video", tone: "note" },
    ],
    keyHint: "Starts with sk-",
  },
];

export const providerMeta = (p: AiProvider) => AI_PROVIDERS.find((x) => x.id === p)!;
export const isProvider = (p: unknown): p is AiProvider => AI_PROVIDERS.some((x) => x.id === p);

/** Whether a saved key works: ready (it answered), no credit left, not accepted, or another problem. */
export type AiStatus = { state: "ready" | "no_credit" | "bad_key" | "error"; at: number; message?: string };

/** What a teacher's AI setup looks like to the browser: never a key itself, only its last characters. */
export type AiSetup = { active: AiProvider | null; providers: Partial<Record<AiProvider, { keyTail: string; model?: string; status?: AiStatus }>> };

/** A model as the service lists it: its id and name, and (when the service says) a description and release date. */
export type AiModel = {
  id: string; name: string; description?: string; created?: number;
  /** From the live catalog (lib/catalog.ts): US dollars per million tokens in and out, and whether it takes video. */
  price?: { in: number; out: number }; video?: boolean;
};
/** A model as the Settings list shows it: whether it can analyze video, its note, and (the picks) why it's suggested. */
export type RankedModel = AiModel & { video: boolean; note?: string; role?: "Recommended" | "Most thorough" | "Lowest cost" };

const ver = (s: string) => s.split(/[.-]/).map(Number).reduce((n, x, i) => n + (Number.isFinite(x) ? x / 100 ** i : 0), 0);
const preview = (id: string) => /preview|exp|latest/.test(id);

/** The newest model of a family that people use: the newest stable release (a preview only when there's none yet). */
function newest(models: AiModel[], re: RegExp): AiModel | undefined {
  return models
    .map((m) => ({ m, v: re.exec(m.id)?.[1] }))
    .filter((x): x is { m: AiModel; v: string } => !!x.v)
    .sort((a, b) => Number(preview(a.m.id)) - Number(preview(b.m.id)) || ver(b.v) - ver(a.v))[0]?.m;
}

/** What a model family is for, when the service doesn't describe its models itself (any version of the family). */
const FAMILY: Record<AiProvider, [RegExp, string][]> = {
  gemini: [[/flash-lite/, "Cheapest; shorter feedback"], [/flash/, "Fast and low-cost, good for most feedback"], [/pro/, "Most thorough; costs more"]],
  anthropic: [[/sonnet/, "Careful and quick, good for most feedback"], [/opus/, "Most capable; costs more"], [/haiku/, "Fastest and cheapest"], [/fable/, "Newest family; most capable"]],
  openai: [[/-nano/, "Cheapest"], [/-mini/, "Faster and cheaper"], [/^o\d/, "Thinks longer before answering; slower"], [/^gpt-\d/, "The main model"]],
};
const MONTH = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric" });

/** A model's note: the service's own description (Gemini lists one for each model), or what its family is for; and when it came out. */
export function noteOf(provider: AiProvider, m: AiModel): string | undefined {
  const own = m.description?.replace(/\s+/g, " ").trim().split(/(?<=\.)\s/)[0]?.replace(/\.$/, "");
  const fam = FAMILY[provider].find(([re]) => re.test(m.id))?.[1];
  // A description that only repeats the model's name says nothing.
  const useful = own && own.length > 12 && own.toLowerCase() !== m.name.toLowerCase() && own.toLowerCase() !== m.id.toLowerCase();
  const text = useful ? (own.length > 120 ? `${own.slice(0, 117)}…` : own) : fam;
  return [text, m.created ? `released ${MONTH(m.created)}` : ""].filter(Boolean).join(" · ") || undefined;
}

const DAY = 864e5;
/** About what one piece of feedback costs: a 3-minute video watched (≈18k tokens in) or a piece of writing read. */
function costOf(m: AiModel, video: boolean): string | undefined {
  if (!m.price || (!m.price.in && !m.price.out)) return undefined;
  const usd = video ? (18000 * m.price.in + 3000 * m.price.out) / 1e6 : (2500 * m.price.in + 1500 * m.price.out) / 1e6;
  const cents = usd * 100;
  const amount = cents < 1 ? "under 1¢" : `≈${cents < 10 ? Math.round(cents * 2) / 2 : Math.round(cents)}¢`;
  return `${amount} ${video ? "a 3-min video" : "a piece of writing"}`;
}
/** The first sentence of a description, without the model's own name in front ("Gemini 4 Hydrogen is the …"). */
function blurb(m: AiModel): string | undefined {
  const first = m.description?.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim().split(/(?<=\.)\s/)[0]?.replace(/\.$/, "");
  if (!first || first.length < 12 || first.toLowerCase() === m.name.toLowerCase()) return undefined;
  // "Gemini 4 Hydrogen is the high-efficiency workhorse …" → "The high-efficiency workhorse …"
  const cut = first.replace(/^[A-Z][\w.\- ]{2,40}?\s+(is|are)\s+(?=(an?|the|\w+['’]s)\s)/, "");
  // Its first clause: what it is. What it's "built for" (coding, agents…) is for developers, not teachers.
  const clause = cut.split(/,\s/)[0].length >= 20 ? cut.split(/,\s/)[0] : cut;
  const text = clause.charAt(0).toUpperCase() + clause.slice(1);
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

/**
 * The models to offer. With the live catalog: from the models released in the last five months, a recommended one
 * (the maker's everyday workhorse), the most thorough (its flagship) and the lowest cost; then every other model,
 * newest first. Each note says what it is, when it came out, and about what a piece of feedback costs. Without the
 * catalog (offline), the newest release of each main family, as before.
 */
export function rankModels(provider: AiProvider, models: AiModel[]): { top: RankedModel[]; more: RankedModel[] } {
  const videoOf = (m: AiModel) => m.video ?? provider === "gemini";
  const ranked = (m: AiModel, role?: RankedModel["role"]): RankedModel => {
    const video = videoOf(m);
    const note = m.price ? [blurb(m), m.created ? MONTH(m.created) : "", costOf(m, video)].filter(Boolean).join(" · ") : noteOf(provider, m);
    return { ...m, video, note, role };
  };
  const live = models.filter((m) => m.price && m.created && !preview(m.id) && !/tts|image|transcribe|robotics|computer|embedding|audio|live|customtools/.test(m.id));
  if (live.length) {
    const newestAt = Math.max(...live.map((m) => m.created!));
    const recent = live.filter((m) => newestAt - m.created! <= 150 * DAY).sort((a, b) => b.created! - a.created!);
    // The maker's own words, strongest first: its "workhorse" before a model merely "mid-priced".
    const said = (words: string[]) => words.flatMap((w) => recent.filter((m) => new RegExp(`\\b${w}\\b`, "i").test(m.description ?? "")));
    const byPrice = [...recent].sort((a, b) => a.price!.in - b.price!.in);
    const recommended = said(["workhorse", "everyday", "balanced", "versatile", "mid-tier", "mid-priced"])[0] ?? byPrice[Math.floor((byPrice.length - 1) / 2)];
    // The most thorough: of those its maker calls its best, the one that costs most ("most intelligent Flash" isn't the top).
    const best = said(["most capable", "most intelligent", "flagship", "frontier"]).filter((m) => m !== recommended);
    const thorough = [...best].sort((a, b) => b.price!.in - a.price!.in || best.indexOf(a) - best.indexOf(b))[0] ?? [...byPrice].reverse().find((m) => m !== recommended);
    const cheapest = byPrice.find((m) => m !== recommended && m !== thorough && m.price!.in < (recommended?.price?.in ?? Infinity));
    const picks: [AiModel | undefined, RankedModel["role"]][] = [[recommended, "Recommended"], [thorough, "Most thorough"], [cheapest, "Lowest cost"]];
    const top = picks.flatMap(([m, role]) => (m ? [ranked(m, role)] : []));
    const more = models.filter((m) => !top.some((x) => x.id === m.id))
      .sort((a, b) => Number(preview(a.id)) - Number(preview(b.id)) || (b.created ?? 0) - (a.created ?? 0))
      .map((m) => ranked(m));
    return { top, more };
  }
  return familyRank(provider, models, ranked);
}

/** Offline: the newest stable release of each provider's main model families first. */
function familyRank(provider: AiProvider, models: AiModel[], ranked: (m: AiModel) => RankedModel): { top: RankedModel[]; more: RankedModel[] } {
  const picks: RegExp[] =
    provider === "gemini" ? [/^gemini-(\d+(?:\.\d+)?)-flash(?:-preview[\w-]*)?$/, /^gemini-(\d+(?:\.\d+)?)-pro(?:-preview[\w-]*)?$/, /^gemini-(\d+(?:\.\d+)?)-flash-lite(?:-preview[\w-]*)?$/]
    : provider === "anthropic" ? [/^claude-sonnet-(\d+(?:-\d+)?)(?:-\d{8})?$/, /^claude-opus-(\d+(?:-\d+)?)(?:-\d{8})?$/, /^claude-haiku-(\d+(?:-\d+)?)(?:-\d{8})?$/]
    : [/^gpt-(\d+(?:\.\d+)?)$/, /^gpt-(\d+(?:\.\d+)?)-mini$/];
  const top: RankedModel[] = [];
  for (const re of picks) {
    const m = newest(models, re);
    if (m && !top.some((x) => x.id === m.id)) top.push(ranked(m));
  }
  const more = models.filter((m) => !top.some((x) => x.id === m.id))
    .sort((a, b) => Number(preview(a.id)) - Number(preview(b.id)) || (b.created ?? 0) - (a.created ?? 0))
    .map(ranked);
  return { top, more };
}
