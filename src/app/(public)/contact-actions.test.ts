import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), insert: vi.fn(), notify: vi.fn(), from: vi.fn(), ip: { value: '' } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-real-ip': mocks.ip.value }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock('@/lib/server/inquiry-email', () => ({ notifyInquiry: mocks.notify }))
import { interestAction, inquiryAction } from './contact-actions'
function form(kind: 'interest' | 'wholesale', extra: Record<string, string> = {}) {
  const data = new FormData()
  const values = kind === 'interest' ? { name: 'Ola', bags: '3' } : { company: 'Kitchen', contact_name: 'Ola', type: 'restaurant', message: 'Fresh garlic please' }
  for (const [key, value] of Object.entries({ ...values, email: 'ola@example.test', consent: 'on', language: 'en', ...extra })) if (typeof value === 'string') data.set(key, value)
  return data
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.ip.value = crypto.randomUUID()
  mocks.from.mockReturnValue({ upsert: mocks.upsert, insert: mocks.insert })
  mocks.upsert.mockResolvedValue({ error: null })
  mocks.insert.mockResolvedValue({ error: null })
  mocks.notify.mockResolvedValue(undefined)
})
describe('public contact server actions', () => {
  it('upserts normalized email with exact translated consent and timestamp', async () => {
    expect(await interestAction(null, form('interest', { email: ' Ola@Example.test ' }))).toEqual({ ok: true })
    expect(mocks.from).toHaveBeenCalledWith('consumer_interests')
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ email: 'ola@example.test', language: 'en', bags: 3, consent_text: expect.stringContaining('I consent'), consented_at: expect.any(String) }), { onConflict: 'email' })
    expect(mocks.notify).not.toHaveBeenCalled()
  })
  it('notifies only after inquiry persistence', async () => {
    expect(await inquiryAction(null, form('wholesale'))).toEqual({ ok: true })
    expect(mocks.insert).toHaveBeenCalledOnce()
    expect(mocks.notify).toHaveBeenCalledOnce()
    expect(mocks.insert.mock.invocationCallOrder[0]).toBeLessThan(mocks.notify.mock.invocationCallOrder[0])
  })
  it('returns localized errors without leaking storage failures', async () => {
    expect(await interestAction(null, form('interest', { bags: '51', language: 'no' }))).toEqual({ ok: false, error: 'Velg et helt antall poser fra 1 til 50.' })
    expect(await inquiryAction(null, form('wholesale', { company: '' }))).toEqual({ ok: false, error: 'Please complete all required fields.' })
    mocks.insert.mockResolvedValue({ error: { message: 'private data' } })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await inquiryAction(null, form('wholesale'))).toEqual({ ok: false, error: 'Something went wrong. Please try again shortly.' })
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledWith('Public contact could not be saved')
    warning.mockRestore()
  })
  it('honeypots succeed without writing, notifying or consuming the rate limit', async () => {
    for (let i = 0; i < 8; i++) expect(await inquiryAction(null, form('wholesale', { hp_extra_field: 'spam' }))).toEqual({ ok: true })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(await inquiryAction(null, form('wholesale'))).toEqual({ ok: true })
  })
  it('rate limits the sixth attempt, sharing the budget across both forms', async () => {
    for (let i = 0; i < 5; i++) expect(await interestAction(null, form('interest', { email: 'bad' }))).toEqual({ ok: false, error: 'Please enter a valid email address.' })
    expect(await inquiryAction(null, form('wholesale'))).toEqual({ ok: false, error: 'Please try again a little later.' })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
