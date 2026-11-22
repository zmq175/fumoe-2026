import { expect, test } from '@playwright/test'
import { mockPublicApi } from './fixtures'

test('慢速或失败的性能上报不阻塞加载和站内导航', async ({ page }) => {
  await mockPublicApi(page, { viewer: { email: 'voter@example.com', role: 'voter' } })
  await page.addInitScript(() => { Math.random = () => 0.05 })
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  const received = page.waitForRequest('**/api/perf')
  await page.route('**/api/perf', async route => { await hold; await route.abort() })
  try {
    await page.goto('/')
    const request = await received
    expect(request.postDataJSON()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'page_load' })]))
    expect(await page.evaluate(() => document.readyState)).toBe('complete')
    await page.locator('header').getByText('赛程', { exact: false }).first().click()
    await expect(page.getByRole('tab', { name: '小组积分' })).toBeVisible()
    await page.getByRole('button', { name: '对局中心', exact: true }).click()
    await page.getByLabel('投票给芙宁娜').first().click()
    await page.getByRole('button', { name: '确认提交 1 场' }).click()
    await page.getByLabel('我已确认以上 1 场选择').check()
    await page.getByRole('button', { name: '提交 1 场投票', exact: true }).click()
    await expect(page.locator('.vote-toast')).toContainText('已提交')
  } finally { release() }
})

test('白屏、首页内容、站内投票页与图片完成分别计时', async ({ page }) => {
  await mockPublicApi(page)
  await page.addInitScript(() => { Math.random = () => 0.05 })
  const samples: Array<{ name: string; ms: number; status: number }> = []
  await page.route('**/api/perf', route => {
    samples.push(...route.request().postDataJSON())
    return route.fulfill({ status: 204 })
  })
  let showHome!: () => void
  const holdOverview = new Promise<void>(resolve => { showHome = resolve })
  await page.route('**/api/public/overview', async route => {
    await holdOverview
    await route.fallback()
  })
  await page.goto('/')
  try {
    await expect.poll(() => samples.some(s => s.name === 'white_screen')).toBe(true)
    expect(samples.some(s => s.name === 'home_visible')).toBe(false)
  } finally { showHome() }
  await expect.poll(() => samples.filter(s => s.name === 'home_visible').length).toBe(1)
  await page.getByRole('button', { name: '对局中心', exact: true }).click()
  await expect.poll(() => samples.filter(s => s.name === 'vote_page_visible').length).toBe(1)
  await expect.poll(() => samples.some(s => s.name.startsWith('image_') && s.status === 200)).toBe(true)
  const firstPaint = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0].startTime)
  expect(samples.find(s => s.name === 'white_screen')?.ms).toBe(Math.round(firstPaint))
  expect(samples.find(s => s.name === 'home_visible')!.ms).toBeGreaterThan(firstPaint)
  await page.goBack()
  await expect.poll(() => samples.filter(s => s.name === 'home_visible').length).toBe(2)
})

test('投票页按入口区分白屏、身份和选票就绪、全部图片完成', async ({ page }) => {
  await mockPublicApi(page, { viewer: { email: 'voter@example.com', role: 'voter' } })
  await page.addInitScript(() => { Math.random = () => 0.05 })
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const grid = document.querySelector('.match-grid')
      if (!grid) return
      const decoration = document.createElement('img')
      decoration.style.display = 'none'
      decoration.loading = 'lazy'
      decoration.src = '/hidden-decoration-test.png'
      grid.append(decoration)
      observer.disconnect()
    })
    observer.observe(document, { childList: true, subtree: true })
  })
  const samples: Array<{ name: string; entry?: string; ms: number; status: number }> = []
  await page.route('**/api/perf', route => {
    samples.push(...route.request().postDataJSON())
    return route.fulfill({ status: 204 })
  })
  function gate() {
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    return { wait, release }
  }
  const identity = gate(), votes = gate(), images = gate()
  await page.route('**/api/auth/me', async route => { await identity.wait; await route.fallback() })
  await page.route('**/api/votes/mine*', async route => { await votes.wait; await route.fallback() })
  await page.route('**/image-variants/*', async route => { await images.wait; await route.fallback() })
  const count = (name: string, entry: string) => samples.filter(s => s.name === name && s.entry === entry && s.status === 200).length
  try {
    await page.goto('/matches', { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('投票给芙宁娜').first()).toBeVisible()
    identity.release()
    await page.waitForFunction(() => performance.getEntriesByType('resource').some(e => e.name.endsWith('/api/auth/me')))
    const voteReleaseTime = await page.evaluate(() => performance.now())
    votes.release()
    await expect.poll(() => count('vote_interactive', 'direct')).toBe(1)
    expect(samples.find(s => s.name === 'vote_interactive')!.ms).toBeGreaterThanOrEqual(Math.floor(voteReleaseTime))
    expect(count('vote_all_images', 'direct')).toBe(0)
    images.release()
    await expect.poll(() => count('vote_all_images', 'direct')).toBe(1)
    expect(count('vote_fcp', 'direct')).toBe(1)
    expect(count('vote_viewport_images', 'direct')).toBe(1)
    await page.getByRole('button', { name: '首页', exact: true }).click()
    await page.getByRole('button', { name: '对局中心', exact: true }).click()
    await expect.poll(() => count('vote_interactive', 'spa')).toBe(1)
    await expect.poll(() => count('vote_all_images', 'spa')).toBe(1)
    expect(count('vote_entry_paint', 'spa')).toBe(1)
    expect(count('vote_fcp', 'spa')).toBe(0)
  } finally { identity.release(); votes.release(); images.release() }
})
