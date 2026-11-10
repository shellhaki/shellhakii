import type { NextConfig } from "next";
import { redirects } from "./src/lib/302s";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Shortcut paths from src/lib/302s.ts, served as 302 redirects.
  async redirects() {
    return redirects.map(({ from, to }) => ({
      source: from,
      destination: to,
      statusCode: 302 as const,
    }));
  },
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
