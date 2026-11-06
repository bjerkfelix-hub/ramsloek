import type { Metadata, ResolvingMetadata } from "next";
import { getDictionary, type Locale } from "@/content";
import { ROUTES, type PageKey } from "@/lib/public/routes";
import { pageSocialMetadata, withParentShareImage } from "@/lib/public/site";

/** Title, description, hreflang alternates and share metadata for a public page (the front page included). */
export function pageMetadata(locale: Locale, key: PageKey): Metadata {
  const { title, description } = getDictionary(locale).pages[key];
  return pageSocialMetadata({ title, description, path: ROUTES[locale][key] });
}

/** `generateMetadata` for a plain page: pageMetadata plus the share image inherited from the language root. */
export function pageMetadataFor(locale: Locale, key: PageKey) {
  return (_props: unknown, parent: ResolvingMetadata): Promise<Metadata> =>
    withParentShareImage(pageMetadata(locale, key), parent);
}
