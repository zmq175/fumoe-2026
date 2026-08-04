import { mkdir,readFile,rm,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { contactSheetLayout } from './artwork-candidates.ts'

const root=resolve(import.meta.dirname,'..')
const reports=resolve(root,'assets/reports')
const cache=resolve(root,'.local/artwork-review')
const discovery=JSON.parse(await readFile(resolve(reports,'missing-artwork-discovery.json'),'utf8'))
const entries=discovery.candidates.flatMap((entry)=>entry.candidates.filter((candidate)=>['recommended','review'].includes(candidate.status)).slice(0,3).map((candidate,index)=>({entry,candidate,index})))
const cardWidth=360,cardHeight=520,gap=24,columns=3
const layout=contactSheetLayout(entries.length,columns,cardWidth,cardHeight,gap)
const agent='FuMoe2026ArchiveBot/2.0 (one-time review contact sheet; contact: https://fumoe.example.com)'
const escape=(value)=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')

await rm(cache,{recursive:true,force:true});await mkdir(cache,{recursive:true})
const cards=[];const failures=[]
for(const [position,{entry,candidate,index}] of entries.entries()){
  try{
    const response=await fetch(candidate.url,{headers:{'user-agent':agent,referer:candidate.sourcePage},signal:AbortSignal.timeout(45_000)})
    if(!response.ok)throw new Error(`HTTP ${response.status}`)
    const type=response.headers.get('content-type')??'';if(!type.startsWith('image/'))throw new Error(`非图片：${type}`)
    const buffer=Buffer.from(await response.arrayBuffer())
    const image=await sharp(buffer,{animated:false}).rotate().resize(336,400,{fit:'contain',background:'#151d22'}).webp({quality:86}).toBuffer()
    const x=gap+(position%columns)*(cardWidth+gap),y=gap+Math.floor(position/columns)*(cardHeight+gap)
    const label=`<svg width="${cardWidth}" height="96"><rect width="100%" height="100%" fill="#f4f4ef"/><text x="12" y="22" font-family="sans-serif" font-size="16" font-weight="700" fill="#111">${escape(entry.id)} · ${escape(entry.name)} · 候选 ${index+1}</text><text x="12" y="45" font-family="sans-serif" font-size="12" fill="#555">${escape(entry.game)} · ${candidate.width}×${candidate.height} · ${candidate.status}</text><text x="12" y="66" font-family="sans-serif" font-size="11" fill="#247ca6">${escape(candidate.fileTitle.slice(0,48))}</text><text x="12" y="85" font-family="sans-serif" font-size="10" fill="#777">评分 ${candidate.score} · ${escape(candidate.reason)}</text></svg>`
    cards.push({input:image,left:x+12,top:y+12},{input:Buffer.from(label),left:x,top:y+424})
  }catch(error){failures.push({id:entry.id,url:candidate.url,error:error instanceof Error?error.message:String(error)})}
}
const sheet=await sharp({create:{width:Math.max(layout.width,408),height:Math.max(layout.height,568),channels:3,background:'#0d1114'}}).composite(cards).webp({quality:90}).toBuffer()
await writeFile(resolve(reports,'missing-artwork-contact-sheet.webp'),sheet)
await writeFile(resolve(reports,'missing-artwork-contact-sheet.json'),`${JSON.stringify({generatedAt:new Date().toISOString(),entries:entries.length,rendered:(cards.length/2),failures},null,2)}\n`)
console.log(`审核联系表：${cards.length/2}/${entries.length} 个候选，失败 ${failures.length} 个。`)
