// The AI services a teacher can connect for feedback (safe to use in the browser: names, strengths, where to get a key).

export type AiProvider = "anthropic" | "openai" | "gemini";

export const AI_PROVIDERS: { id: AiProvider; name: string; company: string; keyUrl: string; watchesVideo: boolean; strengths: string; keyHint: string }[] = [
  {
    id: "gemini", name: "Gemini", company: "Google", keyUrl: "https://aistudio.google.com/app/apikey", watchesVideo: true,
    strengths: "The only one that watches a student’s video itself, picture and sound together: posture, gestures, eye contact and expression, as well as pace and filler words. About 4–11 cents for a 3-minute video. Use a paid key: Google uses free-tier data to improve its products.",
    keyHint: "Starts with AIza",
  },
  {
    id: "anthropic", name: "Claude", company: "Anthropic", keyUrl: "https://console.anthropic.com/settings/keys", watchesVideo: false,
    strengths: "The most careful, specific feedback on writing and on what a student said (from the transcript of their recording): structure, argument, word choice, and what to try next. It can’t watch video.",
    keyHint: "Starts with sk-ant-",
  },
  {
    id: "openai", name: "ChatGPT", company: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", watchesVideo: false,
    strengths: "Fast, low-cost feedback on writing and on transcripts of recordings, in a friendly coaching voice. It can’t watch video through its API.",
    keyHint: "Starts with sk-",
  },
];

export const providerMeta = (p: AiProvider) => AI_PROVIDERS.find((x) => x.id === p)!;
export const isProvider = (p: unknown): p is AiProvider => AI_PROVIDERS.some((x) => x.id === p);

/** What a teacher's AI setup looks like to the browser: never the key itself, only its last characters. */
export type AiSetup = { provider: AiProvider; model: string; keyTail: string };
