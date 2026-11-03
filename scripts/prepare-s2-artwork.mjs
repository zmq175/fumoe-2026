import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {rejectArtwork,preferredArtwork} from './s2-artwork-policy.mjs'
const root=new URL('../',import.meta.url).pathname
const out=root+'.local/s2-artwork/'
await mkdir(out+'images',{recursive:true});await mkdir(out+'cache',{recursive:true})
const source=JSON.parse(await readFile(root+'seasons/s2/roster-source.json','utf8'))
const oldSource=await readFile(root+'src/data/tournament.ts','utf8')
const old=[...oldSource.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map((m,i)=>({name:m[1],game:m[2],id:`c${String(i+1).padStart(3,'0')}`}))
const oldArt=JSON.parse(await readFile(root+'assets/characters.manifest.json','utf8')).characters
const slugs={'鸣潮':'wutheringwaves','战双帕弥什':'zspms','崩坏3':'bh3','崩坏：星穹铁道':'sr','原神':'ys','绝区零':'zzz','异环':'yh','明日方舟：终末地':'zmd'}
const aliases={'琪亚娜':['琪亚娜·卡斯兰娜'],'布洛妮娅':['布洛妮娅·扎伊切克'],'希儿':['希儿·芙乐艾'],'星见雅':['雅'],'α':['露西亚·深红囚影','露西亚·深红之渊'],'露西亚':['露西亚·逆冕','露西亚·誓焰'],'黑希儿':['魇夜星渊'],'德丽莎':['德丽莎·阿波卡利斯']}
const normalized=s=>s.replace(/[ ·・_\s]/g,'')
const hash=s=>createHash('sha256').update(s).digest('hex')
async function json(slug,params){
 const url=new URL(`https://wiki.biligame.com/${slug}/api.php`);url.search=new URLSearchParams({format:'json',formatversion:'2',...params})
 const file=out+'cache/'+hash(url.href)+'.json'
 try{return JSON.parse(await readFile(file,'utf8'))}catch{}
 const res=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'FumoeS2AssetPreparation/1.0'}})
 if(!res.ok)throw new Error('HTTP '+res.status)
 const data=await res.json();if(data.error)throw new Error(data.error.info)
 await writeFile(file,JSON.stringify(data));await new Promise(r=>setTimeout(r,150));return data
}
function score(p,names,game){
 const t=p.title.replaceAll('_',' '),i=p.imageinfo?.[0]
 if(rejectArtwork(t))return -999
 if(!i||!i.url?.startsWith('https://patchwiki.biligame.com/')||i.width<400||i.height<600||i.width*i.height>60000000)return -999
 if(!names.some(n=>n.length===1?(t.includes(' '+n+' ')||t.startsWith('文件:'+n+'立绘')||t.startsWith('文件:'+n+'.')):normalized(t).includes(normalized(n))))return -999
 if(/自画|同人|自制|愚人节|Q版|涂装商店|头像|图标|技能|徽章|圣痕|意识|幻痛囚笼|武器|背景|名片|表情|家具|材料|证件|攻略|横幅|签名|生日|壁纸|宣传|预告/.test(t))return -999
 if(game==='战双帕弥什'&&names[0]==='露西亚'&&/深红囚影|深红之渊/.test(t))return -999
 let n=0;if(/立绘|全身|原画/.test(t))n+=100;if(/涂装|时装|换装|服装|皮肤/.test(t))n+=60
 if(i.height>i.width)n+=20;if(i.mime==='image/png')n+=5
 return n
}
async function prepare(game,name){
 const slug=slugs[game],known=old.find(r=>r.game===game&&(r.name===name||(name==='星见雅'&&r.name==='雅')))
 const id=known?.id??`s2-${slug}-${hash(name).slice(0,10)}`
 const entry={id,name,game,cutoff:'2026-11-04',status:'pending',latestVerified:false,candidates:[],issues:[]}
 const names=[name,...(game==='崩坏3'||game==='战双帕弥什'||name==='星见雅'?aliases[name]??[]:[])]
 const title=game==='鸣潮'?`角色/${name}`:names.at(-1)
 try{
  const data=await json(slug,{action:'query',generator:'images',titles:[title,...names].join('|'),redirects:'1',prop:'imageinfo',iiprop:'url|size|mime|timestamp',gimlimit:'max'})
  entry.candidates=(data.query?.pages??[]).filter(p=>score(p,names,game)>=60).map(p=>({title:p.title,...p.imageinfo[0],score:score(p,names,game),sourcePage:`https://wiki.biligame.com/${slug}/${encodeURIComponent(title)}`}))
  const search=await json(slug,{action:'query',list:'search',srsearch:name==='α'?'深红囚影':name,srnamespace:'6',srlimit:'100'})
  const titles=(search.query?.search??[]).map(p=>p.title).filter(t=>/立绘|涂装|时装|服装|皮肤|全身|原画/.test(t)).slice(0,50)
  if(titles.length){const files=await json(slug,{action:'query',titles:titles.join('|'),prop:'imageinfo',iiprop:'url|size|mime|timestamp'});entry.candidates.push(...(files.query?.pages??[]).filter(p=>score(p,names,game)>=60).map(p=>({title:p.title,...p.imageinfo[0],score:score(p,names,game),sourcePage:p.imageinfo[0].descriptionurl})))}
 }catch(error){entry.issues.push('来源请求：'+error.message)}
 entry.candidates=[...new Map(entry.candidates.map(c=>[c.url,c])).values()].sort((a,b)=>b.score-a.score).slice(0,16)
 const selected=preferredArtwork({...entry,selected:entry.candidates[0]})
 if(selected){try{
  const file=out+'images/'+id+'-'+hash(selected.url).slice(0,10)+'-original';let buffer
  try{buffer=await readFile(file)}catch{const response=await fetch(selected.url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('HTTP '+response.status);buffer=Buffer.from(await response.arrayBuffer());await writeFile(file,buffer)}
  const meta=await sharp(buffer).metadata();entry.dimensions={width:meta.width,height:meta.height};entry.sha256=hash(buffer)
  await sharp(buffer).resize({width:900,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toFile(out+'images/'+id+'.webp')
  entry.image='images/'+id+'.webp';entry.original=file.slice(out.length);entry.selected=selected;entry.status='candidate';entry.issues.push('已找到候选，皮肤实装日期与最新性待核验')
 }catch(e){entry.issues.push('图片下载：'+e.message)}}
 if(!entry.image&&known){const art=oldArt.find(a=>a.id===known.id);if(art){try{
  await copyFile(root+art.sourceFile,out+'images/'+id+'-original');await sharp(root+art.sourceFile).resize({width:900,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toFile(out+'images/'+id+'.webp')
  entry.image='images/'+id+'.webp';entry.original='images/'+id+'-original';entry.status='legacy-reference';entry.selected={title:'S1 已归档素材，仅供参考',url:art.sourceUrl,sourcePage:art.discoveryPage};entry.issues.push('沿用副本仅供辨认，尚不能确认符合 S2 最新皮肤要求')
 }catch(e){entry.issues.push(e.message)}}}
 await writeFile(out+'cache/entry-'+id+'.json',JSON.stringify(entry,null,2));return entry
}
const queue=Object.entries(source).flatMap(([game,names])=>names.split('、').map(name=>({game,name})))
const entries=[];let index=0
await Promise.all(Array.from({length:4},async()=>{while(index<queue.length){const item=queue[index++];const entry=await prepare(item.game,item.name);entries.push(entry);console.log(`${entries.length}/256 ${entry.game} · ${entry.name}: ${entry.status} (${entry.candidates.length})`)}}))
entries.sort((a,b)=>queue.findIndex(q=>q.game===a.game&&q.name===a.name)-queue.findIndex(q=>q.game===b.game&&q.name===b.name))
const manifest={generatedAt:new Date().toISOString(),cutoff:'2026-11-04',notice:'候选预览，未导入生产，未核验条目不代表最新皮肤',entries}
await writeFile(out+'manifest.json',JSON.stringify(manifest,null,2));await writeFile(root+'seasons/s2/artwork-inventory.json',JSON.stringify(manifest,null,2))
console.log(JSON.stringify({total:entries.length,images:entries.filter(e=>e.image).length,pending:entries.filter(e=>!e.image).length}))
