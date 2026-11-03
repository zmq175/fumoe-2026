// Aliases m/r are shared by public and voting queries. No window means the legacy round times.
export const matchStartsSql="COALESCE((SELECT strftime('%Y-%m-%dT%H:%M:%fZ',r.starts_at,'+'||w.offset_hours||' hours') FROM match_windows w WHERE w.match_id=m.id),r.starts_at)"
export const matchEndsSql="COALESCE((SELECT strftime('%Y-%m-%dT%H:%M:%fZ',r.starts_at,'+'||(w.offset_hours+w.duration_hours)||' hours') FROM match_windows w WHERE w.match_id=m.id),r.ends_at)"

export async function refreshDailyMatches(db:D1Database,roundId:string,now:string){
  // Never reopen a closed/review match. Exact vote boundaries are checked independently by the API.
  await db.prepare(`UPDATE matches SET status=CASE WHEN (SELECT ${matchEndsSql} FROM matches m JOIN tournament_rounds r ON r.id=m.round_id WHERE m.id=matches.id)<=? THEN 'closed' WHEN (SELECT ${matchStartsSql} FROM matches m JOIN tournament_rounds r ON r.id=m.round_id WHERE m.id=matches.id)<=? THEN 'live' ELSE 'scheduled' END WHERE round_id=? AND id IN (SELECT match_id FROM match_windows) AND status IN ('scheduled','live')`).bind(now,now,roundId).run()
}
