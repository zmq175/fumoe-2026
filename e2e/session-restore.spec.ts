import {expect,test} from '@playwright/test'
import {mockPublicApi} from './fixtures'

test('迟到的未登录检查不能覆盖刚完成的验证码登录',async({page})=>{
  await mockPublicApi(page)
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/api/auth/me',async route=>{
    await gate
    await route.fulfill({json:{user:null}})
  })
  await page.goto('/')
  await page.getByRole('button',{name:'登录投票'}).click()
  await page.getByLabel('邮箱地址').fill('returning@example.com')
  await page.getByRole('button',{name:'发送验证码'}).click()
  await page.getByRole('button',{name:'完成登录'}).click()
  await expect(page.getByRole('button',{name:/returning@example\.com/})).toBeVisible()
  const response=page.waitForResponse('**/api/auth/me')
  release()
  await response
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
  await expect(page.getByRole('button',{name:/returning@example\.com/})).toBeVisible()
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('fumoe_viewer')??'null')?.email)).toBe('returning@example.com')
})

test('迟到的已登录检查不能恢复用户主动退出的页面状态',async({page})=>{
  const viewer={email:'returning@example.com',role:'voter' as const}
  await mockPublicApi(page,{viewer})
  await page.route('**/api/auth/logout',route=>route.fulfill({json:{ok:true}}))
  await page.addInitScript(value=>localStorage.setItem('fumoe_viewer',JSON.stringify(value)),viewer)
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/api/auth/me',async route=>{await gate;await route.fulfill({json:{user:viewer}})})
  await page.goto('/')
  await page.getByRole('button',{name:/returning@example\.com/}).click()
  await expect(page.getByRole('button',{name:'登录投票'})).toBeVisible()
  const response=page.waitForResponse('**/api/auth/me')
  release()
  await response
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
  await expect(page.getByRole('button',{name:'登录投票'})).toBeVisible()
  expect(await page.evaluate(()=>localStorage.getItem('fumoe_viewer'))).toBeNull()
})
