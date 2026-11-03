import {readFile,writeFile,access,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {viewport} from './s2-artwork-viewport.mjs'
import {matchFraming} from './s2-match-framing.mjs'
const root=new URL('../',import.meta.url).pathname,dir=root+'.local/s2-artwork/'
const manifest=JSON.parse(await readFile(dir+'manifest.json','utf8'))
const specs=JSON.parse(await readFile(root+'seasons/s2/artwork-compositions.json','utf8'))
const results=[]
for(const spec of specs.entries){
 const e=manifest.entries.find(e=>e.id===spec.id&&e.game===spec.game)
 if(!e)throw Error('Unknown game-scoped identity')
 e.sha256??=createHash('sha256').update(await readFile(dir+e.original)).digest('hex')
 const input=await readFile(dir+(spec.file??e.original)),{data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 let left=info.width,top=info.height,right=-1,bottom=-1,zero=0
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a===0)zero++;if(a>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}}
 if(zero/(info.width*info.height)<.05)throw Error('Background is not transparent: '+e.name)
 if(spec.eyes[0]<0||spec.eyes[0]>info.width||spec.eyes[1]<0||spec.eyes[1]>info.height||!(spec.faceWidth>0))throw Error('Invalid face anchors')
 const revision=createHash('sha256').update(input).update(JSON.stringify(spec)).update('portrait-v5-head-safe').digest('hex').slice(0,12),prefix=`images/${e.id}-${revision}-composed-v1`
 if(e.processedArtwork?.image===prefix+'-gallery.webp'&&!process.argv.includes('--force')&&await Promise.all(['gallery','avatar','match','mobile','detail'].map(v=>access(dir+prefix+'-'+v+(v==='avatar'?'.png':'.webp')))).then(()=>true,()=>false)){Object.assign(e.processedArtwork,{sourceSha256:e.sha256,galleryKind:spec.galleryKind??'full',cleanupBatch:spec.cleanupBatch??null,candidateSource:spec.candidateSource??null,avatarCleanupRequired:spec.avatarCleanupRequired??false,visualApproved:false});results.push({id:e.id,name:e.name,game:e.game,method:spec.method,transparentFraction:e.processedArtwork.transparentFraction});continue}
 const scale=Math.min(1080/(bottom-top+1),816/(right-left+1))
 const outputs={gallery:{width:900,height:1200,scale,anchor:[(left+right)/2,(top+bottom)/2],target:[450,600]},avatar:{width:460,height:460,scale:(spec.avatarFaceWidth??170)/spec.faceWidth,anchor:spec.eyes,target:[230,spec.avatarEyeY??210]},match:matchFraming(spec),mobile:matchFraming(spec,540)}
 if(spec.galleryKind==='bust')outputs.gallery={width:900,height:1200,scale:(spec.galleryFaceWidth??260)/spec.faceWidth,anchor:spec.eyes,target:[450,spec.galleryEyeY??390]}
 const cutoutSha256=createHash('sha256').update(input).digest('hex')
 const previous=e.processedArtwork
 for(const [variant,options]of Object.entries(outputs)){
  const extension=variant==='avatar'?'.png':'.webp',destination=dir+prefix+'-'+variant+extension
  if(!process.argv.includes('--force')&&await access(destination).then(()=>true,()=>false))continue
  const oldFile=previous?.[variant==='gallery'?'image':variant+'Image']
  if(!process.argv.includes('--force')&&previous?.cutoutSha256===cutoutSha256&&oldFile&&JSON.stringify(previous.framing?.outputs?.[variant])===JSON.stringify(options)&&await access(dir+oldFile).then(()=>true,()=>false)){await copyFile(dir+oldFile,destination);continue}
  const framed=await viewport(input,options)
  if(variant==='avatar')await sharp(framed).extend({top:26,bottom:26,left:26,right:26,background:'#00000000'}).png().toFile(dir+prefix+'-avatar.png')
  else await writeFile(dir+prefix+'-'+variant+'.webp',framed)
 }
 if(!process.argv.includes('--force')&&await access(dir+prefix+'-detail.webp').then(()=>true,()=>false)){}
 else if(previous?.cutoutSha256===cutoutSha256&&previous.detailImage&&await access(dir+previous.detailImage).then(()=>true,()=>false))await copyFile(dir+previous.detailImage,dir+prefix+'-detail.webp')
 else await sharp(input).webp({quality:96}).toFile(dir+prefix+'-detail.webp')
 e.processedArtwork={image:prefix+'-gallery.webp',avatarImage:prefix+'-avatar.png',avatarStyle:'transparent-id-bust-512-padding26',matchImage:prefix+'-match.webp',mobileImage:prefix+'-mobile.webp',detailImage:prefix+'-detail.webp',method:spec.method,review:spec.review,galleryKind:spec.galleryKind??'full',cleanupBatch:spec.cleanupBatch??null,candidateSource:spec.candidateSource??null,avatarCleanupRequired:spec.avatarCleanupRequired??false,visualApproved:false,sourceSha256:e.sha256,cutoutSha256:createHash('sha256').update(input).digest('hex'),transparentFraction:zero/(info.width*info.height),framing:{eyes:spec.eyes,faceWidth:spec.faceWidth,sourceDimensions:[info.width,info.height],outputs},originalPreserved:true,skinVerified:false}
 results.push({id:e.id,name:e.name,game:e.game,method:spec.method,transparentFraction:e.processedArtwork.transparentFraction})
 await writeFile(dir+'manifest.json',JSON.stringify(manifest,null,2));await writeFile(root+'seasons/s2/artwork-inventory.json',JSON.stringify(manifest,null,2))
 console.log('PROCESSED',e.game,e.name)
}
manifest.generatedAt=new Date().toISOString();await writeFile(dir+'manifest.json',JSON.stringify(manifest,null,2));await writeFile(root+'seasons/s2/artwork-inventory.json',JSON.stringify(manifest,null,2));await writeFile(root+'seasons/s2/artwork-processing-report.json',JSON.stringify({generatedAt:manifest.generatedAt,processed:results.length,entries:results},null,2))
