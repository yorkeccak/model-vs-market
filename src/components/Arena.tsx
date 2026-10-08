"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { COLOR, consensus, okPreds, timeAgo, type Preds } from "@/lib/client";
import { REPO_URL, VALYU_URL } from "@/lib/site";
import { track } from "@/lib/track";
import { MODELS, MODEL_META, type BoardSnapshot, type Market, type PublicSource } from "@/lib/types";
import { Detail, type DetailTarget } from "./Detail";
import { ValyuLockup, ValyuMark } from "./ValyuLogo";
import { Fav, MarketIcon, ModelLogo } from "./Icon";
import { Rail } from "./Rail";
import { Search } from "./Search";
import { Ticker } from "./Ticker";

type Row = { market: Market; sources: PublicSource[] | null; preds: Preds };
const COLS = "md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)_136px]";

const edgeOf = (r: Row) => {
  const c = consensus(r.preds);
  return c === null ? null : c - r.market.price;
};

export function Arena({ initial }: { initial: BoardSnapshot | null }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const rows = useMemo<Row[]>(() => initial?.rows ?? [], [initial]);
  const updatedAt = initial?.at ?? null;
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [now, setNow] = useState(() => initial?.at ?? 0);

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  // Everyone shares one board, refreshed on the server every 15 minutes. Refreshing here only
  // re-reads that snapshot, so it never triggers model calls. Poll quickly while the first board builds.
  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), rows.length ? 5 * 60e3 : 8e3);
    return () => clearInterval(t);
  }, [refresh, rows.length]);

  const ordered = useMemo(() => [...rows].sort((a, b) => Math.abs(edgeOf(b) ?? -1) - Math.abs(edgeOf(a) ?? -1)), [rows]);

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
  useEffect(() => {
    if (isPhone()) window.scrollTo({ top: 0 });
  }, [detail]);

  return (
    <main className="mx-auto grid min-h-dvh max-w-[1440px] grid-rows-[auto_auto_auto_auto] px-4 md:h-dvh md:grid-rows-[auto_auto_minmax(0,1fr)_auto] md:overflow-hidden md:px-8">
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
            {refreshing ? (
              <span className="dots">Refreshing</span>
            ) : updatedAt ? (
              `Updated ${timeAgo(updatedAt, now)}`
            ) : (
              <span className="dots">Building the first board</span>
            )}
          </span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="View the source on GitHub"
            onClick={() => track("Outbound", { to: "github", from: "header" })}
            className="press inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[var(--text)] shadow-[inset_0_0_0_1px_var(--line-2)] hover:bg-white/5"
          >
            <GitHubMark />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <a
            href={VALYU_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Powered by Valyu"
            onClick={() => track("Outbound", { to: "valyu", from: "header" })}
            className="press inline-flex items-center gap-2 rounded-full bg-[var(--text)] px-3.5 py-1.5 text-[var(--bg)] hover:bg-white"
          >
            <span className="hidden text-[12.5px] sm:inline">Powered by</span>
            <ValyuLockup className="h-[11px] w-auto" />
          </a>
        </div>
      </header>

      <section className="pb-4">
        <AnimatePresence initial={false}>
          {!detail && (
            <motion.div
              key="hero"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2 pt-3 pb-5">
                <div>
                  <h1 className="rise text-[30px] leading-[1.05] font-semibold tracking-[-0.03em] md:text-[48px]">
                    Can AI out-guess the market?
                  </h1>
                  <p
                    className="rise mt-2 max-w-[600px] text-[15px] text-[var(--muted)] md:text-[17px]"
                    style={{ animationDelay: "0.1s" }}
                  >
                    Decision models from <Brand m="decisions" />, <Brand m="jev" /> and <Brand m="clef" /> read today&apos;s news, never the
                    odds, and put a probability on any question. Then we compare them with real-money markets.
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

      <section
        className="surface relative overflow-hidden rounded-[20px] md:min-h-0"
      >
        <AnimatePresence initial={false}>
          {detail ? (
            <Detail key={"market" in detail ? detail.market.id : detail.question} target={detail} onClose={close} />
          ) : (
            <motion.div
              key="field"
              className="md:absolute md:inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: isPhone() ? 0 : 0.2 } }}
              transition={{ duration: 0.2 }}
            >
              <Field
                rows={ordered}
                onOpen={(r) => {
                  track("Open market", { from: "board", venue: r.market.venue, question: r.market.question });
                  setDetail({ market: r.market });
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <footer className="flex h-11 items-center justify-between gap-4 text-[12.5px] text-[var(--dim)]">
        <span className="flex items-center gap-1.5">
          Search powered by
          <a
            href={VALYU_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => track("Outbound", { to: "valyu", from: "footer" })}
            className="inline-flex items-center gap-1.5 text-[var(--muted)] hover:text-[var(--text)]"
          >
            <ValyuMark className="h-3 w-3" />
            Valyu
          </a>
          <span className="hidden md:inline">· Models never see market prices · Not financial advice</span>
        </span>
        <span className="num hidden items-center gap-3 lg:flex">
          <Stat v={stats.articles} label="articles read" />
          <Stat v={stats.decisions} label="AI decisions" />
          <Stat v={stats.median} label="median" f={(v) => `${Math.round(v)}ms`} />
          <Stat v={stats.cents} label="model cost" f={(v) => `${v.toFixed(2)}¢`} />
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

function Field({ rows, onOpen }: { rows: Row[]; onOpen: (r: Row) => void }) {
  const ref = useRef<HTMLOListElement>(null);
  const [fit, setFit] = useState(8);
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([e]) => setFit(window.innerWidth < 768 ? Infinity : Math.max(3, Math.floor(e.contentRect.height / 60))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const visible = rows.length ? rows.slice(0, fit) : null;
  const count = visible?.length ?? Math.min(fit, 8);

  return (
    <div className="field flex h-full flex-col">
      <div
        className={`grid shrink-0 items-center gap-x-6 gap-y-2 border-b border-[var(--line)] px-4 py-3 text-[13px] text-[var(--muted)] md:h-12 md:px-5 md:py-0 ${COLS}`}
      >
        <span className="font-medium text-[var(--text)]">Most-traded questions right now</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] md:hidden">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-[2px] rounded-full bg-[var(--market)]" />
            Market
          </span>
          {MODELS.map((m) => (
            <span key={m} className="flex items-center gap-1.5">
              <ModelLogo model={m} size={14} />
              {MODEL_META[m].name}
            </span>
          ))}
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
        <ol
          ref={ref}
          className="grid md:min-h-0 md:flex-1 md:[grid-template-rows:var(--rows)]"
          style={{ "--rows": `repeat(${count}, minmax(0, 1fr))` } as CSSProperties}
        >
          {visible
            ? visible.map((r, i) => <Lane key={r.market.id} row={r} index={i} onOpen={() => onOpen(r)} />)
            : Array.from({ length: count }).map((_, i) => (
                <li key={i} className={`grid h-[84px] items-center gap-x-6 border-b md:h-auto border-[var(--line)] px-4 last:border-b-0 md:px-5 ${COLS}`}>
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

function Lane({ row, index, onOpen }: { row: Row; index: number; onOpen: () => void }) {
  const { market, preds, sources } = row;
  const edge = edgeOf(row);
  const ok = okPreds(preds);
  const thinking = sources === null;
  const pts = edge === null ? null : Math.round(edge * 100);
  const end = market.endDate ? new Date(market.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const delay = Math.min(index, 14) * 0.06;
  const tone = pts === null || Math.abs(pts) < 8 ? "var(--muted)" : pts > 0 ? "var(--decisions)" : "var(--clef)";

  return (
    <motion.li
      layout="position"
      transition={{ layout: { type: "spring", stiffness: 300, damping: 34 } }}
      className="lane min-h-0 border-b border-[var(--line)] last:border-b-0"
    >
      <button
        onClick={onOpen}
        className={`grid h-full w-full grid-cols-[minmax(0,1fr)_auto] content-center items-center gap-x-4 gap-y-2 px-4 py-3 text-left md:gap-x-6 md:gap-y-1.5 md:px-5 md:py-0 ${COLS}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <MarketIcon market={market} size={34} />
          <span className="min-w-0">
            <span className="line-clamp-2 block text-[15px] leading-tight font-medium md:truncate md:text-[15.5px]">{market.question}</span>
            <span className="num mt-1 flex items-center gap-1.5 overflow-hidden text-[12.5px] whitespace-nowrap text-[var(--dim)]">
              <span className="text-[var(--muted)]">
                {Math.round(market.price * 100)}% on {market.venue === "kalshi" ? "Kalshi" : "Polymarket"}
              </span>
              <span>·</span>
              {sources === null ? (
                <span className="dots">Reading the news</span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="hidden sm:flex">
                    {sources.slice(0, 5).map((s, i) => (
                      <motion.span
                        key={s.domain + i}
                        className="-mr-1 rounded-full ring-2 ring-[var(--surface)]"
                        initial={{ opacity: 0, scale: 0.4 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: delay + 0.2 + i * 0.05, type: "spring", duration: 0.35, bounce: 0 }}
                      >
                        <Fav domain={s.domain} size={14} className="rounded-full bg-[var(--surface)]" />
                      </motion.span>
                    ))}
                  </span>
                  <span className="sm:ml-1.5">{sources.length} articles</span>
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
                <Ticker
                  value={pts}
                  format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}`}
                  className="num block text-[22px] leading-none font-medium tracking-[-0.02em]"
                  duration={0.9}
                  delay={delay + 0.6}
                />
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
  return <Image src="/logo.png" alt="" width={24} height={24} priority className="rounded-[7px]" />;
}

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

// Official GitHub mark (Octicons, MIT).
function GitHubMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}
