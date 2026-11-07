import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile,readdir,stat} from 'node:fs/promises'
import sharp from 'sharp'

// Offline build only. Inputs and historical snapshots are never overwritten.
const origin=process.env.ARTWORK_ORIGIN??'https://moe.hooxi.co'
const out='public/image-variants',cache='.local/image-compression',hash=b=>createHash('sha256').update(b).digest('hex')
await mkdir(out,{recursive:true});await mkdir(cache,{recursive:true})
const legacy=JSON.parse(await readFile('src/data/legacy-assets.json','utf8'))
const previous=JSON.parse(await readFile('src/data/image-variants.json','utf8'))
const inputs=new Map(),localByHash=new Map()
const add=(url,kind,file)=>{if(!inputs.has(url))inputs.set(url,{url,kind,file})}
const artworkUrl=key=>key.startsWith('/')?(legacy[key]??key):key.split('/').length===3?(legacy['/artwork/'+key.split('/').slice(1).join('/')]??'/artwork/'+key.split('/').slice(1).join('/')):'/api/media/'+key
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+item.name;if(item.isDirectory()){if(path!==out)await walk(path)}else if(/\.(png|jpe?g|webp|avif)$/i.test(path)){const url='/'+path.slice('public/'.length),kind=/\/portraits\/|\/avatar\./.test(url)?'avatar':/\/gallery\./.test(url)?'gallery':/\/match\./.test(url)?'match':'graphic';add(legacy[url]??url,kind,path);if(legacy[url])add(url,kind,path)}}}
await walk('public')
// Reuse exact copies from the existing preparation workspace when available.
try{
 const inventory=JSON.parse(await readFile('.local/s2-artwork/manifest.json','utf8'))
 for(const entry of inventory.entries)for(const field of ['image','matchImage','avatarImage','mobileImage','detailImage']){
  const name=entry.processedArtwork?.[field];if(!name)continue
  const path='.local/s2-artwork/'+name
  try{localByHash.set(hash(await readFile(path)).slice(0,20),path)}catch{/* Download a missing source from its public, versioned URL. */}
 }
}catch{/* A clean workspace can download all published sources. */}
async function getJson(path){const r=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${path}: ${r.status}`);return r.json()}
const seasons=(await getJson('/api/public/seasons')).seasons
for(const season of seasons){
 const roster=await getJson('/api/public/characters?season='+encodeURIComponent(season.slug))
 await writeFile(cache+'/'+season.slug+'.json',JSON.stringify(roster))
 for(const c of roster.characters)for(const [field,kind]of Object.entries({galleryArtworkKey:'gallery',matchArtworkKey:'match',avatarArtworkKey:'avatar',mobileArtworkKey:'mobile',detailArtworkKey:'detail'}))if(c[field])add(artworkUrl(c[field]),kind)
}
const hashes={...previous.hashes},paths={...previous.paths},report=[],outputHashes=new Map(),processedIds=new Map(),encoded=new Map()
const sourceId=url=>url.match(/^\/archive\/([a-f0-9]{64})\./)?.[1]?.slice(0,20)??url.match(/^\/api\/media\/.+\/([a-f0-9]{20,64})\/[^/]+$/)?.[1]?.slice(0,20)
async function processImage(item){
 const id=sourceId(item.url),cached=cache+'/'+hash(Buffer.from(item.url))+'.source'
 let bytes
 if(item.file)bytes=await readFile(item.file)
 else if(id&&localByHash.has(id))bytes=await readFile(localByHash.get(id))
 else{try{bytes=await readFile(cached)}catch{const r=await fetch(origin+item.url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${item.url}: ${r.status}`);bytes=Buffer.from(await r.arrayBuffer());await writeFile(cached,bytes)}}
 const digest=hash(bytes)
 if(id&&!digest.startsWith(id))throw Error('Version hash mismatch: '+item.url)
 const meta=await sharp(bytes).metadata()
 if((meta.pages??1)>1){report.push({source:item.url,kind:item.kind,status:'animated-preserved',originalBytes:bytes.length,displayBytes:bytes.length});return}
 const policy=digest+':'+item.kind
 if(!encoded.has(policy))encoded.set(policy,(async()=>{
  let pipeline=sharp(bytes)
  if(item.kind==='avatar')pipeline=pipeline.resize({width:192,height:192,fit:'inside',withoutEnlargement:true})
  if(item.kind==='detail')pipeline=pipeline.resize({width:1280,height:1920,fit:'inside',withoutEnlargement:true})
  return pipeline.webp({quality:item.kind==='detail'?78:item.kind==='avatar'?75:70,alphaQuality:100,effort:4}).toBuffer()
 })())
 const candidate=await encoded.get(policy)
 const previousId=sourceId(legacy[item.url]??item.url)
 const oldRevision=(previousId?previous.hashes[previousId]:undefined)??previous.paths[item.url]
 const oldBytes=oldRevision?await readFile(`${out}/${oldRevision}.webp`):bytes
 // Always encode the original, never a previous lossy derivative. Keep the smaller display.
 const compressed=candidate.length<oldBytes.length?candidate:oldBytes
 const result={source:item.url,kind:item.kind,originalBytes:bytes.length,previousBytes:oldBytes.length,displayBytes:bytes.length,width:meta.width,height:meta.height,sourceSha256:digest,status:'original-smaller'}
 if(compressed.length<bytes.length){
  const outputDigest=hash(compressed),outputId=outputDigest.slice(0,20)
  if(outputHashes.has(outputId)&&outputHashes.get(outputId)!==outputDigest)throw Error('Output hash collision')
  outputHashes.set(outputId,outputDigest)
  await writeFile(`${out}/${outputId}.webp`,compressed)
  if(id){if(processedIds.has(id)&&processedIds.get(id)!==outputId)throw Error('Conflicting source policies: '+item.url);processedIds.set(id,outputId);hashes[id]=outputId}else paths[item.url]=outputId
  const m=await sharp(compressed).metadata()
  Object.assign(result,{status:'optimized',displayBytes:compressed.length,displayWidth:m.width,displayHeight:m.height,hasAlpha:m.hasAlpha,outputSha256:outputDigest,output:`/image-variants/${outputId}.webp`})
  if(meta.hasAlpha&&!m.hasAlpha)throw Error('Transparency lost: '+item.url)
 }
 report.push(result)
}
const jobs=[...inputs.values()]
for(let i=0;i<jobs.length;i+=4){await Promise.all(jobs.slice(i,i+4).map(processImage));if(i%100===0)console.log(`Processed ${Math.min(i+4,jobs.length)}/${jobs.length}`)}
// Legacy aliases are already canonicalized by the UI; avoid duplicating their map.
for(const [source,target]of Object.entries(legacy))if(hashes[sourceId(target)])delete paths[source]
const sorted=o=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)))
await writeFile('src/data/image-variants.json',JSON.stringify({hashes:sorted(hashes),paths:sorted(paths)})+'\n')
const uniqueSources=[...new Map(report.map(r=>[r.sourceSha256??r.source,r])).values()]
const totals=uniqueSources.reduce((a,r)=>({originalBytes:a.originalBytes+r.originalBytes,previousBytes:a.previousBytes+(r.previousBytes??r.originalBytes),displayBytes:a.displayBytes+r.displayBytes}),{originalBytes:0,previousBytes:0,displayBytes:0})
const unique=[...new Set(report.filter(r=>r.output).map(r=>r.output))]
const outputBytes=(await Promise.all(unique.map(p=>stat('public'+p)))).reduce((a,s)=>a+s.size,0)
const summary={sourceUrls:report.length,uniqueSources:uniqueSources.length,optimizedUrls:report.filter(r=>r.status==='optimized').length,uniqueFiles:unique.length,outputBytes,...totals,savedPercent:Math.round((1-totals.displayBytes/totals.originalBytes)*100)}
// Keep earlier derivatives addressable for old clients and previous releases.
await writeFile(cache+'/report.json',JSON.stringify({summary,entries:report},null,2));console.log(JSON.stringify(summary))
