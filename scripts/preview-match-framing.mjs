// Local-only sample calibration. Uses the application's canvas crop/export workflow;
// no source/static asset is overwritten, and each upload receives a new media revision.
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

if(!process.argv.includes('--apply-local'))throw new Error('需要 --apply-local；此脚本只更新 8788 本地预览中的四位示例角色')
const base='http://127.0.0.1:8788'
const samples=[
  {id:'c057',source:'public/artwork/c057/gallery.webp',type:'image/webp',area:{x:0,y:178,width:900,height:506.25}},
  {id:'c049',source:'public/artwork/c049/gallery.webp',type:'image/webp',area:{x:0,y:187,width:900,height:506.25}},
  {id:'c041',source:'assets/source/c041.png',type:'image/png',area:{x:0,y:218,width:1024,height:576}},
  {id:'c033',source:'assets/source/c033.png',type:'image/png',area:{x:49,y:62,width:420,height:236.25}}
]
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})})
try{
  const context=await browser.newContext()
  for(const [path,data] of [['request-code',{email:'admin@fumoe.local',turnstileToken:'local'}],['verify-code',{email:'admin@fumoe.local',code:'000000'}]]){
    const response=await context.request.post(`${base}/api/auth/${path}`,{data})
    if(!response.ok())throw new Error(await response.text())
  }
  const page=await context.newPage();await page.goto(base)
  for(const sample of samples){
    const dataUrl=`data:${sample.type};base64,${(await readFile(sample.source)).toString('base64')}`
    const result=await page.evaluate(async({sample,dataUrl})=>{
      const response=await fetch(`/api/admin/characters/${sample.id}`)
      if(!response.ok)throw new Error('角色读取失败')
      const {character:c}=await response.json()
      const original=await (await fetch(dataUrl)).blob(),image=new Image();image.src=dataUrl;await image.decode()
      const a=sample.area,canvas=document.createElement('canvas');canvas.width=960;canvas.height=540
      const drawing=canvas.getContext('2d');drawing.fillStyle='#070c10';drawing.fillRect(0,0,960,540);drawing.drawImage(image,a.x,a.y,a.width,a.height,0,0,960,540)
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9))
      if(!blob)throw new Error('横图生成失败')
      const form=new FormData();form.append('original',original,sample.type==='image/png'?'original.png':'original.webp');form.append('match',blob,'match.webp')
      for(const variant of ['gallery','avatar']){
        const key=c[variant==='gallery'?'artworkGalleryKey':'artworkAvatarKey']??`characters/${sample.id}/${variant}.webp`
        const r=await fetch(`/api/media/${key}`);if(!r.ok||!r.headers.get('content-type')?.startsWith('image/'))throw new Error('旧比例素材读取失败')
        form.append(variant,await r.blob(),`${variant}.webp`)
      }
      const defaultCrop={x:0,y:0,zoom:1,rotation:0}
      form.append('metadata',JSON.stringify({summary:c.summary,sourceType:c.artworkSourceType??'pending',sourceUrl:c.artworkSourceUrl??undefined,sourceNote:'本地人工校准：仅对局横图，保留原图与其他比例',reason:'本地预览对局人像构图校准',galleryCrop:JSON.parse(c.artworkGalleryCrop||'null')??defaultCrop,avatarCrop:JSON.parse(c.artworkAvatarCrop||'null')??defaultCrop,matchCrop:{...defaultCrop,area:{x:a.x/image.naturalWidth*100,y:a.y/image.naturalHeight*100,width:a.width/image.naturalWidth*100,height:a.height/image.naturalHeight*100}}}))
      const upload=await fetch(`/api/admin/characters/${sample.id}/artwork`,{method:'POST',body:form});const result=await upload.json();if(!upload.ok)throw new Error(JSON.stringify(result));return result.keys.match
    },{sample,dataUrl})
    console.log(`${sample.id}: ${result}`)
  }
}finally{await browser.close()}
