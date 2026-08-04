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

export function firstRoundPairs(characters:TournamentCharacter[]) {
  return ['A','B','C','D','E','F','G','H'].flatMap((groupCode) => {
    const group=characters.filter((character)=>character.groupCode===groupCode).sort((a,b)=>a.seed-b.seed)
    if(group.length!==16) throw new Error(`${groupCode} 组人数不是 16 人`)
    return Array.from({length:8},(_,index):Pair=>[group[index],group[15-index]])
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

export function swissPairs(records:Standing[]) {
  const pool=sortStandings(records)
  const pairs:Pair[]=[]
  while(pool.length) {
    const left=pool.shift()!
    const candidate=pool.findIndex((right)=>left.game!==right.game&&!left.opponents.includes(right.id))
    const rematchFallback=pool.findIndex((right)=>!left.opponents.includes(right.id))
    const right=pool.splice(candidate>=0?candidate:rematchFallback>=0?rematchFallback:0,1)[0]
    pairs.push([left,right])
  }
  return pairs
}

export function qualifiers(records:Standing[]) {
  return ['A','B','C','D','E','F','G','H'].flatMap((groupCode)=>sortStandings(records.filter((record)=>record.groupCode===groupCode)).slice(0,2))
}

export function firstKnockoutPairs(records:Standing[]) {
  const byGroup=new Map(['A','B','C','D','E','F','G','H'].map((groupCode)=>[groupCode,sortStandings(records.filter((record)=>record.groupCode===groupCode)).slice(0,2)]))
  return [['A','B'],['C','D'],['E','F'],['G','H']].flatMap(([leftGroup,rightGroup])=>{
    const left=byGroup.get(leftGroup); const right=byGroup.get(rightGroup)
    if(!left || !right || left.length!==2 || right.length!==2) throw new Error('小组晋级名单不完整')
    return [[left[0],right[1]],[right[0],left[1]]] as Pair[]
  })
}

export function knockoutPairs(winners:TournamentCharacter[]) {
  if(winners.length%2) throw new Error('淘汰赛晋级人数必须为偶数')
  return Array.from({length:winners.length/2},(_,index):Pair=>[winners[index*2],winners[index*2+1]])
}

export function simulateSeasonBracket(characters:TournamentCharacter[],chooseWinner:(left:TournamentCharacter,right:TournamentCharacter)=>string) {
  if(characters.length!==128)throw new Error('完整赛季必须包含 128 位角色')
  const played:TournamentMatch[]=[]
  const resolve=(pairs:Pair[],round:number)=>pairs.map(([left,right],index)=>{
    const winnerCharacterId=chooseWinner(left,right)
    const match:TournamentMatch={id:`round-${round}-${index}`,groupCode:left.groupCode===right.groupCode?left.groupCode:null,bracketPosition:index+1,leftCharacterId:left.id,rightCharacterId:right.id,leftVotes:winnerCharacterId===left.id?1:0,rightVotes:winnerCharacterId===right.id?1:0,winnerCharacterId,status:'closed'}
    played.push(match);return winnerCharacterId===left.id?left:right
  })
  let records=calculateStandings(characters,[])
  const roundMatchCounts:number[]=[]
  for(let round=1;round<=3;round++){
    const pairs=round===1?['A','B','C','D','E','F','G','H'].flatMap((group)=>{const players=characters.filter((character)=>character.groupCode===group).sort((a,b)=>a.seed-b.seed);return Array.from({length:8},(_,index):Pair=>[players[index],players[15-index]])}):['A','B','C','D','E','F','G','H'].flatMap((group)=>swissPairs(records.filter((record)=>record.groupCode===group)))
    resolve(pairs,round);roundMatchCounts.push(pairs.length);records=calculateStandings(characters,played)
  }
  let pairs=firstKnockoutPairs(records);roundMatchCounts.push(pairs.length);let winners=resolve(pairs,4)
  for(let round=5;round<=7;round++){pairs=knockoutPairs(winners);roundMatchCounts.push(pairs.length);winners=resolve(pairs,round)}
  return {roundMatchCounts,championId:winners[0]?.id??null,uniqueParticipants:new Set(characters.map((character)=>character.id)).size}
}
