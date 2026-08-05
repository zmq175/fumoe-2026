import {mkdir,readdir,readFile,rename,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import sharp from 'sharp'

const root=resolve(import.meta.dirname,'..')
const portraitRoot=resolve(root,'public/portraits')
const reportRoot=resolve(root,'assets/reports')
const write=process.argv.includes('--write')
const rosterSource=await readFile(resolve(root,'src/data/tournament.ts'),'utf8')
const roster=[...rosterSource.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(([,name,game],index)=>({id:`c${String(index+1).padStart(3,'0')}`,name,game}))
const byId=new Map(roster.map((character)=>[character.id,character]))
const files=(await readdir(portraitRoot)).filter((file)=>/^c\d{3}\.png$/.test(file)).sort()
const results=[]

await mkdir(reportRoot,{recursive:true})

for(const file of files){
  const id=file.slice(0,4)
  const input=resolve(portraitRoot,file)
  try{
    if(write){
      const temporary=resolve(portraitRoot,`.${id}.optimized.png`)
      await sharp(input)
        .trim({background:{r:0,g:0,b:0,alpha:0},threshold:1})
        .resize(460,460,{fit:'contain',background:{r:0,g:0,b:0,alpha:0},kernel:sharp.kernel.lanczos3})
        .extend({top:26,bottom:26,left:26,right:26,background:{r:0,g:0,b:0,alpha:0}})
        .png({compressionLevel:9,quality:92,palette:true,adaptiveFiltering:true})
        .toFile(temporary)
      await rename(temporary,input)
    }
    const image=sharp(input)
    const [metadata,stats,raw]=await Promise.all([
      image.metadata(),
      image.stats(),
      image.clone().ensureAlpha().raw().toBuffer({resolveWithObject:true})
    ])
    const alpha=stats.channels[3]
    const pixels=raw.info.width*raw.info.height
    let transparent=0
    let partial=0
    for(let index=3;index<raw.data.length;index+=4){
      const value=raw.data[index]
      if(value===0)transparent+=1
      else if(value<255)partial+=1
    }
    const corners=[
      raw.data[3],
      raw.data[(raw.info.width-1)*4+3],
      raw.data[(raw.info.width*(raw.info.height-1))*4+3],
      raw.data[(pixels-1)*4+3]
    ]
    const transparentRatio=transparent/pixels
    const valid=metadata.width===512&&metadata.height===512&&metadata.hasAlpha===true&&corners.every((value)=>value===0)&&transparentRatio>=.15&&transparentRatio<=.85
    results.push({id,...byId.get(id),file:`public/portraits/${file}`,valid,width:metadata.width,height:metadata.height,hasAlpha:metadata.hasAlpha,transparentRatio:Number(transparentRatio.toFixed(4)),partialRatio:Number((partial/pixels).toFixed(4)),alphaMin:alpha?.min,alphaMax:alpha?.max})
  }catch(error){
    results.push({id,...byId.get(id),file:`public/portraits/${file}`,valid:false,error:error instanceof Error?error.message:String(error)})
  }
}

const cards=[]
const cardWidth=150
const cardHeight=180
const columns=8
const gap=10
for(const [index,result] of results.entries()){
  const input=await sharp(resolve(root,result.file)).resize(128,128,{fit:'contain'}).png().toBuffer()
  const x=gap+(index%columns)*(cardWidth+gap)
  const y=gap+Math.floor(index/columns)*(cardHeight+gap)
  cards.push({input,left:x+11,top:y+4})
  const label=Buffer.from(`<svg width="${cardWidth}" height="42"><style>text{font-family:sans-serif;fill:#eaf2f6;text-anchor:middle}</style><text x="75" y="16" font-size="12">${result.id} ${result.name??''}</text><text x="75" y="34" font-size="10" fill="#8ca1ad">${result.valid?'ALPHA PASS':'REVIEW'}</text></svg>`)
  cards.push({input:label,left:x,top:y+134})
}
const rows=Math.max(1,Math.ceil(results.length/columns))
await sharp({create:{width:columns*cardWidth+(columns+1)*gap,height:rows*cardHeight+(rows+1)*gap,channels:4,background:'#0d1115'}})
  .composite(cards)
  .webp({quality:88,effort:6})
  .toFile(resolve(reportRoot,'model-portrait-contact-sheet.webp'))

const report={generatedAt:new Date().toISOString(),mode:write?'optimize-and-validate':'validate',total:results.length,valid:results.filter((item)=>item.valid).length,invalid:results.filter((item)=>!item.valid).length,missing:roster.filter((character)=>!results.some((item)=>item.id===character.id)).map(({id,name,game})=>({id,name,game})),results}
await writeFile(resolve(reportRoot,'model-portrait-quality.json'),`${JSON.stringify(report,null,2)}\n`)
console.log(`Model portraits: ${report.valid}/${report.total} valid; ${report.missing.length} missing.`)
if(report.invalid)process.exitCode=1
