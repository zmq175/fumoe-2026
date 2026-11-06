import {expect,test} from '@playwright/test'
import {mockPublicApi} from './fixtures'
const script='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

test('脚本首次失败后重新打开登录可重新加载',async({page})=>{
  await mockPublicApi(page)
  let attempts=0
  await page.route(script,route=>++attempts===1?route.abort():route.fallback())
  await page.goto('/')
  await page.getByRole('button',{name:'登录投票',exact:true}).click()
  await expect(page.getByText('人机验证加载失败，请重试。')).toBeVisible()
  await page.getByRole('button',{name:'关闭',exact:true}).click()
  await page.getByRole('button',{name:'登录投票',exact:true}).click()
  await expect(page.getByText('人机验证已完成')).toBeVisible()
  expect(attempts).toBe(2)
})

test('加载失败可直接重试，恢复前不能发送邮箱验证码',async({page})=>{
  await mockPublicApi(page)
  let attempts=0
  await page.route(script,route=>++attempts===1?route.abort():route.fallback())
  await page.goto('/')
  await page.getByRole('button',{name:'登录投票',exact:true}).click()
  await page.getByLabel('邮箱地址').fill('voter@example.com')
  await expect(page.getByRole('button',{name:'发送验证码',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'重新验证',exact:true}).click()
  await expect(page.getByRole('button',{name:'发送验证码',exact:true})).toBeEnabled()
  expect(attempts).toBe(2)
})

test('错误码可见，旧令牌失效，重试后恢复验证',async({page})=>{
  await mockPublicApi(page)
  await page.route(script,route=>route.fulfill({contentType:'application/javascript',body:`window.turnstile={render:(container,options)=>{window.__challengeOptions=options;queueMicrotask(()=>options.callback('test-token'));return 'widget'},remove:()=>{},reset:()=>{}}`}))
  await page.goto('/')
  await page.getByRole('button',{name:'登录投票',exact:true}).click()
  await page.getByLabel('邮箱地址').fill('voter@example.com')
  await expect(page.getByRole('button',{name:'发送验证码',exact:true})).toBeEnabled()
  await page.evaluate(()=>Reflect.get(window,'__challengeOptions')['error-callback']('200500'))
  await expect(page.getByText(/错误码：200500/)).toBeVisible()
  await expect(page.getByRole('button',{name:'发送验证码',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'重新验证',exact:true}).click()
  await expect(page.getByRole('button',{name:'发送验证码',exact:true})).toBeEnabled()
  await expect(page.getByText(/错误码：200500/)).toHaveCount(0)
  await page.evaluate(()=>Reflect.get(window,'__challengeOptions')['unsupported-callback']())
  await expect(page.getByText(/当前浏览器环境暂不受支持/)).toBeVisible()
  await expect(page.getByRole('button',{name:'发送验证码',exact:true})).toBeDisabled()
})

test('验证码脚本长时间无响应会提示超时并允许重新加载',async({page})=>{
  await mockPublicApi(page)
  await page.clock.install()
  let attempts=0,release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  await page.route(script,async route=>{if(++attempts===1){await gate;await route.abort()}else await route.fallback()})
  try{
    await page.goto('/')
    await page.getByRole('button',{name:'登录投票',exact:true}).click()
    await expect.poll(()=>attempts).toBe(1)
    await page.clock.fastForward(20_001)
    await expect(page.getByText('人机验证加载超时，请检查网络后重试。')).toBeVisible()
    // Restore the simulated network before retrying. Removing a script tag
    // alone does not cancel the browser's underlying pending HTTP request.
    const failed=page.waitForEvent('requestfailed',request=>request.url()===script)
    release()
    await failed
    await page.getByRole('button',{name:'重新验证',exact:true}).click()
    await expect(page.getByText('人机验证已完成')).toBeVisible()
    expect(attempts).toBe(2)
  }finally{release()}
})
