import { formatGroups, formatRoundPlans, legacyFormat, validateRoster, type SeasonFormat } from '../lib/season-format'
export type TournamentCharacter = { id:string; game:string; groupCode:string; seed:number }
export type TournamentMatch = { id:string; groupCode:string|null; bracketPosition:number|null; leftCharacterId:string; rightCharacterId:string; leftVotes:number; rightVotes:number; winnerCharacterId:string|null; status:string }
export type Standing = TournamentCharacter & { points:number; voteDifference:number; opponentPoints:number; opponents:string[] }

type Pair = [TournamentCharacter,TournamentCharacter]

export function winnerFor(match:TournamentMatch, characters:Map<string,TournamentCharacter>) {
  if (match.leftVotes !== match.rightVotes) return match.leftVotes > match.rightVotes ? match.leftCharacterId : match.rightCharacterId
  const left=characters.get(match.leftCharacterId); const right=characters.get(match.rightCharacterId)
  if (!left || !right) throw new Error('对局角色不存在')
  return left.seed <= right.seed ? left.id : right.id
}

export function firstRoundPairs(characters:TournamentCharacter[],format=legacyFormat()) {
  const validation=validateRoster(characters.map(c=>({...c,characterId:c.id})),format)
  if(!validation.valid)throw new Error(validation.error!)
  return formatGroups(format).flatMap((groupCode) => {
    const group=characters.filter((character)=>character.groupCode===groupCode).sort((a,b)=>a.seed-b.seed)
    return Array.from({length:group.length/2},(_,index):Pair=>[group[index],group[group.length-1-index]])
  })
}

export function calculateStandings(characters:TournamentCharacter[], matches:TournamentMatch[]) {
  const records=new Map(characters.map((character)=>[character.id,{...character,points:0,voteDifference:0,opponentPoints:0,opponents:[] as string[]}]))
  for(const match of matches) {
    const left=records.get(match.leftCharacterId); const right=records.get(match.rightCharacterId)
    if(!left || !right || !['live','closed'].includes(match.status))continue
    left.voteDifference+=match.leftVotes-match.rightVotes; right.voteDifference+=match.rightVotes-match.leftVotes
    left.opponents.push(right.id); right.opponents.push(left.id)
    if(match.leftVotes===match.rightVotes) { left.points+=1; right.points+=1 } else if(match.leftVotes>match.rightVotes) left.points+=3; else right.points+=3
  }
  for(const record of records.values()) record.opponentPoints=record.opponents.reduce((total,id)=>total+(records.get(id)?.points??0),0)
  return [...records.values()]
}

export function sortStandings(records:Standing[]) {
  return [...records].sort((a,b)=>b.points-a.points||b.opponentPoints-a.opponentPoints||b.voteDifference-a.voteDifference||a.seed-b.seed)
}

export function swissPairs(records:Standing[],avoidSameGame=true) {
  if(records.length%2)throw new Error('瑞士轮分组人数必须为偶数')
  const pool=sortStandings(records)
  const pairs:Pair[]=[]
  while(pool.length) {
    const left=pool.shift()!
    const candidate=pool.findIndex((right)=>(!avoidSameGame||left.game!==right.game)&&!left.opponents.includes(right.id))
    const rematchFallback=pool.findIndex((right)=>!left.opponents.includes(right.id))
    const right=pool.splice(candidate>=0?candidate:rematchFallback>=0?rematchFallback:0,1)[0]
    pairs.push([left,right])
  }
  return pairs
}

export function qualifiers(records:Standing[],format=legacyFormat()) {
  return formatGroups(format).flatMap((groupCode)=>sortStandings(records.filter((record)=>record.groupCode===groupCode)).slice(0,format.qualifiersPerGroup))
}

export function firstKnockoutPairs(records:Standing[],format=legacyFormat()) {
  const groups=formatGroups(format),count=format.qualifiersPerGroup
  return Array.from({length:groups.length/2},(_,index)=>{
    const left=sortStandings(records.filter(r=>r.groupCode===groups[index*2])).slice(0,count)
    const right=sortStandings(records.filter(r=>r.groupCode===groups[index*2+1])).slice(0,count)
    if(left.length!==count||right.length!==count)throw new Error('小组晋级名单不完整')
    // Adjacent groups cross by rank. Alternating sides preserves the legacy A1/B2, B1/A2 order.
    return Array.from({length:count},(_,rank):Pair=>rank%2===0?[left[rank],right[count-1-rank]]:[right[count-1-rank],left[rank]])
  }).flat()
}

export function knockoutPairs(winners:TournamentCharacter[]) {
  if(winners.length%2) throw new Error('淘汰赛晋级人数必须为偶数')
  return Array.from({length:winners.length/2},(_,index):Pair=>[winners[index*2],winners[index*2+1]])
}

export function simulateSeasonBracket(characters:TournamentCharacter[],chooseWinner:(left:TournamentCharacter,right:TournamentCharacter)=>string,format:SeasonFormat=legacyFormat()) {
  const validation=validateRoster(characters.map(c=>({...c,characterId:c.id})),format)
  if(!validation.valid)throw new Error(validation.error!)
  const played:TournamentMatch[]=[]
  const resolve=(pairs:Pair[],round:number)=>pairs.map(([left,right],index)=>{
    const winnerCharacterId=chooseWinner(left,right)
    if(![left.id,right.id].includes(winnerCharacterId))throw new Error('模拟胜者不在对局中')
    const match:TournamentMatch={id:`round-${round}-${index}`,groupCode:left.groupCode===right.groupCode?left.groupCode:null,bracketPosition:index+1,leftCharacterId:left.id,rightCharacterId:right.id,leftVotes:winnerCharacterId===left.id?1:0,rightVotes:winnerCharacterId===right.id?1:0,winnerCharacterId,status:'closed'}
    played.push(match);return winnerCharacterId===left.id?left:right
  })
  let records=calculateStandings(characters,[])
  const roundMatchCounts:number[]=[]
  const swissCount=format.mode==='knockout'?0:format.swissRounds
  for(let round=1;round<=swissCount;round++){
    const pairs=round===1?firstRoundPairs(characters,format):formatGroups(format).flatMap((group)=>swissPairs(records.filter((record)=>record.groupCode===group),format.avoidSameGame))
    resolve(pairs,round);roundMatchCounts.push(pairs.length);records=calculateStandings(characters,played)
  }
  let pairs=swissCount?firstKnockoutPairs(records,format):firstRoundPairs(characters,format);roundMatchCounts.push(pairs.length);let winners=resolve(pairs,swissCount+1)
  for(let round=swissCount+2;round<=formatRoundPlans(format).length;round++){pairs=knockoutPairs(winners);roundMatchCounts.push(pairs.length);winners=resolve(pairs,round)}
  return {roundMatchCounts,championId:winners[0]?.id??null,uniqueParticipants:new Set(characters.map((character)=>character.id)).size}
}
