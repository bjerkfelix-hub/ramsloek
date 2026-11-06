import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { GeoButton } from '@/components/geo-button'
import { saveArea } from './actions'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { ResponsiveSheet } from '@/features/admin/ui/ResponsiveSheet'

export default async function AreasPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireRole('owner')
  const { edit } = await searchParams
  const supabase = await createClient()
  const { data: areas } = await supabase.from('harvest_areas').select('*').order('name')
  const editing = areas?.find((a) => a.id === edit)

  return (
    <Page>
      <LargeTitle>Områder</LargeTitle>
      <ResponsiveSheet title={editing ? `Rediger ${editing.name}` : 'Nytt område'} inline={!!editing}>
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
            <label className="a-check">
              <input type="checkbox" name="active" defaultChecked={editing.active} />
              Aktiv
            </label>
          )}
        </ActionForm>
      </ResponsiveSheet>
      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th>Navn</th>
              <th>Posisjon</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {areas?.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.lat != null && a.lng != null ? `${a.lat}, ${a.lng}` : '–'}</td>
                <td>{a.active ? 'Aktiv' : 'Inaktiv'}</td>
                <td>
                  <Link href={`/admin/areas?edit=${a.id}`} className="a-link a-link-tap">
                    Rediger
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  )
}
