import type {PublicMatch} from './api'

export type FactionScore={name:string;games:string[];votes:number;share:number}
export type FactionScoreboard={totalVotes:number;factions:FactionScore[]}

const factionByGame:Record<string,string>={
  '原神':'米哈游',
  '崩坏：星穹铁道':'米哈游',
  '绝区零':'米哈游',
  '鸣潮':'库洛游戏',
  '战双帕弥什':'库洛游戏',
  'Fate/Grand Order':'型月',
  '碧蓝航线':'蛮啾网络',
  '蔚蓝档案':'NEXON Games',
  '胜利女神：妮姬':'SHIFT UP',
  '明日方舟：终末地':'鹰角网络',
  '异环':'Hotta Studio'
}

const factionBrands:Record<string,{logoPath:string;accent:string}>={
  '米哈游':{logoPath:'/factions/mihoyo.png',accent:'#57d4ff'},
  '库洛游戏':{logoPath:'/factions/kuro.png',accent:'#ff4d67'},
  '型月':{logoPath:'/factions/type-moon.png',accent:'#d8bf7d'},
  '蛮啾网络':{logoPath:'/factions/manjuu.png',accent:'#ff9fbd'},
  'NEXON Games':{logoPath:'/factions/nexon-games.png',accent:'#64c44c'},
  'SHIFT UP':{logoPath:'/factions/shift-up.png',accent:'#82e05e'},
  '鹰角网络':{logoPath:'/factions/hypergryph.svg',accent:'#f1c24d'},
  'Hotta Studio':{logoPath:'/factions/hotta-studio.png',accent:'#58b4ff'}
}

export function factionBrand(name:string):{logoPath:string|null;accent:string} {
  return factionBrands[name]??{logoPath:null,accent:'#8c98a0'}
}

const gameOrder=Object.keys(factionByGame)
const factionForGame=(game:string)=>factionByGame[game]??game

export function calculateFactionScores(matches:PublicMatch[],seasonGames:string[]):FactionScoreboard {
  const games=[...new Set([...seasonGames,...matches.flatMap((match)=>[match.leftGame,match.rightGame])])]
    .sort((left,right)=>{const leftIndex=gameOrder.indexOf(left);const rightIndex=gameOrder.indexOf(right);return (leftIndex<0?gameOrder.length:leftIndex)-(rightIndex<0?gameOrder.length:rightIndex)||left.localeCompare(right,'zh-CN')})
  const votesByGame=new Map<string,number>()
  for(const match of matches){
    votesByGame.set(match.leftGame,(votesByGame.get(match.leftGame)??0)+match.leftVotes)
    votesByGame.set(match.rightGame,(votesByGame.get(match.rightGame)??0)+match.rightVotes)
  }
  const factionsByName=new Map<string,{name:string;games:string[];votes:number}>()
  for(const game of games){
    const name=factionForGame(game)
    const faction=factionsByName.get(name)??{name,games:[],votes:0}
    faction.games.push(game)
    faction.votes+=votesByGame.get(game)??0
    factionsByName.set(name,faction)
  }
  const totalVotes=[...factionsByName.values()].reduce((sum,faction)=>sum+faction.votes,0)
  const factions=[...factionsByName.values()]
    .map((faction)=>({...faction,share:totalVotes?faction.votes/totalVotes*100:0}))
    .sort((left,right)=>right.votes-left.votes||left.name.localeCompare(right.name,'zh-CN'))
  return {totalVotes,factions}
}
