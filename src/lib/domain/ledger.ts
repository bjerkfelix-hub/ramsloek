import { monthKey } from './periods'

export const MVA_LIMIT_ORE = 5_000_000
export type MeterLevel = 'ok' | 'warn' | 'over'

export function meterLevel(incomeOre: number): MeterLevel {
  if (incomeOre >= MVA_LIMIT_ORE) return 'over'
  if (incomeOre >= MVA_LIMIT_ORE * 0.8) return 'warn'
  return 'ok'
}

export type LedgerKind = 'income' | 'expense'
export type PaymentMethod = 'vipps' | 'card' | 'cash' | 'bank' | 'private' | 'unpaid'
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  vipps: 'Vipps',
  card: 'Kort',
  cash: 'Kontant',
  bank: 'Bank',
  private: 'Lagt ut privat',
  unpaid: 'Ubetalt regning',
}

export type ExportEntry = {
  number: string
  entryDate: string
  kind: LedgerKind
  category: string
  accountNo: string
  counterparty: string | null
  description: string
  paymentMethod: PaymentMethod
  amountOre: number
  voided: boolean
  voidReason: string | null
  receiptNames: string[]
}

type Totals = { incomeOre: number; expenseOre: number; profitOre: number }
type CategorySummary = { accountNo: string; category: string; incomeOre: number; expenseOre: number }
type MonthSummary = Totals & { month: string }

export function summarize(entries: ExportEntry[]): {
  totals: Totals
  byCategory: CategorySummary[]
  byMonth: MonthSummary[]
} {
  const totals: Totals = { incomeOre: 0, expenseOre: 0, profitOre: 0 }
  const categories = new Map<string, CategorySummary>()
  const months = new Map<string, MonthSummary>()

  for (const entry of entries) {
    if (entry.voided) continue
    const categoryKey = JSON.stringify([entry.accountNo, entry.category])
    const category = categories.get(categoryKey) ?? {
      accountNo: entry.accountNo, category: entry.category, incomeOre: 0, expenseOre: 0,
    }
    const key = monthKey(entry.entryDate)
    const month = months.get(key) ?? { month: key, incomeOre: 0, expenseOre: 0, profitOre: 0 }
    const amountField = entry.kind === 'income' ? 'incomeOre' : 'expenseOre'
    totals[amountField] += entry.amountOre
    category[amountField] += entry.amountOre
    month[amountField] += entry.amountOre
    month.profitOre = month.incomeOre - month.expenseOre
    categories.set(categoryKey, category)
    months.set(key, month)
  }
  totals.profitOre = totals.incomeOre - totals.expenseOre
  return {
    totals,
    byCategory: [...categories.values()].sort((a, b) =>
      a.accountNo.localeCompare(b.accountNo) || a.category.localeCompare(b.category, 'nb-NO')),
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  }
}

export function receiptFileName(parts: {
  number: string
  category: string
  counterparty: string | null
  suffix?: string
  ext: string
}): string {
  const number = parts.suffix ? `${parts.number}-${parts.suffix}` : parts.number
  const stem = [number, parts.category, parts.counterparty ?? ''].join(' ')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trimEnd()
  return `${stem}.${parts.ext}`
}

export function uniqueNames(names: string[]): string[] {
  const reserved = new Set(names)
  const used = new Set<string>()
  return names.map((name) => {
    if (!used.has(name)) {
      used.add(name)
      return name
    }
    let candidate = name
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const extension = dot > 0 ? name.slice(dot) : ''
    let count = 2
    while (reserved.has(candidate) || used.has(candidate)) {
      candidate = `${stem}-${count}${extension}`
      count += 1
    }
    used.add(candidate)
    return candidate
  })
}
