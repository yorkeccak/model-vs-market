import { subscribeBoard } from "@/lib/pipeline";

export const maxDuration = 120;

// Streams a live board run as NDJSON. Concurrent callers share one run.
export async function POST(req: Request) {
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = subscribeBoard((e) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
          if (e.t === "done") {
            unsubscribe();
            controller.close();
          }
        } catch {
          unsubscribe();
        }
      });
      req.signal.addEventListener("abort", () => unsubscribe());
    },
    cancel() {
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
