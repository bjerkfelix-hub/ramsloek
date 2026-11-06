import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { saveProduct } from './actions'

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireRole('owner')
  const { edit } = await searchParams
  const supabase = await createClient()
  const { data: products } = await supabase.from('products').select('*').order('name')
  const editing = products?.find((p) => p.id === edit)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Produkter</h1>
      <ActionForm key={editing?.id ?? 'new'} action={saveProduct} resetOnSuccess={!editing}>
        <h2 className="text-lg font-medium">{editing ? `Rediger ${editing.name}` : 'Nytt produkt'}</h2>
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
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="active" defaultChecked={editing.active} className="h-5 w-5" />
            Aktiv
          </label>
        )}
      </ActionForm>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300">
              <th className="py-2 pr-3">Navn</th>
              <th className="py-2 pr-3">Vekt</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">GTIN</th>
              <th className="py-2 pr-3">Holdbarhet</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {products?.map((p) => (
              <tr key={p.id} className="border-b border-zinc-200">
                <td className="py-2 pr-3">{p.name}</td>
                <td className="py-2 pr-3">{p.net_weight_g} g</td>
                <td className="py-2 pr-3">{p.unit_kind === 'consumer' ? 'Forbrukerpakning' : 'Gros'}</td>
                <td className="py-2 pr-3">{p.gtin ?? '–'}</td>
                <td className="py-2 pr-3">{p.shelf_life_days} d</td>
                <td className="py-2 pr-3">{p.active ? 'Aktiv' : 'Inaktiv'}</td>
                <td className="py-2">
                  <Link href={`/products?edit=${p.id}`} className="text-green-900 underline">
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
