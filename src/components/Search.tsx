"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { friendlyStatus } from "@/lib/client";
import { track } from "@/lib/track";
import type { Market } from "@/lib/types";
import { MarketIcon, VenueBadge } from "./Icon";

const EXAMPLES = [
  "Will Bitcoin trade above $150k before 2027?",
  "Will the Fed cut rates in December 2026?",
  "Will OpenAI release GPT-7 before 2027?",
  "Will Apple announce a foldable iPhone in 2026?",
];

type Choice = { kind: "ask"; question: string } | { kind: "market"; market: Market };

const cache = new Map<string, Market[]>();

export function Search({ onPick, compact }: { onPick: (c: Choice) => void; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [hint, setHint] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const query = q.trim();
  const listId = useId();

  // Rotate the placeholder through example questions.
  useEffect(() => {
    const t = setInterval(() => setHint((i) => (i + 1) % EXAMPLES.length), 3500);
    return () => clearInterval(t);
  }, []);

  // "/" focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  // Debounced live-market search across Polymarket + Kalshi.
  useEffect(() => {
    if (query.length < 3) return;
    const key = query.toLowerCase();
    const hit = cache.get(key);
    if (hit) {
      const t = setTimeout(() => {
        setResults(hit);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ac.signal });
        if (!res.ok) {
          setNotice(friendlyStatus(res.status));
          return;
        }
        const { markets } = (await res.json()) as { markets: Market[] };
        cache.set(key, markets);
        setNotice(null);
        setResults(markets);
      } catch {
        // superseded or offline; keep previous results
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query]);

  const shown = query.length >= 3 ? results : [];
  const choices: Choice[] =
    query.length >= 3
      ? [{ kind: "ask", question: query }, ...shown.map((market) => ({ kind: "market" as const, market }))]
      : EXAMPLES.map((question) => ({ kind: "ask" as const, question }));

  const pick = (c: Choice) => {
    setOpen(false);
    inputRef.current?.blur();
    if (c.kind === "ask") {
      const question = c.question.endsWith("?") ? c.question : `${c.question}?`;
      track("Ask", { question, example: query.length < 3 });
      onPick({ kind: "ask", question });
    } else {
      track("Open market", { from: "search", venue: c.market.venue, question: c.market.question });
      onPick(c);
    }
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const c = choices[active] ?? (query ? { kind: "ask" as const, question: query } : null);
          if (c) pick(c);
        }}
        className={`surface flex items-center gap-2.5 rounded-2xl pr-2 pl-4 transition-[box-shadow] duration-200 focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.22),0_24px_48px_-24px_rgba(0,0,0,0.7)] ${compact ? "h-11" : "h-[54px]"}`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[var(--muted)]" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(choices.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Escape") {
                setOpen(false);
                inputRef.current?.blur();
              }
            }}
            aria-label="Ask any question, or search Polymarket and Kalshi"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            className={`w-full bg-transparent py-2 text-[var(--text)] caret-[var(--decisions)] outline-none ${compact ? "text-[15px]" : "text-[16.5px]"}`}
          />
          {!q && (
            <span
              className={`pointer-events-none absolute inset-y-0 left-0 flex max-w-full items-center overflow-hidden text-[var(--dim)] ${compact ? "text-[15px]" : "text-[16.5px]"}`}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={hint}
                  className="truncate"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  {compact ? "Ask anything, or search markets" : `Ask anything… “${EXAMPLES[hint]}”`}
                </motion.span>
              </AnimatePresence>
            </span>
          )}
        </span>
        <kbd className="hidden h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[12px] text-[var(--dim)] shadow-[inset_0_0_0_1px_var(--line-2)] md:inline-flex">
          /
        </kbd>
        <button
          type="submit"
          disabled={!query}
          className={`press shrink-0 rounded-xl bg-[var(--text)] px-4 font-medium text-[var(--bg)] hover:bg-white disabled:bg-white/10 disabled:text-[var(--dim)] ${compact ? "h-8 text-[13.5px]" : "h-10 text-[14.5px]"}`}
        >
          Ask the AIs
        </button>
      </form>

      <AnimatePresence>
        {open && (
          <motion.div
            id={listId}
            role="listbox"
            className="surface absolute inset-x-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl p-1.5"
            initial={{ opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
          >
            {query.length < 3 && <div className="px-3 pt-2 pb-1 text-[12.5px] text-[var(--dim)]">Try one of these, or type your own</div>}
            <ul className="max-h-[min(420px,55dvh)] overflow-y-auto [scrollbar-width:none]">
              {choices.map((c, i) => (
                <li key={c.kind === "ask" ? `ask:${c.question}` : c.market.id}>
                  {c.kind === "market" && i === 1 && <div className="px-3 pt-3 pb-1 text-[12.5px] text-[var(--dim)]">Live markets</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(c)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-100 ${i === active ? "bg-white/[0.06]" : ""}`}
                  >
                    {c.kind === "ask" ? (
                      <>
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[var(--surface-2)] text-[var(--decisions)] shadow-[inset_0_0_0_1px_var(--line)]">
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                            <path
                              d="M1 12l4-5 3 2 3-6 4 3"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px]">
                            {query.length >= 3 ? <>Ask the AIs: “{c.question}”</> : c.question}
                          </span>
                          {query.length >= 3 && (
                            <span className="block text-[12.5px] text-[var(--muted)]">
                              Your own question. We&apos;ll find a matching market if one exists.
                            </span>
                          )}
                        </span>
                        <span className="text-[12.5px] text-[var(--dim)]">↵</span>
                      </>
                    ) : (
                      <>
                        <MarketIcon market={c.market} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px]">{c.market.question}</span>
                          <span className="flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
                            <VenueBadge venue={c.market.venue} />
                            {c.market.endDate && (
                              <span className="text-[var(--dim)]">
                                · Ends{" "}
                                {new Date(c.market.endDate).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="num text-[15px] font-medium">{Math.round(c.market.price * 100)}%</span>
                      </>
                    )}
                  </button>
                </li>
              ))}
              {query.length >= 3 && loading && shown.length === 0 && (
                <li className="px-3 py-3 text-[13px] text-[var(--muted)]">
                  <span className="dots">Searching Polymarket and Kalshi</span>
                </li>
              )}
              {query.length >= 3 && !loading && shown.length === 0 && (
                <li className="px-3 py-3 text-[13px] text-[var(--dim)]">
                  {notice ?? "No live markets match. The AIs can still price your question."}
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export type { Choice };
