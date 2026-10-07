import "server-only";
import { createHash } from "node:crypto";
import { getCache } from "@vercel/functions";

type Store = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: { ttl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

// Locally there's no Runtime Cache endpoint, and getCache's in-memory fallback is
// per bundle (pages and route handlers would each get their own), so use one
// process-wide map instead.
function localStore(): Store {
  const g = globalThis as unknown as { __mvmKv?: Map<string, { value: unknown; expires: number }> };
  const map = (g.__mvmKv ??= new Map());
  return {
    async get(key) {
      const hit = map.get(key);
      if (!hit || hit.expires < Date.now()) return undefined;
      return hit.value;
    },
    async set(key, value, options) {
      map.set(key, { value, expires: Date.now() + (options?.ttl ?? 3600) * 1000 });
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

// Vercel Runtime Cache: shared across function instances in a region, no keys or setup.
export const kv: Store = process.env.RUNTIME_CACHE_ENDPOINT
  ? getCache({ namespace: "mvm", keyHashFunction: (key) => createHash("sha256").update(key).digest("hex") })
  : localStore();
