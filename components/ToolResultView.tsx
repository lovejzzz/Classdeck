import type { ToolResult } from "@/lib/connectors/types";
import { Icon } from "./Icon";

export function ToolResultView({ result }: { result: ToolResult }) {
  if (result.render === "card") {
    return (
      <div className="flex gap-3">
        {result.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.image} alt="" className="h-16 w-16 flex-none rounded-lg border border-line object-cover" />
        )}
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium">{result.title}</div>
          <p className="mt-1 line-clamp-6 text-[13px] leading-relaxed text-ink-2">{result.text}</p>
          {result.url && (
            <a href={result.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
              Open source <Icon name="external" size={12} />
            </a>
          )}
        </div>
      </div>
    );
  }
  if (result.render === "list" && result.items.every((it) => !it.text)) {
    // Bare words (synonyms, rhymes): a row of chips is easier to scan than a list.
    return (
      <div className="flex flex-wrap gap-1.5">
        {result.items.map((it, i) => (
          <span key={i} className="pop rounded-full border border-line bg-white px-2.5 py-1 text-[13px]" style={{ "--i": i } as React.CSSProperties}>{it.title}</span>
        ))}
      </div>
    );
  }
  if (result.render === "gallery") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {result.items.map((it, i) => (
          <a key={i} href={it.url ?? it.image} target="_blank" rel="noreferrer" className="pop group block overflow-hidden rounded-lg border border-line bg-white" style={{ "--i": i } as React.CSSProperties} title={it.title}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.image} alt={it.title} loading="lazy" className="aspect-[4/3] w-full bg-lane object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
            <span className="block truncate px-2 pt-1.5 text-[12px]">{it.title || "Untitled"}</span>
            <span className="block truncate px-2 pb-1.5 text-[11px] text-ink-3">{it.credit ?? "\u00a0"}</span>
          </a>
        ))}
      </div>
    );
  }
  if (result.render === "list") {
    return (
      <ul className="space-y-2">
        {result.items.map((it, i) => (
          <li key={i} className="text-[13px] leading-relaxed">
            <span className="chip mr-1.5 h-5 text-[11px]">{it.title}</span>
            <span className="text-ink-2">{it.text}</span>
            {it.url && <a href={it.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex translate-y-[2px] text-ink-3 hover:text-ink" aria-label="Open"><Icon name="external" size={12} /></a>}
          </li>
        ))}
      </ul>
    );
  }
  if (result.render === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {result.columns.map((c) => (
                <th key={c} className="border-b border-line px-1.5 py-1.5 text-left text-[12px] font-normal text-ink-3">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className={`border-b border-line/60 px-1.5 py-1.5 align-top ${j === 0 ? "text-ink-2" : "text-ink"}`}>
                    {/^https:\/\/\S+$/.test(cell) ? (
                      <a href={cell} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink">Open <Icon name="external" size={11} /></a>
                    ) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (result.render === "text") return <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{result.text}</p>;
  return null;
}
