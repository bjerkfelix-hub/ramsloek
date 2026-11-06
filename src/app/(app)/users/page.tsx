import { requireRole, type Role } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { UserActiveButton } from '@/components/user-active-button'
import { inviteUser, setUserActive } from './actions'

const ROLE_LABEL: Record<Role, string> = { owner: 'Eier', picker: 'Plukker', seller: 'Selger' }

export default async function UsersPage() {
  const me = await requireRole('owner')
  const supabase = await createClient()
  const [{ data: profiles }, { data: authData }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, active').order('full_name'),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ])
  const authById = new Map(authData?.users.map((u) => [u.id, u]))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Brukere</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Legg til bruker</h2>
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
      </section>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300">
              <th className="py-2 pr-3">Navn</th>
              <th className="py-2 pr-3">E-post</th>
              <th className="py-2 pr-3">Rolle</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {profiles?.map((p) => {
              const u = authById.get(p.id)
              const invited = u && !u.last_sign_in_at
              const status = !p.active ? 'Deaktivert' : invited ? 'Invitert' : 'Aktiv'
              return (
                <tr key={p.id} className="border-b border-zinc-200">
                  <td className="py-2 pr-3">{p.full_name}</td>
                  <td className="py-2 pr-3">{u?.email ?? '–'}</td>
                  <td className="py-2 pr-3">{ROLE_LABEL[p.role as Role]}</td>
                  <td className="py-2 pr-3">{status}</td>
                  <td className="py-2">
                    {p.id !== me.id && <UserActiveButton userId={p.id} active={p.active} action={setUserActive} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
