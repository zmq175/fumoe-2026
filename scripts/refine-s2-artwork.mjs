import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {frameArtwork} from './s2-artwork-framing.mjs'
import {preferredArtwork,rejectArtwork} from './s2-artwork-policy.mjs'
const root=new URL('../',import.meta.url).pathname,out=root+'.local/s2-artwork/'
const manifest=JSON.parse(await readFile(out+'manifest.json','utf8'))
const hash=b=>createHash('sha256').update(b).digest('hex')
let previousChanges=[]
try{previousChanges=JSON.parse(await readFile(root+'seasons/s2/artwork-refinement.json','utf8')).changes??[]}catch{/* first refinement */}
const changes=[]
let next=0
await Promise.all(Array.from({length:3},async()=>{
 while(next<manifest.entries.length){
 const e=manifest.entries[next++],selected=preferredArtwork(e)
 e.candidates=e.candidates.filter(c=>!rejectArtwork(c.title))
 if(process.argv.includes('--changed-only')&&e.image&&selected?.url===e.selected?.url&&e.framing?.version===2)continue
 if(!selected){if(e.image){changes.push({name:e.name,game:e.game,before:e.selected?.title,after:null});e.rejectedArtwork=e.selected;delete e.image;delete e.original;delete e.matchImage;delete e.detailImage;delete e.selected;e.status='pending';e.issues=['已剔除 Q 版或宣传图，正式立绘待补齐']}continue}
 if(selected.url!==e.selected?.url){
  try{
   const file='images/'+e.id+'-'+hash(selected.url).slice(0,10)+'-original';let buffer
   try{buffer=await readFile(out+file)}catch{const r=await fetch(selected.url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status);buffer=Buffer.from(await r.arrayBuffer());await sharp(buffer).metadata();await writeFile(out+file,buffer)}
   changes.push({name:e.name,game:e.game,before:e.selected?.title,after:selected.title})
   e.selected=selected;e.original=file;e.sha256=hash(buffer);e.status='candidate'
  }catch(error){console.log('DOWNLOAD FAILED',e.name,error.message);delete e.image;delete e.matchImage;delete e.detailImage;delete e.selected;e.status='pending';e.issues=['正式立绘下载失败；已隐藏不合适的原候选'];continue}
 }
 if(!e.original)continue
 const buffer=await readFile(out+e.original),metadata=await sharp(buffer).metadata()
 e.dimensions={width:metadata.width,height:metadata.height}
 // Use alpha only. Never erase painted white/black parts or synthesize missing body parts.
 let crop={left:0,top:0,width:metadata.width,height:metadata.height}
 if(metadata.hasAlpha){
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  let left=info.width,top=info.height,right=-1,bottom=-1
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>12){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
  if(right>=left&&bottom>=top)crop={left,top,width:right-left+1,height:bottom-top+1}
 }
 const clean=await sharp(buffer).extract(crop).png().toBuffer()
 const rev=hash(buffer).slice(0,12)
 const image=`images/${e.id}-${rev}-gallery-v2.webp`,matchImage=`images/${e.id}-${rev}-match-v2.webp`,detailImage=`images/${e.id}-${rev}-detail-v2.webp`
 await writeFile(out+image,await frameArtwork(clean,{width:900,height:1200,insetX:42,insetY:60}))
 // Match preview shows the upper portion at a fixed scale without stretching.
 // Keep a full-art derivative beside it so the crop can always be inspected.
 const matchHeight=Math.min(crop.height,Math.round(crop.width*0.9))
 const upper=await sharp(clean).extract({left:0,top:0,width:crop.width,height:matchHeight}).png().toBuffer()
 await writeFile(out+matchImage,await frameArtwork(upper,{width:960,height:540,insetX:30,insetY:20}))
 await sharp(clean).resize({width:1400,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:94}).toFile(out+detailImage)
 Object.assign(e,{image,matchImage,detailImage,framing:{version:2,alphaBounds:crop,gallery:{width:900,height:1200},match:{width:960,height:540},method:'alpha-bounds-contain',matchReview:'自动上部构图，待逐图校准'}})
 console.log(e.game,e.name,selected.title)
 }
}))
manifest.generatedAt=new Date().toISOString()
await writeFile(out+'manifest.json',JSON.stringify(manifest,null,2));await writeFile(root+'seasons/s2/artwork-inventory.json',JSON.stringify(manifest,null,2));await writeFile(root+'seasons/s2/artwork-refinement.json',JSON.stringify({changes:[...previousChanges,...changes],policy:'no-chibi-no-poster',generatedAt:manifest.generatedAt},null,2));console.log(JSON.stringify({replaced:changes.length,images:manifest.entries.filter(e=>e.image).length}))
