import { runAnalyze } from "@/lib/pipeline";
import type { AnalyzeEvent, Market } from "@/lib/types";

export const maxDuration = 60;

function asMarket(v: unknown): Market | undefined {
  const m = v as Partial<Market> | null;
  if (!m || typeof m.id !== "string" || typeof m.question !== "string" || typeof m.price !== "number") return undefined;
  return {
    id: m.id.slice(0, 80),
    venue: m.venue === "kalshi" ? "kalshi" : "polymarket",
    question: m.question.slice(0, 300),
    price: Math.max(0, Math.min(1, m.price)),
    endDate: typeof m.endDate === "string" ? m.endDate : "",
    volume: typeof m.volume === "number" ? m.volume : 0,
    icon: typeof m.icon === "string" ? m.icon : null,
    url: typeof m.url === "string" && /^https:\/\/(polymarket|kalshi)\.com\//.test(m.url) ? m.url : "",
    rules: typeof m.rules === "string" ? m.rules.slice(0, 700) : "",
  };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { market?: unknown; question?: unknown };
  const input = { market: asMarket(body.market), question: typeof body.question === "string" ? body.question.slice(0, 300) : undefined };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AnalyzeEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {}
      };
      try {
        await runAnalyze(input, emit);
      } catch (err) {
        emit({ t: "error", message: (err as Error).message });
        emit({ t: "done" });
      }
      try {
        controller.close();
      } catch {}
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
