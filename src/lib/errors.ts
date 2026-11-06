// Maps database/PostgREST errors to Norwegian, user-facing messages.
export function dbErrorToMessage(err: { code?: string; message?: string }): string {
  const message = err.message ?? ''
  if (message.includes('SORTING_CHECK_MISSING')) return 'Partiet må sorteringskontrolleres før pakking.'
  if (message.includes('NOT_ENOUGH_LEFT')) return 'Det er ikke nok igjen av partiet.'
  if (message.includes('STOCK_NEGATIVE')) return 'Det er ikke nok på lager.'
  if (err.code === '42501') return 'Du har ikke tilgang til dette.'
  if (err.code === '23505') return 'Dette finnes allerede.'
  return 'Noe gikk galt. Prøv igjen.'
}
