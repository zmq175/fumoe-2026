type PublicStanding={groupCode:string;id:string;name:string;game:string;seed:number;points:number;voteDifference:number;opponentPoints:number}
import { legacyPortrait } from '../lib/legacy-assets'

// V1 ordering is frozen. V2 currently deliberately retains this scoring policy.
export async function calculateSeasonStandingsV1(db:D1Database,seasonId:string){
  return (await db.prepare(`WITH swiss AS (
    SELECT m.group_code AS groupCode,m.left_character_id AS characterId,m.right_character_id AS opponentId,m.left_votes AS votesFor,m.right_votes AS votesAgainst FROM matches m JOIN tournament_rounds r ON r.id=m.round_id WHERE r.season_id=? AND r.stage='swiss' AND m.status IN ('live','closed')
    UNION ALL
    SELECT m.group_code,m.right_character_id,m.left_character_id,m.right_votes,m.left_votes FROM matches m JOIN tournament_rounds r ON r.id=m.round_id WHERE r.season_id=? AND r.stage='swiss' AND m.status IN ('live','closed')
  ),base AS (
    SELECT se.group_code AS groupCode,se.character_id AS id,COALESCE(se.name_snapshot,c.name) AS name,COALESCE(se.game_snapshot,g.name) AS game,se.seed FROM season_entries se JOIN characters c ON c.id=se.character_id JOIN games g ON g.id=c.game_id WHERE se.season_id=?
  ),standings AS (
    SELECT b.groupCode,b.id,b.name,b.game,b.seed,COALESCE(SUM(CASE WHEN s.votesFor=s.votesAgainst THEN 1 WHEN s.votesFor>s.votesAgainst THEN 3 ELSE 0 END),0) AS points,COALESCE(SUM(s.votesFor-s.votesAgainst),0) AS voteDifference FROM base b LEFT JOIN swiss s ON s.characterId=b.id GROUP BY b.groupCode,b.id,b.name,b.game,b.seed
  )
  SELECT standings.groupCode,standings.id,standings.name,standings.game,standings.seed,standings.points,standings.voteDifference,COALESCE(SUM(opponent.points),0) AS opponentPoints FROM standings LEFT JOIN swiss ON swiss.characterId=standings.id LEFT JOIN standings opponent ON opponent.id=swiss.opponentId GROUP BY standings.groupCode,standings.id,standings.name,standings.game,standings.seed,standings.points,standings.voteDifference ORDER BY standings.groupCode,standings.points DESC,opponentPoints DESC,standings.voteDifference DESC,standings.seed ASC`).bind(seasonId,seasonId,seasonId).all<PublicStanding>()).results
}
export async function snapshotSeasonStandings(db:D1Database,seasonId:string){
  const season=await db.prepare('SELECT rules_version AS version FROM seasons WHERE id=?').bind(seasonId).first<{version:string}>()
  const entries=(await db.prepare('SELECT character_id AS id,artwork_avatar_key_snapshot AS key FROM season_entries WHERE season_id=?').bind(seasonId).all<{id:string;key:string|null}>()).results
  const avatars=new Map(entries.map(e=>[e.id,season?.version==='1'?legacyPortrait(e.id):e.key]))
  const standings=(await calculateSeasonStandingsV1(db,seasonId)).map(row=>({...row,avatarArtworkKey:avatars.get(row.id)??null}))
  await db.prepare('INSERT INTO season_result_snapshots(season_id,standings_json) VALUES(?,?) ON CONFLICT(season_id) DO UPDATE SET standings_json=excluded.standings_json,created_at=CURRENT_TIMESTAMP').bind(seasonId,JSON.stringify(standings)).run()
}
