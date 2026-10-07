import { refreshBoard } from "@/lib/pipeline";

export const maxDuration = 120;

// Vercel Cron calls this every 15 minutes with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authorised = secret ? req.headers.get("authorization") === `Bearer ${secret}` : process.env.NODE_ENV !== "production";
  if (!authorised) return new Response("Unauthorized", { status: 401 });
  const snapshot = await refreshBoard({ force: true });
  return Response.json({ ok: true, markets: snapshot?.rows.length ?? 0, at: snapshot?.at ?? null, sharedCache: Boolean(process.env.VERCEL) });
}
