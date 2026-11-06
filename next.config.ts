import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // cacheComponents/partialPrefetching are off: every page is per-user and dynamic, and with them
  // on, session reads must stream behind Suspense, which loses real 404/redirect status codes.
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
