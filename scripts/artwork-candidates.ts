export type RosterEntry={id:string;name:string;game:string}
export type Candidate={title:string;width:number;height:number;bytes?:number;url?:string;sourcePage?:string;mime?:string}

const rejectedPattern=/头像|头像框|卡牌|技能|图标|icon|face|thumb|表情|武器|敌人|多人|合照|皮肤|换装|时装|海报|壁纸|logo|徽章|小人|q版/i
const portraitPattern=/立绘|全身|原画|角色.*(?:介绍|展示)|character.*(?:full|portrait)|official.*art/i

export function normalizeArtworkName(value:string){return value.toLowerCase().normalize('NFKC').replace(/[·・：:／/\s_\-—–·.'’"“”()（）\[\]【】]/g,'')}

export function scoreCandidate(candidate:Candidate,name:string,aliases:string[]){
  const title=decodeURIComponent(candidate.title)
  const normalized=normalizeArtworkName(title)
  const names=[name,...aliases].map(normalizeArtworkName).filter(Boolean)
  let score=names.some((value)=>normalized.includes(value))?400:-800
  if(portraitPattern.test(title))score+=350
  if(rejectedPattern.test(title))score-=1200
  if(candidate.width>=900&&candidate.height>=1200)score+=120
  else if(candidate.width>=500&&candidate.height>=700)score+=50
  else score-=250
  const ratio=candidate.height/Math.max(1,candidate.width)
  if(ratio>=1.1&&ratio<=3.5)score+=100
  else if(ratio<.8)score-=180
  if((candidate.bytes??50_000)<35_000)score-=150
  return score
}

export function candidateDecision(candidate:Candidate,name:string,aliases:string[]){
  const title=decodeURIComponent(candidate.title)
  if(rejectedPattern.test(title))return{status:'rejected' as const,reason:'文件标题包含非默认立绘关键词',score:scoreCandidate(candidate,name,aliases)}
  if(![name,...aliases].some((value)=>normalizeArtworkName(title).includes(normalizeArtworkName(value))))return{status:'rejected' as const,reason:'文件名未命中角色名或别名',score:scoreCandidate(candidate,name,aliases)}
  if(candidate.width<500||candidate.height<700)return{status:'rejected' as const,reason:'分辨率不足',score:scoreCandidate(candidate,name,aliases)}
  const score=scoreCandidate(candidate,name,aliases)
  return{status:score>=700?'recommended' as const:'review' as const,reason:score>=700?'高置信度默认立绘':'需要人工确认',score}
}

export function missingRoster<T extends RosterEntry>(roster:T[],accepted:Set<string>){return roster.filter((entry)=>!accepted.has(entry.id))}

export function contactSheetLayout(count:number,columns:number,cardWidth:number,cardHeight:number,gap:number){
  const rows=Math.ceil(count/columns)
  return{columns,rows,width:columns*cardWidth+(columns+1)*gap,height:rows*cardHeight+(rows+1)*gap}
}

export function mergeApprovedCandidate<T extends {id:string}>(manifest:T[],candidate:T){
  const index=manifest.findIndex((entry)=>entry.id===candidate.id)
  if(index<0)return[...manifest,candidate]
  return manifest.map((entry,entryIndex)=>entryIndex===index?candidate:entry)
}
