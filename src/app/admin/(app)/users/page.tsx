import { requireRole, type Role } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { UserActiveButton } from '@/components/user-active-button'
import { inviteUser, setUserActive } from './actions'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { ResponsiveSheet } from '@/features/admin/ui/ResponsiveSheet'
import { getCurrentRates } from '@/features/planlegging/queries'
import { RateSheet } from '@/features/planlegging/RateSheet'
import { formatKr } from '@/lib/domain/money'

const ROLE_LABEL: Record<Role, string> = { owner: 'Eier', picker: 'Plukker', seller: 'Selger' }

export default async function UsersPage() {
  const me = await requireRole('owner')
  const supabase = await createClient()
  const [{ data: profiles }, { data: authData }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, active').order('full_name'),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ])
  const rates = new Map((await getCurrentRates()).map(r => [r.profile_id, r.hourly_rate_ore]))
  const authById = new Map(authData?.users.map((u) => [u.id, u]))

  return (
    <Page>
      <LargeTitle>Brukere</LargeTitle>
      <ResponsiveSheet title="Legg til bruker">
        <ActionForm action={inviteUser} submitLabel="Legg til bruker" resetOnSuccess
          successMessage="Brukeren er lagt til. Be dem logge inn på innloggingssiden med e-postadressen sin.">
          <Field label="E-post">
            <input name="email" type="email" required className={inputClass} />
          </Field>
          <Field label="Navn">
            <input name="full_name" required className={inputClass} />
          </Field>
          <Field label="Rolle">
            <select name="role" defaultValue="picker" className={inputClass}>
              <option value="picker">Plukker</option>
              <option value="seller">Selger</option>
              <option value="owner">Eier</option>
            </select>
          </Field>
        </ActionForm>
      </ResponsiveSheet>
      <p className="a-muted">Endringen gjelder nye innstemplinger. Tidligere timer beholder satsen de ble registrert med.</p>
      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th>Navn</th>
              <th>E-post</th>
              <th>Rolle</th>
              <th>Status</th>
              <th>Timesats (kr/time)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {profiles?.map((p) => {
              const u = authById.get(p.id)
              const rate = rates.get(p.id) ?? null
              const invited = u && !u.last_sign_in_at
              const status = !p.active ? 'Deaktivert' : invited ? 'Ikke logget inn ennå' : 'Aktiv'
              return (
                <tr key={p.id}>
                  <td>{p.full_name}</td>
                  <td>{u?.email ?? '–'}</td>
                  <td>{ROLE_LABEL[p.role as Role]}</td>
                  <td>{status}</td>
                  <td>{rate === null ? 'Ikke satt' : formatKr(rate)}
                    <RateSheet profileId={p.id} rate={rate} />
                  </td>
                  <td>
                    {p.id !== me.id && <UserActiveButton userId={p.id} active={p.active} action={setUserActive} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Page>
  )
}
