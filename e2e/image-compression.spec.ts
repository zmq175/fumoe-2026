import {expect,test} from '@playwright/test'
import {mockPublicApi} from './fixtures'
import {legacyPortrait} from '../src/lib/legacy-assets'

test('列表使用压缩图，衍生图不可用时回到同一角色原版本',async({page})=>{
  await mockPublicApi(page)
  await page.goto('/bracket')
  const avatar=page.locator('.standing__row .portrait img').first()
  await expect(avatar).toHaveAttribute('src',/\/image-variants\/[a-f0-9]+\.webp/)
  await page.route('**/image-variants/*.webp',route=>route.fulfill({status:404,body:''}))
  await page.reload()
  await expect(avatar).toHaveAttribute('src',legacyPortrait('c001')!)
  await expect(avatar).toBeVisible()
})
