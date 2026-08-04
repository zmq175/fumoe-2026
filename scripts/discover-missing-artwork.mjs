import { mkdir,readFile,rename,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { candidateDecision,missingRoster,normalizeArtworkName } from './artwork-candidates.ts'

const root=resolve(import.meta.dirname,'..')
const reports=resolve(root,'assets/reports')
const catalog=JSON.parse(await readFile(resolve(root,'assets/community-source-catalog.json'),'utf8'))
const quality=JSON.parse(await readFile(resolve(reports,'artwork-quality.json'),'utf8'))
const rosterSource=await readFile(resolve(root,'src/data/tournament.ts'),'utf8')
const roster=[...rosterSource.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(([,name,game],index)=>({id:`c${String(index+1).padStart(3,'0')}`,name,game}))
const missing=missingRoster(roster,new Set(quality.accepted.map((entry)=>entry.id)))
const agent='FuMoe2026ArchiveBot/2.0 (one-time public wiki artwork archive; contact: https://fumoe.example.com)'
const sleep=(milliseconds)=>new Promise((done)=>setTimeout(done,milliseconds))
const output={generatedAt:new Date().toISOString(),method:'missing-only-mediawiki-v2',missingCount:missing.length,candidates:[],failures:[]}

function wikiSlug(url){return new URL(url).pathname.split('/').filter(Boolean).at(-1)}
async function api(slug,parameters){
  const endpoint=new URL(`https://wiki.biligame.com/${slug}/api.php`)
  endpoint.search=new URLSearchParams({format:'json',formatversion:'2',origin:'*',...parameters}).toString()
  let lastError
  for(let attempt=0;attempt<4;attempt++){
    try{
      const response=await fetch(endpoint,{headers:{'user-agent':agent,accept:'application/json'},signal:AbortSignal.timeout(45_000)})
      const type=response.headers.get('content-type')??''
      if(!response.ok)throw new Error(`HTTP ${response.status}`)
      if(!type.includes('json'))throw new Error(`非 JSON 响应：${type||'unknown'}`)
      return await response.json()
    }catch(error){lastError=error;if(attempt<3)await sleep(3_000*(attempt+1))}
  }
  throw lastError
}
async function allImages(slug,titles){
  const pages=[];let continuation={}
  do{
    const data=await api(slug,{action:'query',prop:'images',redirects:'1',titles:titles.join('|'),imlimit:'max',...continuation})
    pages.push(...(data.query?.pages??[]));continuation=data.continue?{imcontinue:data.continue.imcontinue,continue:data.continue.continue}:null
  }while(continuation)
  return pages
}
async function imageInfo(slug,titles){
  const rows=[]
  for(let index=0;index<titles.length;index+=40){
    const data=await api(slug,{action:'query',prop:'imageinfo',titles:titles.slice(index,index+40).join('|'),iiprop:'url|size|mime'})
    rows.push(...(data.query?.pages??[]));await sleep(900)
  }
  return rows
}

for(const [game,config] of Object.entries(catalog.games)){
  const characters=missing.filter((entry)=>entry.game===game);if(!characters.length)continue
  const aliases=(character)=>config.aliases?.[character.name]??catalog.aliases?.[game]?.[character.name]??[]
  const requested=characters.flatMap((character)=>[character.name,...aliases(character)])
  try{
    const pages=await allImages(wikiSlug(config.wiki),requested)
    const pageByName=new Map(pages.map((page)=>[normalizeArtworkName(page.title),page]))
    const selections=characters.map((character)=>{
      const names=[character.name,...aliases(character)]
      const page=names.map((name)=>pageByName.get(normalizeArtworkName(name))).find(Boolean)
      const files=(page?.images??[]).map((image)=>image.title)
      return{character,names,files}
    })
    const allTitles=[...new Set(selections.flatMap((selection)=>selection.files))]
    const infoMap=new Map((await imageInfo(wikiSlug(config.wiki),allTitles)).map((page)=>[page.title,page]))
    for(const selection of selections){
      const candidates=selection.files.map((title)=>{const image=infoMap.get(title)?.imageinfo?.[0];if(!image?.url)return null;const decision=candidateDecision({title,width:image.width??0,height:image.height??0},selection.character.name,selection.names.slice(1));return{url:image.url,sourcePage:`${config.wiki}${encodeURIComponent(selection.character.name)}`,fileTitle:title,width:image.width??0,height:image.height??0,mime:image.mime??'',...decision}}).filter(Boolean).sort((left,right)=>right.score-left.score)
      output.candidates.push({...selection.character,aliases:selection.names.slice(1),candidates:candidates.slice(0,5),recommended:candidates.find((candidate)=>candidate.status==='recommended')??null,status:candidates.some((candidate)=>candidate.status==='recommended')?'recommended':candidates.some((candidate)=>candidate.status==='review')?'review':'missing'})
    }
  }catch(error){
    output.failures.push({game,reason:error instanceof Error?error.message:String(error)})
    for(const character of characters)output.candidates.push({...character,aliases:aliases(character),candidates:[],recommended:null,status:'failed'})
  }
  await mkdir(reports,{recursive:true});const temporary=resolve(reports,'.missing-artwork-discovery.json.tmp');await writeFile(temporary,`${JSON.stringify(output,null,2)}\n`);await rename(temporary,resolve(reports,'missing-artwork-discovery.json'))
  console.log(`${game}：${output.candidates.filter((entry)=>entry.game===game&&entry.status==='recommended').length}/${characters.length} 个高置信度候选`)
  await sleep(1_500)
}

console.log(`缺失 ${missing.length} 位；推荐 ${output.candidates.filter((entry)=>entry.status==='recommended').length}；待审 ${output.candidates.filter((entry)=>entry.status==='review').length}；无候选 ${output.candidates.filter((entry)=>entry.status==='missing').length}；游戏失败 ${output.failures.length}。`)
