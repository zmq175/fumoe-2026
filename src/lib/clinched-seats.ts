import type { PublicMatch, PublicStanding } from './api'
import { formatGroups, type SeasonFormat } from './season-format'
import { calculateStandings, sortStandings } from '../worker/tournament'

export function swissSeats(matches:PublicMatch[], roster:PublicStanding[], format:SeasonFormat) {
  const slots = new Map<string, PublicStanding>()
  const qualified = new Set<string>()
  if (format.mode !== 'swiss-knockout') return {slots, qualified}

  const firstRound = matches.filter(m => m.stage === 'knockout' && m.roundNumber === 1)
  if (firstRound.length) {
    for (const match of firstRound) {
      qualified.add(match.leftId)
      qualified.add(match.rightId)
    }
    return {slots, qualified}
  }
  const closed = matches.filter(m => m.stage === 'swiss' && m.status === 'closed')
  const records = calculateStandings(roster, closed.map(m => ({
    ...m, leftCharacterId:m.leftId, rightCharacterId:m.rightId
  })))
  const entries = new Map(roster.map(row => [row.id, row]))
  for (const group of formatGroups(format)) {
    const rows = sortStandings(records.filter(row => row.groupCode === group))
    if (rows.length !== format.participants / format.groupCount) continue
    const maximum = (row:typeof rows[number]) => row.points + 3 * (format.swissRounds - row.opponents.length)
    const maximumById = new Map(rows.map(row => [row.id, maximum(row)]))
    // For a completed schedule the opponent list and vote difference are fixed.
    const ahead = (a:typeof rows[number], b:typeof rows[number]) => {
      if (a.points !== maximum(b)) return a.points > maximum(b)
      if (a.opponents.length !== format.swissRounds || b.opponents.length !== format.swissRounds) return false
      const opponentCeiling = b.opponents.reduce((sum,id) => sum + maximumById.get(id)!, 0)
      if (a.opponentPoints !== opponentCeiling) return a.opponentPoints > opponentCeiling
      return a.voteDifference > b.voteDifference || (a.voteDifference === b.voteDifference && a.seed < b.seed)
    }
    for (const row of rows) {
      const best = 1 + rows.filter(other => other !== row && ahead(other,row)).length
      const worst = rows.length - rows.filter(other => other !== row && ahead(row,other)).length
      if (worst > format.qualifiersPerGroup) continue
      qualified.add(row.id)
      if (best === worst) slots.set(group + best, entries.get(row.id)!)
    }
  }
  return {slots, qualified}
}

export function feederWinner(match:PublicMatch|undefined, roster:Map<string,PublicStanding>) {
  if (match?.status !== 'closed') return undefined
  let winner = match.winnerCharacterId
  if (!winner) {
    if (match.leftVotes !== match.rightVotes) winner = match.leftVotes > match.rightVotes ? match.leftId : match.rightId
    else {
      const left = roster.get(match.leftId), right = roster.get(match.rightId)
      if (!left || !right) return undefined
      winner = left.seed <= right.seed ? left.id : right.id
    }
  }
  if (winner === match.leftId) return {id:winner,name:match.leftName,avatarArtworkKey:match.leftAvatarArtworkKey}
  if (winner === match.rightId) return {id:winner,name:match.rightName,avatarArtworkKey:match.rightAvatarArtworkKey}
}
