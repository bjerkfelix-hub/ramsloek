import { getCurrentUser } from '@/lib/auth'

export default async function HomePage() {
  const user = await getCurrentUser()
  return <h1 className="text-xl font-semibold">Hei, {user?.fullName}</h1>
}
