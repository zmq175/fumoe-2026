import type { PublicMatch, PublicRound } from './api'

export type RoundSection = { round: PublicRound; matches: PublicMatch[] }
export type MatchResult = { label: string; winnerId: string | null }
export type ChampionResult = { championId:string;championName:string;championGame:string;runnerUpName:string;championVotes:number;runnerUpVotes:number }

export function championResult(season:{status:string;championCharacterId:string|null},matches:PublicMatch[]):ChampionResult|null {
  if(season.status!=='completed'||!season.championCharacterId)return null
  const final=matches.find((match)=>match.stage==='knockout'&&match.roundNumber===4&&match.status==='closed')
  if(!final||final.winnerCharacterId!==season.championCharacterId)return null
  const championOnLeft=final.leftId===season.championCharacterId
  return {championId:season.championCharacterId,championName:championOnLeft?final.leftName:final.rightName,championGame:championOnLeft?final.leftGame:final.rightGame,runnerUpName:championOnLeft?final.rightName:final.leftName,championVotes:championOnLeft?final.leftVotes:final.rightVotes,runnerUpVotes:championOnLeft?final.rightVotes:final.leftVotes}
}

export function currentRound(rounds: PublicRound[]) {
  return rounds.find((round) => round.status === 'live') ?? rounds.find((round) => round.status === 'scheduled') ?? [...rounds].reverse().find((round) => round.status === 'closed') ?? null
}

export type VoteDrafts=Record<string,string>

export function updateVoteDrafts(drafts:VoteDrafts,matchId:string,characterId:string):VoteDrafts {
  if(drafts[matchId]===characterId){const next={...drafts};delete next[matchId];return next}
  return {...drafts,[matchId]:characterId}
}

export function validVoteDrafts(drafts:VoteDrafts,matches:PublicMatch[],submitted:Record<string,unknown>) {
  return matches.flatMap((match)=>{
    const characterId=drafts[match.id]
    return match.status==='live'&&!submitted[match.id]&&[match.leftId,match.rightId].includes(characterId)
      ? [{matchId:match.id,characterId}]
      : []
  })
}

export function bracketLayout(_roundNumber:number,matchCount:number) {
  const rowSpan=16/matchCount
  return {rowStart:rowSpan/2,rowSpan}
}

type BracketCardGeometry={roundNumber:number;index:number;x:number;y:number;width:number;height:number}

type BracketRoundGeometry={roundNumber:number;cards:BracketCardGeometry[]}

type BracketGeometry={width:number;height:number;rounds:BracketRoundGeometry[];cards:BracketCardGeometry[];paths:string[];championPath:string;champion:{x:number;y:number;width:number;height:number}}

export function bracketGeometry():BracketGeometry {
  const width=1560
  const height=920
  const cardWidth=258
  const cardHeight=88
  const topOffset=124
  const playHeight=692
  const roundXs=[44,380,716,1052]
  const championX=1388
  const championWidth=152
  const championHeight=176
  const counts=[8,4,2,1]
  const rounds=counts.map((count,roundIndex)=>({
    roundNumber:roundIndex+1,
    cards:Array.from({length:count},(_,index):BracketCardGeometry=>({
      roundNumber:roundIndex+1,
      index,
      x:roundXs[roundIndex],
      y:Math.round(topOffset+((index+0.5)*playHeight)/count),
      width:cardWidth,
      height:cardHeight
    }))
  }))
  const cards=rounds.flatMap((round)=>round.cards)
  const paths=rounds.slice(0,-1).flatMap((round,roundIndex)=>round.cards.filter((_,index)=>index%2===0).map((upper,index)=>{
    const lower=round.cards[index*2+1]
    const target=rounds[roundIndex+1].cards[index]
    const sourceX=upper.x+upper.width
    const joinX=Math.round((sourceX+target.x)/2)
    return `M ${sourceX} ${upper.y} H ${joinX} V ${lower.y} H ${sourceX} M ${joinX} ${target.y} H ${target.x}`
  }))
  const final=rounds[3].cards[0]
  return {
    width,
    height,
    rounds,
    cards,
    paths,
    championPath:`M ${final.x+final.width} ${final.y} H ${championX}`,
    champion:{x:championX,y:final.y,width:championWidth,height:championHeight}
  }
}

export function activeRoundMatches(matches:PublicMatch[],activeRound:PublicRound|null) {
  return activeRound ? matches.filter((match)=>match.roundId===activeRound.id) : []
}

export function consistentSeasonSnapshot(rounds:PublicRound[],matches:PublicMatch[],standings:unknown[]) {
  const activeRound=currentRound(rounds)
  const liveMatches=activeRoundMatches(matches,activeRound)
  return {
    activeRound,
    liveMatches,
    hasStandings:Boolean(standings.length),
    ready:Boolean(activeRound && liveMatches.length)
  }
}

export function groupStandings<T extends {groupCode:string}>(standings:T[]) {
  return Array.from({length:8},(_,index)=>String.fromCharCode(65+index)).map((group)=>({group,rows:standings.filter((row)=>row.groupCode===group)}))
}

export function tidyName(value:string) {
  return value.replaceAll('·', ' · ')
}

export function gameLabel(value:string) {
  return value.replaceAll(':', '：')
}

export function sideLabel(name:string,game:string) {
  return `${tidyName(name)} · ${gameLabel(game)}`
}

export function pairWithinGroups<T extends {group:string;seed:number}>(entries:T[]) {
  return ['A','B','C','D','E','F','G','H'].flatMap((group)=>{
    const groupEntries=entries.filter((entry)=>entry.group===group).sort((left,right)=>left.seed-right.seed)
    return Array.from({length:8},(_,index)=>[groupEntries[index],groupEntries[15-index]] as const)
  })
}

export function scoreboardSeed(index:number) {
  return { leftVotes: 860 + index * 9, rightVotes: 790 + index * 7 }
}

export type { BracketCardGeometry, BracketRoundGeometry, BracketGeometry }

export function knockoutColumns(matches: PublicMatch[], rounds: PublicRound[]): RoundSection[] {
  return rounds
    .filter((round) => round.stage === 'knockout')
    .sort((left, right) => left.roundNumber - right.roundNumber)
    .map((round) => ({ round, matches: matches.filter((match) => match.roundId === round.id).sort((left, right) => (left.bracketPosition ?? 0) - (right.bracketPosition ?? 0)) }))
}

export function historySections(matches: PublicMatch[], rounds: PublicRound[]): RoundSection[] {
  return [...rounds]
    .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime() || right.roundNumber - left.roundNumber)
    .map((round) => ({ round, matches: matches.filter((match) => match.roundId === round.id).sort((left, right) => (left.groupCode ?? '').localeCompare(right.groupCode ?? '') || (left.bracketPosition ?? 0) - (right.bracketPosition ?? 0)) }))
}

export function swissRoundPreview(round:PublicRound,matches:PublicMatch[]) {
  if(round.stage!=='swiss'||round.roundNumber<2||matches.some((match)=>match.roundId===round.id))return null
  return {
    dependency:`瑞士轮 ${round.roundNumber-1} 结束后生成具体对阵`,
    groups:Array.from({length:8},(_,index)=>({group:String.fromCharCode(65+index),slots:Array.from({length:8},(_,slot)=>slot+1)}))
  }
}

export function matchResult(match: PublicMatch): MatchResult {
  if (match.status === 'closed' && match.winnerCharacterId) return { label: `${match.winnerCharacterId === match.leftId ? match.leftName : match.rightName} 胜出`, winnerId: match.winnerCharacterId }
  if (match.status === 'live') return { label: '投票中', winnerId: null }
  if (match.status === 'review') return { label: '审核中', winnerId: null }
  return { label: '待开始', winnerId: null }
}

export function roundStatusLabel(round: PublicRound) {
  return round.status === 'live' ? '进行中' : round.status === 'closed' ? '已结束' : round.status === 'archived' ? '已归档' : '待开始'
}
