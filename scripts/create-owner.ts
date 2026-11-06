// Usage: npm run create-owner -- <email> "<full name>"
// Creates the first owner directly (sign-up is disabled). They then sign in from the login page with a magic link.
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

async function main() {
  const [email, fullName] = process.argv.slice(2)
  if (!email || !fullName) {
    console.error('Usage: npm run create-owner -- <email> "<full name>"')
    process.exit(1)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).')
    process.exit(1)
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role: 'owner', full_name: fullName },
  })
  if (error) {
    console.error(`Could not create owner: ${error.message}`)
    process.exit(1)
  }
  console.log(`Created ${data.user.email} as owner. Sign in from the login page with that e-mail.`)
}

void main()
