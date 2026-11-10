import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { ResponsiveSheet } from '@/features/admin/ui/ResponsiveSheet'
import { CategoryActiveButton, CategoryEditForm, NewCategoryForm, type CategoryRow } from '@/features/regnskap/CategoryControls'

const GROUPS = [
  { kind: 'income', title: 'Inntekter' },
  { kind: 'expense', title: 'Kostnader' },
] as const

export default async function CategoriesPage() {
  await requireRole('owner')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ledger_categories')
    .select('id, kind, name, account_no, sort, active, system_key')
    .order('sort')
    .order('name')
  if (error) throw error
  const rows: CategoryRow[] = (data ?? []).map((c) => ({
    id: c.id,
    kind: c.kind as CategoryRow['kind'],
    name: c.name,
    accountNo: c.account_no,
    sort: c.sort,
    active: c.active,
    system: c.system_key !== null,
  }))

  return (
    <Page>
      <LargeTitle>Kategorier</LargeTitle>
      <p className="a-sub">
        Kontonummeret (NS 4102) følger med i eksporten, så den som fører hovedboken kan bokføre rett. Kategorier slettes ikke, men kan skrus av.
      </p>
      <ResponsiveSheet title="Ny kategori">
        <NewCategoryForm />
      </ResponsiveSheet>
      {GROUPS.map((g) => (
        <section key={g.kind} className="a-section" aria-labelledby={`cat-${g.kind}`}>
          <h2 id={`cat-${g.kind}`} className="a-h2 px-1">
            {g.title}
          </h2>
          <ul className="a-list">
            {rows
              .filter((r) => r.kind === g.kind)
              .map((r) => (
                <li key={r.id} data-testid="category-row" className="flex flex-col gap-2 p-4">
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className={r.active ? 'font-semibold' : 'font-semibold a-muted'}>
                      {r.name} · {r.accountNo}
                    </span>
                    <span className="flex items-center gap-2">
                      {!r.active && <span className="a-badge a-badge-neutral">Av</span>}
                      {r.system ? (
                        <span className="a-small a-muted">Brukes av dagsoppgjør</span>
                      ) : (
                        <CategoryActiveButton id={r.id} active={r.active} name={r.name} />
                      )}
                    </span>
                  </p>
                  <details className="a-details">
                    <summary className="a-link a-link-tap">Endre</summary>
                    <CategoryEditForm category={r} />
                  </details>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </Page>
  )
}
