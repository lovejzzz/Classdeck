import type { Manifest } from "./types";

// 内置的声明式连接器。每一个都只是一段配置，没有专门的代码。
// 想接一个新的 API，照着这里加一段就行（或者在“连接器”页面上粘贴同样格式的 JSON）。

export const BUILTIN_MANIFESTS: Manifest[] = [
  {
    id: "wikipedia",
    name: "Wikipedia",
    description: "Search articles and read a short summary of a topic.",
    icon: "📖",
    category: "Research",
    baseUrl: "https://en.wikipedia.org",
    actions: [
      {
        id: "summary",
        title: "Look it up",
        inputs: [{ name: "title", label: "Topic", placeholder: "e.g. Water cycle" }],
        path: "/api/rest_v1/page/summary/{title}",
        output: {
          render: "card",
          map: { title: "title", text: "extract", image: "thumbnail.source", url: "content_urls.desktop.page" },
        },
      },
      {
        id: "search",
        title: "Search articles",
        inputs: [{ name: "q", label: "Search", placeholder: "e.g. persuasive speech" }],
        path: "/w/rest.php/v1/search/page",
        query: { q: "{q}", limit: "6" },
        output: { render: "list", items: "pages", limit: 6, map: { title: "title", text: "description" } },
      },
    ],
  },
  {
    id: "dictionary",
    name: "Dictionary",
    description: "Define an English word (from Wiktionary).",
    icon: "🔤",
    category: "Language & writing",
    baseUrl: "https://en.wiktionary.org/api/rest_v1",
    actions: [
      {
        id: "define",
        title: "Define a word",
        inputs: [{ name: "word", label: "Word", placeholder: "e.g. evaporation" }],
        path: "/page/definition/{word}",
        output: { render: "list", items: "en", limit: 4, map: { title: "partOfSpeech", text: "definitions.0.definition" } },
      },
    ],
  },
  {
    id: "openlibrary",
    name: "Open Library",
    description: "Search for books by keyword.",
    icon: "📚",
    category: "Research",
    baseUrl: "https://openlibrary.org",
    actions: [
      {
        id: "search",
        title: "Search books",
        inputs: [{ name: "q", label: "Keywords", placeholder: "e.g. weather" }],
        path: "/search.json",
        query: { q: "{q}", limit: "6", fields: "title,author_name,first_publish_year" },
        output: {
          render: "table",
          rows: "docs",
          columns: [
            { label: "Title", path: "title" },
            { label: "Author", path: "author_name.0" },
            { label: "First published", path: "first_publish_year" },
          ],
        },
      },
    ],
  },
  {
    id: "translate",
    name: "Translate",
    description: "Translate a sentence or short paragraph (from MyMemory).",
    icon: "translate",
    category: "Language & writing",
    baseUrl: "https://api.mymemory.translated.net",
    actions: [
      {
        id: "text",
        title: "Translate",
        inputs: [
          { name: "text", label: "Text", type: "textarea", placeholder: "What do you want to translate?" },
          { name: "from", label: "From", type: "select", options: [["en", "English"], ["es", "Spanish"], ["zh-CN", "Chinese (Simplified)"], ["fr", "French"], ["de", "German"], ["ar", "Arabic"], ["pt", "Portuguese"], ["ja", "Japanese"], ["ko", "Korean"], ["hi", "Hindi"], ["ru", "Russian"], ["vi", "Vietnamese"]] },
          { name: "to", label: "To", type: "select", options: [["es", "Spanish"], ["en", "English"], ["zh-CN", "Chinese (Simplified)"], ["fr", "French"], ["de", "German"], ["ar", "Arabic"], ["pt", "Portuguese"], ["ja", "Japanese"], ["ko", "Korean"], ["hi", "Hindi"], ["ru", "Russian"], ["vi", "Vietnamese"]] },
        ],
        path: "/get",
        query: { q: "{text}", langpair: "{from}|{to}" },
        output: { render: "text", path: "responseData.translatedText" },
      },
    ],
  },
  {
    id: "openalex",
    name: "Research papers",
    description: "Search 250 million scholarly works: title, year, and how often each is cited (from OpenAlex).",
    icon: "graduation",
    category: "Research",
    baseUrl: "https://api.openalex.org",
    actions: [
      {
        id: "search",
        title: "Find papers",
        inputs: [{ name: "q", label: "Topic", placeholder: "e.g. public speaking anxiety" }],
        path: "/works",
        query: { search: "{q}", "per-page": "8", select: "display_name,publication_year,cited_by_count,doi" },
        output: {
          render: "table",
          rows: "results",
          columns: [
            { label: "Title", path: "display_name" },
            { label: "Year", path: "publication_year" },
            { label: "Cited by", path: "cited_by_count" },
            { label: "Link", path: "doi" },
          ],
        },
      },
    ],
  },
];
