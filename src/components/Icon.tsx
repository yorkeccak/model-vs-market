import Image from "next/image";
import { COLOR, favicon } from "@/lib/client";
import { MODEL_META, type Market, type ModelId } from "@/lib/types";

const VENUE_DOMAIN = { polymarket: "polymarket.com", kalshi: "kalshi.com" } as const;

// Market artwork, falling back to the venue's favicon.
export function MarketIcon({ market, size = 32, className = "" }: { market: Pick<Market, "icon" | "venue">; size?: number; className?: string }) {
  const src = market.icon ?? favicon(VENUE_DOMAIN[market.venue]);
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      unoptimized={!market.icon}
      loading="eager"
      sizes={`${size}px`}
      className={`max-w-none shrink-0 rounded-[9px] bg-[var(--surface-2)] object-cover outline outline-1 -outline-offset-1 outline-white/10 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// Site favicon via Google's favicon service; already tiny, so skip optimisation.
export function Fav({ domain, size = 16, className = "" }: { domain: string; size?: number; className?: string }) {
  return <Image src={favicon(domain)} alt="" width={size} height={size} unoptimized loading="eager" className={`max-w-none shrink-0 rounded-[4px] ${className}`} style={{ width: size, height: size }} />;
}

export function VenueBadge({ venue }: { venue: Market["venue"] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Fav domain={VENUE_DOMAIN[venue]} size={13} />
      {venue === "kalshi" ? "Kalshi" : "Polymarket"}
    </span>
  );
}

// Official maker mark for each model, optionally ringed in the model's series colour.
export function ModelLogo({ model, size = 16, ring = false, className = "" }: { model: ModelId; size?: number; ring?: boolean; className?: string }) {
  return (
    <Image
      src={MODEL_META[model].logo}
      alt={MODEL_META[model].maker}
      width={size}
      height={size}
      unoptimized
      loading="eager"
      className={`max-w-none shrink-0 rounded-full bg-white object-contain ${model === "clef" ? "p-[1.5px]" : ""} ${className}`}
      style={{ width: size, height: size, boxShadow: ring ? `0 0 0 1.5px ${COLOR[model]}, 0 0 10px ${COLOR[model]}` : undefined }}
    />
  );
}
