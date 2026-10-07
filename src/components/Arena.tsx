"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { COLOR, consensus, okPreds, streamEvents, timeAgo, type Preds } from "@/lib/client";
import { MODELS, MODEL_META, type BoardEvent, type BoardSnapshot, type Market, type PublicSource } from "@/lib/types";
import { Detail, type DetailTarget } from "./Detail";
import { Fav, MarketIcon, ModelLogo } from "./Icon";
import { Rail } from "./Rail";
import { Search } from "./Search";
import { Ticker } from "./Ticker";

type Row = { market: Market; sources: PublicSource[] | null; preds: Preds };
const STALE_MS = 10 * 60e3;
const COLS = "md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)_136px]";

const edgeOf = (r: Row) => {
  const c = consensus(r.preds);
  return c === null ? null : c - r.market.price;
};

export function Arena({ initial, deferLive }: { initial: BoardSnapshot | null; deferLive?: boolean }) {
  const [rows, setRows] = useState<Row[]>(() => initial?.rows ?? []);
  const [updatedAt, setUpdatedAt] = useState<number | null>(initial?.at ?? null);
  const [running, setRunning] = useState(false);
  const [sorted, setSorted] = useState(Boolean(initial));
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [now, setNow] = useState(() => initial?.at ?? 0);
  const [failed, setFailed] = useState<string | null>(null);
  const runRef = useRef(false);

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const runLive = useCallback(async () => {
    if (runRef.current) return;
    runRef.current = true;
    setRunning(true);
    setFailed(null);
    setSorted(false);
    try {
      for await (const e of streamEvents<BoardEvent>("/api/board", {})) {
        if (e.t === "markets")
          setRows((prev) => {
            const old = new Map(prev.map((r) => [r.market.id, r]));
            return e.markets.map((m) => ({ market: m, sources: old.get(m.id)?.sources ?? null, preds: old.get(m.id)?.preds ?? {} }));
          });
        else if (e.t === "sources") setRows((prev) => prev.map((r) => (r.market.id === e.id ? { ...r, sources: e.sources } : r)));
        else if (e.t === "pred") setRows((prev) => prev.map((r) => (r.market.id === e.id ? { ...r, preds: { ...r.preds, [e.model]: e.pred } } : r)));
        else if (e.t === "error" && e.id === "*") setFailed(e.message);
        else if (e.t === "done") {
          setUpdatedAt(e.at);
          setNow(Date.now());
        }
      }
    } catch (err) {
      setFailed((err as Error).message);
    } finally {
      runRef.current = false;
      setRunning(false);
      setSorted(true);
    }
  }, []);

  useEffect(() => {
    if (deferLive) return;
    if (!initial || Date.now() - initial.at > STALE_MS) runLive();
  }, [initial, deferLive, runLive]);

  const ordered = useMemo(() => (sorted ? [...rows].sort((a, b) => Math.abs(edgeOf(b) ?? -1) - Math.abs(edgeOf(a) ?? -1)) : rows), [rows, sorted]);

  const stats = useMemo(() => {
    const preds = rows.flatMap((r) => okPreds(r.preds));
    const ms = preds.map(([, p]) => p.ms).sort((a, b) => a - b);
    return {
      decisions: preds.length,
      median: ms.length ? ms[Math.floor(ms.length / 2)] : 0,
      cents: preds.reduce((s, [m, p]) => s + (p.tokens * MODEL_META[m].usdPerMTok) / 1e4, 0),
      articles: rows.reduce((s, r) => s + (r.sources?.length ?? 0), 0),
    };
  }, [rows]);

  const close = useCallback(() => setDetail(null), []);

  return (
    <main className="mx-auto grid h-dvh max-w-[1440px] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden px-4 md:px-8">
      <header className="flex h-14 items-center justify-between">
        <button onClick={close} className="flex items-center gap-2.5 text-[15px] font-medium">
          <Mark />
          Model vs Market
        </button>
        <div className="flex items-center gap-3 text-[13px] text-[var(--muted)]">
          <span className="num hidden items-center gap-2 sm:flex">
            <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--decisions)]">
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--decisions)]" />
            </span>
            {running ? <span className="dots">Pricing live</span> : updatedAt ? `Updated ${timeAgo(updatedAt, now)}` : "Warming up"}
          </span>
          <button onClick={runLive} disabled={running} className="press rounded-full px-3 py-1.5 text-[var(--text)] shadow-[inset_0_0_0_1px_var(--line-2)] hover:bg-white/5 disabled:text-[var(--dim)]">
            Refresh
          </button>
        </div>
      </header>

      <section className="pb-4">
        <AnimatePresence initial={false}>
          {!detail && (
            <motion.div key="hero" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }} className="overflow-hidden">
              <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2 pt-3 pb-5">
                <div>
                  <h1 className="rise text-[34px] leading-[1.02] font-semibold tracking-[-0.03em] md:text-[48px]">Can AI out-guess the market?</h1>
                  <p className="rise mt-2 max-w-[600px] text-[15.5px] text-[var(--muted)] md:text-[17px]" style={{ animationDelay: "0.1s" }}>
                    Decision models from <Brand m="decisions" />, <Brand m="jev" /> and <Brand m="clef" /> read today&apos;s news, never the odds, and put a probability on any question. Then we compare them with real-money markets.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="rise relative z-30 max-w-[760px]" style={{ animationDelay: "0.18s" }}>
          <Search compact={!!detail} onPick={(c) => setDetail(c.kind === "ask" ? { question: c.question } : { market: c.market })} />
        </div>
      </section>

      <section className="surface relative min-h-0 overflow-hidden rounded-[20px]">
        <AnimatePresence initial={false}>
          {detail ? (
            <Detail key={"market" in detail ? detail.market.id : detail.question} target={detail} onClose={close} />
          ) : (
            <motion.div key="field" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <Field rows={ordered} running={running} failed={failed} onOpen={(r) => setDetail({ market: r.market })} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <footer className="flex h-11 items-center justify-between gap-4 text-[12.5px] text-[var(--dim)]">
        <span className="flex items-center gap-1.5">
          News by <Fav domain="valyu.ai" size={13} /> <a href="https://valyu.ai" className="text-[var(--muted)] hover:text-[var(--text)]">Valyu</a>
          <span className="hidden md:inline">· Models never see market prices · Not financial advice</span>
        </span>
        <span className="num hidden items-center gap-3 lg:flex">
          <Stat v={stats.articles} label="articles read" />
          <Stat v={stats.decisions} label="AI decisions" />
          <Stat v={stats.median} label="median" f={(v) => `${Math.round(v)}ms`} />
          <Stat v={stats.cents} label="total cost" f={(v) => `${v.toFixed(2)}¢`} />
        </span>
      </footer>
    </main>
  );
}

function Brand({ m }: { m: "decisions" | "jev" | "clef" }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap text-[var(--text)]">
      <ModelLogo model={m} size={17} className="relative top-[3px]" />
      {MODEL_META[m].maker}
    </span>
  );
}

function Stat({ v, label, f = (x) => String(Math.round(x)) }: { v: number; label: string; f?: (v: number) => string }) {
  return (
    <span className="whitespace-nowrap">
      <Ticker value={v} format={f} duration={1.1} className="text-[var(--muted)]" /> {label}
    </span>
  );
}

function Field({ rows, running, failed, onOpen }: { rows: Row[]; running: boolean; failed: string | null; onOpen: (r: Row) => void }) {
  const ref = useRef<HTMLOListElement>(null);
  const [fit, setFit] = useState(8);
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([e]) => setFit(Math.max(3, Math.floor(e.contentRect.height / (window.innerWidth < 768 ? 92 : 60)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const visible = rows.length ? rows.slice(0, fit) : null;
  const count = visible?.length ?? Math.min(fit, 10);

  return (
    <div className="field flex h-full flex-col">
      <div className={`grid h-12 shrink-0 items-center gap-x-6 border-b border-[var(--line)] px-4 text-[13px] text-[var(--muted)] md:px-5 ${COLS}`}>
        <span className="font-medium text-[var(--text)]">
          Most-traded questions right now {failed && <span className="ml-2 font-normal text-[var(--clef)]">· {failed}</span>}
        </span>
        <span className="hidden items-center justify-between md:flex">
          <span className="num text-[var(--dim)]">0%</span>
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-[2px] rounded-full bg-[var(--market)]" />
              Market
            </span>
            {MODELS.map((m) => (
              <span key={m} className="flex items-center gap-1.5">
                <ModelLogo model={m} size={16} />
                <span>
                  {MODEL_META[m].name} <span className="text-[var(--dim)]">by {MODEL_META[m].maker}</span>
                </span>
              </span>
            ))}
          </span>
          <span className="num text-[var(--dim)]">100%</span>
        </span>
        <span className="hidden text-right md:block">AI vs market</span>
      </div>
      <LayoutGroup>
        <ol ref={ref} className="grid min-h-0 flex-1" style={{ gridTemplateRows: `repeat(${count}, minmax(0, 1fr))` }}>
          {visible
            ? visible.map((r, i) => <Lane key={r.market.id} row={r} index={i} running={running} onOpen={() => onOpen(r)} />)
            : Array.from({ length: count }).map((_, i) => (
                <li key={i} className={`grid items-center gap-x-6 border-b border-[var(--line)] px-4 last:border-b-0 md:px-5 ${COLS}`}>
                  <span className="flex items-center gap-3">
                    <span className="h-8 w-8 rounded-[9px] bg-white/[0.04]" />
                    <span className="scan h-3 w-3/4 rounded bg-white/[0.04]" style={{ animationDelay: `${i * 80}ms` }} />
                  </span>
                  <span className="hidden h-px bg-[var(--line-2)] md:block" />
                  <span />
                </li>
              ))}
        </ol>
      </LayoutGroup>
    </div>
  );
}

function Lane({ row, index, running, onOpen }: { row: Row; index: number; running: boolean; onOpen: () => void }) {
  const { market, preds, sources } = row;
  const edge = edgeOf(row);
  const ok = okPreds(preds);
  const thinking = (running && ok.length < MODELS.length) || sources === null;
  const pts = edge === null ? null : Math.round(edge * 100);
  const end = market.endDate ? new Date(market.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const delay = Math.min(index, 14) * 0.06;
  const tone = pts === null || Math.abs(pts) < 8 ? "var(--muted)" : pts > 0 ? "var(--decisions)" : "var(--clef)";

  return (
    <motion.li layout="position" transition={{ layout: { type: "spring", stiffness: 300, damping: 34 } }} className="lane min-h-0 border-b border-[var(--line)] last:border-b-0">
      <button onClick={onOpen} className={`grid h-full w-full grid-cols-[minmax(0,1fr)_auto] content-center items-center gap-x-6 gap-y-1.5 px-4 text-left md:px-5 ${COLS}`}>
        <span className="flex min-w-0 items-center gap-3">
          <MarketIcon market={market} size={34} />
          <span className="min-w-0">
            <span className="block truncate text-[15.5px] leading-tight font-medium">{market.question}</span>
            <span className="num mt-1 flex items-center gap-1.5 text-[12.5px] text-[var(--dim)]">
              <span className="text-[var(--muted)]">{Math.round(market.price * 100)}% on {market.venue === "kalshi" ? "Kalshi" : "Polymarket"}</span>
              <span>·</span>
              {sources === null ? (
                <span className="dots">Reading the news</span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="flex">
                    {sources.slice(0, 5).map((s, i) => (
                      <motion.span key={s.domain + i} className="-mr-1 rounded-full ring-2 ring-[var(--surface)]" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: delay + 0.2 + i * 0.05, type: "spring", duration: 0.35, bounce: 0 }}>
                        <Fav domain={s.domain} size={14} className="rounded-full bg-[var(--surface)]" />
                      </motion.span>
                    ))}
                  </span>
                  <span className="ml-1.5">{sources.length} articles</span>
                </span>
              )}
              <span className="hidden sm:inline">· Ends {end}</span>
            </span>
          </span>
        </span>

        <span className="relative col-span-2 h-9 md:col-span-1 md:h-full">
          {[0.25, 0.5, 0.75].map((t) => (
            <span key={t} className="absolute inset-y-0 w-px bg-[var(--line)]" style={{ left: `${t * 100}%` }} />
          ))}
          <Rail market={market.price} preds={preds} thinking={thinking} delay={delay} />
        </span>

        <span className="col-start-2 row-start-1 text-right md:col-start-auto md:row-start-auto">
          {pts === null ? (
            <span className="text-[14px] text-[var(--dim)]">{thinking ? <span className="dots" /> : "-"}</span>
          ) : (
            <span className="block">
              <span style={{ color: tone }}>
                <Ticker value={pts} format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}`} className="num block text-[22px] leading-none font-medium tracking-[-0.02em]" duration={0.9} delay={delay + 0.6} />
              </span>
              <span className="mt-1.5 flex h-4 items-center justify-end text-[12px] whitespace-nowrap text-[var(--dim)]">
                <span className="lane-a">{Math.abs(pts) < 8 ? "Agree" : pts > 0 ? "AI higher" : "AI lower"}</span>
                <span className="lane-b num items-center gap-2.5">
                  {ok.map(([m, p]) => (
                    <span key={m} className="inline-flex items-center gap-1" style={{ color: COLOR[m] }}>
                      <ModelLogo model={m} size={12} />
                      {Math.round(p.p * 100)}
                    </span>
                  ))}
                </span>
              </span>
            </span>
          )}
        </span>
      </button>
    </motion.li>
  );
}

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="21" height="21" rx="7" fill="var(--surface-2)" stroke="var(--line-2)" />
      <path d="M5 11h12" stroke="var(--text)" strokeOpacity="0.45" strokeDasharray="1.5 2" />
      <path d="M5 14.5l3.2-4 2.6 2 3-5.5L17 9" stroke="var(--decisions)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
