import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { saveProduct } from './actions'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { ResponsiveSheet } from '@/features/admin/ui/ResponsiveSheet'

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireRole('owner')
  const { edit } = await searchParams
  const supabase = await createClient()
  const { data: products } = await supabase.from('products').select('*').order('name')
  const editing = products?.find((p) => p.id === edit)

  return (
    <Page>
      <LargeTitle>Produkter</LargeTitle>
      <ResponsiveSheet title={editing ? `Rediger ${editing.name}` : 'Nytt produkt'} inline={!!editing}>
      <ActionForm key={editing?.id ?? 'new'} action={saveProduct} resetOnSuccess={!editing}>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <Field label="Navn">
          <input name="name" required defaultValue={editing?.name ?? ''} className={inputClass} />
        </Field>
        <Field label="Nettovekt (g)">
          <input
            name="net_weight_g"
            type="number"
            min={1}
            step={1}
            required
            inputMode="numeric"
            defaultValue={editing?.net_weight_g ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label="Type">
          <select name="unit_kind" defaultValue={editing?.unit_kind ?? 'consumer'} className={inputClass}>
            <option value="consumer">Forbrukerpakning</option>
            <option value="trade">Gros</option>
          </select>
        </Field>
        <Field label="GTIN">
          <input name="gtin" inputMode="numeric" defaultValue={editing?.gtin ?? ''} className={inputClass} />
        </Field>
        <Field label="Holdbarhet (dager)">
          <input
            name="shelf_life_days"
            type="number"
            min={1}
            max={60}
            step={1}
            required
            inputMode="numeric"
            defaultValue={editing?.shelf_life_days ?? 6}
            className={inputClass}
          />
        </Field>
        <Field label="Oppbevaring">
          <input name="storage_text" defaultValue={editing?.storage_text ?? 'Oppbevares kjølig'} className={inputClass} />
        </Field>
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
              <th>Vekt</th>
              <th>Type</th>
              <th>GTIN</th>
              <th>Holdbarhet</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products?.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.net_weight_g} g</td>
                <td>{p.unit_kind === 'consumer' ? 'Forbrukerpakning' : 'Gros'}</td>
                <td>{p.gtin ?? '–'}</td>
                <td>{p.shelf_life_days} d</td>
                <td>{p.active ? 'Aktiv' : 'Inaktiv'}</td>
                <td>
                  <Link href={`/admin/products?edit=${p.id}`} className="a-link a-link-tap">
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
