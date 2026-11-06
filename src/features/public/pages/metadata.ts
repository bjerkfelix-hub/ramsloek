import type { Metadata } from "next";
import { getDictionary, type Locale } from "@/content";
import { ROUTES, type PageKey } from "@/lib/public/routes";
import { pageAlternates } from "@/lib/public/site";

type SimplePage = Exclude<PageKey, "home">;

/** Title, description and hreflang alternates for one of the plain pages. */
export function pageMetadata(locale: Locale, key: SimplePage): Metadata {
  const { title, description } = getDictionary(locale).pages[key];
  return {
    title,
    description,
    alternates: pageAlternates(ROUTES[locale][key]),
  };
}
