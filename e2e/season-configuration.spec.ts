import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { currentSeason, mockPublicApi, matches } from './fixtures'
import { legacyFormat, formatSchedule, type SeasonFormat } from '../src/lib/season-format'

test('配置 256 人月赛并保存，桌面和手机能完成同一流程',async({page})=>{
  const draft={...currentSeason,id:'draft-config',slug:'draft-config',name:'月赛草稿',status:'draft' as const,isCurrent:false,format:legacyFormat()}
  await mockPublicApi(page,{season:draft,seasons:[draft],viewer:{email:'admin@example.com',role:'admin'}})
  let saved:SeasonFormat=legacyFormat()
  await page.route('**/api/admin/seasons/draft-config/configuration',async route=>{
    if(route.request().method()==='PUT'){saved=route.request().postDataJSON().format;draft.format=saved;await route.fulfill({json:{ok:true}});return}
    await route.fulfill({json:{format:saved,entries:[],rounds:formatSchedule(saved,'2030-08-01T00:00:00.000Z').map((r,i)=>({...r,id:`r${i}`,status:'scheduled'})),validation:{valid:false,error:'名单为空'}}})
  })
  await page.goto('/admin')
  const config=page.getByRole('region',{name:'赛制与排期配置'})
  await expect(config.getByLabel('参赛人数')).toBeVisible()
  await config.getByLabel('参赛人数').selectOption('256')
  await expect(page.getByRole('button',{name:'发布赛季',exact:true})).toBeDisabled()
  await config.getByRole('combobox',{name:'分组数',exact:true}).selectOption('16')
  await config.getByLabel('瑞士轮数').fill('5')
  const rows=config.locator('tbody tr')
  await expect(rows).toHaveCount(10)
  for(const row of await rows.all()){await row.locator('input').nth(0).fill('24');await row.locator('input').nth(1).fill('48')}
  await expect(config.locator('.season-config__preview')).toContainText('约 30.0 天')
  await config.getByLabel('操作原因').fill('为下届月赛配置赛制')
  await config.getByRole('button',{name:/保存赛制与排期/}).click()
  await expect(config.getByRole('status')).toContainText('赛制与默认排期已保存')
  await expect(page.getByRole('button',{name:'发布赛季',exact:true})).toBeEnabled()
  expect(saved.participants).toBe(256);expect(saved.groupCount).toBe(16);expect(saved.rounds).toHaveLength(10)
  mkdirSync('.impeccable/review',{recursive:true})
  await page.setViewportSize({width:1440,height:1000})
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:'.impeccable/review/desktop.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await expect(config.getByLabel('参赛人数')).toBeVisible()
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:'.impeccable/review/mobile.png',fullPage:true})
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth&&getComputedStyle(e).position!=='absolute').map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right})).slice(0,10)}))
  expect(overflow.scroll,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width)
  await expect(config.getByText('左右滑动查看完整排期。')).toBeVisible()
  await config.locator('summary').filter({hasText:'本赛季阵营'}).click()
  await config.locator('summary').filter({hasText:'导入／替换草稿名单'}).click()
  await config.getByLabel('参赛名单').fill('new-hero\t新角色\t新游戏\tA\t1')
  await expect(page.getByRole('button',{name:'发布赛季',exact:true})).toBeDisabled()
  await config.locator('summary').filter({hasText:'逐轮日历与调整'}).click()
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:'.impeccable/review/expanded-mobile.png',fullPage:true})
})

test('新游戏角色可以投票展示，256 人单败签表具有八轮',async({page})=>{
  const format:SeasonFormat={...legacyFormat(),participants:256,mode:'knockout',rounds:Array.from({length:8},()=>({durationHours:72,breakHours:0}))}
  const rounds=formatSchedule(format,'2030-08-01T00:00:00.000Z').map((r,i)=>({...r,id:`new-round-${i}`,status:i===0?'live' as const:'scheduled' as const}))
  const match={...matches[0],id:'new-match',roundId:rounds[0].id,stage:'knockout' as const,roundNumber:1,leftId:'new-game-hero',leftName:'新游戏角色',leftGame:'新增游戏',rightId:'another-hero',rightName:'另一个角色',rightGame:'另一个游戏'}
  await mockPublicApi(page,{season:{...currentSeason,format},rounds,matches:[match]})
  await page.goto('/')
  await expect(page.getByLabel('投票给新游戏角色')).toBeVisible()
  await page.getByRole('button',{name:'赛程赛况'}).click()
  await expect(page.locator('.bracket-canvas__round-title')).toHaveCount(9)
  await expect(page.locator('.bracket-canvas__match')).toHaveCount(255)
  await expect(page.locator('.bracket-canvas')).toContainText('256 强')
  await page.screenshot({path:'.impeccable/review/knockout.png',fullPage:true})
})

test('已发布赛季的规则与名单只读',async({page})=>{
  await mockPublicApi(page,{viewer:{email:'admin@example.com',role:'admin'}})
  await page.goto('/admin')
  const config=page.getByRole('region',{name:'赛制与排期配置'})
  await expect(config.getByLabel('参赛人数')).toBeDisabled()
  await expect(config.getByText('本赛季规则已冻结。历史赛季继续按发布时的规则展示。')).toBeVisible()
  await expect(config.getByRole('button',{name:/保存赛制与排期/})).toHaveCount(0)
  await page.screenshot({path:'.impeccable/review/frozen.png',fullPage:true})
})
