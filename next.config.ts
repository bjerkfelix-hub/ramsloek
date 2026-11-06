import type { NextConfig } from "next";

// Internal pages used to live at the root; keep old bookmarks and emailed links working.
const MOVED = ["batches", "stock", "products", "areas", "users", "settings"];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/oppskrifter/ramslokssuppe", destination: "/oppskrifter/ramsloksuppe", permanent: true },
      { source: "/en/recipes/ramslokssuppe", destination: "/en/recipes/ramsloksuppe", permanent: true },
      { source: "/login", destination: "/admin/login", permanent: true },
      ...MOVED.flatMap((name) => [
        { source: `/${name}`, destination: `/admin/${name}`, permanent: true },
        { source: `/${name}/:path*`, destination: `/admin/${name}/:path*`, permanent: true },
      ]),
    ];
  },
  experimental: {
    // The app has several root layouts (public NO, public EN, admin) and no top-level layout, so
    // there is no single layout to render a 404 for unmatched URLs in. Next's documented answer is
    // app/global-not-found.tsx, which is still behind this experimental flag (Next 16.4). Side effect:
    // unknown /admin/... URLs also get the (Norwegian) public 404; notFound() inside admin is unchanged.
    globalNotFound: true,
  },
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
