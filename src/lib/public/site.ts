import type { Metadata, ResolvingMetadata } from "next";
import { SITE_NAME } from "@/content/site";
import { alternatePath, localeOfPath } from "./routes";

/** Public origin (punycode form of ramsløk.no). */
export const SITE_URL = "https://xn--ramslk-fya.no";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/**
 * Canonical + hreflang alternates for a public page path. Use as `metadata.alternates`.
 * Norwegian is the default (x-default) language.
 */
export function pageAlternates(
  pathname: string,
): NonNullable<Metadata["alternates"]> {
  const isEnglish = localeOfPath(pathname) === "en";
  const other = alternatePath(pathname);
  const no = isEnglish ? other : pathname;
  const en = isEnglish ? pathname : other;
  return {
    canonical: absoluteUrl(pathname),
    languages: {
      nb: absoluteUrl(no),
      en: absoluteUrl(en),
      "x-default": absoluteUrl(no),
    },
  };
}

/**
 * Title, description, canonical + hreflang, Open Graph and Twitter card for a public page.
 * The share image comes from the `opengraph-image` file convention of the language root.
 */
export function pageSocialMetadata(page: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const { title, description, path } = page;
  const alternates = pageAlternates(path);
  return {
    title,
    description,
    alternates,
    openGraph: {
      type: "website",
      title,
      description,
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      locale: localeOfPath(path) === "en" ? "en_GB" : "nb_NO",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * A page's own `openGraph`/`twitter` replace the layout's wholesale (shallow merge), which would drop the
 * share image from the language root's `opengraph-image`. Copy the resolved parent images back in.
 */
export async function withParentShareImage(
  meta: Metadata,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { openGraph, twitter } = await parent;
  return {
    ...meta,
    openGraph: { ...meta.openGraph, images: openGraph?.images },
    twitter: { ...meta.twitter, images: twitter?.images ?? openGraph?.images },
  } as Metadata;
}
