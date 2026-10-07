import { SEARCH_LIMITS, allow, clientIp } from "@/lib/guard";
import { kv } from "@/lib/kv";
import { searchMarkets } from "@/lib/markets";
import { rememberMarkets } from "@/lib/pipeline";
import type { Market } from "@/lib/types";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 120) ?? "";
  if (q.length < 3) return Response.json({ markets: [] });
  if (!(await allow(clientIp(req), SEARCH_LIMITS))) return Response.json({ markets: [], error: "Slow down a little." }, { status: 429 });

  const key = `s:${q.toLowerCase().replace(/\s+/g, " ")}`;
  let markets = (await kv.get(key)) as Market[] | undefined;
  if (!markets) {
    markets = await searchMarkets(q);
    await Promise.all([kv.set(key, markets, { ttl: 300 }), rememberMarkets(markets)]);
  }
  return Response.json({ markets }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } });
}
