import type { z } from 'zod'
import type { seasonFormatSchema } from './season-format-schema'

export type SeasonFormat=z.infer<typeof seasonFormatSchema>
export type SeasonFaction=SeasonFormat['factions'][number]
export function isPowerOfTwo(n:number){return Number.isInteger(n)&&n>0&&(n&(n-1))===0}
export function knockoutSize(f:Pick<SeasonFormat,'mode'|'participants'|'groupCount'|'qualifiersPerGroup'>){return f.mode==='knockout'?f.participants:f.groupCount*f.qualifiersPerGroup}
export function roundCount(f:Pick<SeasonFormat,'mode'|'participants'|'groupCount'|'qualifiersPerGroup'|'swissRounds'>){return (f.mode==='knockout'?0:f.swissRounds)+Math.log2(knockoutSize(f))}
export function formatGroups(f:SeasonFormat){return Array.from({length:f.mode==='knockout'?1:f.groupCount},(_,i)=>String.fromCharCode(65+i))}
export const legacyFactions:SeasonFaction[]=[
  {name:'米哈游',games:['原神','崩坏：星穹铁道','绝区零'],logoPath:'/factions/mihoyo.png',accent:'#57d4ff'},
  {name:'库洛游戏',games:['鸣潮','战双帕弥什'],logoPath:'/factions/kuro.png',accent:'#ff4d67'},
  {name:'型月',games:['Fate/Grand Order'],logoPath:'/factions/type-moon.png',accent:'#d8bf7d'},
  {name:'蛮啾网络',games:['碧蓝航线'],logoPath:'/factions/manjuu.png',accent:'#ff9fbd'},
  {name:'NEXON Games',games:['蔚蓝档案'],logoPath:'/factions/nexon-games.png',accent:'#64c44c'},
  {name:'SHIFT UP',games:['胜利女神：妮姬'],logoPath:'/factions/shift-up.png',accent:'#82e05e'},
  {name:'鹰角网络',games:['明日方舟：终末地'],logoPath:'/factions/hypergryph.svg',accent:'#f1c24d'},
  {name:'Hotta Studio',games:['异环'],logoPath:'/factions/hotta-studio.png',accent:'#58b4ff'}
]
export function legacyFormat():SeasonFormat{return {version:2,mode:'swiss-knockout',participants:128,groupCount:8,swissRounds:3,qualifiersPerGroup:2,avoidSameGame:true,rounds:Array.from({length:7},()=>({durationHours:24,breakHours:0})),factions:structuredClone(legacyFactions)}}
export function formatRoundPlans(f:SeasonFormat){
  const swiss=f.mode==='knockout'?0:f.swissRounds
  return Array.from({length:roundCount(f)},(_,i)=>{
    const stage=i<swiss?'swiss' as const:'knockout' as const
    const roundNumber=stage==='swiss'?i+1:i-swiss+1
    const remaining=knockoutSize(f)/2**(roundNumber-1)
    return {stage,roundNumber,name:stage==='swiss'?`瑞士轮 ${roundNumber}`:remaining===2?'决赛':remaining===4?'半决赛':`${remaining} 强`,matchCount:stage==='swiss'?f.participants/2:remaining/2,...f.rounds[i]}
  })
}
export function formatSchedule(f:SeasonFormat,startsAt:string){
  let cursor=new Date(startsAt).getTime()
  if(!Number.isFinite(cursor))throw new Error('开始时间无效')
  if(f.version===3&&(cursor+8*3_600_000)%86_400_000!==0)throw new Error('S2 必须在北京时间 00:00 开赛')
  return formatRoundPlans(f).map(round=>{cursor+=round.breakHours*3_600_000;const start=cursor;cursor+=round.durationHours*3_600_000;return {...round,startsAt:new Date(start).toISOString(),endsAt:new Date(cursor).toISOString()}})
}
export function validateRoster(entries:Array<{characterId:string;groupCode:string;seed:number}>,f:SeasonFormat){
  const groups=formatGroups(f),size=f.participants/groups.length
  const groupCounts=Object.fromEntries(groups.map(g=>[g,entries.filter(e=>e.groupCode===g).length]))
  let error:string|null=null
  if(entries.length!==f.participants)error=`赛季名单必须包含 ${f.participants} 位角色`
  else if(new Set(entries.map(e=>e.characterId)).size!==entries.length)error='赛季名单包含重复角色'
  else if(new Set(entries.map(e=>e.seed)).size!==entries.length)error='赛季名单包含重复种子'
  else if(entries.some(e=>!Number.isInteger(e.seed)||e.seed<1||e.seed>f.participants))error=`种子必须在 1 到 ${f.participants} 之间`
  else if(entries.some(e=>!groups.includes(e.groupCode))||groups.some(g=>groupCounts[g]!==size))error=`每组必须恰好包含 ${size} 位角色`
  return {valid:!error,error,groupCounts}
}
