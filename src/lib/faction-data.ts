import { legacyFactions, type SeasonFaction } from './season-format'
import { legacyAsset } from './legacy-assets'
import type {PublicMatch} from './api'

export type FactionScore={name:string;games:string[];votes:number;share:number}
export type FactionScoreboard={totalVotes:number;factions:FactionScore[]}

export function factionBrand(name:string,factions:SeasonFaction[]=legacyFactions):{logoPath:string|null;accent:string} {
  const faction=factions.find(f=>f.name===name)
  return faction?{logoPath:faction.logoPath?legacyAsset(faction.logoPath):null,accent:faction.accent}:{logoPath:null,accent:'#8c98a0'}
}

export function calculateFactionScores(matches:PublicMatch[],seasonGames:string[],factions:SeasonFaction[]=legacyFactions):FactionScoreboard {
  const factionByGame=Object.fromEntries(factions.flatMap(f=>f.games.map(game=>[game,f.name])))
  const gameOrder=Object.keys(factionByGame)
  const factionForGame=(game:string)=>factionByGame[game]??game
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
  const rankedFactions=[...factionsByName.values()]
    .map((faction)=>({...faction,share:totalVotes?faction.votes/totalVotes*100:0}))
    .sort((left,right)=>right.votes-left.votes||left.name.localeCompare(right.name,'zh-CN'))
  return {totalVotes,factions:rankedFactions}
}
