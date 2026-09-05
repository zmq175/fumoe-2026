import { expect,test } from '@playwright/test'
import { currentSeason,matches,mockPublicApi } from './fixtures'
import type { PublicMatch,PublicRound } from '../src/lib/api'
import { formatSchedule,legacyFormat } from '../src/lib/season-format'

const rounds:PublicRound[]=formatSchedule(legacyFormat(),'2030-08-01T00:00:00.000Z').map((r,i)=>({...r,id:`r${i}`,status:'closed'}))
const knockoutMatches:PublicMatch[]=[]
let entrants=Array.from({length:16},(_,i)=>({id:`c${String(i+1).padStart(3,'0')}`,name:`角色${i+1}`}))
for(const round of rounds.filter(r=>r.stage==='knockout')){
  const winners=[]
  for(let i=0;i<entrants.length;i+=2){const a=entrants[i],b=entrants[i+1];winners.push(a);knockoutMatches.push({...matches[0],id:`${round.id}-${i}`,roundId:round.id,stage:'knockout',roundNumber:round.roundNumber,roundName:round.name,bracketPosition:i/2,groupCode:null,status:'closed',leftId:a.id,leftName:a.name,rightId:b.id,rightName:b.name,winnerCharacterId:a.id,leftVotes:1500+i,rightVotes:1200+i})}
  entrants=winners
}

test.beforeEach(async({page})=>{await mockPublicApi(page,{season:{...currentSeason,format:legacyFormat()},rounds,matches:knockoutMatches});await page.goto('/');await page.getByRole('button',{name:'赛程赛况',exact:true}).click();await page.getByRole('tab',{name:'淘汰赛签表'}).click()})

test('大屏展开、冠军连线和角色路径锁定可用',async({page})=>{
  await page.setViewportSize({width:2200,height:1100})
  const view=page.getByRole('region',{name:'可滚动淘汰赛画布'})
  const canvas=page.locator('.bracket-canvas')
  await expect.poll(async()=>Math.ceil((await canvas.boundingBox())!.height)-await view.evaluate(e=>e.clientHeight)).toBeLessThanOrEqual(1)
  expect(await view.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(1)
  expect(await view.evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1)
  await expect(page.locator('.bracket-canvas__champion-line')).toHaveCSS('stroke','rgb(244, 201, 93)')
  await page.getByRole('button',{name:'清晰大图',exact:true}).click()
  expect((await canvas.boundingBox())!.x).toBeGreaterThan((await view.boundingBox())!.x)
  const role=page.getByRole('button',{name:'角色1，1500 票，查看晋级路径'}).first()
  await role.focus()
  await expect(page.locator('.bracket-canvas__match--tracked')).toHaveCount(4)
  await role.click()
  await expect(role).toHaveAttribute('aria-pressed','true')
  await page.mouse.move(0,0)
  await expect(page.locator('.bracket-canvas__path--tracked')).toHaveCount(4)
  await page.keyboard.press('Escape')
  await expect(page.locator('.bracket-canvas__match--tracked')).toHaveCount(0)
})

test('手机保持可读字号并能定位冠军，不撑宽页面',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'清晰大图',exact:true}).click()
  const toolbar=page.locator('.bracket-explorer__toolbar')
  expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(66)
  await expect(toolbar.getByRole('button')).toHaveCount(1)
  await expect(page.getByRole('button',{name:'清除高亮',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'全图概览',exact:true}).click()
  await expect(page.getByRole('button',{name:'清晰大图',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'清晰大图',exact:true}).click()
  const view=page.getByRole('region',{name:'可滚动淘汰赛画布'})
  expect(await view.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(page.locator('.bracket-canvas__side strong').first()).toHaveCSS('font-size','15px')
  await page.getByLabel('定位轮次').selectOption('champion')
  await expect.poll(()=>view.evaluate(e=>e.scrollLeft)).toBeGreaterThan(1000)
  await expect(page.getByRole('button',{name:'追踪冠军 角色1'})).toBeInViewport()
  await page.getByRole('button',{name:'追踪冠军 角色1'}).click()
  await page.getByRole('button',{name:'清除高亮',exact:true}).click()
  await expect(page.locator('.bracket-canvas__match--tracked')).toHaveCount(0)
})

test('鼠标拖动不会误锁定角色，按钮可横移，边界可继续滚动页面',async({page})=>{
  await page.setViewportSize({width:1100,height:900})
  await page.getByRole('button',{name:'清晰大图',exact:true}).click()
  const view=page.getByRole('region',{name:'可滚动淘汰赛画布'})
  await view.scrollIntoViewIfNeeded()
  const role=page.getByRole('button',{name:'角色1，1500 票，查看晋级路径'}).first()
  const box=(await role.boundingBox())!
  await page.mouse.move(box.x+160,box.y+20)
  await page.mouse.down()
  await page.mouse.move(box.x+40,box.y-80,{steps:12})
  await page.mouse.up()
  expect(await view.evaluate(e=>e.scrollLeft)).toBeGreaterThan(90)
  expect(await view.evaluate(e=>e.scrollTop)).toBeGreaterThan(70)
  await expect(role).toHaveAttribute('aria-pressed','false')
  const before=await view.evaluate(e=>e.scrollLeft)
  await page.getByRole('button',{name:'向右浏览签表'}).click()
  await expect.poll(()=>view.evaluate(e=>e.scrollLeft)).toBeGreaterThan(before+100)
  await view.evaluate(e=>{e.scrollTop=e.scrollHeight})
  const rect=(await view.boundingBox())!
  await page.mouse.move(rect.x+rect.width/2,Math.min(rect.y+150,800))
  const pageTop=await page.evaluate(()=>window.scrollY)
  await page.mouse.wheel(0,400)
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(pageTop)
})
