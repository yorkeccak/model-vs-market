import { MODELS, type ModelId, type Prediction } from "./types";

export const COLOR: Record<ModelId | "market", string> = {
  market: "var(--market)",
  decisions: "var(--decisions)",
  jev: "var(--jev)",
  clef: "var(--clef)",
};

// POST and yield each NDJSON event as it arrives. Aborting cancels the reader
// quietly instead of throwing, so unmounts never surface as errors.
export async function* streamEvents<T>(url: string, body: unknown, signal?: AbortSignal): AsyncGenerator<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  if (!res.body || signal?.aborted) return;
  const reader = res.body.getReader();
  const onAbort = () => reader.cancel().catch(() => {});
  signal?.addEventListener("abort", onAbort, { once: true });
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done || signal?.aborted) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) yield JSON.parse(line) as T;
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

export type Preds = Partial<Record<ModelId, Prediction | { error: string }>>;

export function okPreds(preds: Preds): [ModelId, Prediction][] {
  return MODELS.flatMap((m) => {
    const p = preds[m];
    return p && "p" in p ? [[m, p] as [ModelId, Prediction]] : [];
  });
}

export function consensus(preds: Preds): number | null {
  const ok = okPreds(preds);
  return ok.length ? ok.reduce((s, [, p]) => s + p.p, 0) / ok.length : null;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;

export function cents(p: number) {
  const c = p * 100;
  return c < 1 ? "<1¢" : c > 99 ? ">99¢" : `${Math.round(c)}¢`;
}

export function timeAgo(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export const favicon = (domain: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
