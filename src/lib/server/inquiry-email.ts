import 'server-only'
import { CONTACT_EMAIL } from '@/content/site'

export type InquiryNotification = {
  company: string
  contact_name: string
  email: string
  phone: string
  type: string
  weekly_quantity: string
  message: string
  language: string
  consent_text: string
  consented_at: string
}
const headerValue = (value: string) => value.replace(/[\r\n]/g, '')

/** Best effort: persistence has already succeeded. Never log personal data or provider responses. */
export async function notifyInquiry(inquiry: InquiryNotification): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('Inquiry notification skipped: email service is not configured')
    return
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        from: 'Nesodden Ramsløk <varsel@xn--ramslk-fya.no>',
        to: [headerValue(CONTACT_EMAIL)],
        reply_to: headerValue(inquiry.email),
        subject: `Ny henvendelse: ${headerValue(inquiry.company)}`,
        text: [
          ['Bedrift', inquiry.company],
          ['Kontaktperson', inquiry.contact_name],
          ['E-post', inquiry.email],
          ['Telefon', inquiry.phone],
          ['Type', inquiry.type],
          ['Ukentlig mengde', inquiry.weekly_quantity],
          ['Melding', inquiry.message],
          ['Språk', inquiry.language],
          ['Samtykke', inquiry.consent_text],
          ['Samtykket', inquiry.consented_at],
        ]
          .map(([label, value]) => `${label}: ${value}`)
          .join('\n'),
      }),
    })
    if (!response.ok) console.warn('Inquiry notification failed: email service rejected request')
  } catch {
    console.warn('Inquiry notification failed: email service unavailable')
  }
}
