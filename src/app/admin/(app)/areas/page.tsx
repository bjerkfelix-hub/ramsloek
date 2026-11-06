import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { GeoButton } from '@/components/geo-button'
import { saveArea } from './actions'

export default async function AreasPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireRole('owner')
  const { edit } = await searchParams
  const supabase = await createClient()
  const { data: areas } = await supabase.from('harvest_areas').select('*').order('name')
  const editing = areas?.find((a) => a.id === edit)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Områder</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{editing ? `Rediger ${editing.name}` : 'Nytt område'}</h2>
        <ActionForm key={editing?.id ?? 'new'} action={saveArea} resetOnSuccess={!editing}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Navn">
            <input name="name" required defaultValue={editing?.name ?? ''} className={inputClass} />
          </Field>
          <Field label="Breddegrad">
            <input name="lat" inputMode="decimal" defaultValue={editing?.lat ?? ''} className={inputClass} />
          </Field>
          <Field label="Lengdegrad">
            <input name="lng" inputMode="decimal" defaultValue={editing?.lng ?? ''} className={inputClass} />
          </Field>
          <GeoButton />
          {editing && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="active" defaultChecked={editing.active} className="h-5 w-5" />
              Aktiv
            </label>
          )}
        </ActionForm>
      </section>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300">
              <th className="py-2 pr-3">Navn</th>
              <th className="py-2 pr-3">Posisjon</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {areas?.map((a) => (
              <tr key={a.id} className="border-b border-zinc-200">
                <td className="py-2 pr-3">{a.name}</td>
                <td className="py-2 pr-3">{a.lat != null && a.lng != null ? `${a.lat}, ${a.lng}` : '–'}</td>
                <td className="py-2 pr-3">{a.active ? 'Aktiv' : 'Inaktiv'}</td>
                <td className="py-2">
                  <Link href={`/admin/areas?edit=${a.id}`} className="text-green-900 underline">
                    Rediger
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
