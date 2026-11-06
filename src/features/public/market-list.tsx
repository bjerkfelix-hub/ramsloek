import { getDictionary, type Locale } from '@/content'
import type { MarketDay } from '@/lib/domain/season'
import { formatPublicDate, formatPublicTime, mapUrl, marketNote } from './view'

export function MarketList({ days, locale }: { days: MarketDay[]; locale: Locale }) {
  const { markets } = getDictionary(locale)
  return (
    <ol className="flex flex-col gap-3">
      {days.map((day) => {
        const note = marketNote(day, locale)
        return (
          <li
            key={day.id}
            className={`rounded-xl border border-line px-4 py-4 sm:px-5 ${day.cancelled ? 'bg-paper' : 'bg-cream'}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className={`font-display text-lg font-semibold first-letter:uppercase ${day.cancelled ? 'text-muted' : 'text-forest'}`}>
                {formatPublicDate(day.marketDate, locale)}
              </p>
              <p className={day.cancelled ? 'text-muted' : 'font-medium'}>{formatPublicTime(day, locale)}</p>
            </div>
            {day.cancelled && (
              <p className="mt-1">
                <span className="inline-block rounded-full bg-alert-bg px-3 py-0.5 text-sm font-semibold text-alert">
                  {markets.cancelled}
                </span>
              </p>
            )}
            <p className="mt-1 font-medium">{day.placeName}</p>
            <p className="text-muted">{day.address}</p>
            {note && <p className="mt-1">{note}</p>}
            {!day.cancelled && (
              <p className="mt-2">
                <a href={mapUrl(day.address)} className="inline-block py-1 text-forest underline">
                  {markets.showOnMap}
                  <span className="sr-only">: {day.placeName}</span>
                </a>
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
