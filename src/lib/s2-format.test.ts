import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { drawSeasonRoster, s2Format } from './s2-format'
import { formatSchedule, legacyFormat } from './season-format'
import { seasonFormatSchema } from './season-format-schema'

describe('S2 独立配置',()=>{
  it('256 人 30 天，每日最多 24 场，决赛 48 小时，不改变旧配置',()=>{
    const old=legacyFormat(),format=s2Format(),schedule=formatSchedule(format,'2030-01-01T16:00:00.000Z')
    expect(schedule.reduce((n,r)=>n+r.matchCount,0)).toBe(447)
    expect(schedule.reduce((n,r)=>n+r.durationHours,0)).toBe(720)
    expect(Math.max(...schedule.flatMap(r=>r.batches!))).toBe(24)
    expect(schedule.at(-1)?.durationHours).toBe(48)
    expect(()=>formatSchedule(format,'2030-01-01T00:00:00.000Z')).toThrow('北京时间')
    expect(legacyFormat()).toEqual(old)
    expect(old.participants).toBe(128)
    expect(format.factions).toHaveLength(4)
    format.rounds[0].batches=[128]
    expect(seasonFormatSchema.safeParse(format).success).toBe(false)
  })
  it('按游戏区分同名角色，名单共 256 人',()=>{
    const source=JSON.parse(readFileSync('seasons/s2/roster-source.json','utf8')) as Record<string,string>
    const identities=Object.entries(source).flatMap(([game,names])=>names.split('、').map(name=>`${game}:${name}`))
    expect(identities).toHaveLength(256)
    expect(new Set(identities).size).toBe(256)
    expect(identities.filter(s=>s.endsWith(':希儿'))).toHaveLength(2)
  })
  it('抽签可重现、输入顺序不影响结果，每组 16 人',async()=>{
    const entries=Array.from({length:256},(_,i)=>({characterId:`character-${i}`}))
    const result=await drawSeasonRoster(entries,'recorded-random-seed')
    expect(await drawSeasonRoster([...entries].reverse(),'recorded-random-seed')).toEqual(result)
    expect(await drawSeasonRoster(entries,'different-seed')).not.toEqual(result)
    for(const group of 'ABCDEFGHIJKLMNOP')expect(result.filter(r=>r.groupCode===group)).toHaveLength(16)
    expect(new Set(result.map(r=>r.seed)).size).toBe(256)
  })
})
