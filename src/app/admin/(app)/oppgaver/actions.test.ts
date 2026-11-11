import { beforeEach, expect, it, vi } from 'vitest'
import { saveTask, setTaskStatus, completeTask, archiveTask, restoreTask } from './actions'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
vi.mock('@/lib/auth', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => { throw Error('Forbidden admin client') }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111'
const lookup = vi.fn(), insert = vi.fn(), update = vi.fn(), rpc = vi.fn(), changed = vi.fn()
const chain = { eq: () => chain, is: () => chain, select: changed }
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }), insert, update }))
const payload = { title: 'Task', description: null, assigned_to: null, due_date: null, important: false }
function form(over: Record<string,string | undefined> = {}) { const f = new FormData(); for (const [k,v] of Object.entries({id, title:'Task', ...over})) f.set(k,v ?? ''); return f }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireRole).mockReset().mockResolvedValue({ id, role: 'picker', fullName: 'Me' }); vi.mocked(createClient).mockResolvedValue({from, rpc} as never); lookup.mockResolvedValue({data:null,error:null}); insert.mockResolvedValue({error:null}); update.mockReturnValue(chain); changed.mockResolvedValue({data:[{id}],error:null}); rpc.mockResolvedValue({error:null}) })
it('creates only whitelisted business fields, ignoring forged metadata', async () => { expect(await saveTask(form({completed_by:id, completed_at:'2020-01-01', archived_at:'2020-01-01', created_by:id}))).toEqual({ok:true,id}); expect(insert).toHaveBeenCalledWith({id,...payload}); expect(requireRole).toHaveBeenCalledWith('owner') })
it.each([{id:'bad'},{title:' '},{title:'x'.repeat(201)},{description:'x'.repeat(10001)},{assigned_to:'bad'},{due_date:'2027-02-30'},{due_date:'2027-2-01'}])('rejects invalid input %j',async over=>{ expect((await saveTask(form(over))).ok).toBe(false); expect(from).not.toHaveBeenCalled() })
it('same create retry succeeds only with identical fields',async()=>{ lookup.mockResolvedValue({data:payload,error:null}); expect((await saveTask(form())).ok).toBe(true); expect((await saveTask(form({title:'Changed'}))).ok).toBe(false); expect(update).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled() })
it('handles a same-id insert race without overwriting',async()=>{ insert.mockResolvedValue({error:{code:'23505'}}); lookup.mockResolvedValueOnce({data:null,error:null}).mockResolvedValueOnce({data:payload,error:null}); expect((await saveTask(form())).ok).toBe(true); expect(update).not.toHaveBeenCalled() })
it('edits explicitly, preserving nulls and importance',async()=>{lookup.mockResolvedValue({data:payload,error:null}); expect((await saveTask(form({intent:'edit',description:'Details',important:'on'}))).ok).toBe(true); expect(update).toHaveBeenCalledWith({...payload,description:'Details',important:true}) })
it('rejects editing archived or missing records',async()=>{expect((await saveTask(form({intent:'edit'}))).ok).toBe(false); lookup.mockResolvedValue({data:{...payload,archived_at:'2026-01-01'},error:null}); expect((await saveTask(form({intent:'edit'}))).ok).toBe(false); expect(update).not.toHaveBeenCalled()})
it('owner status controls send status alone and reject invalid status',async()=>{expect((await setTaskStatus(id,'in_progress')).ok).toBe(true); expect(update).toHaveBeenCalledWith({status:'in_progress'}); expect((await setTaskStatus(id,'forged' as never)).ok).toBe(false)})
it('completion sends status only and permits all roles',async()=>{expect((await completeTask(id)).ok).toBe(true); expect(requireRole).toHaveBeenCalledWith('owner','picker','seller'); expect(update).toHaveBeenCalledWith({status:'done'})})
it('re-reads a trigger-skipped completion; hidden, archived and reassigned rows fail',async()=>{changed.mockResolvedValue({data:[],error:null}); lookup.mockResolvedValue({data:{status:'done',assigned_to:id,archived_at:null},error:null}); expect((await completeTask(id)).ok).toBe(true); for(const data of [null,{status:'done',assigned_to:'other',archived_at:null},{status:'done',assigned_to:id,archived_at:'2026-01-01'}]) {lookup.mockResolvedValue({data,error:null}); expect(await completeTask(id)).toEqual({ok:false,error:'Fant ikke registreringen.'})}})
it('archives only with the DB-time RPC',async()=>{expect((await archiveTask(id)).ok).toBe(true); expect(rpc).toHaveBeenCalledWith('archive_work_task',{p_id:id}); expect(from).not.toHaveBeenCalled()})
it.each(['picker','seller'])('denies %s owner mutations before client access',async()=>{vi.mocked(requireRole).mockRejectedValue(Error('404')); for(const run of [()=>saveTask(form()),()=>setTaskStatus(id,'todo'),()=>archiveTask(id),()=>restoreTask(id)]) await expect(run()).rejects.toThrow('404'); expect(createClient).not.toHaveBeenCalled()})
it('reports database failures and missing update rows',async()=>{changed.mockResolvedValue({data:[],error:null}); expect((await setTaskStatus(id,'todo')).ok).toBe(false); insert.mockResolvedValue({error:{message:'TASK_ARCHIVED'}}); expect((await saveTask(form())).ok).toBe(false); rpc.mockResolvedValue({error:{message:'TASK_ARCHIVED'}}); expect((await archiveTask(id)).ok).toBe(false)})
it('rejects invalid identifiers for every mutation',async()=>{for(const run of [()=>completeTask('bad'),()=>setTaskStatus('bad','done'),()=>archiveTask('bad'),()=>restoreTask('bad')]) expect((await run()).ok).toBe(false); expect(createClient).not.toHaveBeenCalled()})
it('accepts an unchanged edit of a completed task when the guard skips the update',async()=>{
  lookup.mockResolvedValue({data:{...payload,archived_at:null},error:null})
  changed.mockResolvedValue({data:[],error:null})
  expect(await saveTask(form({intent:'edit'}))).toEqual({ok:true,id})
})

it('restores through the owner-only RPC and revalidates the board', async()=>{
  expect(await restoreTask(id)).toEqual({ok:true})
  expect(requireRole).toHaveBeenCalledWith('owner')
  expect(rpc).toHaveBeenCalledWith('restore_work_task',{p_id:id})
  expect(from).not.toHaveBeenCalled()
  expect(revalidatePath).toHaveBeenCalledWith('/admin/oppgaver')
})
it.each(['PLANNING_NOT_FOUND','TASK_ARCHIVED'])('maps restore failure %s without revalidating',async message=>{
  rpc.mockResolvedValue({error:{message}})
  expect(await restoreTask(id)).toEqual({ok:false,error:message==='PLANNING_NOT_FOUND'?'Fant ikke registreringen.':'Oppgaven er arkivert og kan ikke endres.'})
  expect(revalidatePath).not.toHaveBeenCalled()
})
