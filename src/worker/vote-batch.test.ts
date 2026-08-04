import { describe,expect,it } from 'vitest'
import { normalizeVoteRequest, planBatchVotes, scheduleScorePublications } from './vote-batch'

const match=(id:string,leftCharacterId:string,rightCharacterId:string)=>({id,leftCharacterId,rightCharacterId,status:'live',startsAt:'2030-08-01T12:00:00.000Z',endsAt:'2030-08-02T12:00:00.000Z',seasonStatus:'live',isCurrent:1})
const now='2030-08-01T18:00:00.000Z'

describe('投票请求兼容',()=>{
  it('将旧单场请求转换为批量选择并标记旧响应格式',()=>{
    expect(normalizeVoteRequest({matchId:'m1',characterId:'c1',deviceFingerprint:'device-fingerprint'})).toEqual({choices:[{matchId:'m1',characterId:'c1'}],deviceFingerprint:'device-fingerprint',legacy:true})
  })

  it('保留新版批量请求格式',()=>{
    expect(normalizeVoteRequest({choices:[{matchId:'m1',characterId:'c1'}],deviceFingerprint:'device-fingerprint'})).toEqual({choices:[{matchId:'m1',characterId:'c1'}],deviceFingerprint:'device-fingerprint',legacy:false})
  })
})

describe('实时比分发布',()=>{
  it('将发布任务交给后台而不等待其完成',()=>{
    let resolvePublish:()=>void=()=>{}
    const publishing=new Promise<void>((resolve)=>{resolvePublish=resolve})
    let scheduled:Promise<unknown>|null=null
    scheduleScorePublications([publishing],(task)=>{scheduled=task})
    expect(scheduled).toBeTruthy()
    let completed=false
    scheduled!.then(()=>{completed=true})
    expect(completed).toBe(false)
    resolvePublish()
  })
})

describe('批量投票计划',()=>{
  it('一次接受多个不同场次的有效选择',()=>{
    expect(planBatchVotes(
      [{matchId:'m1',characterId:'c1'},{matchId:'m2',characterId:'c4'}],
      [match('m1','c1','c2'),match('m2','c3','c4')],
      [],
      now
    )).toEqual({ok:true,newVotes:[{matchId:'m1',characterId:'c1'},{matchId:'m2',characterId:'c4'}],existingVotes:[]})
  })

  it('拒绝重复场次，防止同批请求覆盖选择',()=>{
    expect(planBatchVotes(
      [{matchId:'m1',characterId:'c1'},{matchId:'m1',characterId:'c2'}],
      [match('m1','c1','c2')],
      [],
      now
    )).toEqual({ok:false,error:'同一场次不能重复选择'})
  })

  it('将数据库中的原选择作为幂等结果且不重复写票',()=>{
    const existing={matchId:'m1',characterId:'c1',riskStatus:'approved' as const,createdAt:'2030-08-01T12:30:00.000Z'}
    expect(planBatchVotes(
      [{matchId:'m1',characterId:'c2'},{matchId:'m2',characterId:'c3'}],
      [match('m1','c1','c2'),match('m2','c3','c4')],
      [existing],
      now
    )).toEqual({ok:true,newVotes:[{matchId:'m2',characterId:'c3'}],existingVotes:[existing]})
  })

  it('任一新选择不可投时拒绝整批写入',()=>{
    expect(planBatchVotes(
      [{matchId:'m1',characterId:'c1'},{matchId:'m2',characterId:'outside'}],
      [match('m1','c1','c2'),match('m2','c3','c4')],
      [],
      now
    )).toEqual({ok:false,error:'所选角色不属于对应场次'})
    expect(planBatchVotes(
      [{matchId:'m1',characterId:'c1'}],
      [{...match('m1','c1','c2'),status:'closed'}],
      [],
      now
    )).toEqual({ok:false,error:'所选场次当前不可投票'})
  })
})
