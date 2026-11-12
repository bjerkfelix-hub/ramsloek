import { getDictionary, type Locale } from '@/content'
import type { ContactKind } from '@/lib/domain/public-contacts'
import { ContactForm } from '../contact-form'
import { PageHeading } from './page-heading'

export function ContactPage({ locale, kind }: { locale: Locale; kind: ContactKind }) {
  const content = getDictionary(locale)[kind]
  return (
    <div className="flex flex-col gap-8 pb-4 pt-8 sm:pt-12">
      <PageHeading title={content.heading} lead={content.lead} />
      <ContactForm locale={locale} kind={kind} />
    </div>
  )
}
