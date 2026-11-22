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
