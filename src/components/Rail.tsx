"use client";

import { motion } from "motion/react";
import { consensus, okPreds, type Preds } from "@/lib/client";
import { MODELS } from "@/lib/types";
import { ModelLogo } from "./Icon";

const fly = { type: "spring" as const, stiffness: 120, damping: 17, mass: 0.8 };

// One lane: white tick = market price, logos = models, hatching = the spread
// between the crowd and the models' average.
export function Rail({ market, preds, thinking, delay = 0 }: { market: number; preds: Preds; thinking: boolean; delay?: number }) {
  const avg = consensus(preds);
  const ok = new Map(okPreds(preds));
  const lo = avg === null ? market : Math.min(market, avg);
  const hi = avg === null ? market : Math.max(market, avg);
  const up = avg !== null && avg >= market;

  return (
    <div className="relative h-full w-full">
      {/* track sweeps in */}
      <motion.div
        className="absolute inset-x-0 top-1/2 h-px origin-left bg-[var(--line-2)]"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.7, delay, ease: [0.65, 0, 0.35, 1] }}
      />

      {/* spread */}
      <motion.div
        className={`absolute top-1/2 h-[9px] -translate-y-1/2 ${up ? "hatch-up" : "hatch-down"}`}
        initial={{ left: `${market * 100}%`, width: 0, opacity: 0 }}
        animate={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, opacity: avg === null ? 0 : 1 }}
        transition={{ ...fly, delay: delay + 0.55 }}
      />

      {/* market tick drops in */}
      <motion.div
        className="absolute top-1/2 h-[22px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--market)]"
        initial={{ left: `${market * 100}%`, scaleY: 0 }}
        animate={{ left: `${market * 100}%`, scaleY: 1 }}
        transition={{ scaleY: { duration: 0.35, delay: delay + 0.35, ease: [0.2, 0, 0, 1] }, left: fly }}
      >
        <span className="val num absolute bottom-[calc(100%+4px)] left-1/2 text-[11.5px] whitespace-nowrap text-[var(--market)]">
          {Math.round(market * 100)}%
        </span>
      </motion.div>

      {/* models fly out from the market price */}
      {MODELS.map((m, i) => {
        const pred = ok.get(m);
        return (
          <motion.div
            key={m}
            className="absolute top-1/2"
            initial={{ left: `${market * 100}%`, opacity: 0 }}
            animate={{ left: `${(pred?.p ?? market) * 100}%`, opacity: pred ? 1 : thinking ? 1 : 0 }}
            transition={{ left: { ...fly, delay: delay + 0.5 + i * 0.07 }, opacity: { duration: 0.2, delay: delay + 0.45 } }}
            style={{ marginTop: (i - 1) * 9 }}
          >
            <span
              className="absolute block -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ animation: !pred && thinking ? `pulse-dot 0.9s ${i * 0.15}s ease-in-out infinite` : undefined, zIndex: 3 - i }}
            >
              <ModelLogo model={m} size={17} ring={!!pred} className={pred ? "" : "opacity-60 grayscale"} />
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
