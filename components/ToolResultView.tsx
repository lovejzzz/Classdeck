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
  if (result.render === "list") {
    return (
      <ul className="space-y-2">
        {result.items.map((it, i) => (
          <li key={i} className="text-[13px] leading-relaxed">
            <span className="chip mr-1.5 h-5 text-[11px]">{it.title}</span>
            <span className="text-ink-2">{it.text}</span>
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
                  <td key={j} className={`border-b border-line/60 px-1.5 py-1.5 ${j === 0 ? "text-ink-2" : "text-ink"}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{result.text}</p>;
}
