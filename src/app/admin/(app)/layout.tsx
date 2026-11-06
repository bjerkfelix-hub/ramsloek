import { cookies } from 'next/headers'
import { requireRole } from '@/lib/auth'
import { parseThemePref, THEME_COOKIE } from '@/features/admin/theme'
import { AppShell } from '@/features/admin/ui/AppShell'

// Every page here depends on the signed-in user, so the layout reads the session per request
// and blocks on it: real HTTP statuses (redirect to /admin/login, 404 for a disallowed role).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('owner', 'picker', 'seller')
  const theme = parseThemePref((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <AppShell user={user} theme={theme}>
      {children}
    </AppShell>
  )
}
