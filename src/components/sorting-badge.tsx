export function SortingBadge({ signed }: { signed: boolean }) {
  return signed ? (
    <span className="a-badge a-badge-ok">Sorteringskontrollert</span>
  ) : (
    <span className="a-badge a-badge-warn">Ikke sorteringskontrollert</span>
  )
}
