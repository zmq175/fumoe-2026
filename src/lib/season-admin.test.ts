import { describe,expect,it } from 'vitest'
import { seasonRosterSummary } from './season-admin'

const entries=Array.from({length:128},(_,index)=>({characterId:`c${index}`,name:`角色${index}`,game:'游戏',groupCode:String.fromCharCode(65+index%8),seed:index+1}))

describe('赛季名单摘要',()=>{
  it('汇总各组人数并识别发布就绪状态',()=>{
    expect(seasonRosterSummary(entries)).toEqual({total:128,groupCounts:{A:16,B:16,C:16,D:16,E:16,F:16,G:16,H:16},duplicateSeeds:[],ready:true})
  })

  it('报告重复种子和人数不足',()=>{
    const invalid=entries.slice(1).map((entry,index)=>index===0?{...entry,seed:3}:entry)
    expect(seasonRosterSummary(invalid)).toMatchObject({total:127,duplicateSeeds:[3],ready:false})
  })
})
