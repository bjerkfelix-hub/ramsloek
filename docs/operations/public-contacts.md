# Public interest and business inquiries

Both forms use server actions, the service-role client, a honeypot and the same
five-attempt / ten-minute in-memory IP limiter as season signup. Clients have no
direct insert grant. Rate-limit and honeypot tests therefore run in Vitest and
Playwright; pgTAP tests the service-role write path, constraints and RLS.

Owners open **Påmeldinger → Interesse / Henvendelser**. Deletion is permanent.
Audits retain the actor, row ID and operation, without copying personal data.

The daily `purge-public-contacts` cron job deletes inquiries after 12 months.
Interest registered before 1 July is deleted from 1 July that year; later
registrations belong to the following spring. This uses Europe/Oslo dates.

Set `RESEND_API_KEY` on the server to enable inquiry notification emails. The
sender is `Nesodden Ramsløk <varsel@xn--ramslk-fya.no>`; the recipient is
`CONTACT_EMAIL` in `src/content/site.ts`. Configure the sender domain in Resend.
Notifications have a five-second timeout. Missing configuration or delivery
failure logs a generic warning and never rolls back a saved inquiry. There is no
automatic retry, so the admin list remains the record of received inquiries.

Owners must delete notification emails and any exported/copied details when
handling a deletion request, and remove inquiry emails after 12 months. Database
retention cannot remove copies in an external mailbox. Resend also processes the
notification data; include it in processor and retention arrangements.

Run tests only with local Supabase and no `RESEND_API_KEY` in the reused dev
server. Unit tests mock fetch and environment values and never contact Resend.
