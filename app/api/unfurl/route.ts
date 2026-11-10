import { fetchHtml } from "@/lib/connectors/safety";
import { ConnectorError } from "@/lib/connectors/types";

// Link previews: title, description, image, and site name from a page's meta tags. Cached in memory.
const cache = new Map<string, { at: number; data: Record<string, string> }>();

function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function meta(html: string, keys: string[]) {
  for (const k of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decode(content);
  }
  return "";
}

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  if (!/^https:\/\//i.test(url)) return Response.json({ ok: false, error: "Only https links get previews" }, { status: 400 });
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return Response.json({ ok: true, ...hit.data });
  try {
    const { url: final, html } = await fetchHtml(url);
    const title = meta(html, ["og:title", "twitter:title"]) || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
    const description = meta(html, ["og:description", "twitter:description", "description"]);
    let image = meta(html, ["og:image", "og:image:url", "twitter:image"]);
    if (image) image = new URL(image, final).toString();
    const data = {
      title: title.slice(0, 200),
      description: description.slice(0, 300),
      image: image.startsWith("https://") ? image : "",
      site: meta(html, ["og:site_name"]) || new URL(final).hostname.replace(/^www\./, ""),
    };
    cache.set(url, { at: Date.now(), data });
    return Response.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof ConnectorError ? e.message : "Couldn’t preview that link";
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}
