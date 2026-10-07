"use client";

import { animate, useMotionValue, useTransform, motion } from "motion/react";
import { useEffect } from "react";

// Number that rolls to its new value instead of jumping.
export function Ticker({
  value,
  format = (v) => String(Math.round(v)),
  duration = 0.9,
  delay = 0,
  className,
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, format);
  useEffect(() => {
    const c = animate(mv, value, { duration, delay, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [mv, value, duration, delay]);
  return <motion.span className={`num ${className ?? ""}`}>{text}</motion.span>;
}
