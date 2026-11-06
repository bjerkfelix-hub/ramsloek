import { CONTACT_EMAIL, format, getDictionary, SITE_NAME, type Locale, type Recipe } from "@/content";
import type { MarketDay } from "@/lib/domain/season";
import { ROUTES, contactHref } from "./routes";
import { absoluteUrl } from "./site";

const offsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Oslo",
  timeZoneName: "longOffset",
});

/** "2027-05-08", "10:00" (Oslo wall-clock) -> "2027-05-08T10:00:00+02:00", with the right DST offset. */
export function osloIso(ymd: string, hhmm: string): string {
  const [h, m] = hhmm.slice(0, 5).split(":");
  // Oslo is 1-2 h ahead of UTC and the clocks change at 01:00 UTC, so 2 h before the wall time read as UTC
  // falls on the right side of the change for any realistic opening hours.
  const probe = new Date(`${ymd}T${h}:${m}:00Z`);
  probe.setUTCHours(probe.getUTCHours() - 2);
  const name =
    offsetFormat.formatToParts(probe).find((p) => p.type === "timeZoneName")
      ?.value ?? "GMT+01:00";
  const offset = name === "GMT" ? "+00:00" : name.replace("GMT", "");
  return `${ymd}T${h}:${m}:00${offset}`;
}

/** JSON for a <script type="application/ld+json"> element; every "<" and the JS line separators are escaped so the script cannot be closed early. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function recipeJsonLd(
  recipe: Recipe,
  locale: Locale,
): Record<string, unknown> {
  const dict = getDictionary(locale);
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title[locale],
    description: recipe.intro[locale],
    recipeIngredient: recipe.ingredients[locale],
    recipeInstructions: recipe.steps[locale].map((text) => ({
      "@type": "HowToStep",
      text,
    })),
    ...(recipe.durationIso ? { totalTime: recipe.durationIso } : {}),
    recipeYield: format(dict.recipes.servings, { count: recipe.servings }),
    inLanguage: locale === "en" ? "en" : "nb",
  };
}

export function marketEventJsonLd(
  day: MarketDay,
  locale: Locale,
): Record<string, unknown> {
  const note = locale === "en" ? day.noteEn : day.noteNo;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: day.placeName,
    ...(note ? { description: note } : {}),
    startDate: osloIso(day.marketDate, day.startsAt),
    endDate: osloIso(day.marketDate, day.endsAt),
    eventStatus: day.cancelled
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: day.placeName, address: day.address },
    inLanguage: locale === "en" ? "en" : "nb",
  };
}

/** LocalBusiness for the front pages: no street address, phone or opening hours are published. */
export function localBusinessJsonLd(locale: Locale): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: SITE_NAME,
    url: absoluteUrl(ROUTES[locale].home),
    email: contactHref(CONTACT_EMAIL).replace(/^mailto:/, ""),
    areaServed: "Oslo",
    description: getDictionary(locale).pages.home.description,
    inLanguage: locale === "en" ? "en" : "nb",
  };
}
