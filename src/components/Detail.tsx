"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { COLOR, streamEvents } from "@/lib/client";
import { MODELS, MODEL_META, type AnalyzeEvent, type Market, type ModelId, type Prediction, type PublicSource } from "@/lib/types";
import { Fav, MarketIcon, ModelLogo, VenueBadge } from "./Icon";
import { Ticker } from "./Ticker";

export type DetailTarget = { market: Market } | { question: string };

type Steps = Record<ModelId, (Prediction | undefined)[]>;
const STEP_MS = 1100;
const ease = [0.65, 0, 0.35, 1] as const;

export function Detail({ target, onClose }: { target: DetailTarget; onClose: () => void }) {
  const [market, setMarket] = useState<Market | null | undefined>("market" in target ? target.market : undefined);
  const [sources, setSources] = useState<PublicSource[] | null>(null);
  const [steps, setSteps] = useState<Steps>({ decisions: [], jev: [], clef: [] });
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [play, setPlay] = useState(-1);
  const [auto, setAuto] = useState(true);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const question = "market" in target ? target.market.question : target.question;

  useEffect(() => {
    const ac = new AbortController();
    startedAt.current = performance.now();
    (async () => {
      try {
        for await (const e of streamEvents<AnalyzeEvent>("/api/analyze", "market" in target ? { market: target.market } : { question: target.question }, ac.signal)) {
          if (e.t === "market") setMarket(e.market);
          else if (e.t === "sources") setSources(e.sources);
          else if (e.t === "step")
            setSteps((s) => {
              const next = { ...s, [e.model]: [...s[e.model]] };
              next[e.model][e.k] = e.pred;
              return next;
            });
          else if (e.t === "error") setErrors((x) => [...x, e.model ? `${MODEL_META[e.model].name}: ${e.message}` : e.message]);
          else if (e.t === "done") {
            setDone(true);
            setPlay(0);
            setElapsed(performance.now() - startedAt.current);
          }
        }
      } catch (err) {
        if (!ac.signal.aborted) setErrors((x) => [...x, (err as Error).message]);
      }
    })();
    return () => ac.abort();
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!done || !sources) return;
      if (e.key === "ArrowRight") {
        setAuto(false);
        setPlay((p) => Math.min(sources.length, p + 1));
      }
      if (e.key === "ArrowLeft") {
        setAuto(false);
        setPlay((p) => Math.max(0, p - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, done, sources]);

  const n = sources?.length ?? 0;

  // Auto-replay: one article per beat.
  useEffect(() => {
    if (!auto || play < 0 || play >= n) return;
    const t = setTimeout(() => setPlay((p) => p + 1), play === 0 ? 1300 : STEP_MS);
    return () => clearTimeout(t);
  }, [play, n, auto]);

  const at = (m: ModelId, k: number): number | undefined => {
    for (let i = Math.min(k, n); i >= 0; i--) if (steps[m][i]) return steps[m][i]!.p;
    return undefined;
  };
  const delta = (m: ModelId, k: number) => {
    const a = at(m, k - 1);
    const b = at(m, k);
    return a === undefined || b === undefined ? 0 : Math.round((b - a) * 100);
  };
  const cursor = Math.max(0, play);
  const finals = MODELS.map((m) => at(m, n)).filter((v): v is number => v !== undefined);
  const avg = finals.length ? finals.reduce((a, b) => a + b, 0) / finals.length : null;
  const ms = useMemo(() => MODELS.flatMap((m) => steps[m].filter(Boolean).map((s) => s!.ms)).sort((a, b) => a - b), [steps]);

  let biggest = -1;
  if (done) {
    let bestMove = 4;
    for (let k = 1; k <= n; k++) {
      const move = MODELS.reduce((s, m) => s + Math.abs(delta(m, k)), 0);
      if (move > bestMove) {
        biggest = k;
        bestMove = move;
      }
    }
  }

  const verdict = (() => {
    if (avg === null) return null;
    const spread = Math.max(...finals) - Math.min(...finals);
    if (!market) return spread > 0.3 ? "The models can't agree, and there's no live market to settle it." : `The models put this at ${Math.round(avg * 100)}%.`;
    const gap = Math.round((avg - market.price) * 100);
    if (Math.abs(gap) < 8) return "Models and money roughly agree.";
    if (spread > 0.35) return `The models split, but on average sit ${Math.abs(gap)} points ${gap > 0 ? "above" : "below"} the market.`;
    return `The models think YES is ${gap > 0 ? "underpriced" : "overpriced"} by ${Math.abs(gap)} points.`;
  })();

  const share = () => {
    const parts = [market ? `Market ${Math.round(market.price * 100)}%` : null, ...MODELS.map((m) => (at(m, n) !== undefined ? `${MODEL_META[m].name} ${Math.round(at(m, n)! * 100)}%` : null))].filter(Boolean);
    const text = `AI vs the market: "${question}"\n\n${parts.join(" · ")}\n\nThree decision models read the news via @ValyuNetwork, never the odds.`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const scrub = (k: number) => {
    if (!done) return;
    setAuto(false);
    setPlay(k);
  };

  return (
    <motion.div className="absolute inset-0 grid grid-rows-[auto_minmax(0,1fr)_auto]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      {/* header: question + live readouts */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-[var(--line)] px-4 py-4 md:px-6">
        <div className="min-w-0 flex-1 basis-[420px]">
          <button onClick={onClose} className="press mb-2 inline-flex items-center gap-1.5 rounded-full text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
            ← Back <span className="text-[var(--dim)]">esc</span>
          </button>
          <div className="flex items-center gap-3">
            {market && <MarketIcon market={market} size={42} />}
            <div className="min-w-0">
              <h2 className="line-clamp-2 text-[22px] leading-[1.15] font-semibold tracking-[-0.02em] md:text-[28px]">{question}</h2>
              <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--muted)]">{market === undefined ? <span className="dots">Looking for a matching market</span> : market ? <><VenueBadge venue={market.venue} /> {market.endDate && <span className="text-[var(--dim)]">· Resolves {new Date(market.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}</> : "Your question · no live market matches it"}</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4">
          <Readout label="Market" color={COLOR.market} value={market ? market.price : undefined} cents empty={market === null ? "n/a" : undefined} />
          {MODELS.map((m) => (
            <Readout key={m} model={m} label={MODEL_META[m].name} color={COLOR[m]} value={play >= 0 ? at(m, cursor) : undefined} pending={!done} />
          ))}
        </div>
      </div>

      {/* body: chart and what they read, side by side */}
      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_380px] md:grid-rows-1">
        <div className="relative min-h-[260px] md:border-r md:border-[var(--line)]">
          <Chart n={n} sources={sources} market={market?.price ?? null} play={play} done={done} at={at} delta={delta} onScrub={scrub} />
        </div>
        <Sources sources={sources} play={play} done={done} biggest={biggest} delta={delta} onScrub={scrub} />
      </div>

      {/* footer: verdict + actions */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--line)] px-4 py-3 md:px-6">
        <div className="min-w-0 flex-1 text-[18px] font-medium">
          <AnimatePresence mode="wait">
            {play >= n && verdict ? (
              <motion.span key="v" className="block" initial={{ opacity: 0, y: 6, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}>
                {verdict}
              </motion.span>
            ) : (
              <motion.span key="s" className="block text-[14px] text-[var(--muted)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {errors.length ? <span className="text-[var(--clef)]">{errors.join(" · ")}</span> : done ? "Use ← → to step through the evidence" : <span className="dots">{sources ? `${n} articles found. Asking 3 models ${(n + 1) * 3} times` : "Searching the news with Valyu"}</span>}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        {done && ms.length > 0 && (
          <div className="num text-[12.5px] text-[var(--dim)]">
            {ms.length} decisions · median {ms[Math.floor(ms.length / 2)]}ms{elapsed ? ` · ${(elapsed / 1000).toFixed(1)}s total` : ""}
          </div>
        )}
        <div className="flex items-center gap-1">
          {play >= n && n > 0 && (
            <button
              onClick={() => {
                setAuto(true);
                setPlay(0);
              }}
              className="press rounded-full px-3 py-1.5 text-[13.5px] text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
            >
              ↺ Replay
            </button>
          )}
          {market && (
            <a href={market.url} target="_blank" rel="noreferrer" className="press rounded-full px-3 py-1.5 text-[13.5px] text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]">
              Open on {market.venue === "kalshi" ? "Kalshi" : "Polymarket"} ↗
            </a>
          )}
          <button onClick={share} disabled={!done} className="press rounded-full bg-[var(--text)] px-4 py-1.5 text-[13.5px] font-medium text-[var(--bg)] hover:bg-white disabled:opacity-30">
            Share result
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Readout({ model, label, color, value, pending, empty }: { model?: ModelId; label: string; color: string; value: number | undefined; cents?: boolean; pending?: boolean; empty?: string }) {
  return (
    <div className="min-w-[88px] border-l border-[var(--line)] px-4 first:border-l-0 md:min-w-[108px]">
      <div className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
        {model ? <ModelLogo model={model} size={16} /> : <span className="mx-[7px] h-3.5 w-[2px] rounded-full bg-[var(--market)]" />}
        {label}
      </div>
      <div className="num mt-0.5 h-[40px] text-[34px] leading-[40px] font-medium tracking-[-0.03em]" style={{ color }}>
        {value !== undefined ? <Ticker value={value * 100} duration={0.7} format={(v) => `${Math.round(v)}%`} /> : <span className={`text-[var(--dim)] ${pending ? "animate-pulse" : ""}`}>{empty ?? "--"}</span>}
      </div>
    </div>
  );
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

type ChartProps = {
  n: number;
  sources: PublicSource[] | null;
  market: number | null;
  play: number;
  done: boolean;
  at: (m: ModelId, k: number) => number | undefined;
  delta: (m: ModelId, k: number) => number;
  onScrub: (k: number) => void;
};

function Chart({ n, sources, market, play, done, at, delta, onScrub }: ChartProps) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const PAD = { l: 52, r: 64, t: 132, b: 50 };
  const iw = Math.max(1, w - PAD.l - PAD.r);
  const ih = Math.max(1, h - PAD.t - PAD.b);
  const x = (k: number) => PAD.l + (n === 0 ? iw / 2 : (k / n) * iw);
  const y = (p: number) => PAD.t + (1 - p) * ih;
  const ready = play >= 0 && w > 0;
  const cursor = Math.max(0, play);
  const dur = STEP_MS / 1000;

  const path = (m: ModelId) => {
    let d = "";
    let prev: [number, number] | null = null;
    for (let k = 0; k <= n; k++) {
      const p = at(m, k);
      if (p === undefined) continue;
      const pt: [number, number] = [x(k), y(p)];
      if (!prev) d += `M${pt[0]},${pt[1]}`;
      else {
        const mx = (prev[0] + pt[0]) / 2;
        d += ` C${mx},${prev[1]} ${mx},${pt[1]} ${pt[0]},${pt[1]}`;
      }
      prev = pt;
    }
    return d;
  };

  const src = cursor > 0 ? sources?.[cursor - 1] : undefined;
  const calloutW = Math.min(360, w - 24);
  const calloutLeft = Math.max(12, Math.min(w - calloutW - 12, x(cursor) - calloutW / 2));

  // Keep the three value labels at the playhead from colliding.
  const heads = MODELS.map((m) => ({ m, p: at(m, cursor) })).filter((hd): hd is { m: ModelId; p: number } => hd.p !== undefined);
  const labelY = new Map<ModelId, number>();
  let last = -Infinity;
  for (const hd of [...heads].sort((a, b) => y(a.p) - y(b.p))) {
    const yy = Math.max(y(hd.p), last + 22);
    labelY.set(hd.m, yy);
    last = yy;
  }

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      {w > 0 && (
        <svg width={w} height={h} className="absolute inset-0 block">
          <defs>
            <clipPath id="reveal">
              <motion.rect x={0} y={0} height={h} initial={{ width: PAD.l }} animate={{ width: ready ? x(cursor) + 1 : PAD.l }} transition={{ duration: play === 0 ? 0.5 : dur, ease }} />
            </clipPath>
            <clipPath id="logo-clip">
              <circle r="9" />
            </clipPath>
            <filter id="glow" x="-10%" y="-50%" width="120%" height="200%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={PAD.l - 12} y={y(t) + 4} textAnchor="end" className="num" fontSize="11.5" fill="var(--dim)">
                {t * 100}%
              </text>
            </g>
          ))}

          {market !== null && (
            <g>
              <motion.line x1={PAD.l} x2={w - PAD.r} y1={y(market)} y2={y(market)} stroke="var(--market)" strokeWidth="1.5" strokeDasharray="5 5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease }} />
              <text x={PAD.l + 8} y={y(market) - 8} className="num" fontSize="12" fontWeight="500" fill="var(--market)">
                Market {Math.round(market * 100)}%
              </text>
            </g>
          )}

          {/* playhead, reaching up into the callout */}
          {ready && n > 0 && <motion.line y1={PAD.t - 18} y2={h - PAD.b + 6} stroke="rgba(235,231,222,0.35)" initial={false} animate={{ x1: x(cursor), x2: x(cursor) }} transition={{ duration: dur, ease }} />}

          <g clipPath="url(#reveal)">
            {MODELS.map((m) => {
              const d = path(m);
              return d ? (
                <g key={m}>
                  <path d={d} fill="none" stroke={COLOR[m]} strokeWidth="7" opacity="0.3" filter="url(#glow)" />
                  <path d={d} fill="none" stroke={COLOR[m]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              ) : null;
            })}
          </g>

          {ready &&
            heads.map(({ m, p }) => (
              <g key={m}>
                <motion.g initial={false} animate={{ x: x(cursor), y: y(p) }} transition={{ duration: dur, ease }}>
                  <circle r="16" fill={COLOR[m]} opacity="0.14" />
                  <circle r="10.5" fill="white" stroke={COLOR[m]} strokeWidth="2" />
                  <image href={MODEL_META[m].logo} x={-9} y={-9} width={18} height={18} clipPath="url(#logo-clip)" />
                </motion.g>
                <motion.text initial={false} animate={{ x: x(cursor) + 20, y: (labelY.get(m) ?? y(p)) + 4 }} transition={{ duration: dur, ease }} className="num" fontSize="12.5" fontWeight="600" fill={COLOR[m]}>
                  {Math.round(p * 100)}%
                </motion.text>
              </g>
            ))}

          {/* x axis: the article read at each step, by favicon */}
          {n > 0 &&
            Array.from({ length: n + 1 }, (_, k) => {
              const cx = x(k);
              const cy = h - PAD.b + 22;
              const state = !ready ? "idle" : k === cursor ? "now" : k < cursor ? "read" : "unread";
              return (
                <g key={k} onClick={() => onScrub(k)} style={{ cursor: done ? "pointer" : "default" }} opacity={state === "unread" ? 0.3 : 1}>
                  <rect x={cx - 15} y={cy - 15} width={30} height={30} fill="transparent" />
                  {k === 0 ? (
                    <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11.5" fill="var(--muted)">
                      Prior
                    </text>
                  ) : (
                    <image href={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(sources![k - 1].domain)}&sz=64`} x={cx - 8} y={cy - 8} width={16} height={16} />
                  )}
                  {state === "now" && <rect x={cx - 14} y={cy - 14} width={28} height={28} rx={8} fill="none" stroke="var(--text)" strokeWidth="1.5" />}
                </g>
              );
            })}
        </svg>
      )}

      {/* now-reading callout */}
      {ready && sources && (
        <motion.div className="absolute top-3" initial={false} animate={{ left: calloutLeft }} transition={{ duration: dur, ease }} style={{ width: calloutW }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={cursor} className="rounded-[14px] bg-[var(--surface-2)]/95 px-3.5 py-3 shadow-[0_0_0_1px_var(--line-2),0_16px_32px_-12px_rgba(0,0,0,0.6)] backdrop-blur" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 }}>
              {src ? (
                <>
                  <div className="flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
                    <Fav domain={src.domain} size={14} />
                    <span className="truncate">
                      Article {cursor} of {n} · {src.domain} · {src.date ?? "undated"}
                    </span>
                  </div>
                  <div className="mt-1.5 line-clamp-2 text-[15px] leading-snug font-medium">{src.title}</div>
                </>
              ) : (
                <>
                  <div className="text-[12.5px] text-[var(--muted)]">Before reading anything</div>
                  <div className="mt-1.5 text-[15px] leading-snug font-medium">Gut instinct from base rates alone.</div>
                </>
              )}
              <div className="num mt-2 flex gap-4 text-[12.5px]">
                {MODELS.map((m) => {
                  const d = cursor > 0 ? delta(m, cursor) : null;
                  return (
                    <span key={m} className="flex items-center gap-1.5" style={{ color: COLOR[m] }}>
                      <ModelLogo model={m} size={14} />
                      {MODEL_META[m].name}
                      <span className="font-medium text-[var(--text)]">{d === null ? `${Math.round((at(m, 0) ?? 0) * 100)}%` : d === 0 ? "±0" : `${d > 0 ? "▲" : "▼"}${Math.abs(d)}`}</span>
                    </span>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}

      {!ready && w > 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-[14px] text-[var(--muted)]">{sources === null ? "Searching the last 60 days of news" : `Asking 3 models ${(n + 1) * 3} times`}</div>
            <div className="scan mx-auto mt-3 h-px w-56 rounded bg-[var(--line)]" />
          </div>
        </div>
      )}
    </div>
  );
}

type SourcesProps = { sources: PublicSource[] | null; play: number; done: boolean; biggest: number; delta: (m: ModelId, k: number) => number; onScrub: (k: number) => void };

function Sources({ sources, play, done, biggest, delta, onScrub }: SourcesProps) {
  return (
    <div className="flex min-h-0 flex-col border-t border-[var(--line)] md:border-t-0">
      <div className="flex items-center justify-between px-5 pt-4 pb-2 text-[13px]">
        <span className="font-medium">What they read</span>
        <span className="flex items-center gap-1.5 text-[var(--dim)]">
          via <Fav domain="valyu.ai" size={13} /> Valyu
        </span>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-width:none]">
        {sources === null
          ? Array.from({ length: 7 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="h-4 w-4 rounded bg-white/[0.06]" />
                <span className="flex-1 space-y-1.5">
                  <span className="scan block h-2.5 w-4/5 rounded bg-white/[0.05]" style={{ animationDelay: `${i * 90}ms` }} />
                  <span className="block h-2 w-1/3 rounded bg-white/[0.03]" />
                </span>
              </li>
            ))
          : sources.map((s, i) => {
              const k = i + 1;
              const state = play < 0 ? "idle" : play === k ? "now" : play > k ? "read" : "unread";
              return (
                <motion.li key={s.url + i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: state === "unread" ? 0.35 : 1, x: 0 }} transition={{ delay: play < 0 ? i * 0.06 : 0, duration: 0.3 }}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    onMouseEnter={() => onScrub(k)}
                    className="relative flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-white/[0.04]"
                    style={{ background: state === "now" ? "rgba(255,255,255,0.06)" : undefined }}
                  >
                    {state === "now" && <motion.span layoutId="now-bar" className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full bg-[var(--text)]" transition={{ duration: 0.25 }} />}
                    <Fav domain={s.domain} size={16} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[14px] leading-snug">{s.title}</span>
                      <span className="mt-1 flex items-center gap-2 text-[12.5px] text-[var(--dim)]">
                        <span className="truncate">
                          {s.domain} · {s.date ? new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "undated"}
                        </span>
                        {k === biggest && <span className="shrink-0 rounded-full bg-[var(--text)] px-2 py-px text-[11.5px] font-medium text-[var(--bg)]">Biggest move</span>}
                      </span>
                    </span>
                    {done && (
                      <span className="num flex shrink-0 flex-col items-end text-[12px] leading-[16px] font-medium">
                        {MODELS.map((m) => {
                          const d = delta(m, k);
                          return (
                            <span key={m} className="flex items-center gap-1" style={{ color: d === 0 ? "var(--dim)" : COLOR[m] }}>
                              {d === 0 ? "·" : `${d > 0 ? "▲" : "▼"}${Math.abs(d)}`}
                              <ModelLogo model={m} size={11} className={d === 0 ? "opacity-40" : ""} />
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </a>
                </motion.li>
              );
            })}
        {sources?.length === 0 && <li className="px-3 py-3 text-[14px] text-[var(--muted)]">No recent articles found. The models are working from base rates alone.</li>}
      </ol>
    </div>
  );
}
