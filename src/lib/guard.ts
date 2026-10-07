import "server-only";
import { ipAddress } from "@vercel/functions";
import { kv } from "./kv";

export function clientIp(req: Request): string {
  return ipAddress(req) ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// Fixed-window counter in the shared cache. Not atomic, so a burst can overshoot
// slightly; the Vercel Firewall rate-limit rules are the hard edge limit.
async function take(key: string, limit: number, windowSec: number): Promise<boolean> {
  const k = `rl:${key}:${windowSec}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const used = Number((await kv.get(k)) ?? 0);
  if (used >= limit) return false;
  await kv.set(k, used + 1, { ttl: windowSec + 5 });
  return true;
}

export type Limit = { name: string; limit: number; windowSec: number };

// True when every limit still has room; consumes one unit from each.
export async function allow(subject: string, limits: Limit[]): Promise<boolean> {
  for (const l of limits) if (!(await take(`${l.name}:${subject}`, l.limit, l.windowSec))) return false;
  return true;
}

// Uncached analyses cost real money (search + 27 model calls). Per IP, and a global daily cap.
export const ANALYZE_LIMITS: Limit[] = [
  { name: "analyze-10m", limit: 6, windowSec: 600 },
  { name: "analyze-day", limit: 25, windowSec: 86_400 },
];
export const SEARCH_LIMITS: Limit[] = [{ name: "search-1m", limit: 60, windowSec: 60 }];
export const DAILY_ANALYZE_BUDGET = Number(process.env.MAX_DAILY_ANALYSES ?? 2000);
