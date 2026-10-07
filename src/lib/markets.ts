import "server-only";
import type { Market } from "./types";

const GAMMA = "https://gamma-api.polymarket.com";
const KALSHI = "https://api.elections.kalshi.com";

// ---------- Polymarket ----------

type GammaMarket = {
  id: string;
  question: string;
  slug: string;
  endDate?: string;
  outcomes?: string;
  outcomePrices?: string;
  volume24hr?: number;
  volume?: string | number;
  icon?: string;
  image?: string;
  description?: string;
  closed?: boolean;
  gameStartTime?: string;
  sportsMarketType?: string;
  events?: { id: string; slug: string }[];
};

// Single-game sports/esports lines resolve in hours and have no news to read.
const SPORTS = /\bvs\.?\b|\bBO\d\b|game \d|map \d|o\/u|spread|handicap|total (goals|points|kills)|up or down|\b\d{1,2}(:\d\d)?\s?(am|pm)\b/i;

function fromGamma(m: GammaMarket, eventSlug?: string): Market | null {
  try {
    const outcomes = JSON.parse(m.outcomes ?? "[]");
    const prices = JSON.parse(m.outcomePrices ?? "[]").map(Number);
    if (outcomes[0] !== "Yes" || outcomes[1] !== "No" || !Number.isFinite(prices[0])) return null;
    return {
      id: `pm:${m.id}`,
      venue: "polymarket",
      question: m.question.trim(),
      price: prices[0],
      endDate: m.endDate ?? "",
      volume: Number(m.volume24hr ?? m.volume ?? 0),
      icon: m.icon || m.image || null,
      url: `https://polymarket.com/event/${eventSlug ?? m.events?.[0]?.slug ?? m.slug}`,
      rules: (m.description ?? "").slice(0, 700),
    };
  } catch {
    return null;
  }
}

export async function topMarkets(n: number): Promise<Market[]> {
  const res = await fetch(`${GAMMA}/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=400`, { signal: AbortSignal.timeout(10_000) });
  const raw: GammaMarket[] = await res.json();
  const now = Date.now();
  const seenEvents = new Set<string>();
  const out: Market[] = [];
  for (const m of raw) {
    if (m.closed || m.gameStartTime || m.sportsMarketType || SPORTS.test(m.question)) continue;
    const end = Date.parse(m.endDate ?? "");
    if (!(end > now + 36 * 3600e3 && end < now + 450 * 86400e3)) continue;
    const market = fromGamma(m);
    if (!market || market.price < 0.04 || market.price > 0.96) continue;
    const eventId = m.events?.[0]?.id ?? m.id;
    if (seenEvents.has(eventId)) continue;
    seenEvents.add(eventId);
    out.push(market);
    if (out.length === n) break;
  }
  return out;
}

async function searchPolymarket(q: string): Promise<Market[]> {
  const res = await fetch(`${GAMMA}/public-search?q=${encodeURIComponent(q)}&limit_per_type=8&events_status=active&keep_closed_markets=0`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) return [];
  const json: { events?: { slug: string; markets?: GammaMarket[] }[] } = await res.json();
  return (json.events ?? []).flatMap((e) => (e.markets ?? []).filter((m) => !m.closed).map((m) => fromGamma(m, e.slug)).filter((m): m is Market => !!m && m.price > 0.005 && m.price < 0.995));
}

// ---------- Kalshi ----------

type KalshiSeries = {
  series_ticker: string;
  event_ticker: string;
  event_title: string;
  event_subtitle?: string;
  total_volume?: number;
  markets?: {
    ticker: string;
    yes_subtitle?: string;
    last_price_dollars?: string;
    yes_bid_dollars?: string;
    yes_ask_dollars?: string;
    close_ts?: string;
    icon_url_dark_mode?: string;
    icon_url_light_mode?: string;
    volume?: number;
    result?: string;
  }[];
};

async function searchKalshi(q: string): Promise<Market[]> {
  // Kalshi's public site search; the trade API has no text search.
  const res = await fetch(`${KALSHI}/v1/search/series?query=${encodeURIComponent(q)}&order_by=querymatch&page_size=8`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) return [];
  const json: { current_page?: KalshiSeries[] } = await res.json();
  const out: Market[] = [];
  for (const s of json.current_page ?? []) {
    const markets = (s.markets ?? []).filter((m) => !m.result);
    for (const m of markets.slice(0, 4)) {
      const last = Number(m.last_price_dollars);
      const mid = (Number(m.yes_bid_dollars) + Number(m.yes_ask_dollars)) / 2;
      const price = Number.isFinite(last) && last > 0 ? last : mid;
      if (!Number.isFinite(price) || price <= 0.005 || price >= 0.995) continue;
      const title = s.event_title.trim();
      const outcome = m.yes_subtitle?.trim();
      const question = markets.length > 1 && outcome ? `${title.replace(/\?$/, "")}: ${outcome}?` : title;
      out.push({
        id: `ks:${m.ticker}`,
        venue: "kalshi",
        question,
        price,
        endDate: m.close_ts ?? "",
        volume: m.volume ?? s.total_volume ?? 0,
        icon: m.icon_url_dark_mode || m.icon_url_light_mode || null,
        url: `https://kalshi.com/markets/${s.series_ticker.toLowerCase()}`,
        rules: s.event_subtitle ?? "",
      });
    }
  }
  return out;
}

// Live markets from both venues for a free-text query, best matches first per venue.
export async function searchMarkets(q: string): Promise<Market[]> {
  // Skip intraday lines (15-minute crypto, "price today at 10am"): nothing to forecast.
  const horizon = Date.now() + 12 * 3600e3;
  const keep = (m: Market) => !m.endDate || Date.parse(m.endDate) > horizon;
  const [pm, ks] = await Promise.all([searchPolymarket(q).then((r) => r.filter(keep)).catch(() => []), searchKalshi(q).then((r) => r.filter(keep)).catch(() => [])]);
  const out: Market[] = [];
  for (let i = 0; i < Math.max(pm.length, ks.length) && out.length < 12; i++) {
    if (pm[i]) out.push(pm[i]);
    if (ks[i]) out.push(ks[i]);
  }
  return out;
}
