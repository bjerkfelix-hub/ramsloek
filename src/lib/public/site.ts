import type { Metadata } from "next";
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
