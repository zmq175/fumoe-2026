import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockPublicApi } from './fixtures'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

test('手机页脚保留登录状态，版本入口可打开和关闭更新日志', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockPublicApi(page, { viewer: { email: 'reader@example.com', role: 'voter' } })
  await page.goto('/')
  const footer = page.locator('.site-footer')
  await expect(footer).toContainText('reader@example.com 已登录')
  const entry = footer.getByRole('button', { name: `v${version} · 更新日志` })
  await entry.click()
  const notes = page.getByRole('dialog', { name: '更新日志' })
  await expect(notes.getByRole('heading', { name: `v${version}`, exact: true })).toBeVisible()
  const versions = await notes.getByRole('heading', { level: 3 }).allTextContents()
  expect(versions.slice(0, 2)).toEqual([`v${version}`, 'v1.5.0'])
  expect(versions.at(-1)).toBe('v1.0.0')
  expect(new Set(versions).size).toBe(versions.length)
  expect(versions.indexOf('v1.4.10')).toBeLessThan(versions.indexOf('v1.4.9'))
  await expect(notes.getByText('候选版本 · 待上线')).toBeVisible()
  expect(versions).toEqual([...versions].sort((a, b) => b.localeCompare(a, 'en', { numeric: true })))
  await page.keyboard.press('Escape')
  await expect(notes).toBeHidden()
  await expect(entry).toBeFocused()
  await entry.click()
  await notes.getByRole('button', { name: '关闭更新日志' }).click()
  await expect(notes).toBeHidden()
})
