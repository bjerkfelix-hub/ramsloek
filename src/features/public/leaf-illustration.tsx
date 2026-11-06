// Decorative line drawing of ramsløk: two broad leaves and a flower stalk with a star-flowered umbel.

const CENTER = { x: 60, y: 46 }

function star(cx: number, cy: number, outer: number, inner: number): string {
  const points: string[] = []
  for (let i = 0; i < 12; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI / 6) * i - Math.PI / 2
    points.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return points.join(' ')
}

// Flowers on short stalks fanning out from the top of the flower stalk.
const FLOWERS = [-160, -130, -105, -75, -50, -20, -90].map((deg, i) => {
  const r = i === 6 ? 30 : 22
  const a = (deg * Math.PI) / 180
  return { x: CENTER.x + r * Math.cos(a), y: CENTER.y + r * Math.sin(a) }
})

export function LeafIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 170"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* left leaf */}
      <path d="M40 164 C 22 128, 16 84, 30 38 C 46 80, 50 126, 40 164 Z" fill="var(--rl-sage)" />
      <path d="M40 160 C 36 124, 34 88, 30 44" strokeWidth={1.25} />
      {/* right leaf */}
      <path d="M86 164 C 106 132, 112 96, 102 58 C 84 92, 80 130, 86 164 Z" fill="var(--rl-sage)" />
      <path d="M86 160 C 92 128, 96 96, 101 64" strokeWidth={1.25} />
      {/* flower stalk */}
      <path d="M62 166 C 60 120, 61 80, 60 46" />
      {FLOWERS.map((f, i) => (
        <g key={i}>
          <path d={`M${CENTER.x} ${CENTER.y} L${f.x.toFixed(1)} ${f.y.toFixed(1)}`} strokeWidth={1.25} />
          <polygon points={star(f.x, f.y, 7, 3)} fill="var(--rl-cream)" strokeWidth={1.25} />
          <circle cx={f.x} cy={f.y} r={1.2} fill="currentColor" stroke="none" />
        </g>
      ))}
    </svg>
  )
}
