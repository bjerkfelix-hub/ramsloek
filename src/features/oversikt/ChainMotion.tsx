'use client'

import { useEffect, useRef } from 'react'
import { animate } from 'motion/react'
import { prefersReducedMotion } from '@/features/admin/ui/use-phone'
import { formatChainNumber } from './chain'

/** Only presentation crosses this boundary; cards and final values are server-rendered children. */
export function ChainMotion({ period, children }: { period: string; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const previous = useRef(new Map<string, number>())
  useEffect(() => {
    const element = root.current!
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const controls: { stop: () => void }[] = []
    const values = previous.current
    const numbers = [...element.querySelectorAll<HTMLElement>('[data-chain-number]')].map(el => ({ el, key: el.dataset.chainNumber!, target: Number(el.dataset.value), digits: Number(el.dataset.digits) }))
    const finish = () => {
      controls.forEach(c => c.stop())
      numbers.forEach(({ el, target, digits }) => { el.textContent = formatChainNumber(target, digits) })
      element.querySelectorAll<HTMLElement>('[data-chain-card]').forEach(el => { el.style.opacity = '1'; el.style.transform = 'none' })
      const dot = element.querySelector<HTMLElement>('.a-chain-dot')!
      dot.style.transform = 'none'
    }
    if (!prefersReducedMotion()) {
      const cards = [...element.querySelectorAll<HTMLElement>('[data-chain-card]')]
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          observer.unobserve(entry.target)
          const card = entry.target as HTMLElement
          const index = cards.indexOf(card)
          controls.push(animate(card, { opacity: [0, 1], y: [10, 0] }, { duration: 0.35, delay: index * 0.04 }))
          numbers.filter(({ el }) => card.contains(el)).forEach(({ el, key, target, digits }) => {
            controls.push(animate(values.get(key) ?? 0, target, {
              duration: 0.65,
              onUpdate: value => { el.textContent = formatChainNumber(value, digits) },
            }))
          })
        }
      })
      cards.forEach(card => observer.observe(card))
      controls.push({ stop: () => observer.disconnect() })
      const line = element.querySelector<HTMLElement>('.a-chain-line')!
      const dot = element.querySelector<HTMLElement>('.a-chain-dot')!
      const resize = new ResizeObserver(() => {
        dotAnimation?.stop()
        const phone = window.matchMedia('(max-width: 640px)').matches
        dotAnimation = animate(dot, phone ? { y: [0, line.clientHeight - 7], x: 0 } : { x: [0, line.clientWidth - 7], y: 0 }, { duration: 5, repeat: Infinity, ease: 'linear' })
      })
      let dotAnimation: ReturnType<typeof animate> | undefined
      resize.observe(line)
      controls.push({ stop: () => { resize.disconnect(); dotAnimation?.stop() } })
    }
    const onReduced = () => { if (reduced.matches) finish() }
    reduced.addEventListener('change', onReduced)
    return () => {
      controls.forEach(c => c.stop())
      numbers.forEach(({ key, target }) => values.set(key, target))
      reduced.removeEventListener('change', onReduced)
    }
  }, [period])
  return <div ref={root} className="a-chain">{children}</div>
}
