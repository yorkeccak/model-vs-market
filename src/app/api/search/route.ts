import { searchMarkets } from "@/lib/markets";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 120) ?? "";
  const markets = q.length < 3 ? [] : await searchMarkets(q);
  return Response.json({ markets }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
}
