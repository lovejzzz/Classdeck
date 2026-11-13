/** This site's public address for links we hand out (invite links, exports). Behind a tunnel or proxy the
 * request can look like plain http on a private address, so online it comes from PUBLIC_URL. */
export function publicOrigin(request: Request): string {
  const env = process.env.PUBLIC_URL?.replace(/\/+$/, "");
  return env || new URL(request.url).origin;
}
