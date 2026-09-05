import { expect,test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockPublicApi,currentSeason } from './fixtures'
import { legacyFormat } from '../src/lib/season-format'

test('首页宣传语不绑定人数，实际人数单独展示',async({page})=>{
  await mockPublicApi(page,{season:{...currentSeason,format:{...legacyFormat(),participants:256}}})
  await page.goto('/')
  await expect(page.locator('.hero h1')).toHaveText('你来投票选出下一位群头像主角')
  await expect(page.locator('.hero__season-facts')).toContainText('256 位角色')
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('只调整对局横图，发布时原样保留图鉴与头像',async({page})=>{
  await mockPublicApi(page,{viewer:{email:'admin@example.com',role:'admin'}})
  const c={id:'c057',name:'鉴心',game:'鸣潮',summary:'今州的拳师，以心观万象。',groupCode:'A',seed:57,artworkQualityStatus:'verified',artworkSourceType:'community-wiki',artworkOriginalKey:'characters/c057/original.webp',artworkGalleryKey:null,artworkMatchKey:null,artworkAvatarKey:null,artworkGalleryCrop:'{}',artworkMatchCrop:'{}',artworkAvatarCrop:'{}'}
  c.artworkMatchCrop=JSON.stringify({x:0,y:0,zoom:1,rotation:0,area:{x:0,y:14.833333,width:100,height:42.1875}})
  await page.route('**/api/admin/characters/c057',r=>r.fulfill({json:{character:c}}))
  await page.route('**/api/media/characters/c057/original.webp',r=>r.fulfill({contentType:'image/webp',body:readFileSync('public/artwork/c057/gallery.webp')}))
  let uploaded=false
  await page.route('**/api/admin/characters/c057/artwork',async route=>{
    const r=route.request(),body=r.postDataBuffer()!
    const form=await new Request(r.url(),{method:'POST',headers:r.headers(),body:new Uint8Array(body)}).formData()
    for(const variant of ['gallery','avatar'])expect(Buffer.from(await (form.get(variant) as File).arrayBuffer())).toEqual(readFileSync(`public/artwork/c057/${variant}.webp`))
    const metadata=JSON.parse(form.get('metadata') as string)
    expect(metadata.matchCrop.area.width).toBeGreaterThan(0)
    expect(metadata.matchCrop.area.height).toBeGreaterThan(0)
    expect(metadata.matchCrop.area.y).toBeGreaterThan(10)
    expect(metadata.matchCrop.area.y).toBeLessThan(25)
    expect(Buffer.from(await (form.get('match') as File).arrayBuffer())).not.toEqual(readFileSync('public/artwork/c057/match.webp'))
    uploaded=true;await route.fulfill({json:{ok:true,keys:{},character:{}}})
  })
  await page.goto('/admin/characters/c057')
  await expect(page.getByText('已载入最新发布版本',{exact:false})).toBeVisible()
  await expect(page.getByLabel('显示对局构图参考线')).toBeChecked()
  await expect(page.locator('.editor-dirty')).toHaveCount(0)
  await page.getByRole('button',{name:'放大',exact:true}).click()
  await expect(page.locator('.crop-preview--match')).toHaveJSProperty('tagName','CANVAS')
  await page.getByRole('button',{name:'发布新版本',exact:false}).click()
  await expect(page.getByRole('status')).toContainText('发布成功')
  expect(uploaded).toBe(true)
})
