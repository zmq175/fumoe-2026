import { readFormat, formatSchedule, type SeasonFormat } from '../lib/season-format'
import { id } from './security'
import type { TournamentCharacter } from './tournament'

export async function loadSeasonFormat(db:D1Database,seasonId:string){
  const row=await db.prepare('SELECT format_json AS formatJson,rules_version AS rulesVersion FROM seasons WHERE id=?').bind(seasonId).first<{formatJson:string|null;rulesVersion:string}>()
  if(!row)throw new Error('赛季不存在')
  return readFormat(row.formatJson,row.rulesVersion)
}
export function roundStatements(db:D1Database,seasonId:string,format:SeasonFormat,startsAt:string){
  return formatSchedule(format,startsAt).map(round=>db.prepare(`INSERT INTO tournament_rounds(id,season_id,stage,round_number,name,starts_at,ends_at,status) VALUES(?,?,?,?,?,?,?,'scheduled')`).bind(`${seasonId}-${round.stage}-${round.roundNumber}`,seasonId,round.stage,round.roundNumber,round.name,round.startsAt,round.endsAt))
}
// Stage order is independent of the configured number of Swiss rounds.
export const roundOrderSql="CASE stage WHEN 'swiss' THEN round_number ELSE 100+round_number END"

export function insertPairStatement(db:D1Database,roundId:string,pairs:Array<[TournamentCharacter,TournamentCharacter]>,groups:Array<string|null>){
  const rows=pairs.map(([left,right],index)=>({id:id(),group:groups[index],position:index+1,left:left.id,right:right.id}))
  return db.prepare(`INSERT INTO matches(id,round_id,group_code,bracket_position,left_character_id,right_character_id,status) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.group'),json_extract(value,'$.position'),json_extract(value,'$.left'),json_extract(value,'$.right'),'scheduled' FROM json_each(?)`).bind(roundId,JSON.stringify(rows))
}
