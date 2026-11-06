import { requireRole } from '@/lib/auth'

// Placeholder: Task 7 replaces this with the real settings page.
export default async function SettingsPage() {
  await requireRole('owner')
  return <h1 className="text-xl font-semibold">Innstillinger</h1>
}
