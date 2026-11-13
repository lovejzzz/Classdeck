// Where uploaded files live: this computer's disk (development), or a Cloudflare R2 bucket (online).
// R2 is used when R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET are set.
// Either way a file's address is /api/upload/<name>; online, that address redirects to a short-lived R2 link.
import { AwsClient } from "aws4fetch";

const env = process.env;

export const r2Ready = () => !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);

let client: AwsClient | null = null;
function r2() {
  client ??= new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, service: "s3", region: "auto" });
  return client;
}

/** Files sit under uploads/ in the bucket, so database backups can share it. */
// R2_ENDPOINT is only for testing against a stand-in server; normally it's worked out from the account id.
const objectUrl = (name: string) => `${env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`}/${env.R2_BUCKET}/uploads/${name}`;

/** A link the browser can PUT the file to, good for 15 minutes. The content type is part of the signature. */
export async function presignPut(name: string, type: string): Promise<string> {
  const url = new URL(objectUrl(name));
  url.searchParams.set("X-Amz-Expires", "900");
  const signed = await r2().sign(new Request(url, { method: "PUT", headers: { "Content-Type": type } }), { aws: { signQuery: true, allHeaders: true } });
  return signed.url;
}

/** A link to read the file, good for an hour. */
export async function presignGet(name: string): Promise<string> {
  const url = new URL(objectUrl(name));
  url.searchParams.set("X-Amz-Expires", "3600");
  const signed = await r2().sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } });
  return signed.url;
}

/** The stored file's size in bytes, or null if it isn't there. */
export async function sizeOf(name: string): Promise<number | null> {
  const r = await r2().fetch(objectUrl(name), { method: "HEAD" });
  if (!r.ok) return null;
  return Number(r.headers.get("content-length") ?? 0);
}

export async function remove(name: string): Promise<void> {
  await r2().fetch(objectUrl(name), { method: "DELETE" });
}
