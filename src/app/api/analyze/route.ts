import { ANALYZE_LIMITS, DAILY_ANALYZE_BUDGET, allow, clientIp } from "@/lib/guard";
import { analyzeKey, cachedAnalysis, resolveMarket, runAnalyze, storeAnalysis } from "@/lib/pipeline";
import type { AnalyzeEvent } from "@/lib/types";

export const maxDuration = 60;

// Identical concurrent requests on one instance share a single paid run.
const inflight = new Map<string, Promise<AnalyzeEvent[]>>();

const encoder = new TextEncoder();
const line = (e: AnalyzeEvent) => encoder.encode(JSON.stringify(e) + "\n");
const ndjson = (body: BodyInit, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });

function replay(events: AnalyzeEvent[], status = 200) {
  return ndjson(new Blob(events.map((e) => JSON.stringify(e) + "\n")), status);
}

const fail = (message: string, status: number) => replay([{ t: "error", message }, { t: "done" }], status);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { marketId?: unknown; question?: unknown };
  const marketId = typeof body.marketId === "string" && /^(pm|ks):[\w.-]{1,80}$/.test(body.marketId) ? body.marketId : undefined;
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 300) : undefined;
  if (!marketId && (!question || question.length < 8)) return fail("Ask a longer question.", 400);

  const key = analyzeKey({ marketId, question });
  const cached = await cachedAnalysis(key);
  if (cached) return replay(cached);
  const pending = inflight.get(key);
  if (pending) return replay(await pending);

  const market = marketId ? await resolveMarket(marketId) : undefined;
  if (marketId && !market) return fail("That market isn't available any more. Pick one from the board or search again.", 404);

  // Only uncached runs cost money, so only they count against the limits.
  if (!(await allow(clientIp(req), ANALYZE_LIMITS)))
    return fail("You've asked a lot of new questions. Give it a few minutes, or open any market on the board (those are instant).", 429);
  if (!(await allow("global", [{ name: "analyze-budget", limit: DAILY_ANALYZE_BUDGET, windowSec: 86_400 }])))
    return fail("We've hit today's limit for new questions. Markets on the board still work.", 503);

  const events: AnalyzeEvent[] = [];
  let finish: (e: AnalyzeEvent[]) => void = () => {};
  inflight.set(key, new Promise((r) => (finish = r)));

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AnalyzeEvent) => {
        events.push(e);
        try {
          controller.enqueue(line(e));
        } catch {}
      };
      try {
        await runAnalyze({ market: market ?? undefined, question }, emit);
        // A single model refusing or erroring still leaves a useful replay; cache it briefly
        // so a transient provider blip doesn't stick. Runs that failed outright aren't cached.
        const modelErrors = events.some((e) => e.t === "error" && e.model);
        const fatal = events.some((e) => e.t === "error" && !e.model);
        if (!fatal) await storeAnalysis(key, events, modelErrors ? 180 : 1800);
      } catch (err) {
        emit({ t: "error", message: (err as Error).message });
        emit({ t: "done" });
      } finally {
        inflight.delete(key);
        finish(events);
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return ndjson(stream);
}
