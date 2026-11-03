import {viewport} from './s2-artwork-viewport.mjs'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import sharp from 'sharp'
import {createHash} from 'node:crypto'
const root=new URL('../',import.meta.url).pathname,dir=root+'.local/s2-artwork/'
const config=JSON.parse(await readFile(root+'seasons/s2/artwork-ai.json','utf8'))
const manifest=JSON.parse(await readFile(dir+'manifest.json','utf8'))
await mkdir(dir+'images',{recursive:true})
// Deterministic export layout after GPT Image background extraction: never redraw faces.

for(const spec of config.entries){
 const e=manifest.entries.find(e=>e.id===spec.id&&e.game===spec.game);if(!e)throw Error('Unknown game-scoped identity')
 const input=await readFile(dir+spec.file),{data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 let left=info.width,top=info.height,right=-1,bottom=-1,transparent=0
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a===0)transparent++;if(a>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}}
 if(transparent/(info.width*info.height)<.15)throw Error('Missing transparent background: '+e.id)
 const bodyHeight=bottom-top+1,bodyWidth=right-left+1,scale=Math.min(1080/bodyHeight,816/bodyWidth)
 const rev=createHash('sha256').update(input).update(JSON.stringify(spec)).digest('hex').slice(0,12),prefix=`images/${e.id}-${rev}-ai-v1`
 const gallery=await viewport(input,{width:900,height:1200,scale,anchor:[(left+right)/2,bottom],target:[450,1140]})
 const avatar=await viewport(input,{width:512,height:512,scale:236/spec.faceWidth,anchor:spec.eyes,target:[256,215]})
 const match=await viewport(input,{width:960,height:540,scale:170/spec.faceWidth,anchor:spec.eyes,target:[480,195]})
 for(const [suffix,buffer]of[['gallery',gallery],['avatar',avatar],['match',match]])await writeFile(dir+prefix+'-'+suffix+'.webp',buffer)
 e.aiArtwork={image:prefix+'-gallery.webp',avatarImage:prefix+'-avatar.webp',matchImage:prefix+'-match.webp',detailImage:spec.file,review:spec.review,sourceSha256:e.sha256,tool:'GPT Image (built-in)',transparentFraction:transparent/(info.width*info.height),framing:{canvas:[900,1200],bottom:1140,bodyHeight:Math.round(bodyHeight*scale),avatarCanvas:[512,512],avatarEyeLine:215,avatarFaceWidth:236},originalPreserved:true}
 console.log(e.game,e.name,JSON.stringify(e.aiArtwork.framing))
}
await writeFile(dir+'manifest.json',JSON.stringify(manifest,null,2))
await writeFile(root+'seasons/s2/artwork-inventory.json',JSON.stringify(manifest,null,2))
