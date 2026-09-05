import { describe, expect, it } from 'vitest'
import { calculateStandings, firstKnockoutPairs, knockoutPairs, simulateSeasonBracket, sortStandings, swissPairs, winnerFor, type TournamentCharacter, type TournamentMatch } from './tournament'
import { expectedMatchCount, unresolvedMatchStatus } from './progression'
import { completionSeasonState, shouldRebaseRound } from './lifecycle'

const character=(id:string, groupCode='A', seed=1, game='游戏甲'):TournamentCharacter=>({id,groupCode,seed,game})
const match=(leftCharacterId:string,rightCharacterId:string,leftVotes:number,rightVotes:number,winnerCharacterId:string|null=null):TournamentMatch=>({id:`${leftCharacterId}-${rightCharacterId}`,groupCode:'A',bracketPosition:1,leftCharacterId,rightCharacterId,leftVotes,rightVotes,winnerCharacterId,status:'closed'})

describe('赛事推进规则', () => {
  it('平票时让种子更高的角色晋级', () => {
    const characters=new Map([['a',character('a','A',2)],['b',character('b','A',1)]])
    expect(winnerFor(match('a','b',10,10),characters)).toBe('b')
  })

  it('累计积分、对手分和净票差并按既定顺序排名', () => {
    const players=[character('a','A',1),character('b','A',2),character('c','A',3),character('d','A',4)]
    const records=calculateStandings(players,[match('a','b',10,5,'a'),match('c','d',8,8,'c')])
    expect(sortStandings(records).map((record)=>record.id)).toEqual(['a','c','d','b'])
    expect(records.find((record)=>record.id==='a')?.opponentPoints).toBe(0)
  })

  it('按进行中对局的当前比分生成实时预估积分', () => {
    const players=[character('a','A',1),character('b','A',2),character('c','A',3),character('d','A',4)]
    const live=[{...match('a','b',12,8),status:'live',winnerCharacterId:null},{...match('c','d',5,5),status:'live',winnerCharacterId:null}]
    const records=calculateStandings(players,live)
    expect(records.find((record)=>record.id==='a')).toMatchObject({points:3,voteDifference:4})
    expect(records.find((record)=>record.id==='b')).toMatchObject({points:0,voteDifference:-4})
    expect(records.find((record)=>record.id==='c')).toMatchObject({points:1,voteDifference:0})
    expect(records.find((record)=>record.id==='d')).toMatchObject({points:1,voteDifference:0})
  })

  it('瑞士轮优先避免同游戏和重复对阵', () => {
    const records=calculateStandings([
      character('a','A',1,'甲'),character('b','A',2,'甲'),character('c','A',3,'乙'),character('d','A',4,'丙')
    ],[match('a','c',5,3,'a'),match('b','d',4,2,'b')])
    const pairs=swissPairs(records)
    const byId=new Map(records.map((record)=>[record.id,record]))
    expect(pairs.flat().map((record)=>record.id)).toHaveLength(4)
    expect(pairs.every(([left,right])=>left.game!==right.game)).toBe(true)
    expect(pairs.every(([left,right])=>!byId.get(left.id)?.opponents.includes(right.id))).toBe(true)
  })

  it('按小组排名交叉生成十六强，并按胜者顺序生成后续淘汰赛', () => {
    const records=['A','B','C','D','E','F','G','H'].flatMap((group,index)=>[character(`${group}1`,group,index*2+1),character(`${group}2`,group,index*2+2)])
    const pairs=firstKnockoutPairs(records.map((record,index)=>({...record,points:index%2?3:6,voteDifference:0,opponentPoints:0,opponents:[]})))
    expect(pairs).toHaveLength(8)
    expect(pairs[0].map((record)=>record.id)).toEqual(['A1','B2'])
    expect(knockoutPairs(pairs.flat().slice(0,4))).toHaveLength(2)
  })

  it('待审核投票会阻止轮次结算，即使对局未标记为待审核', () => {
    expect(unresolvedMatchStatus({ matchStatus: 'live', pendingVotes: 1 })).toBe('review')
    expect(unresolvedMatchStatus({ matchStatus: 'live', pendingVotes: 0 })).toBe('live')
  })

  it('完整演练三轮瑞士制和四轮淘汰赛', () => {
    const players=['A','B','C','D','E','F','G','H'].flatMap((group,groupIndex)=>Array.from({length:16},(_,index)=>character(`${group}${index+1}`,group,groupIndex*16+index+1,`游戏${index%4}`)))
    const result=simulateSeasonBracket(players,(left,right)=>left.seed<=right.seed?left.id:right.id)
    expect(result.roundMatchCounts).toEqual([64,64,64,8,4,2,1])
    expect(result.championId).toBe('A1')
    expect(result.uniqueParticipants).toBe(128)
  })

  it('决赛关闭后记录冠军并将赛事标记为结束', () => {
    expect(completionSeasonState({ nextRoundId:null, championId:'c128' }, 'ko-4')).toEqual({ status:'completed', currentRoundId:'ko-4', championId:'c128' })
    expect(completionSeasonState({ nextRoundId:'ko-2', championId:null }, 'ko-1')).toEqual({ status:'live', currentRoundId:'ko-2', championId:null })
  })

  it('校验每阶段完整对局数量',()=>{
    expect([1,2,3].map((roundNumber)=>expectedMatchCount({stage:'swiss',roundNumber}))).toEqual([64,64,64])
    expect([1,2,3,4].map((roundNumber)=>expectedMatchCount({stage:'knockout',roundNumber}))).toEqual([8,4,2,1])
  })

  it('过期时间窗需要从恢复时刻重排',()=>{
    const now=new Date('2030-08-03T00:00:00.000Z')
    expect(shouldRebaseRound({startsAt:'2030-08-01T00:00:00.000Z',endsAt:'2030-08-02T00:00:00.000Z'},now)).toBe(true)
    expect(shouldRebaseRound({startsAt:'2030-08-02T00:00:00.000Z',endsAt:'2030-08-04T00:00:00.000Z'},now)).toBe(false)
  })
})
