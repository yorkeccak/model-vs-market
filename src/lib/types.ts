export const MODELS = ["decisions", "jev", "clef"] as const;
export type ModelId = (typeof MODELS)[number];

export const MODEL_META: Record<ModelId, { name: string; maker: string; logo: string; usdPerMTok: number }> = {
  decisions: { name: "Decisions", maker: "OpenAI", logo: "/logos/openai.png", usdPerMTok: 0.1 },
  jev: { name: "Jev", maker: "TypeSafe", logo: "/logos/typesafe.png", usdPerMTok: 0.042 },
  clef: { name: "Clef", maker: "Cloudflare", logo: "/logos/cloudflare.png", usdPerMTok: 0.24 },
};

export type Venue = "polymarket" | "kalshi";

export type Market = {
  id: string; // "pm:<id>" or "ks:<ticker>"
  venue: Venue;
  question: string;
  price: number; // market-implied P(YES), 0-1
  endDate: string;
  volume: number;
  icon: string | null;
  url: string;
  rules: string;
};

export type Source = {
  title: string;
  url: string;
  date: string | null;
  domain: string;
  text: string;
};

export type PublicSource = Omit<Source, "text">;

export type Prediction = { p: number; ms: number; tokens: number };

export type BoardRow = {
  market: Market;
  sources: PublicSource[] | null;
  preds: Partial<Record<ModelId, Prediction | { error: string }>>;
};

export type BoardSnapshot = { at: number; rows: BoardRow[] };

// NDJSON events streamed to the client.
export type BoardEvent =
  | { t: "markets"; markets: Market[] }
  | { t: "sources"; id: string; sources: PublicSource[] }
  | { t: "pred"; id: string; model: ModelId; pred: Prediction }
  | { t: "error"; id: string; model?: ModelId; message: string }
  | { t: "done"; at: number };

export type AnalyzeEvent =
  | { t: "market"; market: Market | null }
  | { t: "sources"; sources: PublicSource[] }
  | { t: "step"; model: ModelId; k: number; pred: Prediction }
  | { t: "error"; model?: ModelId; message: string }
  | { t: "done" };

export type AnalyzeInput = { market?: Market; question?: string };
