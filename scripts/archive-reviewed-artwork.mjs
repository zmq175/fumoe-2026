import { createHash } from 'node:crypto'
import { mkdir,readFile,rename,writeFile } from 'node:fs/promises'
import { extname,resolve } from 'node:path'
import sharp from 'sharp'
import { mergeApprovedCandidate } from './artwork-candidates.ts'

const root=resolve(import.meta.dirname,'..')
const discovery=JSON.parse(await readFile(resolve(root,'assets/reports/missing-artwork-discovery.json'),'utf8'))
const review=JSON.parse(await readFile(resolve(root,'assets/reports/missing-artwork-review.json'),'utf8'))
const manifestPath=resolve(root,'assets/characters.manifest.json')
const manifest=JSON.parse(await readFile(manifestPath,'utf8'))
const agent='FuMoe2026ArchiveBot/2.0 (reviewed one-time archive; contact: https://fumoe.example.com)'
let characters=manifest.characters
const archived=[]

for(const decision of review.decisions.filter((entry)=>entry.decision==='approved')){
  const row=discovery.candidates.find((entry)=>entry.id===decision.id);if(!row)throw new Error(`发现报告中不存在 ${decision.id}`)
  const candidate=row.candidates[decision.candidate-1];if(!candidate)throw new Error(`${decision.id} 不存在候选 ${decision.candidate}`)
  if(!['recommended','review'].includes(candidate.status))throw new Error(`${decision.id} 候选未通过自动筛选`)
  const response=await fetch(candidate.url,{headers:{'user-agent':agent,referer:candidate.sourcePage},signal:AbortSignal.timeout(45_000)})
  if(!response.ok)throw new Error(`${decision.id}: HTTP ${response.status}`)
  const type=response.headers.get('content-type')??'';if(!/^image\/(png|jpeg|webp)/.test(type))throw new Error(`${decision.id}: 非静态图片 ${type}`)
  const buffer=Buffer.from(await response.arrayBuffer());const metadata=await sharp(buffer,{animated:false}).metadata()
  if((metadata.width??0)<500||(metadata.height??0)<700)throw new Error(`${decision.id}: 原图分辨率不足`)
  const extension=type.includes('png')?'png':type.includes('jpeg')?'jpg':extname(new URL(candidate.url).pathname).slice(1)||'webp'
  const relative=`assets/source/${decision.id}.${extension}`;await mkdir(resolve(root,'assets/source'),{recursive:true});await writeFile(resolve(root,relative),buffer)
  const entry={id:decision.id,sourceFile:relative,sourceUrl:candidate.url,discoveryPage:candidate.sourcePage,officialHost:new URL(candidate.url).hostname,sha256:createHash('sha256').update(buffer).digest('hex'),sourceType:'community-wiki',status:'approved',reviewedBy:review.reviewedBy,reviewedAt:review.reviewedAt,focus:{x:50,y:48},notes:`${decision.note} 一次性上线前归档；生产环境不再请求第三方来源。`}
  characters=mergeApprovedCandidate(characters,entry);archived.push({id:decision.id,name:row.name,candidate:decision.candidate,sourceFile:relative,width:metadata.width,height:metadata.height})
}
characters.sort((left,right)=>left.id.localeCompare(right.id))
const temporary=`${manifestPath}.tmp`;await writeFile(temporary,`${JSON.stringify({...manifest,characters},null,2)}\n`);await rename(temporary,manifestPath)
await writeFile(resolve(root,'assets/reports/missing-artwork-archive.json'),`${JSON.stringify({generatedAt:new Date().toISOString(),archived},null,2)}\n`)
console.log(`已归档 ${archived.length} 个经人工确认的角色素材。`)
