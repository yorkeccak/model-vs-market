import "server-only";
import type { Market, Source } from "./types";

const MAX_SOURCES = 8;
const CHARS_PER_SOURCE = 1400;

// Sites whose whole point is the market price. Feeding them in makes the models
// echo the crowd (tested: "market prices 30%" in context -> model answers 0.30).
const MARKET_SITES = ["polymarket.com", "kalshi.com", "manifold.markets", "metaculus.com", "predictit.org", "octagonai.co", "oddschecker.com", "betfair.com", "lines.com", "covers.com", "actionnetwork.com", "oddsshark.com", "sportsbookreview.com", "vegasinsider.com"];
const MARKET_TITLE = /polymarket|kalshi|odds|betting|bettors|prediction market|implied probabilit|forecast(ing)? market|wager|fedwatch|market-implied|futures (imply|pricing|price in)/i;
const ODDS_SENTENCE = /polymarket|kalshi|manifold|metaculus|predictit|fedwatch|futures (markets? )?(imply|price|pricing|see)|odds|bettors?|betting|prediction markets?|traders (price|see|give|put)|implied (probability|chance)|\d+(\.\d+)?\s?(%|percent|per cent)\s+(chance|probability|likelihood)|(chance|probability|likelihood) of \d+(\.\d+)?\s?(%|percent)/i;

function clean(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>|`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scrub(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !ODDS_SENTENCE.test(s))
    .join(" ");
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "valyu";
  }
}

type ValyuResult = { title?: string; url?: string; content?: unknown; publication_date?: string };

export async function gatherEvidence(question: string): Promise<Source[]> {
  const since = new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10);
  const res = await fetch("https://api.valyu.ai/v1/search", {
    method: "POST",
    headers: { "x-api-key": process.env.VALYU_API_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({
      query: question.replace(/\?$/, ""),
      search_type: "news",
      max_num_results: 12,
      start_date: since,
      fast_mode: true,
      excluded_sources: MARKET_SITES,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Valyu search failed (HTTP ${res.status})`);
  const json: { results?: ValyuResult[] } = await res.json();

  const seen = new Set<string>();
  const out: Source[] = [];
  for (const r of json.results ?? []) {
    const url = r.url ?? "";
    const title = clean(r.title ?? "").slice(0, 160);
    const domain = domainOf(url);
    if (!title || MARKET_SITES.some((d) => domain.endsWith(d)) || /(^|\.)(bet|odds)|sportsbook/.test(domain) || MARKET_TITLE.test(title)) continue;
    const key = title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = typeof r.content === "string" ? r.content : JSON.stringify(r.content ?? "");
    const text = scrub(clean(raw)).slice(0, CHARS_PER_SOURCE);
    if (text.length < 120) continue;
    out.push({ title, url, domain, date: r.publication_date?.slice(0, 10) ?? null, text });
    if (out.length === MAX_SOURCES) break;
  }
  // Oldest first, so replaying the evidence reads like the news unfolding.
  return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

export function buildState(question: string, market: Pick<Market, "endDate" | "rules"> | null, sources: Source[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [`Today: ${today}`, `Question: ${question}`];
  if (market?.endDate) {
    const days = Math.max(0, Math.round((Date.parse(market.endDate) - Date.now()) / 86400e3));
    lines.push(`Resolution date: ${market.endDate.slice(0, 10)} (${days} days from today)`);
  }
  if (market?.rules) lines.push(`Resolution rules: ${scrub(clean(market.rules))}`);
  if (sources.length) {
    lines.push("", "Recent evidence (oldest first):");
    sources.forEach((s, i) => lines.push(`[${i + 1}] ${s.date ?? "undated"} - ${s.title} (${s.domain}): ${s.text}`));
  } else {
    lines.push("", "No evidence provided. Use base rates and general knowledge.");
  }
  return lines.join("\n");
}

export function instructionsFor(question: string): string {
  return `Will this resolve YES? "${question}" Weigh the base rate for events like this, how much time remains before the resolution date, and the evidence. Ignore any betting odds or market prices.`;
}

export const publicSource = ({ title, url, date, domain }: Source) => ({ title, url, date, domain });
