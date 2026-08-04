import { describe, expect, it } from 'vitest'
import { buildSeasonSlug, canEditRoster, canEditSeason, homepageMode, validateSeasonRoster } from './seasons'

describe('多赛季规则', () => {
  it('将可读名称规范化为稳定链接标识', () => {
    expect(buildSeasonSlug('府萌 2027 Summer', '2027-08-01')).toBe('2027-summer')
    expect(buildSeasonSlug('府萌 夏季赛', '2027-08-01')).toBe('2027-season')
  })

  it('只允许编辑活跃赛季或已审计解锁的历史赛季', () => {
    expect(canEditSeason({ status:'live', historyUnlocked:false })).toBe(true)
    expect(canEditSeason({ status:'completed', historyUnlocked:false })).toBe(false)
    expect(canEditSeason({ status:'completed', historyUnlocked:true })).toBe(true)
    expect(canEditSeason({ status:'archived', historyUnlocked:true })).toBe(true)
  })

  it('发布前要求 128 人、唯一角色与种子且每组恰好 16 人', () => {
    const valid=Array.from({length:128},(_,index)=>({characterId:`c${index}`,groupCode:String.fromCharCode(65+index%8),seed:index+1}))
    expect(validateSeasonRoster(valid)).toEqual({ valid:true, error:null, groupCounts:{A:16,B:16,C:16,D:16,E:16,F:16,G:16,H:16} })
    expect(validateSeasonRoster(valid.slice(1))).toMatchObject({ valid:false, error:'赛季名单必须包含 128 位角色' })
    expect(validateSeasonRoster(valid.map((entry,index)=>index===0?{...entry,groupCode:'B'}:entry))).toMatchObject({ valid:false, error:'每组必须恰好包含 16 位角色' })
    expect(validateSeasonRoster(valid.map((entry,index)=>index===1?{...entry,characterId:'c0'}:entry))).toMatchObject({ valid:false,error:'赛季名单包含重复角色' })
    expect(validateSeasonRoster(valid.map((entry,index)=>index===1?{...entry,seed:1}:entry))).toMatchObject({ valid:false,error:'赛季名单包含重复种子' })
  })

  it('只允许草稿赛季调整参赛名单', () => {
    expect(canEditRoster({ status:'draft', rosterLocked:false })).toBe(true)
    expect(canEditRoster({ status:'published', rosterLocked:false })).toBe(false)
    expect(canEditRoster({ status:'draft', rosterLocked:true })).toBe(false)
  })

  it('按当前与上一赛季状态决定首页布局', () => {
    expect(homepageMode({ currentStatus:'live', hasPreviousChampion:true })).toBe('live-with-defender')
    expect(homepageMode({ currentStatus:'published', hasPreviousChampion:true })).toBe('season-transition')
    expect(homepageMode({ currentStatus:'completed', hasPreviousChampion:false })).toBe('champion')
    expect(homepageMode({ currentStatus:null, hasPreviousChampion:false })).toBe('default')
  })
})
