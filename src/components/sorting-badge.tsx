export function SortingBadge({ signed }: { signed: boolean }) {
  return signed ? (
    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900">Sorteringskontrollert</span>
  ) : (
    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Ikke sorteringskontrollert</span>
  )
}
