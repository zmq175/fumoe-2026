import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {frameArtwork} from './s2-artwork-framing.mjs'
const root=new URL('../',import.meta.url).pathname,dir=root+'.local/s2-artwork/'
const manifest=JSON.parse(await readFile(dir+'manifest.json','utf8')),batch=JSON.parse(await readFile(root+'seasons/s2/artwork-supplement.json','utf8'))
for(const item of batch.entries){
 const e=manifest.entries.find(e=>e.id===item.id&&e.game===item.game);if(!e)throw Error('Unknown identity')
 let input;try{input=await readFile(dir+item.localSource)}catch{const r=await fetch(item.url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status);input=Buffer.from(await r.arrayBuffer())}
 const meta=await sharp(input).metadata(),sha=createHash('sha256').update(input).digest('hex'),path=`images/${e.id}-${sha.slice(0,12)}-supplement-original`,image=`images/${e.id}-${sha.slice(0,12)}-supplement.webp`
 await writeFile(dir+path,input);await writeFile(dir+image,await frameArtwork(input,{width:900,height:1200,insetX:42,insetY:60}))
 const selected={title:`${item.sourceName} · ${item.skin??'角色原图'}`,url:item.url,sourcePage:item.sourcePage}
 Object.assign(e,{original:path,image,sha256:sha,selected,candidates:[selected,...e.candidates.filter(c=>c.url!==item.url)],dimensions:{width:meta.width,height:meta.height},status:'candidate',latestVerified:false,supplementBatch:batch.batch,sourceName:item.sourceName,skin:item.skin,issues:['原图已补齐；最新服装与处理细节仍待最终复核']})
 if(e.processedArtwork?.sourceSha256!==sha)delete e.processedArtwork
 console.log(e.name,meta.width,meta.height)
}
manifest.generatedAt=new Date().toISOString();await writeFile(dir+'manifest.json',JSON.stringify(manifest,null,2));await writeFile(root+'seasons/s2/artwork-inventory.json',JSON.stringify(manifest,null,2))
