import Link from 'next/link'
import { formatDate } from '@/lib/domain/time'
import { ChainMotion } from './ChainMotion'
import { PERIODS, formatChainNumber, type ChainPeriod, type Step } from './chain'

export function ValueChain({ period, steps }: { period: ChainPeriod; steps: Step[] }) {
  return (
    <section className="a-section" aria-labelledby="chain-title">
      <div className="a-chain-heading">
        <div>
          <h2 className="a-h2" id="chain-title">Verdikjeden</h2>
          <p className="a-small a-muted">{formatDate(period.from)} – {formatDate(period.to)}</p>
        </div>
        <nav className="a-seg a-chain-period" aria-label="Periode">
          {Object.entries(PERIODS).map(([key, label]) => (
            <Link key={key} href={`/admin?periode=${key}`} scroll={false} aria-current={period.key === key ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
      </div>
      <ChainMotion period={`${period.key}:${period.to}`}>
        <div className="a-chain-line" aria-hidden="true"><span className="a-chain-dot" /></div>
        <ol className="a-chain-steps" style={{ '--chain-count': steps.length } as React.CSSProperties}>
          {steps.map((step, index) => (
            <li key={step.id} data-chain-card data-testid={`chain-${step.id}`}>
              <Link href={step.href} className="a-card a-chain-card">
                <span className="a-chain-index" aria-hidden="true">{index + 1}</span>
                <h3>{step.title}</h3>
                {step.failed ? <p className="a-sub">Kunne ikke hente</p> : (
                  <dl>
                    {step.metrics.map((metric, i) => (
                      <div key={i}>
                        <dt>{metric.label}</dt>
                        <dd>
                          <span className="sr-only">{formatChainNumber(metric.value, metric.digits)}</span>
                          <span aria-hidden="true" data-chain-number={`${step.id}-${i}`} data-value={metric.value} data-digits={metric.digits ?? 0}>{formatChainNumber(metric.value, metric.digits)}</span>
                          {metric.unit && ` ${metric.unit}`}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Link>
            </li>
          ))}
        </ol>
      </ChainMotion>
    </section>
  )
}
