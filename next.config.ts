import type { NextConfig } from "next";

// Internal pages used to live at the root; keep old bookmarks and emailed links working.
const MOVED = ["batches", "stock", "products", "areas", "users", "settings"];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/login", destination: "/admin/login", permanent: true },
      ...MOVED.flatMap((name) => [
        { source: `/${name}`, destination: `/admin/${name}`, permanent: true },
        { source: `/${name}/:path*`, destination: `/admin/${name}/:path*`, permanent: true },
      ]),
    ];
  },
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
