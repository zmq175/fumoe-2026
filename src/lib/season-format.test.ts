import { describe, expect, it } from 'vitest'
import { formatSchedule, legacyFormat, readFormat, seasonFormatSchema, validateRoster } from './season-format'
import { firstKnockoutPairs, simulateSeasonBracket, type TournamentCharacter } from '../worker/tournament'
import { bracketGeometry, championResult } from './tournament-views'
import { calculateFactionScores } from './faction-data'

describe('赛季规则隔离和可配置规模',()=>{
  const extended=()=>({...legacyFormat(),participants:256,groupCount:16,swissRounds:5,rounds:Array.from({length:10},()=>({durationHours:48,breakHours:24}))})
  const players=(n:number,groups:number):TournamentCharacter[]=>Array.from({length:n},(_,i)=>({id:`entry-${i}`,game:`新增游戏${i%7}`,groupCode:String.fromCharCode(65+i%groups),seed:i+1}))
  it('旧配置始终解析为原规则，未知和缺失的新版本配置拒绝运行',()=>{
    const f=readFormat(null,'1');f.participants=256
    expect(readFormat(null,'1').participants).toBe(128)
    expect(()=>readFormat(null,'3')).toThrow('版本')
    expect(()=>readFormat(null,'2')).toThrow('缺失')
  })
  it('256 人、16 组、五轮瑞士轮和 32 强完整运行，排期正好 30 天',()=>{
    const f=seasonFormatSchema.parse(extended())
    const schedule=formatSchedule(f,'2030-01-01T00:00:00.000Z')
    expect(schedule.at(-1)?.endsAt).toBe('2030-01-31T00:00:00.000Z')
    expect(schedule[1].startsAt).toBe('2030-01-05T00:00:00.000Z')
    const result=simulateSeasonBracket(players(256,16),(a,b)=>a.seed<b.seed?a.id:b.id,f)
    expect(result.roundMatchCounts).toEqual([128,128,128,128,128,16,8,4,2,1])
    expect(result.uniqueParticipants).toBe(256)
    expect(result.championId).toBe('entry-0')
  })
  it('直接 256 人单败产生 255 场比赛和八轮签表',()=>{
    const f=seasonFormatSchema.parse({...extended(),mode:'knockout',rounds:Array.from({length:8},()=>({durationHours:72,breakHours:0}))})
    const result=simulateSeasonBracket(players(256,1),(a)=>a.id,f)
    expect(result.roundMatchCounts).toEqual([128,64,32,16,8,4,2,1])
    expect(bracketGeometry(256).cards).toHaveLength(255)
  })
  it('每组四人晋级时交叉配对不重复、不漏人',()=>{
    const f={...extended(),groupCount:8,qualifiersPerGroup:4}
    const records=players(256,8).map(p=>({...p,points:0,voteDifference:0,opponentPoints:0,opponents:[]}))
    const pairs=firstKnockoutPairs(records,f)
    expect(pairs).toHaveLength(16)
    expect(new Set(pairs.flat().map(p=>p.id)).size).toBe(32)
    expect(pairs.every(([a,b])=>a.groupCode!==b.groupCode)).toBe(true)
  })
  it('人数、晋级数、轮数和阵营归属必须一致',()=>{
    expect(seasonFormatSchema.safeParse({...extended(),participants:255}).success).toBe(false)
    expect(seasonFormatSchema.safeParse({...extended(),qualifiersPerGroup:32}).success).toBe(false)
    expect(seasonFormatSchema.safeParse({...extended(),rounds:[]}).success).toBe(false)
    const f=extended();f.factions.push({...f.factions[0],name:'重复归属'})
    expect(seasonFormatSchema.safeParse(f).success).toBe(false)
    const roster=players(256,16).map(p=>({...p,characterId:p.id}))
    expect(validateRoster(roster,extended()).valid).toBe(true)
    expect(validateRoster(roster,legacyFormat()).valid).toBe(false)
  })
  it('新阵营归属不会改变旧赛季的统计名称',()=>{
    const newFactions=[{name:'新联盟',games:['原神'],accent:'#123456',logoPath:null}]
    expect(calculateFactionScores([],['原神'],newFactions).factions[0].name).toBe('新联盟')
    expect(calculateFactionScores([],['原神'],legacyFormat().factions).factions[0].name).toBe('米哈游')
  })
  it('无决赛记录时不捏造历史冠军比分',()=>{
    expect(championResult({status:'archived',championCharacterId:'entry-1'},[])).toBeNull()
  })
})
