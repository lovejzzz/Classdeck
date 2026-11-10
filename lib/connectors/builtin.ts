import type { Manifest } from "./types";

// 内置的声明式连接器。每一个都只是一段配置，没有专门的代码。
// 想接一个新的 API，照着这里加一段就行（或者在“连接器”页面上粘贴同样格式的 JSON）。

export const BUILTIN_MANIFESTS: Manifest[] = [
  {
    id: "wikipedia",
    name: "Wikipedia",
    description: "Get the summary of an article.",
    icon: "📖",
    baseUrl: "https://en.wikipedia.org/api/rest_v1",
    actions: [
      {
        id: "summary",
        title: "Look it up",
        inputs: [{ name: "title", label: "Topic", placeholder: "e.g. Water cycle" }],
        path: "/page/summary/{title}",
        output: {
          render: "card",
          map: { title: "title", text: "extract", image: "thumbnail.source", url: "content_urls.desktop.page" },
        },
      },
    ],
  },
  {
    id: "dictionary",
    name: "Dictionary",
    description: "Define an English word (from Wiktionary).",
    icon: "🔤",
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
];
