// Shared by server and browser clients; localhost development uses HTTP.
export const cookieOptions = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
}
