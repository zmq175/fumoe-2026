import {expect,test} from '@playwright/test'
import {mockPublicApi,currentSeason,matches,rounds} from './fixtures'

for(const path of ['/', '/matches'])test(`${path} 先展示总览中的比赛，不等待慢速对局和图鉴接口`,async({page})=>{
  await mockPublicApi(page)
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  for(const endpoint of ['matches','characters','standings']){
    await page.route(`**/api/public/${endpoint}*`,async route=>{await gate;await route.fallback()})
  }
  try{
    await page.goto(path)
    await expect(page.getByRole('heading',{name:path==='/'?'正在发生的对局':'今日对局',exact:true})).toBeVisible()
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

test('关键总览在主脚本下载完成前发出，首页不加载后台编辑器',async({page})=>{
  await mockPublicApi(page)
  let overviewReads=0
  const scripts:string[]=[]
  page.on('request',r=>{if(r.resourceType()==='script')scripts.push(r.url())})
  await page.route('**/api/public/overview',async route=>{overviewReads++;await route.fallback()})
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/assets/index-*.js',async route=>{await gate;await route.continue()})
  try {
    await page.goto('/',{waitUntil:'commit'})
    await expect.poll(()=>overviewReads).toBe(1)
  } finally {release()}
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  expect(overviewReads).toBe(1)
  expect(scripts.some(url=>/ArtworkEditor|SeasonConfiguration/.test(url))).toBe(false)
  await expect(page.locator('script[type="module"][src^="/assets/index-"]')).toHaveAttribute('data-cfasync','false')
})

for(const rollover of [false,true])test(`轮询并发请求且${rollover?'切季丢弃旧响应':'等待身份确认后应用结果'}`,async({page})=>{
  await mockPublicApi(page)
  await page.clock.install()
  const counts={overview:0,matches:0,rounds:0,standings:0}
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  const nextSeason=rollover?{...currentSeason,id:'next-season',slug:'next-season',name:'新赛季'}:currentSeason
  await page.route('**/api/public/overview',async route=>{
    counts.overview++
    if(counts.overview===1)return route.fallback()
    await gate
    await route.fulfill({json:{season:nextSeason,previousSeason:null,round:rounds[0],matches:matches.filter(m=>m.status==='live'),siteAnnouncement:'',seasonAnnouncement:''}})
  })
  for(const endpoint of ['matches','rounds','standings'] as const)await page.route(`**/api/public/${endpoint}*`,async route=>{
    counts[endpoint]++
    if(endpoint==='matches'&&counts.matches>1){
      const next=new URL(route.request().url()).searchParams.get('season')==='next-season'
      return route.fulfill({json:{matches:matches.map(m=>({...m,leftName:next?'新赛季角色':rollover?'旧赛季返回':'更新角色'}))}})
    }
    return route.fallback()
  })
  try{
    await page.goto('/matches')
    await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
    await expect.poll(()=>counts.rounds).toBe(1)
    await page.clock.fastForward(15_001)
    // Overview is blocked: these must already be in flight, not queued behind it.
    await expect.poll(()=>counts.overview).toBe(2)
    await expect.poll(()=>counts.matches).toBe(2)
    await expect.poll(()=>counts.rounds).toBe(2)
    await expect.poll(()=>counts.standings).toBe(0)
    await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
    release()
    await expect(page.getByLabel(rollover?'投票给新赛季角色':'投票给更新角色').first()).toBeVisible()
    await expect(page.getByText('旧赛季返回',{exact:true})).toHaveCount(0)
  }finally{release()}
})

test('首次总览失败不会显示旧赛制布局，并可重试恢复',async({page})=>{
  await mockPublicApi(page)
  await page.route('**/api/public/overview',route=>route.fulfill({status:503,json:{error:'unavailable'}}))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('无法获取当前赛季')
  await expect(page.locator('main.hero .hero__grid')).toBeAttached()
  await expect(page.getByRole('heading',{name:'连接暂未恢复'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'正在发生的对局',exact:true})).toHaveCount(0)
  await page.unroute('**/api/public/overview')
  await page.getByRole('button',{name:'重新获取'}).click()
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('部分接口更新失败提示旧数据，恢复后清除警告',async({page})=>{
  await mockPublicApi(page)
  await page.clock.install()
  await page.goto('/matches')
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  await expect(page.locator('.data-freshness')).toHaveCount(0)
  await page.route('**/api/public/matches*',route=>route.fulfill({status:503,json:{error:'unavailable'}}))
  await page.clock.fastForward(15_001)
  await expect(page.getByRole('alert')).toContainText('部分数据可能停留在上次成功获取时')
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  await page.unroute('**/api/public/matches*')
  await page.getByRole('button',{name:'重新获取'}).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('首页不因积分接口失败报警，进入依赖积分的赛程页才提示',async({page})=>{
  await mockPublicApi(page)
  let failedReads=0
  await page.route('**/api/public/standings*',async route=>{failedReads++;await route.fulfill({status:503,json:{error:'unavailable'}})})
  await page.goto('/')
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  expect(failedReads).toBe(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button',{name:'赛程赛况'}).click()
  await expect(page.getByRole('alert')).toContainText('更新失败')
})

test('总览返回异常内容时保留已加载赛事，不清空为白屏',async({page})=>{
  await mockPublicApi(page)
  await page.clock.install()
  await page.goto('/')
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  await page.route('**/api/public/overview',route=>route.fulfill({json:{}}))
  await page.clock.fastForward(15_001)
  await expect(page.getByRole('alert')).toContainText('更新失败')
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  await expect(page.locator('.hero h1')).toBeVisible()
})

test('首次总览慢至20秒仍能加载，不被旧超时打断或变成空白',async({page})=>{
  test.setTimeout(45_000)
  await mockPublicApi(page)
  let reads=0
  await page.route('**/api/public/overview',async route=>{
    reads++
    await new Promise(resolve=>setTimeout(resolve,20_000))
    await route.fallback()
  })
  await page.goto('/')
  await expect(page.locator('main.hero')).toBeVisible()
  await expect(page.getByRole('heading',{name:'正在加载赛事'})).toBeVisible()
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible({timeout:25_000})
  expect(reads).toBe(1)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('对局请求瞬时失败自动恢复，无需用户手动刷新',async({page})=>{
  await mockPublicApi(page)
  let reads=0
  await page.route('**/api/public/matches*',async route=>{
    reads++
    if(reads===1)return route.fulfill({status:503,json:{error:'temporary'}})
    await route.fallback()
  })
  await page.goto('/matches')
  await expect.poll(()=>reads).toBe(2)
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('切换页面不等待上一页的慢图鉴请求',async({page})=>{
  await mockPublicApi(page)
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  let rosterStarted=false,matchReads=0
  await page.route('**/api/public/characters*',async route=>{rosterStarted=true;await gate;await route.fallback()})
  await page.route('**/api/public/matches*',async route=>{matchReads++;await route.fallback()})
  try{
    await page.goto('/gallery')
    await expect.poll(()=>rosterStarted).toBe(true)
    await expect.poll(()=>matchReads).toBe(1)
    await page.getByRole('button',{name:'对局中心',exact:true}).click()
    await expect.poll(()=>matchReads).toBe(2)
    await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  }finally{release()}
})

for(const [path,endpoint,title] of [
  ['/matches','matches','对局中心'],['/bracket','standings','赛程赛况'],
  ['/factions','characters','阵营数据'],['/gallery','characters','角色图鉴'],['/seasons','seasons','历届赛事'],
] as const)test(`${title} 首次数据未到不显示空数据结论`,async({page})=>{
  await mockPublicApi(page,{matches:[]})
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  await page.route(`**/api/public/${endpoint}*`,async route=>{await gate;await route.fallback()})
  try{
    await page.goto(path)
    await expect(page.getByRole('heading',{name:`正在加载${title}`,exact:true})).toBeVisible()
    await expect(page.getByText('当前暂无公开赛季。',{exact:true})).toHaveCount(0)
    release()
    await expect(page.getByRole('heading',{name:`正在加载${title}`,exact:true})).toHaveCount(0)
  }finally{release()}
})

test('历史赛季加载失败保留历史页面语义并支持重试',async({page})=>{
  await mockPublicApi(page)
  await page.route('**/api/public/seasons/2030-season',route=>route.fulfill({status:503,json:{error:'temporary'}}))
  await page.goto('/seasons/2030-season')
  await expect(page.getByRole('alert')).toContainText('历史赛季')
  await expect(page.getByRole('heading',{name:'历史赛季暂未加载完成'})).toBeVisible()
  await page.unroute('**/api/public/seasons/2030-season')
  await page.getByRole('button',{name:'重新获取'}).click()
  await expect(page.getByRole('heading',{name:'府萌 2030',exact:true})).toBeVisible()
})

test('轮次接口返回异常结构不会清空或崩溃对局中心',async({page})=>{
  await mockPublicApi(page)
  await page.clock.install()
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto('/matches')
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  await page.route('**/api/public/rounds*',route=>route.fulfill({json:{}}))
  await page.clock.fastForward(15_001)
  await expect(page.getByRole('alert')).toContainText('更新失败')
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  expect(errors).toEqual([])
})
