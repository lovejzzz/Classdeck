// The AI services a teacher can connect for feedback (safe to use in the browser: names, strengths, where to get a key).

export type AiProvider = "anthropic" | "openai" | "gemini";

/** A short fact about a service, shown as a label: "good" (what it does well), "plain", or "note" (a caution). */
export type AiLabel = { text: string; tone: "good" | "plain" | "note" };

export const AI_PROVIDERS: { id: AiProvider; name: string; company: string; keyUrl: string; watchesVideo: boolean; labels: AiLabel[]; keyHint: string }[] = [
  {
    id: "gemini", name: "Gemini", company: "Google", keyUrl: "https://aistudio.google.com/app/apikey", watchesVideo: true,
    labels: [
      { text: "Analyzes video", tone: "good" }, { text: "Posture & gestures", tone: "good" }, { text: "Eye contact", tone: "good" },
      { text: "Pace & filler words", tone: "good" }, { text: "Writing", tone: "plain" }, { text: "≈ 4–11¢ per 3-min video", tone: "plain" },
      { text: "Use a paid key (free tier data trains Google)", tone: "note" },
    ],
    keyHint: "Starts with AIza",
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

/** What a teacher's AI setup looks like to the browser: never the key itself, only its last characters. */
export type AiSetup = { provider: AiProvider; model: string; keyTail: string };

export type AiModel = { id: string; name: string };
/** A model as the Settings list shows it: whether it can analyze video, and (the most used ones) what it's good for. */
export type RankedModel = AiModel & { video: boolean; note?: string };

const ver = (s: string) => s.split(/[.-]/).map(Number).reduce((n, x, i) => n + (Number.isFinite(x) ? x / 100 ** i : 0), 0);
const preview = (id: string) => /preview|exp|latest/.test(id);

/** The newest model of a family that people use: the newest stable release (a preview only when there's none yet). */
function newest(models: AiModel[], re: RegExp): AiModel | undefined {
  return models
    .map((m) => ({ m, v: re.exec(m.id)?.[1] }))
    .filter((x): x is { m: AiModel; v: string } => !!x.v)
    .sort((a, b) => Number(preview(a.m.id)) - Number(preview(b.m.id)) || ver(b.v) - ver(a.v))[0]?.m;
}

/**
 * The models to offer, most used first: the newest of each provider's main models, each with a word on what it's for;
 * then every other model (stable ones before previews). Gemini models analyze video; Claude and ChatGPT read only.
 */
export function rankModels(provider: AiProvider, models: AiModel[]): { top: RankedModel[]; more: RankedModel[] } {
  const video = provider === "gemini";
  const picks: [RegExp, string][] =
    provider === "gemini" ? [
      [/^gemini-(\d+(?:\.\d+)?)-flash(?:-preview[\w-]*)?$/, "Most used: fast and low-cost, good for most feedback"],
      [/^gemini-(\d+(?:\.\d+)?)-pro(?:-preview[\w-]*)?$/, "Most thorough; costs more"],
      [/^gemini-(\d+(?:\.\d+)?)-flash-lite(?:-preview[\w-]*)?$/, "Cheapest; shorter feedback"],
    ] : provider === "anthropic" ? [
      [/^claude-sonnet-(\d+(?:-\d+)?)(?:-\d{8})?$/, "Most used: careful and quick"],
      [/^claude-opus-(\d+(?:-\d+)?)(?:-\d{8})?$/, "Most capable; costs more"],
      [/^claude-haiku-(\d+(?:-\d+)?)(?:-\d{8})?$/, "Fastest and cheapest"],
    ] : [
      [/^gpt-(\d+(?:\.\d+)?)$/, "Most used: the main model"],
      [/^gpt-(\d+(?:\.\d+)?)-mini$/, "Faster and cheaper"],
    ];
  const top: RankedModel[] = [];
  for (const [re, note] of picks) {
    const m = newest(models, re);
    if (m && !top.some((x) => x.id === m.id)) top.push({ ...m, video, note });
  }
  const more = models.filter((m) => !top.some((x) => x.id === m.id))
    .sort((a, b) => Number(preview(a.id)) - Number(preview(b.id)))
    .map((m) => ({ ...m, video }));
  return { top, more };
}
