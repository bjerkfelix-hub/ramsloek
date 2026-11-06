import { COMPANY, CONTACT_EMAIL, format, getDictionary, type Locale } from "@/content";
import { contactHref } from "@/lib/public/routes";
import { PageHeading } from "./page-heading";

export function PrivacyPage({ locale }: { locale: Locale }) {
  const { privacy, footer } = getDictionary(locale);
  const [before, after] = format(privacy.contact, { email: "\u0000" }).split(
    "\u0000",
  );
  return (
    <div className="flex flex-col gap-8 pb-4 pt-8 sm:pt-12">
      <PageHeading title={privacy.heading} />
      <p className="text-muted">{privacy.updated}</p>
      <p className="max-w-[65ch] text-lg">{privacy.intro}</p>
      <section className="flex max-w-[65ch] flex-col gap-1 text-lg" data-testid="data-controller">
        <h2 className="font-display text-2xl font-semibold text-forest">{privacy.controllerHeading}</h2>
        <p className="font-medium">{COMPANY.legalName}</p>
        <p>{format(footer.orgNumber, { orgNumber: COMPANY.orgNr })}</p>
        <p>{COMPANY.address}</p>
        <p>
          <a href={contactHref(CONTACT_EMAIL)} className="font-medium text-forest underline">
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>
      {privacy.sections.map((section) => (
        <section
          key={section.heading}
          className="flex max-w-[65ch] flex-col gap-3 text-lg"
        >
          <h2 className="font-display text-2xl font-semibold text-forest">
            {section.heading}
          </h2>
          {section.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
      <section className="flex max-w-[65ch] flex-col gap-3 text-lg">
        <h2 className="font-display text-2xl font-semibold text-forest">
          {privacy.contactHeading}
        </h2>
        <p>
          {before}
          <a
            href={contactHref(CONTACT_EMAIL)}
            className="font-medium text-forest underline"
          >
            {CONTACT_EMAIL}
          </a>
          {after}
        </p>
      </section>
    </div>
  );
}
