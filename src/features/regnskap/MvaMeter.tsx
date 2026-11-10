import { formatKr } from '@/lib/domain/money'
import { MVA_LIMIT_ORE, type MeterLevel } from '@/lib/domain/ledger'

const LEVEL_CLASS: Record<MeterLevel, string> = {
  ok: 'r-meter-ok',
  warn: 'r-meter-warn',
  over: 'r-meter-over',
}

const LEVEL_TEXT: Record<MeterLevel, string> = {
  ok: 'Godt under grensen.',
  warn: 'Nærmer seg grensen for MVA-registrering.',
  over: 'Over grensen – DONTPANIC AS må registreres i Merverdiavgiftsregisteret.',
}

/** Income last 12 months against the NOK 50 000 MVA registration limit. */
export function MvaMeter({ incomeOre, level }: { incomeOre: number; level: MeterLevel }) {
  const pct = Math.min(100, Math.round((incomeOre / MVA_LIMIT_ORE) * 100))
  return (
    <section className="a-card r-meter" aria-labelledby="mva-meter-title" data-testid="mva-meter" data-level={level}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="mva-meter-title" className="a-h2">MVA-grensen</h2>
        <p className="a-sub whitespace-nowrap">
          {formatKr(incomeOre)} av {formatKr(MVA_LIMIT_ORE)}
        </p>
      </div>
      <div
        className={`r-meter-track ${LEVEL_CLASS[level]}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Inntekt siste 12 måneder av MVA-grensen"
      >
        <div className="r-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="a-small">{LEVEL_TEXT[level]} Inntekt fra ramsløk siste 12 måneder.</p>
      <p className="a-small a-muted">Grensen gjelder hele DONTPANIC AS – ta med annen omsetning.</p>
    </section>
  )
}
