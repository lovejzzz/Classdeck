import { currentVersion, subscribe } from "@/lib/bus";

/** Server-sent events: pushes a "change" message whenever course data is saved. */
export async function GET(request: Request) {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(enc.encode(text));
        } catch {
          cleanup();
        }
      };
      send(`retry: 3000\nevent: hello\ndata: ${currentVersion()}\n\n`);
      const off = subscribe((v) => send(`event: change\ndata: ${v}\n\n`));
      const ping = setInterval(() => send(`: ping\n\n`), 25000);
      cleanup = () => {
        off();
        clearInterval(ping);
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
