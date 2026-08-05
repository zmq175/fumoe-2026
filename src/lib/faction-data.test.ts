import {describe,expect,it} from 'vitest'
import type {PublicMatch} from './api'
import {calculateFactionScores,factionBrand} from './faction-data'

const match=(id:string,leftGame:string,leftVotes:number,rightGame:string,rightVotes:number):PublicMatch=>({
  id,roundId:'swiss-1',stage:'swiss',roundNumber:1,roundName:'瑞士轮 1',groupCode:'A',bracketPosition:1,status:'live',winnerCharacterId:null,
  leftVotes,rightVotes,startsAt:'2030-08-01T12:00:00.000Z',endsAt:'2030-08-02T12:00:00.000Z',
  leftId:`${id}-left`,leftName:'左方',leftGame,rightId:`${id}-right`,rightName:'右方',rightGame
})

describe('阵营比分',()=>{
  it('跨游戏与轮次汇总双方票数，并按总票占比排名',()=>{
    const scores=calculateFactionScores([
      match('m1','原神',40,'崩坏：星穹铁道',20),
      match('m2','鸣潮',30,'Fate/Grand Order',10),
      match('m3','战双帕弥什',15,'未收录游戏',5)
    ],['绝区零','碧蓝航线'])

    expect(scores.totalVotes).toBe(120)
    expect(scores.factions.slice(0,4)).toEqual([
      {name:'米哈游',games:['原神','崩坏：星穹铁道','绝区零'],votes:60,share:50},
      {name:'库洛游戏',games:['鸣潮','战双帕弥什'],votes:45,share:37.5},
      {name:'型月',games:['Fate/Grand Order'],votes:10,share:10/120*100},
      {name:'未收录游戏',games:['未收录游戏'],votes:5,share:5/120*100}
    ])
    expect(scores.factions.find((faction)=>faction.name==='蛮啾网络')).toEqual({name:'蛮啾网络',games:['碧蓝航线'],votes:0,share:0})
  })

  it('票池为空时保留本赛季阵营并返回零占比',()=>{
    expect(calculateFactionScores([],['原神','鸣潮']).factions).toEqual([
      {name:'库洛游戏',games:['鸣潮'],votes:0,share:0},
      {name:'米哈游',games:['原神'],votes:0,share:0}
    ])
  })

  it('为已知阵营提供官方 LOGO 与对抗主题色',()=>{
    expect(factionBrand('米哈游')).toEqual({logoPath:'/factions/mihoyo.png',accent:'#57d4ff'})
    expect(factionBrand('库洛游戏')).toEqual({logoPath:'/factions/kuro.png',accent:'#ff4d67'})
    expect(factionBrand('未收录游戏')).toEqual({logoPath:null,accent:'#8c98a0'})
  })
})
