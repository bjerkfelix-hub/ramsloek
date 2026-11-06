import type { MetadataRoute } from "next";
import { recipes } from "@/content";
import { ROUTES } from "@/lib/public/routes";
import { absoluteUrl, pageAlternates } from "@/lib/public/site";

/** Every public page and recipe in both languages, with hreflang alternates. Admin and unsubscribe pages are left out. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    ...Object.values(ROUTES.no),
    ...Object.values(ROUTES.en),
    ...recipes.flatMap((r) => [
      `${ROUTES.no.recipes}/${r.slug}`,
      `${ROUTES.en.recipes}/${r.slug}`,
    ]),
  ];
  return paths.map((path) => ({
    url: absoluteUrl(path),
    alternates: { languages: pageAlternates(path).languages as Record<string, string> },
  }));
}
