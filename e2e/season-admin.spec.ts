import { expect,test } from '@playwright/test'
import { currentSeason,mockPublicApi } from './fixtures'

test('creates a season through an explicit confirmation dialog',async({page})=>{
  await mockPublicApi(page,{viewer:{email:'admin@example.com',role:'admin'},seasons:[currentSeason]})
  await page.goto('/admin')
  await page.getByRole('button',{name:'创建草稿赛季'}).click()
  const dialog=page.getByRole('dialog',{name:'创建草稿赛季'})
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('赛季名称').fill('府萌 2031')
  await dialog.getByLabel('操作原因').fill('筹备下一届赛事')
  await dialog.getByRole('button',{name:'创建草稿赛季'}).click()
  await expect(page.getByText('草稿赛季已创建，可配置赛制和名单。')).toBeVisible()
})
