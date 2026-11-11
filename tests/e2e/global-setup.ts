import { expect } from '@playwright/test'
import { adminClient } from './helpers'

// A reset can finish seeding before the local API has recovered. Check both Auth
// and PostgREST once for the suite instead of letting every test time out in turn.
export default async function globalSetup() {
  const admin = adminClient() // also refuses hosted URLs
  await expect.poll(async () => {
    const [auth, db] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1 }),
      admin.from('profiles').select('id').limit(1),
    ])
    return !auth.error && !db.error && !!db.data?.length
  }, { message: 'Local Supabase Auth and seeded database must be ready', timeout: 30000 }).toBe(true)
}
