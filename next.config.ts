import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  experimental: {
    // Native Rust port of the React Compiler inside Turbopack.
    turbopackRustReactCompiler: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "polymarket-upload.s3.us-east-2.amazonaws.com" },
      { protocol: "https", hostname: "kalshi-fallback-images.s3.amazonaws.com" },
      { protocol: "https", hostname: "*.kalshi.com" },
    ],
  },
};

export default nextConfig;
