import { track as vercelTrack } from "@vercel/analytics";

type Props = Record<string, string | number | boolean | null>;

// Custom events for Vercel Web Analytics. Values are capped at 255 characters.
export function track(event: string, props?: Props) {
  const clipped = props && Object.fromEntries(Object.entries(props).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 255) : v]));
  vercelTrack(event, clipped);
}
