import { expect, test } from '@playwright/test'
import { currentSeason, later, matches, mockPublicApi, now, standings } from './fixtures'

test.beforeEach(async ({ page }) => {
  await mockPublicApi(page)
})

test('shows the live round and active public matchup', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('.hero__statboard p')).toContainText('瑞士轮 01')
  await expect(page.locator('.hero__statboard p')).toContainText('进行中')
  await expect(page.getByRole('heading', { name: '正在发生的对局' })).toBeVisible()
  await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
  await expect(page.getByText('42 票', { exact: true }).first()).toBeVisible()
  const voteBar=page.locator('.vote-progress').first()
  await expect(voteBar.locator('.vote-progress__left')).toHaveCSS('background-color','rgb(42, 130, 228)')
  await expect(voteBar.locator('.vote-progress__right')).toHaveCSS('background-color','rgb(239, 91, 126)')
  await expect(voteBar).not.toContainText('%')
})

test('requires login before voting and records a confirmed vote', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '对局中心', exact: true }).click()
  await expect(page.getByRole('heading', { name: '今日对局' })).toBeVisible()

  await page.getByLabel('投票给芙宁娜').first().click()
  await expect(page.getByRole('dialog', { name: '登录后投票' })).toBeVisible()
  await page.getByLabel('邮箱地址').fill('voter@example.com')
  await page.getByRole('button', { name: '发送验证码' }).click()
  await expect(page.getByText('本地开发验证码：')).toBeVisible()
  await page.getByRole('button', { name: '完成登录' }).click()
  await expect(page.getByRole('button', { name: /voter@example\.com/ })).toBeVisible()

  await page.getByRole('button', { name: '确认提交 1 场' }).click()
  await expect(page.getByRole('dialog', { name:'确认 1 场投票' })).toBeVisible()
  await page.getByLabel('我已确认以上 1 场选择').check()
  await page.getByRole('button', { name: '提交 1 场投票' }).click()
  await expect(page.getByRole('dialog', { name:'确认 1 场投票' })).toHaveCount(0)
  const votedCard=page.locator('.match-card--voted').first()
  await expect(votedCard.getByText('选票已记录')).toBeVisible()
  await expect(votedCard.getByLabel('我的选票：芙宁娜')).toBeVisible()
  await expect(votedCard.locator('.vote-stamp')).toHaveCount(1)
  await expect(votedCard.getByText('我的选择：芙宁娜 · 已锁定')).toBeVisible()
  await expect(votedCard.getByText('已投 · 芙宁娜')).toHaveCount(0)
  await expect(votedCard.getByLabel('已选角色')).toHaveCount(0)
  await expect(page.getByLabel('已投给芙宁娜').first()).toBeDisabled()
  await expect(page.getByLabel('本场已投票，不能再投给流萤').first()).toBeDisabled()
  await expect(page.getByLabel('已投给芙宁娜').first()).toHaveCSS('opacity','1')
  await expect(page.getByLabel('本场已投票，不能再投给流萤').first()).toHaveCSS('opacity','1')
  await expect(votedCard).toHaveCSS('border-color','rgb(210, 210, 206)')
  await expect(page.getByText('43 票', { exact: true }).first()).toBeVisible()
  expect(await page.evaluate(()=>(window as Window&{__turnstileActions?:string[]}).__turnstileActions)).toEqual(['login'])

  await page.reload()
  await expect(page.getByText('选票已记录').first()).toBeVisible()
  await expect(page.getByLabel('我的选票：芙宁娜').first()).toBeVisible()
  await expect(page.getByLabel('已投给芙宁娜').first()).toBeDisabled()
})

test('batches choices from multiple live matches into one confirmation',async({page})=>{
  await mockPublicApi(page,{viewer:{email:'voter@example.com',role:'voter'}})
  await page.goto('/')
  await expect(page.getByText('本轮共 2 场进行中，首页展示 2 场')).toBeVisible()
  await page.getByRole('button',{name:'进入对局中心查看全部'}).click()
  await page.getByLabel('投票给芙宁娜').click()
  await page.getByLabel('投票给胡桃').click()
  await expect(page.getByRole('button',{name:'确认提交 2 场'})).toBeVisible()
  await page.getByRole('button',{name:'确认提交 2 场'}).click()
  const dialog=page.getByRole('dialog',{name:'确认 2 场投票'})
  await expect(dialog.getByText('芙宁娜')).toBeVisible()
  await expect(dialog.getByText('胡桃')).toBeVisible()
  await dialog.getByLabel('我已确认以上 2 场选择').check()
  await dialog.getByRole('button',{name:'提交 2 场投票'}).click()
  await expect(page.getByLabel('我的选票：芙宁娜')).toBeVisible()
  await expect(page.getByLabel('我的选票：胡桃')).toBeVisible()
  await expect(page.getByRole('button',{name:'确认提交 2 场'})).toHaveCount(0)
})

test('requires login Turnstile before sending an email code', async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', (route) => route.abort())
  await page.goto('/')
  await page.getByRole('button', { name: '登录投票' }).click()
  await page.getByLabel('邮箱地址').fill('mobile@example.com')
  await expect(page.getByRole('button', { name: '发送验证码' })).toBeDisabled()
  await expect(page.getByText('人机验证加载失败，请重试。')).toBeVisible()
})

test('keeps the visible login across navigation and a transient session check failure', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '登录投票' }).click()
  await page.getByLabel('邮箱地址').fill('returning@example.com')
  await page.getByRole('button', { name: '发送验证码' }).click()
  await page.getByRole('button', { name: '完成登录' }).click()
  await page.getByRole('button', { name: '赛程赛况' }).click()
  await page.getByRole('button', { name: '对局中心', exact: true }).click()
  await expect(page.getByRole('button', { name: /returning@example\.com/ })).toBeVisible()

  await page.route('**/api/auth/me', (route) => route.abort())
  await page.reload()
  await expect(page.getByRole('button', { name: /returning@example\.com/ })).toBeVisible()
})

test('keeps admin header controls inside the mobile viewport', async ({ page }) => {
  await page.setViewportSize({width:430,height:932})
  await mockPublicApi(page,{viewer:{email:'zmq175@qq.com',role:'admin'}})
  await page.goto('/')

  await expect(page.locator('.admin-nav-button')).toBeHidden()
  await expect(page.locator('.account-button')).toBeVisible()
  await expect(page.locator('.menu-button')).toBeVisible()
  const controls=await page.locator('.site-header > .brand, .site-header .account-button, .site-header .menu-button').evaluateAll((elements)=>elements.map((element)=>{const box=element.getBoundingClientRect();return{left:box.left,right:box.right,width:box.width}}))
  expect(controls.every(({left,right,width})=>left>=0&&right<=430&&width>0),JSON.stringify(controls)).toBe(true)
})

test('keeps live standings visible when another public request fails', async ({ page }) => {
  await page.route('**/api/public/characters', (route) => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'temporary'})}))
  await page.goto('/')
  await page.getByRole('button', { name: '赛程赛况' }).click()
  await expect(page.locator('.standing__row')).toHaveCount(2)
  await expect(page.getByText('实时预估，轮次结束后锁定')).toBeVisible()
})

test('aggregates current-season votes into developer faction scores',async({page})=>{
  const factionMatch={...matches[0],id:'faction-match',leftId:'c049',leftName:'长离',leftGame:'鸣潮',leftVotes:30,rightId:'c085',rightName:'阿尔托莉雅·潘德拉贡',rightGame:'Fate/Grand Order',rightVotes:15}
  await mockPublicApi(page,{matches:[...matches,factionMatch]})
  await page.goto('/')
  await page.getByRole('button',{name:'阵营数据'}).click()

  await expect(page).toHaveURL('/factions')
  await expect(page.getByRole('heading',{name:'阵营数据'})).toBeVisible()
  const arena=page.getByRole('region',{name:'前二阵营对抗'})
  await expect(arena).toBeVisible()
  await expect(arena.getByAltText('米哈游 官方 LOGO')).toBeVisible()
  const kuroLogo=arena.getByAltText('库洛游戏 官方 LOGO')
  await expect(kuroLogo).toBeVisible()
  expect((await kuroLogo.boundingBox())?.height).toBeGreaterThan(100)
  await expect(arena.getByText('VS',{exact:true})).toBeVisible()
  await expect(arena.getByText('285 票',{exact:true})).toBeVisible()
  await expect(arena.getByText('30 票',{exact:true})).toBeVisible()
  await expect(arena.getByText('领先 255 票',{exact:true})).toBeVisible()
  await expect(arena.getByRole('meter',{name:'前二阵营票数对抗'})).toHaveAttribute('aria-valuenow','285')
  await expect(page.getByText('当前赛季共计 330 票')).toBeVisible()
  await expect(page.getByText('比分按总得票占当前赛季票池比例计算')).toBeVisible()
})

test('refreshes provisional standings immediately after a vote', async ({ page }) => {
  const provisional=[
    {...standings[0],points:0,voteDifference:11},
    {...standings[1],points:0,voteDifference:-11}
  ]
  await mockPublicApi(page,{viewer:{email:'voter@example.com',role:'voter'},standings:provisional})
  await page.goto('/')
  await page.getByRole('button', { name: '赛程赛况' }).click()
  await expect(page.getByText('0 分').first()).toBeVisible()
  await expect(page.getByText('实时预估，轮次结束后锁定')).toBeVisible()

  await page.getByRole('button', { name: '对局中心', exact: true }).click()
  await page.getByLabel('投票给芙宁娜').first().click()
  await page.getByRole('button', { name:'确认提交 1 场' }).click()
  await page.getByLabel('我已确认以上 1 场选择').check()
  await page.getByRole('button', { name: '提交 1 场投票' }).click()
  await page.getByRole('button', { name: '赛程赛况' }).click()
  await expect(page.getByText('3 分').first()).toBeVisible()
})

test('renders standings, knockout bracket, and match history tabs', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '赛程赛况' }).click()
  await expect(page.getByRole('heading', { name: '赛程与赛况' })).toBeVisible()

  await expect(page.getByRole('tab', { name: '小组积分', selected: true })).toBeVisible()
  await expect(page.locator('.standing__row--qualifying')).toHaveCount(2)
  await expect(page.locator('.standing__row .portrait img')).toHaveCount(2)
  await expect(page.locator('.standing__row .portrait img').first()).toHaveAttribute('src','/portraits/c001.png')

  await page.getByRole('tab', { name: '淘汰赛签表' }).click()
  await expect(page.getByRole('tab', { name: '淘汰赛签表', selected: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '淘汰赛签表' })).toBeVisible()
  await expect(page.getByText('16 强', { exact: true })).toBeVisible()
  await expect(page.locator('.bracket-canvas__side--winner')).toHaveCount(1)
  await expect(page.locator('.bracket-canvas__match:not(.bracket-canvas__match--placeholder) .bracket-canvas__score')).toHaveCount(2)
  await expect(page.locator('.bracket-canvas__match:not(.bracket-canvas__match--placeholder) .portrait')).toHaveCount(2)
  const layouts=await page.locator('.bracket-canvas__match:not(.bracket-canvas__match--placeholder) .bracket-canvas__side').evaluateAll((sides)=>sides.map((side)=>{
    const values=(selector:string)=>{const box=side.querySelector(selector)?.getBoundingClientRect();return box?{left:box.left,right:box.right,top:box.top,bottom:box.bottom}:null}
    const box=side.getBoundingClientRect()
    return {portrait:values('.portrait'),label:values(':scope > span:not(.portrait)'),score:values('.bracket-canvas__score'),bounds:{left:box.left,right:box.right,top:box.top,bottom:box.bottom}}
  }))
  expect(layouts,JSON.stringify(layouts)).toHaveLength(2)
  expect(layouts.every(({portrait,label,score,bounds})=>Boolean(portrait&&label&&score&&bounds&&portrait.left>=bounds.left&&portrait.bottom<=bounds.bottom&&portrait.right<=label.left&&label.right<=score.left)),JSON.stringify(layouts)).toBe(true)
  expect(await page.locator('.bracket-canvas__match').evaluateAll((cards) => cards.every((card) => {
    const footer = card.querySelector('footer')
    if (!footer) return false
    const cardBox = card.getBoundingClientRect()
    const footerBox = footer.getBoundingClientRect()
    return footerBox.bottom <= cardBox.bottom && footer.scrollHeight <= footer.clientHeight
  }))).toBe(true)

  await page.getByRole('tab', { name: '对阵历史' }).click()
  await expect(page.getByRole('heading', { name: '瑞士轮 第 1 轮' })).toBeVisible()
  await expect(page.getByText('芙宁娜', { exact: true }).last()).toBeVisible()
  await expect(page.locator('.history-match .portrait img')).toHaveCount(6)
  await expect(page.locator('.history-match .portrait img').first()).toHaveAttribute('src','/portraits/c001.png')
  await expect(page.getByRole('heading', { name: '瑞士轮 2' })).toBeVisible()
  await expect(page.getByText('瑞士轮 1 结束后生成具体对阵')).toBeVisible()
  await expect(page.locator('.swiss-preview').first().locator('section')).toHaveCount(8)
  await expect(page.locator('.swiss-preview').first().getByText('待定')).toHaveCount(128)
})

test('shows the completed season champion prominently', async ({ page }) => {
  const final = { ...matches[2], id:'final', roundId:'knockout-4', roundNumber:4, roundName:'决赛', leftVotes:88, rightVotes:102, winnerCharacterId:'c002' }
  const season = { ...currentSeason, status:'completed' as const, championCharacterId:'c002', announcement:'赛季已经结束' }
  await mockPublicApi(page, { season, matches:[final], rounds:[{ id:'knockout-4',stage:'knockout',roundNumber:4,name:'决赛',status:'closed',startsAt:now,endsAt:later }] })
  await page.goto('/')
  await expect(page.getByText('冠军诞生')).toBeVisible()
  await expect(page.getByRole('heading',{name:'流萤'})).toBeVisible()
  await expect(page.getByText('102 : 88')).toBeVisible()
  await expect(page.getByRole('heading',{name:'正在发生的对局'})).toHaveCount(0)
})

test('keeps historical season data after current-season polling', async ({ page }) => {
  const final={...matches[2],id:'archive-final',roundId:'archive-ko-4',roundNumber:4,roundName:'决赛',status:'closed' as const,leftVotes:88,rightVotes:102,winnerCharacterId:'c002'}
  const archive={...currentSeason,id:'season-2029',slug:'2029-season',name:'府萌 2029',status:'completed' as const,isCurrent:false,championCharacterId:'c002'}
  const archiveRounds=[{id:'archive-ko-4',stage:'knockout' as const,roundNumber:4,name:'决赛',status:'closed' as const,startsAt:now,endsAt:later}]
  await mockPublicApi(page,{seasons:[currentSeason,archive],historical:{'2029-season':{season:archive,rounds:archiveRounds,matches:[final],standings:[]}}})
  await page.clock.install()
  await page.goto('/seasons/2029-season')
  await expect(page.getByText('102 : 88')).toBeVisible()
  await page.clock.fastForward('16:00')
  await page.getByRole('tab',{name:'小组积分'}).click()
  await page.getByRole('tab',{name:'淘汰赛签表'}).click()
  await expect(page.getByText('102 : 88')).toBeVisible()
  await expect(page.getByText('流萤').last()).toBeVisible()
})

test('uses optimized static match art and falls back for versioned art', async ({ page }) => {
  const versioned={...matches[0],leftArtworkKey:'characters/c001/rev-2/match.webp'}
  await mockPublicApi(page,{matches:[versioned,matches[1]]})
  let versionedRequests=0
  await page.route('**/api/media/characters/c001/rev-2/match.webp',(route)=>{versionedRequests++;return route.fulfill({status:404,contentType:'application/json',body:'{}'})})
  await page.goto('/')
  const left=page.getByAltText('芙宁娜 角色立绘').first()
  await expect.poll(()=>versionedRequests).toBe(1)
  await expect(left).toHaveAttribute('src','/artwork/c001/match.webp')
  await expect(left).toHaveAttribute('loading','eager')
  await expect(left).toHaveAttribute('fetchpriority','high')
})

test('serves every finalized transparent portrait', async ({ request }) => {
  for (let index=1;index<=128;index++) {
    const id=`c${String(index).padStart(3,'0')}`
    const response=await request.get(`/portraits/${id}.png`)
    expect(response.ok(),`${id} should be directly accessible`).toBe(true)
    expect(response.headers()['content-type']).toContain('image/png')
  }
})

test('falls back to the frozen avatar when a portrait fails', async ({ page }) => {
  await mockPublicApi(page,{standings:[{...standings[0],avatarArtworkKey:'characters/c001/rev-2/avatar.webp'}]})
  await page.route('**/portraits/c001.png',(route)=>route.fulfill({status:404,body:''}))
  await page.route('**/api/media/characters/c001/rev-2/avatar.webp',(route)=>route.fulfill({status:404,body:''}))
  await page.goto('/')
  await page.getByRole('button',{name:'赛程赛况'}).click()
  await expect(page.locator('.standing__row .portrait img')).toHaveAttribute('src','/artwork/c001/avatar.webp')
})

test.describe('mobile bracket', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('keeps knockout columns accessible with horizontal scrolling', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '展开菜单' }).click()
    await page.getByRole('button', { name: '赛程赛况' }).click()
    await page.getByRole('tab', { name: '淘汰赛签表' }).click()

    const bracket = page.getByRole('region', { name: '淘汰赛签表' })
    await expect(bracket).toBeVisible()
    expect(await bracket.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  })
})
