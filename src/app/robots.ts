import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/public/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/avmelding", "/en/unsubscribe"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
