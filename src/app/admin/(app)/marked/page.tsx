import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { MarketCancelButton } from '@/components/market-cancel-button'
import { formatMarketDate, formatMarketTimes } from '@/lib/domain/market'
import { todayOslo } from '@/lib/domain/time'
import { saveMarketDay, setMarketDayCancelled } from './actions'

type MarketDay = {
  id: string
  market_date: string
  starts_at: string
  ends_at: string
  place_name: string
  address: string
  note_no: string | null
  note_en: string | null
  published: boolean
  cancelled: boolean
}

function DayItem({ day }: { day: MarketDay }) {
  return (
    <li className="flex flex-col gap-1 border-b border-zinc-200 py-3">
      <div className="font-medium">
        {formatMarketDate(day.market_date)}, {formatMarketTimes(day.starts_at, day.ends_at)}
      </div>
      <div className="text-sm">
        {day.place_name}, {day.address}
      </div>
      {(day.note_no || day.note_en) && (
        <div className="text-sm text-zinc-600">{[day.note_no, day.note_en].filter(Boolean).join(' / ')}</div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {day.cancelled && <span className="rounded bg-red-100 px-2 py-1 font-medium text-red-800">Avlyst</span>}
        {!day.published && <span className="rounded bg-zinc-200 px-2 py-1">Ikke publisert</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/admin/marked?edit=${day.id}`} className="py-2 text-green-900 underline">
          Rediger
        </Link>
        <MarketCancelButton id={day.id} cancelled={day.cancelled} action={setMarketDayCancelled} />
      </div>
    </li>
  )
}

export default async function MarkedPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireRole('owner')
  const { edit } = await searchParams
  const supabase = await createClient()
  const { data } = await supabase.from('market_days').select('*').order('market_date').order('starts_at')
  const days = (data ?? []) as MarketDay[]
  const today = todayOslo()
  const upcoming = days.filter((d) => d.market_date >= today)
  const past = days.filter((d) => d.market_date < today).reverse()
  const editing = days.find((d) => d.id === edit)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Marked</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{editing ? `Rediger ${editing.place_name}` : 'Ny markedsdag'}</h2>
        {editing && (
          <Link href="/admin/marked" className="text-green-900 underline">
            Avbryt redigering
          </Link>
        )}
        <ActionForm key={editing?.id ?? 'new'} action={saveMarketDay} resetOnSuccess={!editing}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Dato">
            <input type="date" name="date" defaultValue={editing?.market_date ?? ''} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fra">
              <input
                type="time"
                name="starts"
                defaultValue={editing?.starts_at.slice(0, 5) ?? ''}
                className={inputClass}
              />
            </Field>
            <Field label="Til">
              <input type="time" name="ends" defaultValue={editing?.ends_at.slice(0, 5) ?? ''} className={inputClass} />
            </Field>
          </div>
          <Field label="Sted">
            <input name="place" defaultValue={editing?.place_name ?? ''} className={inputClass} />
          </Field>
          <Field label="Adresse">
            <input name="address" defaultValue={editing?.address ?? ''} className={inputClass} />
          </Field>
          <Field label="Merknad (norsk)">
            <input name="note_no" defaultValue={editing?.note_no ?? ''} className={inputClass} />
          </Field>
          <Field label="Merknad (engelsk)">
            <input name="note_en" defaultValue={editing?.note_en ?? ''} className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="published" defaultChecked={editing?.published ?? true} className="h-5 w-5" />
            Publisert
          </label>
        </ActionForm>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Kommende markedsdager</h2>
        {upcoming.length ? (
          <ul>
            {upcoming.map((d) => (
              <DayItem key={d.id} day={d} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">Ingen kommende markedsdager.</p>
        )}
      </section>
      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer py-2 text-lg font-medium">Tidligere markedsdager</summary>
          <ul>
            {past.map((d) => (
              <DayItem key={d.id} day={d} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
