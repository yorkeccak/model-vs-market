import "server-only";
import { createHash } from "node:crypto";
import { buildState, gatherEvidence, instructionsFor, publicSource } from "./evidence";
import { kv } from "./kv";
import { predict } from "./models";
import { searchMarkets, topMarkets } from "./markets";
import { MODELS, type AnalyzeEvent, type BoardRow, type BoardSnapshot, type Market, type Source } from "./types";

const BOARD_SIZE = 16;
const BOARD_KEY = "board:v1";
const BOARD_LOCK = "board:lock";
const BOARD_STALE_MS = 25 * 60e3;
const DAY = 86_400;

// ---------- evidence (shared, 30 min) ----------

async function cachedEvidence(key: string, question: string): Promise<Source[]> {
  const k = `ev:${key}`;
  const hit = (await kv.get(k)) as Source[] | undefined;
  if (hit) return hit;
  const sources = await gatherEvidence(question);
  await kv.set(k, sources, { ttl: 1800 });
  return sources;
}

// ---------- board: one shared snapshot for every visitor ----------

export const boardIsStale = (snapshot: BoardSnapshot | null) => !snapshot || Date.now() - snapshot.at > BOARD_STALE_MS;

export async function readBoard(): Promise<BoardSnapshot | null> {
  return ((await kv.get(BOARD_KEY)) as BoardSnapshot | undefined) ?? null;
}

async function computeBoard(): Promise<BoardSnapshot> {
  const markets = await topMarkets(BOARD_SIZE);
  const rows: BoardRow[] = await Promise.all(
    markets.map(async (market) => {
      // Remember board markets so /api/analyze can resolve them by id.
      await kv.set(`m:${market.id}`, market, { ttl: DAY });
      const sources = await cachedEvidence(market.id, market.question).catch(() => []);
      const state = buildState(market.question, market, sources);
      const instructions = instructionsFor(market.question);
      const preds: BoardRow["preds"] = {};
      await Promise.all(
        MODELS.map(async (model) => {
          preds[model] = await predict(model, state, instructions).catch((err: Error) => ({ error: err.message }));
        }),
      );
      return { market, sources: sources.map(publicSource), preds };
    }),
  );
  return { at: Date.now(), rows };
}

let inflight: Promise<BoardSnapshot> | null = null;

// Recompute and publish the board. The lock keeps concurrent instances from
// paying for the same refresh; `force` is for the scheduled job.
export async function refreshBoard({ force = false } = {}): Promise<BoardSnapshot | null> {
  if (inflight) return inflight;
  if (!force && (await kv.get(BOARD_LOCK))) return null;
  await kv.set(BOARD_LOCK, Date.now(), { ttl: 180 });
  inflight = computeBoard()
    .then(async (snapshot) => {
      await kv.set(BOARD_KEY, snapshot, { ttl: 2 * DAY });
      return snapshot;
    })
    .finally(() => {
      inflight = null;
      void kv.delete(BOARD_LOCK);
    });
  return inflight;
}

// ---------- analyze ----------

// Markets are only ever resolved server-side (board or search results), so a client
// can't inject a fake question or rules under a real market id.
export async function resolveMarket(id: string): Promise<Market | null> {
  const fromKv = (await kv.get(`m:${id}`)) as Market | undefined;
  if (fromKv) return fromKv;
  return (await readBoard())?.rows.find((r) => r.market.id === id)?.market ?? null;
}

export async function rememberMarkets(markets: Market[]) {
  await Promise.all(markets.map((m) => kv.set(`m:${m.id}`, m, { ttl: DAY })));
}

const normalise = (q: string) => q.toLowerCase().replace(/\s+/g, " ").replace(/[?!.\s]+$/, "").trim();

export function analyzeKey(input: { marketId?: string; question?: string }) {
  const raw = input.marketId ? `m:${input.marketId}` : `q:${normalise(input.question ?? "")}`;
  return `an:${createHash("sha256").update(raw).digest("hex")}`;
}

export async function cachedAnalysis(key: string): Promise<AnalyzeEvent[] | null> {
  return ((await kv.get(key)) as AnalyzeEvent[] | undefined) ?? null;
}

export async function storeAnalysis(key: string, events: AnalyzeEvent[], ttl: number) {
  await kv.set(key, events, { ttl });
}

// Use the decision model itself to pick which live market (if any) the question is about.
async function matchMarket(question: string): Promise<Market | null> {
  const candidates = await searchMarkets(question).catch(() => []);
  if (!candidates.length) return null;
  const res = await fetch("https://api.openai.com/v1/decisions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-6-luna",
      input: `User question: ${question}`,
      questions: [
        {
          type: "choice",
          name: "market",
          instructions: "Which prediction market asks essentially the same yes/no question as the user (same event, same deadline give or take)? Pick none if no market matches.",
          choices: [
            ...candidates.map((m) => ({ value: m.id, description: `${m.question} (resolves ${m.endDate.slice(0, 10)})` })),
            { value: "none", description: "None of these match the user's question." },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  const json = await res?.json().catch(() => null);
  const answer = json?.answers?.[0];
  if (answer?.type !== "choice" || answer.choice === "none") return null;
  const top = answer.probabilities?.find((p: { value: string }) => p.value === answer.choice)?.probability ?? 0;
  return top >= 0.6 ? (candidates.find((m) => m.id === answer.choice) ?? null) : null;
}

export async function runAnalyze(input: { market?: Market; question?: string }, emit: (e: AnalyzeEvent) => void) {
  const question = (input.market?.question ?? input.question ?? "").trim();
  if (!question) throw new Error("Ask a question");

  const [market, sources] = await Promise.all([
    input.market ? Promise.resolve(input.market) : matchMarket(question),
    cachedEvidence(input.market?.id ?? `q:${normalise(question)}`, question),
  ]);
  emit({ t: "market", market });
  emit({ t: "sources", sources: sources.map(publicSource) });

  // Re-decide with articles 1..k for each k: k=0 is the prior, k=N is the final call.
  const instructions = instructionsFor(question);
  const steps = Array.from({ length: sources.length + 1 }, (_, k) => buildState(question, market, sources.slice(0, k)));
  await Promise.all(
    MODELS.flatMap((model) =>
      steps.map(async (state, k) => {
        try {
          emit({ t: "step", model, k, pred: await predict(model, state, instructions) });
        } catch (err) {
          if (k === steps.length - 1) emit({ t: "error", model, message: (err as Error).message });
        }
      }),
    ),
  );
  emit({ t: "done" });
}
