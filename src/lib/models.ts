import "server-only";
import { experimental_decide } from "ai";
import type { ModelId, Prediction } from "./types";

const TIMEOUT_MS = 20_000;

function clamp01(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("model returned no probability");
  return Math.max(0, Math.min(1, v));
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message ?? json?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// OpenAI Decisions API: POST /v1/decisions, predicate question.
async function decisions(state: string, instructions: string) {
  const json = await postJson(
    "https://api.openai.com/v1/decisions",
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    { model: "gpt-6-luna", input: state, questions: [{ type: "predicate", name: "yes", instructions }] },
  );
  const answer = json.answers?.[0];
  if (answer?.type === "refusal") throw new Error("refused");
  return { p: clamp01(answer?.probability), tokens: json.usage?.input_tokens ?? 0 };
}

// Cloudflare Clef on Workers AI, System One question shape.
async function clef(state: string, instructions: string) {
  const json = await postJson(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/cloudflare/clef`,
    { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    { model: "clef", state, questions: { yes: { type: "noul", instructions } } },
  );
  return { p: clamp01(json.result?.answers?.yes?.noul), tokens: json.result?.usage?.input_tokens ?? 0 };
}

// TypeSafe Jev through Vercel AI Gateway.
async function jev(state: string, instructions: string) {
  const res = await experimental_decide({
    model: "typesafe-ai/jev",
    state,
    questions: { yes: { type: "boolean", instructions } },
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const answer = res.answers.yes as { probability?: number };
  return { p: clamp01(answer.probability), tokens: res.usage.inputTokens ?? 0 };
}

const impl: Record<ModelId, (state: string, instructions: string) => Promise<{ p: number; tokens: number }>> = {
  decisions,
  jev,
  clef,
};

// Per-provider concurrency cap so a board refresh never trips rate limits.
const limits: Record<ModelId, number> = { decisions: 24, jev: 16, clef: 12 };
const active: Record<ModelId, number> = { decisions: 0, jev: 0, clef: 0 };
const queues: Record<ModelId, (() => void)[]> = { decisions: [], jev: [], clef: [] };

async function withSlot<T>(model: ModelId, fn: () => Promise<T>): Promise<T> {
  if (active[model] >= limits[model]) await new Promise<void>((r) => queues[model].push(r));
  active[model]++;
  try {
    return await fn();
  } finally {
    active[model]--;
    queues[model].shift()?.();
  }
}

export async function predict(model: ModelId, state: string, instructions: string): Promise<Prediction> {
  return withSlot(model, async () => {
    const t = performance.now();
    const { p, tokens } = await impl[model](state, instructions);
    return { p, tokens, ms: Math.round(performance.now() - t) };
  });
}
