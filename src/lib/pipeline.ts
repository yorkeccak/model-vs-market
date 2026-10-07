import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildState, gatherEvidence, instructionsFor, publicSource } from "./evidence";
import { predict } from "./models";
import { searchMarkets, topMarkets } from "./markets";
import { MODELS, type AnalyzeEvent, type AnalyzeInput, type BoardEvent, type BoardRow, type BoardSnapshot, type Market, type Source } from "./types";

const BOARD_SIZE = 16;
// Vercel functions can only write to /tmp; locally keep the snapshot in the project.
const CACHE_FILE = path.join(process.env.VERCEL ? os.tmpdir() : process.cwd(), ".cache", "board.json");

type Store = {
  board: BoardSnapshot | null;
  boardRun: Promise<void> | null;
  listeners: Set<(e: BoardEvent) => void>;
  replay: BoardEvent[];
  sources: Map<string, { at: number; sources: Source[] }>;
};
const g = globalThis as unknown as { __mvm?: Store };
const store: Store = (g.__mvm ??= { board: null, boardRun: null, listeners: new Set(), replay: [], sources: new Map() });

export async function readBoard(): Promise<BoardSnapshot | null> {
  if (store.board) return store.board;
  try {
    store.board = JSON.parse(await readFile(CACHE_FILE, "utf8"));
  } catch {
    store.board = null;
  }
  return store.board;
}

async function cachedEvidence(key: string, question: string): Promise<Source[]> {
  const hit = store.sources.get(key);
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit.sources;
  const sources = await gatherEvidence(question);
  store.sources.set(key, { at: Date.now(), sources });
  return sources;
}

async function runBoard(emit: (e: BoardEvent) => void) {
  const markets = await topMarkets(BOARD_SIZE);
  emit({ t: "markets", markets });
  const rows: BoardRow[] = markets.map((market) => ({ market, sources: null, preds: {} }));

  await Promise.all(
    rows.map(async (row) => {
      const { market } = row;
      let sources: Source[];
      try {
        sources = await cachedEvidence(market.id, market.question);
      } catch (err) {
        emit({ t: "error", id: market.id, message: (err as Error).message });
        sources = [];
      }
      row.sources = sources.map(publicSource);
      emit({ t: "sources", id: market.id, sources: row.sources });
      const state = buildState(market.question, market, sources);
      const instructions = instructionsFor(market.question);
      await Promise.all(
        MODELS.map(async (model) => {
          try {
            const pred = await predict(model, state, instructions);
            row.preds[model] = pred;
            emit({ t: "pred", id: market.id, model, pred });
          } catch (err) {
            const message = (err as Error).message;
            row.preds[model] = { error: message };
            emit({ t: "error", id: market.id, model, message });
          }
        }),
      );
    }),
  );

  const snapshot: BoardSnapshot = { at: Date.now(), rows };
  store.board = snapshot;
  // The snapshot is a cache, so a failed write must never fail the run.
  await mkdir(path.dirname(CACHE_FILE), { recursive: true })
    .then(() => writeFile(CACHE_FILE, JSON.stringify(snapshot)))
    .catch(() => {});
  emit({ t: "done", at: snapshot.at });
}

// One board run at a time; late subscribers get the events so far, then live ones.
export function subscribeBoard(listener: (e: BoardEvent) => void): () => void {
  if (store.boardRun) for (const e of store.replay) listener(e);
  store.listeners.add(listener);
  if (!store.boardRun) {
    store.replay = [];
    const emit = (e: BoardEvent) => {
      store.replay.push(e);
      for (const l of store.listeners) l(e);
    };
    store.boardRun = runBoard(emit)
      .catch((err) => emit({ t: "error", id: "*", message: (err as Error).message }))
      .finally(() => {
        store.boardRun = null;
        if (store.replay.at(-1)?.t !== "done") emit({ t: "done", at: Date.now() });
      });
  }
  return () => store.listeners.delete(listener);
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

export async function runAnalyze(input: AnalyzeInput, emit: (e: AnalyzeEvent) => void) {
  const question = (input.market?.question ?? input.question ?? "").trim();
  if (!question) throw new Error("Ask a question");

  const [market, sources] = await Promise.all([
    input.market ? Promise.resolve(input.market) : matchMarket(question),
    cachedEvidence(input.market?.id ?? `q:${question.toLowerCase()}`, question),
  ]);
  emit({ t: "market", market });
  emit({ t: "sources", sources: sources.map(publicSource) });

  // Re-decide after each additional source: k=0 is the prior, k=N is the final call.
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
