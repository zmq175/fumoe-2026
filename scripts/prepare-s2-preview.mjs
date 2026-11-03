// Local-only, fresh state on every invocation. Does not connect to production.
import {execFileSync,spawn} from 'node:child_process'
import {cp,mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
import {Miniflare} from 'miniflare'
const root=resolve(import.meta.dirname,'..'),state=await mkdtemp('/tmp/fumoe-s2-preview-'),port=8793
const run=args=>execFileSync(resolve(root,'node_modules/.bin/wrangler'),args,{cwd:root,stdio:'pipe',timeout:120000})
await build({entryPoints:['src/lib/s2-format.ts'],bundle:true,platform:'node',format:'esm',outfile:state+'/format.mjs'})
const {s2Format,drawSeasonRoster}=await import(state+'/format.mjs')
const manifest=JSON.parse(await readFile('.local/s2-artwork/manifest.json'))
const bios=JSON.parse(await readFile('seasons/s2/character-bios.json')).entries
const roster=await drawSeasonRoster(manifest.entries.map(e=>{
 const bio=bios.find(b=>b.id===e.id&&b.game===e.game&&b.name===e.name)
 if(!bio?.summary)throw Error(`Missing S2 biography: ${e.game}/${e.name}`)
 return {characterId:e.id,name:e.name,game:e.game,summary:bio.summary}
}), 'fumoe-s2-preview-only-20261104')
console.log('隔离预览状态：'+state)
run(['d1','migrations','apply','fumoe-2026','--local','--persist-to',state])
execFileSync(process.execPath,['scripts/seed-local.mjs','--persist-to',state],{stdio:'pipe',timeout:120000})
// Fictional S1 fixture. Historical names and artwork snapshots are not rewritten.
const fixture=`UPDATE tournament_rounds SET status='closed' WHERE season_id='season-2026';
UPDATE matches SET status='closed',winner_character_id=left_character_id;
UPDATE seasons SET status='completed',schedule_mode='manual',champion_character_id='c105',name='S1 演示档案（非正式赛果）' WHERE id='season-2026';
UPDATE characters SET name='星见雅' WHERE id='c040';
INSERT INTO matches(id,round_id,left_character_id,right_character_id,left_votes,right_votes,status,winner_character_id) VALUES('preview-final','ko-4','c105','c053',47,32,'closed','c105');`
await writeFile(state+'/fixture.sql',fixture)
run(['d1','execute','fumoe-2026','--local','--persist-to',state,'--file',state+'/fixture.sql'])
await cp('dist',state+'/site',{recursive:true})
const server=spawn(resolve(root,'node_modules/.bin/wrangler'),['dev','--local','--assets',state+'/site','--ip','127.0.0.1','--persist-to',state,'--port',String(port),'--var',`APP_ORIGIN:http://127.0.0.1:${port}`,'--var','DEV_AUTH_BYPASS:true','--var','ADMIN_EMAILS:admin@fumoe.local','--var','AUTH_SECRET:s2-preview-secret-at-least-32-characters'],{stdio:['ignore','pipe','pipe']})
server.stderr.on('data',data=>{if(String(data).includes('ERROR'))process.stderr.write(data)})
await new Promise((done,fail)=>{const timer=setTimeout(()=>fail(Error('Preview start timeout')),60000);server.stdout.on('data',d=>{if(String(d).includes('Ready on')){clearTimeout(timer);done()}});server.once('exit',()=>{clearTimeout(timer);fail(Error('Preview exited'))})})
let cookie=''
const request=async(path,body,method=body?'POST':'GET')=>{const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{cookie,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const j=await r.json();if(!r.ok)throw Error(path+': '+JSON.stringify(j));return j}
try{
 await request('/api/auth/request-code',{email:'admin@fumoe.local',turnstileToken:'local'})
 await request('/api/auth/verify-code',{email:'admin@fumoe.local',code:'000000'})
 const {seasonId}=await request('/api/admin/seasons',{name:'府萌 S2 · 本地预览',slug:'s2-preview',format:s2Format(),startsAt:'2030-01-01T16:00:00.000Z',reason:'本地隔离预览，日期和抽签仅作演示'})
 await request(`/api/admin/seasons/${seasonId}/roster`,{entries:roster,reason:'本地预览导入已确认的256人名单'},'PUT')
 // R2 access is local Miniflare storage, using the exact local bucket identity Wrangler uses.
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("local seed")}}',r2Buckets:{MEDIA:'fumoe-2026-assets'},r2Persist:state+'/v3/r2'})
 const bucket=await mf.getR2Bucket('MEDIA'),imports=[]
 try{for(const [i,e]of manifest.entries.entries()){
  const a=e.processedArtwork,source=a.candidateSource??e.selected
  const files={originalKey:source?.localOriginal??e.original,galleryKey:a.image,matchKey:a.matchImage,avatarKey:e.portraitArtwork?.avatarImage??a.avatarImage,mobileKey:a.mobileImage,detailKey:a.detailImage}
  const revision=createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,16),keys={}
  for(const [field,file]of Object.entries(files)){const data=await readFile('.local/s2-artwork/'+file);const ext=file.endsWith('.webp')?'webp':file.endsWith('.png')?'png':'bin';const key=`seasons/${seasonId}/${e.id}/${revision}/${field}.${ext}`;await bucket.put(key,data,{httpMetadata:{contentType:ext==='webp'?'image/webp':'image/png'}});keys[field]=key}
  const sourceUrl=[source?.sourcePage,source?.url,e.selected?.sourcePage,e.selected?.url].find(u=>u?.startsWith('https://'))??'https://wutheringwaves.kurogames.com/'
  imports.push({characterId:e.id,skinName:(source?.title??e.name+'选定素材').replace(/^文件:/,'').slice(0,150),summary:roster.find(r=>r.characterId===e.id).summary,sourceUrl,sourceType:'community-wiki',sourceNote:'本地演示使用已选定素材；部分经 AI 提取和构图。未声明为已核验最新皮肤，正式开赛日期未定。',...keys})
  if((i+1)%32===0)console.log(`本地素材 ${i+1}/256`)
 }}finally{await mf.dispose()}
 for(let i=0;i<imports.length;i+=16)await request(`/api/admin/seasons/${seasonId}/artwork`,{entries:imports.slice(i,i+16),reason:'仅本地预览验证选定素材与独立版本路径'},'PUT')
 await request(`/api/admin/seasons/${seasonId}`,{announcement:'本地演示：2030-01-02 为预览占位日期，正式开赛时间待定；分组为可复核演示抽签，S1 也是演示数据。',reason:'明确区分预览与正式排期'},'PATCH')
 await request(`/api/admin/seasons/${seasonId}/action`,{action:'publish',reason:'仅本地发布赛前预览，不启动赛事'})
 const overview=await request('/api/public/overview');if(overview.season.status!=='published')throw Error('Preview must remain pre-start')
 await writeFile('.local/s2-app-preview.json',JSON.stringify({state,port,seasonId,url:`http://127.0.0.1:${port}`,drawSeed:'fumoe-s2-preview-only-20261104',productionWritten:false},null,2))
 console.log(`S2 应用预览就绪：http://127.0.0.1:${port} （仅本地，未开赛）`)
 process.on('SIGINT',()=>server.kill('SIGTERM'));process.on('SIGTERM',()=>server.kill('SIGTERM'))
 await new Promise(resolveExit=>server.once('exit',resolveExit))
}catch(error){server.kill('SIGTERM');throw error}
