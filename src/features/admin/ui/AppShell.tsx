import type { CurrentUser } from '@/lib/auth'
import type { ThemePref } from '../theme'
import { navFor } from './nav-items'
import { Sidebar, TabBar, TopBar } from './Nav'
import { ScrollEdge } from './ScrollEdge'
import { ThemeProvider } from './ThemeSwitch'
import { ToastProvider } from './Toast'

export function AppShell({ user, theme, children }: { user: CurrentUser; theme: ThemePref; children: React.ReactNode }) {
  const items = navFor(user.role)
  return (
    <ThemeProvider initial={theme}>
      <ToastProvider>
        {/* Made inert while a sheet is open; sheets and toasts render outside it. */}
        <div id="admin-app" className="a-app flex min-h-full flex-1 flex-col">
          <ScrollEdge />
          <Sidebar items={items} userName={user.fullName} />
          <TopBar items={items} userName={user.fullName} />
          <main className="a-main flex-1">{children}</main>
          <TabBar items={items} userName={user.fullName} />
        </div>
      </ToastProvider>
    </ThemeProvider>
  )
}
