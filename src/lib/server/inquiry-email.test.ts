import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { notifyInquiry, type InquiryNotification } from './inquiry-email'
import { CONTACT_EMAIL } from '@/content/site'
const inquiry: InquiryNotification = { company: 'Kjøkkenet', contact_name: 'Ola', email: 'ola@example.test', phone: '+47 12345678', type: 'restaurant', weekly_quantity: '5 kg', message: '<script>hello</script>', language: 'no', consent_text: 'Samtykke', consented_at: '2026-04-01T12:00:00Z' }
beforeEach(() => { vi.stubEnv('RESEND_API_KEY', 'test-key'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true })); vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('inquiry notification', () => {
  it('sends every field as plain text, to the configured contact', async () => {
    await notifyInquiry(inquiry)
    expect(fetch).toHaveBeenCalledOnce()
    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(options!.body as string)
    expect(body).toMatchObject({ from: 'Nesodden Ramsløk <varsel@xn--ramslk-fya.no>', to: [CONTACT_EMAIL], reply_to: inquiry.email, subject: 'Ny henvendelse: Kjøkkenet' })
    expect(body.html).toBeUndefined()
    for (const value of Object.values(inquiry)) expect(body.text).toContain(value)
    expect(body.text).toContain('Bedrift: Kjøkkenet')
    expect(options!.signal).toBeDefined()
  })
  it('skips a missing key without making a network request', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    await expect(notifyInquiry(inquiry)).resolves.toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledOnce()
  })
  it.each(['http', 'network'])('swallows %s failures and warns without secrets or personal data', async failure => {
    if (failure === 'http') vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    else vi.mocked(fetch).mockRejectedValue(Error('test-key ola@example.test'))
    await expect(notifyInquiry(inquiry)).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalledOnce()
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls)
    for (const value of ['test-key', inquiry.email, inquiry.company, inquiry.contact_name, inquiry.message]) expect(logged).not.toContain(value)
  })
  it('strips CR/LF from subject and reply-to and creates no extra headers', async () => {
    await notifyInquiry({ ...inquiry, company: 'Company\r\nBcc: attacker@example.test', email: 'user@example.test\r\nBcc: attacker@example.test' })
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.subject).not.toMatch(/[\r\n]/)
    expect(body.reply_to).not.toMatch(/[\r\n]/)
    expect(body.bcc).toBeUndefined()
    expect(body.headers).toBeUndefined()
  })
})
