/**
 * PostgREST returns at most 1000 rows per request (Supabase's max_rows), and silently truncates the
 * rest. Ledger lists, totals and exports must see every row, so they page with .range() until a short
 * page comes back. `page` must build a query with a stable order (e.g. by id or number).
 */
export const PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: unknown }

export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) return rows
  }
}
