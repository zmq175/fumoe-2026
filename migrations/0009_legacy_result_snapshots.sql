-- Capture legacy final rankings using the original scoring and ordering policy.
-- Matches, votes, winners and champions are not changed.
INSERT INTO season_result_snapshots(season_id,standings_json)
SELECT archive.id,(SELECT json_group_array(json_object('groupCode',ranked.groupCode,'id',ranked.id,'name',ranked.name,'game',ranked.game,'seed',ranked.seed,'points',ranked.points,'voteDifference',ranked.voteDifference,'opponentPoints',ranked.opponentPoints)) FROM (
WITH swiss AS (
    SELECT m.group_code AS groupCode,m.left_character_id AS characterId,m.right_character_id AS opponentId,m.left_votes AS votesFor,m.right_votes AS votesAgainst FROM matches m JOIN tournament_rounds r ON r.id=m.round_id WHERE r.season_id=archive.id AND r.stage='swiss' AND m.status IN ('live','closed')
    UNION ALL
    SELECT m.group_code,m.right_character_id,m.left_character_id,m.right_votes,m.left_votes FROM matches m JOIN tournament_rounds r ON r.id=m.round_id WHERE r.season_id=archive.id AND r.stage='swiss' AND m.status IN ('live','closed')
  ),base AS (
    SELECT se.group_code AS groupCode,se.character_id AS id,COALESCE(se.name_snapshot,c.name) AS name,COALESCE(se.game_snapshot,g.name) AS game,se.seed FROM season_entries se JOIN characters c ON c.id=se.character_id JOIN games g ON g.id=c.game_id WHERE se.season_id=archive.id
  ),standings AS (
    SELECT b.groupCode,b.id,b.name,b.game,b.seed,COALESCE(SUM(CASE WHEN s.votesFor=s.votesAgainst THEN 1 WHEN s.votesFor>s.votesAgainst THEN 3 ELSE 0 END),0) AS points,COALESCE(SUM(s.votesFor-s.votesAgainst),0) AS voteDifference FROM base b LEFT JOIN swiss s ON s.characterId=b.id GROUP BY b.groupCode,b.id,b.name,b.game,b.seed
  )
  SELECT standings.groupCode,standings.id,standings.name,standings.game,standings.seed,standings.points,standings.voteDifference,COALESCE(SUM(opponent.points),0) AS opponentPoints FROM standings LEFT JOIN swiss ON swiss.characterId=standings.id LEFT JOIN standings opponent ON opponent.id=swiss.opponentId GROUP BY standings.groupCode,standings.id,standings.name,standings.game,standings.seed,standings.points,standings.voteDifference ORDER BY standings.groupCode,standings.points DESC,opponentPoints DESC,standings.voteDifference DESC,standings.seed ASC
) AS ranked)
FROM seasons archive WHERE archive.status IN ('completed','archived');
