// Offline release plan only: never uploads, creates a season or changes preview state.
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises'
import {resolve,sep} from 'node:path'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {build} from 'esbuild'
const output=resolve('.local/s2-release')
await mkdir(output,{recursive:true})
const selectionBytes=await readFile('seasons/s2/artwork-selection.json')
const selection=JSON.parse(selectionBytes),manifest=JSON.parse(await readFile('.local/s2-artwork/manifest.json'))
const bios=JSON.parse(await readFile('seasons/s2/character-bios.json')).entries
const base=await realpath('.local/s2-artwork')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const expectedGames={'鸣潮':40,'战双帕弥什':40,'崩坏3':36,'崩坏：星穹铁道':36,'原神':36,'绝区零':32,'异环':16,'明日方舟：终末地':20}
const counts={},ids=new Set(),identities=new Set(),entries=[],issues=[]
const sizes={gallery:[900,1200],match:[960,540],mobile:[720,720]}
for(const entry of selection.entries){
 if(ids.has(entry.id)||identities.has(`${entry.game}\0${entry.name}`))throw Error(`Duplicate identity: ${entry.id}`)
 ids.add(entry.id);identities.add(`${entry.game}\0${entry.name}`);counts[entry.game]=(counts[entry.game]??0)+1
 const bio=bios.find(b=>b.id===entry.id&&b.game===entry.game&&b.name===entry.name)
 if(!bio?.summary||!bio.sourceUrl?.startsWith('https://'))throw Error(`Missing biography: ${entry.id}`)
 const source=manifest.entries.find(e=>e.id===entry.id)
 if(!source||source.game!==entry.game||source.name!==entry.name)throw Error(`Identity drift: ${entry.id}`)
 const provenance=source.processedArtwork?.candidateSource??source.selected
 const userSupplied=provenance?.userSelected===true
 const sourceUrl=[provenance?.sourcePage,provenance?.descriptionurl,provenance?.url].find(u=>u?.startsWith('https://'))??null
 if(!sourceUrl)issues.push({characterId:entry.id,game:entry.game,name:entry.name,issue:userSupplied?'user-supplied-source-needs-import-attribution':'missing-source-url'})
 const originalFile=provenance?.localOriginal??source.original
 const originalPath=await realpath(resolve(base,originalFile))
 if(!originalPath.startsWith(base+sep))throw Error(`Outside source directory: ${entry.id}`)
 const originalBytes=await readFile(originalPath)
 const origin={kind:userSupplied?'user-supplied':'web-source',file:originalFile,sha256:hash(originalBytes),selectionDate:provenance?.selectionDate??selection.selectedAt}
 const files={}
 for(const view of ['gallery','match','mobile','detail','avatar']){
  const path=await realpath(resolve(base,entry.views[view]))
  if(!path.startsWith(base+sep))throw Error(`Outside artwork directory: ${entry.id}`)
  const bytes=await readFile(path),meta=await sharp(bytes).metadata()
  if(!meta.hasAlpha)throw Error(`Opaque ${view}: ${entry.id}`)
  // The accepted mobile exports can vary in resolution; enforce their square shape.
  if(view==='mobile'&&meta.width!==meta.height)throw Error(`Non-square mobile: ${entry.id}`)
  if(view==='avatar'&&meta.width!==meta.height)throw Error(`Non-square avatar: ${entry.id}`)
  if(sizes[view]&&view!=='mobile'&&(meta.width!==sizes[view][0]||meta.height!==sizes[view][1]))throw Error(`Unexpected ${view} dimensions: ${entry.id}`)
  const sha256=hash(bytes)
  files[view]={file:entry.views[view],sha256,bytes:bytes.length,width:meta.width,height:meta.height,mime:`image/${meta.format}`,keyTemplate:`seasons/{seasonId}/${entry.id}/${sha256.slice(0,20)}/${view}.${meta.format==='jpeg'?'jpg':meta.format}`}
 }
 entries.push({id:entry.id,name:entry.name,game:entry.game,summary:bio.summary,biographySourceUrl:bio.sourceUrl,origin,sourceUrl,sourceTitle:provenance?.title??null,latestSkinVerified:source.latestVerified===true,files})
}
if(entries.length!==256||JSON.stringify(Object.entries(counts).sort())!==JSON.stringify(Object.entries(expectedGames).sort()))throw Error('Roster count mismatch')
await build({entryPoints:['src/lib/s2-format.ts'],bundle:true,platform:'node',format:'esm',outfile:output+'/format.mjs'})
const {s2Format}=await import(output+'/format.mjs')
const format=s2Format()
const unresolved=entries.filter(e=>!e.latestSkinVerified)
const plan={schemaVersion:1,purpose:'offline-release-plan',productionWritten:false,readyToPublish:false,season:{name:'府萌 S2',nameConfirmed:false,startsAt:null,drawSeed:null,format},selectionSha256:hash(selectionBytes),counts,assetCount:entries.length*5,totalBytes:entries.reduce((n,e)=>n+Object.values(e.files).reduce((m,f)=>m+f.bytes,0),0),blockers:['正式开赛日期待定','正式抽签种子待定','正式赛季名称待确认',...(unresolved.length?[`${unresolved.length} 位角色的最新皮肤事实仍未核验`]:[]),...(issues.length?[`${issues.length} 条用户提供／缺少网页来源的素材须完成正式导入归属记录`]:[])],sourceIssues:issues,entries}
await writeFile(output+'/plan.json',JSON.stringify(plan,null,2)+'\n')
await writeFile(output+'/README.md',`# S2 离线发布计划\n\n256 人，${plan.assetCount} 张展示图，${(plan.totalBytes/1024/1024).toFixed(1)} MiB。\n\n此文件不包含正式日期和抽签结果，不可直接发布。没有上传或修改任何数据库。\n\n${plan.blockers.map(x=>'- '+x).join('\n')}\n\n每个对象路径基于实际文件 SHA-256；填入正式 seasonId 后仍须走受保护的后台导入及发布接口。不得复用演示数据库、模拟票数或演示抽签。原始来源与原画归档仍保留在 .local/s2-artwork，导入时应另行验证。\n`)
console.log(JSON.stringify({entries:entries.length,assets:plan.assetCount,MiB:Number((plan.totalBytes/1024/1024).toFixed(1)),sourceIssues:issues.length,unverifiedLatest:unresolved.length,output,productionWritten:false}))
