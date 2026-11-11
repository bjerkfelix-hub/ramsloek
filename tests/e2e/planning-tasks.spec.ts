import { expect } from '@playwright/test'
import { test, submitPlanning, planningUser, loginPlanning, checked } from './planning-helpers'
import { todayOslo } from '../../src/lib/domain/time'
test.use({ viewport: { width:390, height:844 } })
const yesterday = () => new Date(Date.parse(`${todayOslo()}T12:00:00Z`)-86400000).toISOString().slice(0,10)

test('owner creates, assigns, moves, edits, reopens, archives and restores with keyboard controls', async({page})=>{
  test.setTimeout(90000)
  const owner=await planningUser('owner'), picker=await planningUser('picker')
  const title=`E2E task ${crypto.randomUUID()}`
  await loginPlanning(page,owner.email); await page.goto('/admin/oppgaver')
  await page.getByRole('button',{name:'Ny oppgave',exact:true}).click()
  let dialog=page.getByRole('dialog')
  await dialog.getByLabel('Tittel').fill(title); await dialog.getByLabel('Beskrivelse').fill('Praktisk arbeid')
  await dialog.getByLabel('Frist').fill(yesterday()); await dialog.getByLabel('Viktig').check()
  const saveRequest=await submitPlanning(dialog.getByRole('button',{name:'Lagre',exact:true}))
  await expect(dialog).not.toBeVisible()
  const card=page.getByRole('article').filter({hasText:title})
  await expect(card).toContainText('Forfalt'); await expect(card).toContainText('Ikke tildelt'); await expect(card).toContainText('Viktig')
  await card.getByRole('button',{name:'Rediger',exact:true}).click(); dialog=page.getByRole('dialog')
  await dialog.getByLabel('Person').selectOption(picker.id)
  await submitPlanning(dialog.getByRole('button',{name:'Lagre',exact:true})); await expect(dialog).not.toBeVisible()
  await card.getByLabel('Status').selectOption('in_progress'); await submitPlanning(card.getByRole('button',{name:'Endre status'}))
  await expect(page.getByRole('region',{name:'Pågår',exact:true}).getByRole('article').filter({hasText:title})).toBeVisible()
  await loginPlanning(page,picker.email); await page.goto('/admin/oppgaver')
  await expect(page.getByRole('heading',{name:'Mine oppgaver',exact:true})).toBeVisible()
  for(const name of ['Ny oppgave','Rediger','Arkiver']) await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0)
  await expect(card).toContainText('Praktisk arbeid')
  const completeRequest=await submitPlanning(card.getByRole('button',{name:'Marker som ferdig'}))
  await expect(card).toContainText('Ferdig'); await expect(card.getByText('Forfalt')).toHaveCount(0)
  const task=checked(await picker.client.from('work_tasks').select('*').eq('title',title).single()).data!
  expect(task.completed_by).toBe(picker.id); expect(task.completed_at).toBeTruthy()
  const denied=await page.request.post('/admin/oppgaver',{headers:{'next-action':saveRequest.headers()['next-action'],'content-type':saveRequest.headers()['content-type']},data:saveRequest.postDataBuffer()!})
  expect(denied.status()).toBe(404)
  await loginPlanning(page,owner.email); await page.goto('/admin/oppgaver')
  await expect(card).toContainText(picker.label); await expect(card).toContainText('Fullført')
  await card.getByLabel('Status').selectOption('todo'); await submitPlanning(card.getByRole('button',{name:'Endre status'}))
  await card.getByRole('button',{name:'Rediger',exact:true}).click(); dialog=page.getByRole('dialog')
  await dialog.getByLabel('Beskrivelse').fill('Endret arbeid'); await dialog.getByLabel('Frist').fill(''); await dialog.getByLabel('Viktig').uncheck()
  await submitPlanning(dialog.getByRole('button',{name:'Lagre',exact:true})); await expect(dialog).not.toBeVisible()
  await expect(card).toContainText('Endret arbeid'); await expect(card.getByText('Forfalt')).toHaveCount(0)
  await submitPlanning(card.getByRole('button',{name:'Arkiver',exact:true})); await expect(card).toHaveCount(0)
  await page.getByRole('link',{name:'Vis arkiverte'}).click()
  const archive=page.getByRole('region',{name:'Arkiverte oppgaver',exact:true})
  const archivedCard=archive.getByRole('article').filter({hasText:title})
  await expect(archivedCard).toContainText('Arkivert')
  await expect(archivedCard).toContainText(picker.label)
  await expect(archivedCard.getByText('Å gjøre',{exact:true})).toBeVisible()
  for(const status of ['Å gjøre','Pågår','Ferdig']) await expect(page.getByRole('region',{name:status,exact:true}).getByRole('article').filter({hasText:title})).toHaveCount(0)
  for(const width of [390,1280]) {
    await page.setViewportSize({width,height:844})
    for(const theme of ['light','dark'] as const) {
      await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'})
      await archivedCard.scrollIntoViewIfNeeded()
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await page.screenshot({path:`shots/planning-task-archive-${width}-${theme}.png`})
    }
  }
  await loginPlanning(page,picker.email); await page.goto('/admin/oppgaver?archived=1')
  await expect(card).toHaveCount(0); await expect(page.getByRole('link',{name:'Vis arkiverte'})).toHaveCount(0)
  const stale=await page.request.post('/admin/oppgaver',{headers:{'next-action':completeRequest.headers()['next-action'],'content-type':completeRequest.headers()['content-type']},data:completeRequest.postDataBuffer()!})
  expect(stale.status()).toBe(200); expect(await stale.text()).toContain('Fant ikke registreringen.')
  await loginPlanning(page,owner.email); await page.goto('/admin/oppgaver?archived=1')
  await submitPlanning(archivedCard.getByRole('button',{name:'Gjenopprett',exact:true}))
  await expect(archivedCard).toHaveCount(0)
  await expect(page.getByRole('region',{name:'Å gjøre',exact:true}).getByRole('article').filter({hasText:title})).toBeVisible()
  await loginPlanning(page,picker.email); await page.goto('/admin/oppgaver')
  await expect(card).toBeVisible()
})

for(const role of ['picker','seller'] as const) test(`${role} private tasks, forged updates and stale reassignment`,async({page})=>{
  const owner=await planningUser('owner'), person=await planningUser(role), other=await planningUser(role==='picker'?'seller':'picker')
  const ids=Array.from({length:4},()=>crypto.randomUUID()), label=`E2E private ${crypto.randomUUID()}`
  checked(await owner.client.from('work_tasks').insert(ids.map((id,i)=>({id,title:`${label} ${i}`,assigned_to:i===3?other.id:person.id,due_date:i===0?yesterday():todayOslo(),important:i===0,description:'Beskrivelse',status:i===2?'done':'todo'}))))
  await loginPlanning(page,person.email); await page.goto('/admin/oppgaver?archived=1')
  const card=page.getByRole('article').filter({hasText:`${label} 0`})
  await expect(card).toContainText('Forfalt'); await expect(page.getByRole('article').filter({hasText:`${label} 1`}).getByText('Forfalt')).toHaveCount(0)
  await expect(page.getByRole('article').filter({hasText:`${label} 2`})).toContainText('Ferdig')
  await expect(page.getByText(`${label} 3`)).toHaveCount(0)
  expect(checked(await person.client.from('work_tasks').select('id').in('id',ids)).data).toHaveLength(3)
  const forged=await person.client.from('work_tasks').update({status:'done',title:'Forged',important:false,completed_by:owner.id}).eq('id',ids[0]); expect(forged.error).not.toBeNull()
  checked(await owner.client.from('work_tasks').update({assigned_to:other.id}).eq('id',ids[0]))
  await submitPlanning(card.getByRole('button',{name:'Marker som ferdig'}))
  await expect(card.getByRole('alert')).toContainText('Fant ikke registreringen.')
  expect(checked(await owner.client.from('work_tasks').select('status').eq('id',ids[0]).single()).data!.status).toBe('todo')
  for(const width of [390,1280]) { await page.setViewportSize({width,height:width===390?844:800}); for(const theme of ['light','dark'] as const) { await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await page.screenshot({path:`shots/planning-tasks-${role}-${width}-${theme}.png`}) } }
})

test('owner board sorts tasks, Mer exposes planning, and sheets support keyboard focus',async({page})=>{
  const owner=await planningUser('owner')
  const prefix=`E2E order ${crypto.randomUUID()}`
  const rows=[
    {id:crypto.randomUUID(),title:`${prefix} no date`,due_date:null,important:false},
    {id:crypto.randomUUID(),title:`${prefix} today`,due_date:todayOslo(),important:false},
    {id:crypto.randomUUID(),title:`${prefix} important`,due_date:null,important:true},
  ]
  checked(await owner.client.from('work_tasks').insert(rows))
  await loginPlanning(page,owner.email); await page.goto('/admin/oppgaver')
  await page.getByRole('button',{name:'Mer',exact:true}).click()
  for(const name of ['Vaktplan','Stemple','Timer','Oppgaver']) await expect(page.getByRole('dialog').getByRole('link',{name,exact:true})).toBeVisible()
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible()
  const create=page.getByRole('button',{name:'Ny oppgave',exact:true})
  await create.focus(); await page.keyboard.press('Enter')
  const dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible()
  await page.keyboard.press('Tab'); await expect(dialog.getByRole('button',{name:'Lukk',exact:true})).toBeFocused()
  await page.keyboard.press('Tab'); await expect(dialog.getByLabel('Tittel')).toBeFocused()
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(create).toBeFocused()
  const cards=page.getByRole('region',{name:'Å gjøre',exact:true}).getByRole('article').filter({hasText:prefix})
  await expect(cards).toHaveCount(3)
  expect(await cards.getByRole('heading').allTextContents()).toEqual([`${prefix} important`,`${prefix} today`,`${prefix} no date`])
  for(const width of [390,1280]) {
    await page.setViewportSize({width,height:width===390?844:800})
    for(const theme of ['light','dark'] as const) {
      await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'})
      await cards.first().scrollIntoViewIfNeeded()
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await page.screenshot({path:`shots/planning-tasks-owner-${width}-${theme}.png`})
    }
  }
})
