import type { NextConfig } from "next";

// DealerOS Phase 1 is a fully client-side app backed by IndexedDB, so
// Cache Components / partial prefetching are intentionally left off.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
