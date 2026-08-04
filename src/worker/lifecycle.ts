import { closeRoundAndAdvance, ensureRoundCanStart } from './progression'
import { id, iso } from './security'
import type { Env } from './types'

type Round = { id:string; seasonId:string; stage:'swiss'|'knockout'; roundNumber:number; status:string; startsAt?:string; endsAt?:string }
type LifecycleEnv = Pick<Env, 'DB'>
type Advancement = { nextRoundId:string|null; championId:string|null }

export function completionSeasonState(advancement: Advancement, closedRoundId: string) {
  return {
    status: advancement.championId ? 'completed' : 'live',
    currentRoundId: advancement.nextRoundId ?? closedRoundId,
    championId: advancement.championId
  }
}

async function audit(db:D1Database, action:string, round:Round, detail:unknown, actorId?:string, reason?:string) {
  await db.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,after_json,season_id) VALUES(?,?,?,?,?,?,?,?)').bind(id(),actorId??null,action,'round',round.id,reason??null,JSON.stringify(detail),round.seasonId).run()
}

export async function startRound(env:LifecycleEnv, round:Round, actorId?:string, reason?:string, now=new Date()) {
  await ensureRoundCanStart(env.DB,round)
  const timestamp=now.toISOString()
  await env.DB.batch([
    env.DB.prepare(`UPDATE tournament_rounds SET status='live',starts_at=CASE WHEN ? THEN ? ELSE starts_at END,ends_at=CASE WHEN ? THEN ? ELSE ends_at END WHERE id=?`).bind(Boolean(actorId),timestamp,Boolean(actorId),new Date(now.getTime()+86_400_000).toISOString(),round.id),
    env.DB.prepare(`UPDATE matches SET status='live' WHERE round_id=? AND status!='closed'`).bind(round.id),
    env.DB.prepare(`UPDATE seasons SET status='live',current_round_id=?,updated_at=?,updated_by=? WHERE id=?`).bind(round.id,timestamp,actorId??null,round.seasonId)
  ])
  await audit(env.DB,actorId?'round_started':'round_started_automatically',round,{status:'live'},actorId,reason)
}

export async function closeRound(env:LifecycleEnv, round:Round, actorId?:string, reason?:string) {
  const advancement=await closeRoundAndAdvance(env,round)
  const timestamp=iso()
  const state=completionSeasonState(advancement,round.id)
  await env.DB.batch([
    env.DB.prepare(`UPDATE tournament_rounds SET status='closed' WHERE id=?`).bind(round.id),
    env.DB.prepare(`UPDATE seasons SET status=?,current_round_id=?,champion_character_id=?,completed_at=CASE WHEN ?='completed' THEN ? ELSE completed_at END,updated_at=?,updated_by=? WHERE id=?`).bind(state.status,state.currentRoundId,state.championId,state.status,timestamp,timestamp,actorId??null,round.seasonId)
  ])
  await audit(env.DB,actorId?'round_close':'round_closed_automatically',round,advancement,actorId,reason)
  return advancement
}

export async function runScheduledLifecycle(env:LifecycleEnv, now=new Date()) {
  const season=await env.DB.prepare(`SELECT id,schedule_mode AS scheduleMode FROM seasons WHERE is_current=1 AND status IN ('published','live')`).first<{id:string;scheduleMode:string}>()
  if(!season||season.scheduleMode!=='scheduled') return {closed:0,started:0}
  const timestamp=now.toISOString()
  const due=await env.DB.prepare(`SELECT id,season_id AS seasonId,stage,round_number AS roundNumber,status,starts_at AS startsAt,ends_at AS endsAt FROM tournament_rounds WHERE season_id=? AND status='live' AND ends_at<=? ORDER BY ends_at`).bind(season.id,timestamp).all<Round>()
  let closed=0
  for(const round of due.results) { await closeRound(env,round); closed++ }
  const next=await env.DB.prepare(`SELECT id,season_id AS seasonId,stage,round_number AS roundNumber,status,starts_at AS startsAt,ends_at AS endsAt FROM tournament_rounds WHERE season_id=? AND status='scheduled' AND starts_at<=? AND ends_at>? ORDER BY starts_at LIMIT 1`).bind(season.id,timestamp,timestamp).first<Round>()
  if(!next) return {closed,started:0}
  try { await startRound(env,next,undefined,undefined,now); return {closed,started:1} }
  catch(error) { await audit(env.DB,'round_auto_start_skipped',next,{error:error instanceof Error?error.message:'无法自动开始'}); return {closed,started:0} }
}
