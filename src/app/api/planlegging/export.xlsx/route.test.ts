import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only',()=>({}))
const mocks=vi.hoisted(()=>({user: null as null | {role:string}, load:vi.fn(), build:vi.fn()}))
vi.mock('@/lib/auth',()=>({getCurrentUser:async()=>mocks.user}))
vi.mock('@/features/planlegging/export-data',()=>({loadHoursExport:mocks.load}))
vi.mock('@/features/planlegging/xlsx',()=>({buildHoursWorkbook:mocks.build}))
import { GET } from './route'
beforeEach(()=>{vi.clearAllMocks();mocks.user=null;mocks.load.mockResolvedValue({});mocks.build.mockResolvedValue(new Uint8Array([1,2]))})
it.each([null,{role:'picker'},{role:'seller'}])('404 before loading for %s',async user=>{mocks.user=user;expect((await GET(new Request('http://localhost/api?month=bad'))).status).toBe(404);expect(mocks.load).not.toHaveBeenCalled()})
it('validates month with exact error',async()=>{mocks.user={role:'owner'};const response=await GET(new Request('http://localhost/api?month=2026-13'));expect(response.status).toBe(400);expect(await response.text()).toBe('Velg en gyldig måned.');expect(mocks.load).not.toHaveBeenCalled()})
it('downloads private deterministic filename',async()=>{mocks.user={role:'owner'};const response=await GET(new Request('http://localhost/api?month=2026-03'));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('x-content-type-options')).toBe('nosniff');expect(response.headers.get('content-disposition')).toBe('attachment; filename="ramslok-timer-2026-03.xlsx"');expect(response.headers.get('content-type')).toContain('spreadsheetml');expect(mocks.load).toHaveBeenCalledWith('2026-03')})
