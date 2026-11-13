/** This site's public address for links we hand out (invite links, exports). Behind a tunnel or proxy the
 * request can look like plain http on a private address, so online it comes from PUBLIC_URL. */
export function publicOrigin(request: Request): string {
  const env = process.env.PUBLIC_URL?.replace(/\/+$/, "");
  return env || new URL(request.url).origin;
}

/** The visitor's IP address, for rate limits. Behind Cloudflare it's CF-Connecting-IP, which visitors can't fake. */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
