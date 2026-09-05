import { calculateStandings, firstKnockoutPairs, knockoutPairs, swissPairs, winnerFor, type TournamentCharacter, type TournamentMatch } from './tournament'
import type { Env } from './types'
import { formatGroups, formatRoundPlans, legacyFormat, knockoutSize } from '../lib/season-format'
import { insertPairStatement, loadSeasonFormat, roundOrderSql } from './season-config'

type Round = { id:string; seasonId:string; stage:'swiss'|'knockout'; roundNumber:number; status:string }
type Advancement = { nextRoundId:string|null; generatedMatches:number; championId:string|null }
type MatchResolution = { matchStatus:string; pendingVotes:number }

export function unresolvedMatchStatus({matchStatus,pendingVotes}:MatchResolution) { return matchStatus==='review'||pendingVotes>0?'review':matchStatus }

async function characters(db:D1Database,seasonId:string) {
  const result=await db.prepare(`SELECT se.character_id AS id,COALESCE(se.game_snapshot,g.name) AS game,se.group_code AS groupCode,se.seed FROM season_entries se JOIN characters c ON c.id=se.character_id JOIN games g ON g.id=c.game_id WHERE se.season_id=? ORDER BY se.seed`).bind(seasonId).all<TournamentCharacter>()
  return result.results
}

async function matchesForRound(db:D1Database,roundId:string) {
  const result=await db.prepare(`SELECT m.id,m.group_code AS groupCode,m.bracket_position AS bracketPosition,m.left_character_id AS leftCharacterId,m.right_character_id AS rightCharacterId,m.left_votes AS leftVotes,m.right_votes AS rightVotes,m.winner_character_id AS winnerCharacterId,m.status AS matchStatus,(SELECT COUNT(*) FROM votes v WHERE v.match_id=m.id AND v.risk_status='pending') AS pendingVotes FROM matches m WHERE m.round_id=? ORDER BY m.group_code,m.bracket_position`).bind(roundId).all<Omit<TournamentMatch,'status'>&MatchResolution>()
  return result.results.map((match)=>({...match,status:unresolvedMatchStatus(match)}))
}

async function roundFor(db:D1Database,seasonId:string,stage:'swiss'|'knockout',roundNumber:number) {
  return db.prepare(`SELECT id,season_id AS seasonId,stage,round_number AS roundNumber,status FROM tournament_rounds WHERE season_id=? AND stage=? AND round_number=?`).bind(seasonId,stage,roundNumber).first<Round>()
}

async function insertPairs(db:D1Database,roundId:string,pairs:Array<[TournamentCharacter,TournamentCharacter]>,groupCodes:Array<string|null>) {
  const existing=await db.prepare(`SELECT COUNT(*) AS count FROM matches WHERE round_id=?`).bind(roundId).first<{count:number}>()
  if((existing?.count??0)>0)return 0
  await insertPairStatement(db,roundId,pairs,groupCodes).run()
  return pairs.length
}

export function expectedMatchCount(round:Pick<Round,'stage'|'roundNumber'>,format=legacyFormat()) {
  return formatRoundPlans(format).find(r=>r.stage===round.stage&&r.roundNumber===round.roundNumber)?.matchCount??0
}

export async function ensureRoundCanStart(db:D1Database,round:Round) {
  const format=await loadSeasonFormat(db,round.seasonId)
  const order=round.stage==='swiss'?round.roundNumber:100+round.roundNumber
  const [matches,live,unfinishedPrevious]=await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count,SUM(CASE WHEN status!='scheduled' THEN 1 ELSE 0 END) AS invalid FROM matches WHERE round_id=?`).bind(round.id).first<{count:number;invalid:number}>(),
    db.prepare(`SELECT id FROM tournament_rounds WHERE season_id=? AND status='live' AND id!=? LIMIT 1`).bind(round.seasonId,round.id).first(),
    db.prepare(`SELECT id FROM tournament_rounds WHERE season_id=? AND (${roundOrderSql})<? AND status!='closed' LIMIT 1`).bind(round.seasonId,order).first()
  ])
  if(!expectedMatchCount(round,format)||matches?.count!==expectedMatchCount(round,format))throw new Error('本轮对局数量不完整')
  if(matches.invalid)throw new Error('本轮对局状态不允许开始')
  if(unfinishedPrevious)throw new Error('前序轮次尚未结束')
  if(live)throw new Error('已有其他轮次正在进行')
}

export async function closeRoundAndAdvance(env:Pick<Env,'DB'>,round:Round):Promise<Advancement> {
  const format=await loadSeasonFormat(env.DB,round.seasonId)
  const allCharacters=await characters(env.DB,round.seasonId)
  const characterMap=new Map(allCharacters.map((character)=>[character.id,character]))
  const beforeFreeze=await matchesForRound(env.DB,round.id)
  if(!expectedMatchCount(round,format)||beforeFreeze.length!==expectedMatchCount(round,format))throw new Error('本轮对局数量不完整')
  if(beforeFreeze.some((match)=>match.status==='review'))throw new Error('本轮仍有待审核对局')
  if(beforeFreeze.some((match)=>!['live','closed'].includes(match.status)))throw new Error('本轮包含不可结算的对局')
  await env.DB.prepare(`UPDATE matches SET status='closed',updated_at=? WHERE round_id=? AND status='live'`).bind(new Date().toISOString(),round.id).run()
  const matches=await matchesForRound(env.DB,round.id)
  if(matches.some((match)=>match.status==='review'))throw new Error('冻结赛果时出现待审核对局')
  const resolved=matches.map((match)=>({...match,winnerCharacterId:winnerFor(match,characterMap)}))
  await env.DB.prepare(`WITH resolutions AS (SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.winnerCharacterId') AS winner FROM json_each(?)) UPDATE matches SET winner_character_id=(SELECT winner FROM resolutions WHERE resolutions.id=matches.id),updated_at=? WHERE id IN (SELECT id FROM resolutions)`).bind(JSON.stringify(resolved.map(({id,winnerCharacterId})=>({id,winnerCharacterId}))),new Date().toISOString()).run()
  if(round.stage==='swiss') {
    const allSwiss=(await env.DB.prepare(`SELECT m.id,m.group_code AS groupCode,m.bracket_position AS bracketPosition,m.left_character_id AS leftCharacterId,m.right_character_id AS rightCharacterId,m.left_votes AS leftVotes,m.right_votes AS rightVotes,m.winner_character_id AS winnerCharacterId,m.status FROM matches m JOIN tournament_rounds r ON r.id=m.round_id WHERE r.season_id=? AND r.stage='swiss' AND r.round_number<=? AND m.status='closed'`).bind(round.seasonId,round.roundNumber).all<TournamentMatch>()).results
    const records=calculateStandings(allCharacters,allSwiss)
    if(round.roundNumber<format.swissRounds) {
      const next=await roundFor(env.DB,round.seasonId,'swiss',round.roundNumber+1); if(!next)throw new Error('下一轮瑞士轮未配置')
      const pairsByGroup=formatGroups(format).flatMap((groupCode)=>swissPairs(records.filter((record)=>record.groupCode===groupCode),format.avoidSameGame).map((pair)=>({pair,groupCode})))
      return {nextRoundId:next.id,generatedMatches:await insertPairs(env.DB,next.id,pairsByGroup.map((item)=>item.pair),pairsByGroup.map((item)=>item.groupCode)),championId:null}
    }
    const next=await roundFor(env.DB,round.seasonId,'knockout',1); if(!next)throw new Error('首轮淘汰赛未配置')
    const pairs=firstKnockoutPairs(records,format)
    return {nextRoundId:next.id,generatedMatches:await insertPairs(env.DB,next.id,pairs,pairs.map(()=>null)),championId:null}
  }
  const winners=resolved.sort((a,b)=>(a.bracketPosition??0)-(b.bracketPosition??0)).map((match)=>characterMap.get(match.winnerCharacterId!)).filter((character):character is TournamentCharacter=>Boolean(character))
  if(round.roundNumber===Math.log2(knockoutSize(format)))return {nextRoundId:null,generatedMatches:0,championId:winners[0]?.id??null}
  const next=await roundFor(env.DB,round.seasonId,'knockout',round.roundNumber+1); if(!next)throw new Error('下一轮淘汰赛未配置')
  const pairs=knockoutPairs(winners)
  return {nextRoundId:next.id,generatedMatches:await insertPairs(env.DB,next.id,pairs,pairs.map(()=>null)),championId:null}
}
