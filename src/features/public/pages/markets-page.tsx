import { connection } from "next/server";
import { getDictionary, type Locale } from "@/content";
import { getUpcomingMarketDays } from "@/lib/public/market-days";
import { marketEventJsonLd } from "@/lib/public/structured-data";
import type { MarketDay } from "@/lib/domain/season";
import { JsonLd } from "../json-ld";
import { MarketList } from "../market-list";
import { calendarView } from "../view";
import { PageHeading } from "./page-heading";

const monthHeading: Record<Locale, Intl.DateTimeFormat> = {
  no: new Intl.DateTimeFormat("nb-NO", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }),
};

/** Groups days (already ordered by date) by month, keeping order. */
export function groupByMonth(
  days: MarketDay[],
  locale: Locale,
): { key: string; heading: string; days: MarketDay[] }[] {
  const groups: { key: string; heading: string; days: MarketDay[] }[] = [];
  for (const day of days) {
    const key = day.marketDate.slice(0, 7);
    let group = groups.at(-1);
    if (group?.key !== key) {
      group = {
        key,
        heading: monthHeading[locale].format(new Date(`${key}-15T12:00:00Z`)),
        days: [],
      };
      groups.push(group);
    }
    group.days.push(day);
  }
  return groups;
}

export async function MarketsPage({ locale }: { locale: Locale }) {
  // Market data is read on every request.
  await connection();
  const dict = getDictionary(locale);
  const result = await getUpcomingMarketDays();
  const calendar = calendarView(result, dict);
  return (
    <div className="flex flex-col gap-8 pb-4 pt-8 sm:pt-12">
      <PageHeading title={dict.markets.heading} lead={dict.markets.lead} />
      {calendar.kind === "failed" && (
        <p className="rounded-xl bg-alert-bg px-4 py-3 text-alert">
          {calendar.message}
        </p>
      )}
      {calendar.kind === "empty" && (
        <div className="flex flex-col gap-1">
          <p>{calendar.message}</p>
          <p className="text-muted">{dict.markets.emptyPointer}</p>
        </div>
      )}
      {calendar.kind === "list" &&
        groupByMonth(calendar.days, locale).map((group) => (
          <section
            key={group.key}
            aria-labelledby={`maned-${group.key}`}
            className="flex flex-col gap-3"
          >
            <h2
              id={`maned-${group.key}`}
              className="font-display text-2xl font-semibold capitalize text-forest sm:text-3xl"
            >
              {group.heading}
            </h2>
            <MarketList days={group.days} locale={locale} />
          </section>
        ))}
      {calendar.kind === "list" &&
        calendar.days.map((day) => (
          <JsonLd key={day.id} data={marketEventJsonLd(day, locale)} />
        ))}
    </div>
  );
}
