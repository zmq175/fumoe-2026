import { isPowerOfTwo, knockoutSize, roundCount, legacyFormat, type SeasonFormat } from './season-format'
import { z } from 'zod'

const factionSchema = z.object({
  name:z.string().trim().min(1).max(80), games:z.array(z.string().trim().min(1).max(100)).max(256),
  logoPath:z.string().max(300).regex(/^\/(?!\/)[a-zA-Z0-9/_.-]*$/).nullable().default(null),
  accent:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8c98a0')
})
export const seasonFormatSchema = z.object({
  version:z.union([z.literal(2),z.literal(3)]), mode:z.enum(['swiss-knockout','knockout']),
  participants:z.number().int().min(2).max(256), groupCount:z.number().int().min(1).max(16),
  swissRounds:z.number().int().min(0).max(16), qualifiersPerGroup:z.number().int().min(1).max(128),
  avoidSameGame:z.boolean(),
  rounds:z.array(z.object({durationHours:z.number().min(1).max(744), breakHours:z.number().min(0).max(744), batches:z.array(z.number().int().min(1).max(128)).min(1).max(31).optional(), matchDurationHours:z.number().int().min(1).max(48).optional()})).max(24),
  factions:z.array(factionSchema).max(256),
  defendingChampionId:z.string().max(80).optional(), artworkCutoff:z.string().optional(), drawSeed:z.string().max(128).optional()
}).strict().superRefine((format,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message})
  if(!isPowerOfTwo(format.participants))fail('参赛人数须为 2 的幂，范围 2–256')
  if(format.mode==='swiss-knockout'){
    const size=format.participants/format.groupCount
    if(!isPowerOfTwo(format.groupCount)||format.groupCount<2)fail('瑞士轮分组数须为 2、4、8 或 16')
    if(!Number.isInteger(size)||size<2||size%2)fail('每组必须包含偶数位参赛者')
    if(format.swissRounds<1||format.swissRounds>=size)fail('瑞士轮数须在 1 到每组人数减 1 之间')
    if(!isPowerOfTwo(format.qualifiersPerGroup)||format.qualifiersPerGroup>size)fail('每组晋级人数须为 2 的幂且不能超过组内人数')
  }
  const count=knockoutSize(format)
  if(!isPowerOfTwo(count)||count<2||count>format.participants)fail('淘汰赛晋级总人数不合法')
  if(format.rounds.length!==roundCount(format))fail(`需要配置 ${roundCount(format)} 轮的比赛时间`)
  if(new Set(format.factions.map(f=>f.name)).size!==format.factions.length)fail('阵营名称不能重复')
  if(format.version===2&&format.rounds.some(r=>r.batches))fail('分日赛程需要 v3 规则')
  if(format.version===3){
    for(const [i,round] of format.rounds.entries()){
      const swiss=format.mode==='swiss-knockout'?format.swissRounds:0
      const expected=i<swiss?format.participants/2:count/2**(i-swiss+1)
      if(!round.batches||round.batches.reduce((a,b)=>a+b,0)!==expected)fail('每日场次数量须恰好覆盖本轮')
      if(round.batches&&round.durationHours!==(round.batches.length-1)*24+(round.matchDurationHours??24))fail('轮次时长必须与每日对局窗口一致')
      if(round.breakHours!==0)fail('分日赛程不允许轮前休赛')
      if(i<swiss&&round.batches?.some(n=>n%(format.participants/format.groupCount/2)!==0))fail('瑞士赛每日必须安排完整小组')
    }
  }
  const games=format.factions.flatMap(f=>f.games)
  if(new Set(games).size!==games.length)fail('同一游戏在本赛季只能属于一个阵营')
})
export function readFormat(json?:string|null,rulesVersion='1'):SeasonFormat{
  if(!['1','2','3'].includes(rulesVersion))throw new Error('不支持该赛季的规则版本')
  if(!json){if(rulesVersion!=='1')throw new Error('赛季规则配置缺失');return legacyFormat()}
  const format=seasonFormatSchema.parse(JSON.parse(json)); if(rulesVersion==='3'&&format.version!==3||rulesVersion!=='3'&&format.version===3)throw new Error('赛季配置与规则版本不一致');return format
}
