import {expect,test} from '@playwright/test'
import {mockPublicApi} from './fixtures'

test('首页先展示总览中的比赛，不等待慢速对局和图鉴接口',async({page})=>{
  await mockPublicApi(page)
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  for(const endpoint of ['matches','characters','standings']){
    await page.route(`**/api/public/${endpoint}*`,async route=>{await gate;await route.fallback()})
  }
  try{
    await page.goto('/')
    await expect(page.getByRole('heading',{name:'正在发生的对局'})).toBeVisible()
    await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
    await expect(page.getByText('42 票',{exact:true}).first()).toBeVisible()
  }finally{release()}
})

test('名单不随比分每次重拉，隐藏暂停轮询，恢复可见时刷新',async({page})=>{
  await mockPublicApi(page)
  await page.clock.install()
  const counts={overview:0,characters:0}
  for(const endpoint of ['overview','characters'] as const){
    await page.route(`**/api/public/${endpoint}*`,async route=>{
      counts[endpoint]++
      if(endpoint==='characters')await route.fulfill({json:{characters:[{id:'c001',name:'芙宁娜',game:'原神',summary:'本季参赛角色介绍',groupCode:'A',seed:1,galleryArtworkKey:null,matchArtworkKey:null,avatarArtworkKey:null}]}})
      else await route.fallback()
    })
  }
  await page.goto('/gallery')
  await expect(page.locator('.character-card').first()).toBeVisible()
  await page.clock.fastForward(15_001)
  await expect.poll(()=>counts.overview).toBe(2)
  expect(counts.characters).toBe(1)
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true})
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.fastForward(45_001)
  expect(counts.overview).toBe(2)
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:false})
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(()=>counts.overview).toBe(3)
  await expect.poll(()=>counts.characters).toBe(2)
})
