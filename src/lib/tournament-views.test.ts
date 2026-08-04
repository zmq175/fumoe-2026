import { describe, expect, it } from 'vitest'
import type { PublicMatch, PublicRound } from './api'
import { bracketGeometry, bracketLayout, championResult, currentRound, historySections, knockoutColumns, matchResult, swissRoundPreview, updateVoteDrafts, validVoteDrafts } from './tournament-views'

const round = (id: string, stage: PublicRound['stage'], roundNumber: number, status: PublicRound['status']): PublicRound => ({ id, stage, roundNumber, status, name: `${stage}-${roundNumber}`, startsAt: `2026-08-0${roundNumber}T12:00:00.000Z`, endsAt: `2026-08-0${roundNumber + 1}T12:00:00.000Z` })
const match = (id: string, roundId: string, stage: PublicMatch['stage'], roundNumber: number, status: PublicMatch['status'], winnerCharacterId: string | null = null): PublicMatch => ({ id, roundId, stage, roundNumber, roundName: `${stage}-${roundNumber}`, groupCode: stage === 'swiss' ? 'A' : null, bracketPosition: 1, status, winnerCharacterId, leftVotes: 12, rightVotes: 8, startsAt: '2026-08-01T12:00:00.000Z', endsAt: '2026-08-02T12:00:00.000Z', leftId: 'left', leftName: '左方', leftGame: '游戏甲', rightId: 'right', rightName: '右方', rightGame: '游戏乙' })

describe('赛事视图数据', () => {
  it('优先显示进行中的轮次，其次显示最近待开始轮次', () => {
    const rounds = [round('r1', 'swiss', 1, 'closed'), round('r2', 'swiss', 2, 'scheduled'), round('r3', 'swiss', 3, 'live')]
    expect(currentRound(rounds)?.id).toBe('r3')
    expect(currentRound(rounds.filter((item) => item.id !== 'r3'))?.id).toBe('r2')
  })

  it('在多个场次间保留待提交选择，并允许改选或取消', () => {
    const first=updateVoteDrafts({},'m1','c001')
    const second=updateVoteDrafts(first,'m2','c003')
    expect(second).toEqual({m1:'c001',m2:'c003'})
    expect(updateVoteDrafts(second,'m1','c002')).toEqual({m1:'c002',m2:'c003'})
    expect(updateVoteDrafts(second,'m2','c003')).toEqual({m1:'c001'})
  })

  it('批量确认前排除已投票、非直播和角色不匹配的选择', () => {
    const live=match('m1','s1','swiss',1,'live')
    const closed=match('m2','s1','swiss',1,'closed')
    expect(validVoteDrafts({m1:'left',m2:'left',missing:'left',wrong:'outside'},[live,closed,{...live,id:'wrong'}],{m2:{}})).toEqual([
      {matchId:'m1',characterId:'left'}
    ])
  })

  it('按淘汰轮次保留空签表列并按位置排序对局', () => {
    const rounds = [round('k1', 'knockout', 1, 'closed'), round('k2', 'knockout', 2, 'scheduled')]
    const columns = knockoutColumns([match('second', 'k1', 'knockout', 1, 'closed'), { ...match('first', 'k1', 'knockout', 1, 'closed'), bracketPosition: 0 }], rounds)
    expect(columns.map((column) => [column.round.id, column.matches.map((item) => item.id)])).toEqual([['k1', ['first', 'second']], ['k2', []]])
  })

  it('按轮次倒序整理对阵历史，并保留尚无对局的轮次', () => {
    const rounds = [round('s1', 'swiss', 1, 'closed'), round('k1', 'knockout', 2, 'scheduled')]
    const sections = historySections([match('swiss-match', 's1', 'swiss', 1, 'closed')], rounds)
    expect(sections.map((section) => [section.round.id, section.matches.length])).toEqual([['k1', 0], ['s1', 1]])
  })

  it('为未生成的后续瑞士轮公示八组各八场对阵席位', () => {
    const preview=swissRoundPreview(round('s2','swiss',2,'scheduled'),[])
    expect(preview?.dependency).toBe('瑞士轮 1 结束后生成具体对阵')
    expect(preview?.groups).toHaveLength(8)
    expect(preview?.groups.every((group)=>group.slots.length===8)).toBe(true)
    expect(swissRoundPreview(round('k1','knockout',1,'scheduled'),[])).toBeNull()
    expect(swissRoundPreview(round('s2','swiss',2,'scheduled'),[match('m','s2','swiss',2,'scheduled')])).toBeNull()
  })

  it('为已结束对局标记胜者，为其他状态提供明确文案', () => {
    expect(matchResult(match('closed', 'k1', 'knockout', 1, 'closed', 'right'))).toEqual({ label: '右方 胜出', winnerId: 'right' })
    expect(matchResult(match('live', 'k1', 'knockout', 1, 'live'))).toEqual({ label: '投票中', winnerId: null })
    expect(matchResult(match('review', 'k1', 'knockout', 1, 'review'))).toEqual({ label: '审核中', winnerId: null })
  })

  it('只从已完成赛季的决赛生成冠军展示数据', () => {
    const final={...match('final','k4','knockout',4,'closed','right'),leftVotes:88,rightVotes:102}
    expect(championResult({status:'completed',championCharacterId:'right'},[final])).toEqual({championId:'right',championName:'右方',championGame:'游戏乙',runnerUpName:'左方',championVotes:102,runnerUpVotes:88})
    expect(championResult({status:'live',championCharacterId:'right'},[final])).toBeNull()
    expect(championResult({status:'completed',championCharacterId:'left'},[final])).toBeNull()
  })

  it('将世界杯式淘汰赛各轮对局置于前一轮对局中间', () => {
    expect(bracketLayout(1,8)).toEqual({rowStart:1,rowSpan:2})
    expect(bracketLayout(2,4)).toEqual({rowStart:2,rowSpan:4})
    expect(bracketLayout(3,2)).toEqual({rowStart:4,rowSpan:8})
    expect(bracketLayout(4,1)).toEqual({rowStart:8,rowSpan:16})
  })

  it('在同一画布上生成完整且连续的淘汰赛和冠军连接路径', () => {
    const geometry=bracketGeometry()
    expect(geometry.rounds.map((round)=>round.cards.length)).toEqual([8,4,2,1])
    expect(geometry.cards.find((card)=>card.roundNumber===1&&card.index===0)).toMatchObject({x:44,y:167})
    expect(geometry.cards.find((card)=>card.roundNumber===2&&card.index===0)).toMatchObject({x:380,y:211})
    expect(geometry.paths[0]).toBe('M 302 167 H 341 V 254 H 302 M 341 211 H 380')
    expect(geometry.championPath).toBe('M 1310 470 H 1388')
  })

  it('让后一轮卡片始终位于两张来源卡片的垂直中点', () => {
    const geometry=bracketGeometry()
    geometry.rounds.slice(0,-1).forEach((round,index)=>{
      round.cards.filter((_,cardIndex)=>cardIndex%2===0).forEach((upper,pairIndex)=>{
        const lower=round.cards[pairIndex*2+1]
        const target=geometry.rounds[index+1].cards[pairIndex]
        expect(Math.abs(target.y-(upper.y+lower.y)/2)).toBeLessThanOrEqual(0.5)
      })
    })
  })
})
