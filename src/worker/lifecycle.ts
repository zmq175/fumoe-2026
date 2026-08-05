import { closeRoundAndAdvance, ensureRoundCanStart } from './progression'
import { id, iso } from './security'
import type { Env } from './types'

type Round = { id:string; seasonId:string; stage:'swiss'|'knockout'; roundNumber:number; status:string; startsAt?:string; endsAt?:string }
type LifecycleEnv = Pick<Env, 'DB'>
type Advancement = { nextRoundId:string|null; championId:string|null }
type Season = { id:string; status:string; scheduleMode:string; currentRoundId:string|null }

const day=86_400_000
const leaseDuration=5*60_000
const roundOrder=`CASE stage WHEN 'swiss' THEN round_number ELSE 3+round_number END`

export function completionSeasonState(advancement: Advancement, closedRoundId: string) {
  return {
    status: advancement.championId ? 'completed' : 'live',
    currentRoundId: advancement.nextRoundId ?? closedRoundId,
    championId: advancement.championId
  }
}

export function shouldRebaseRound(round:Pick<Round,'startsAt'|'endsAt'>,now:Date) {
  const startsAt=round.startsAt?new Date(round.startsAt).getTime():Number.NaN
  const endsAt=round.endsAt?new Date(round.endsAt).getTime():Number.NaN
  return !Number.isFinite(startsAt)||!Number.isFinite(endsAt)||endsAt<=now.getTime()
}

async function audit(db:D1Database, action:string, round:Round, detail:unknown, actorId?:string, reason?:string) {
  await db.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,after_json,season_id) VALUES(?,?,?,?,?,?,?,?)').bind(id(),actorId??null,action,'round',round.id,reason??null,JSON.stringify(detail),round.seasonId).run()
}

async function acquireLease(db:D1Database,seasonId:string,now:Date) {
  const token=id(); const expiresAt=new Date(now.getTime()+leaseDuration).toISOString()
  const result=await db.prepare(`INSERT INTO tournament_lifecycle_leases(season_id,token,expires_at) VALUES(?,?,?) ON CONFLICT(season_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE tournament_lifecycle_leases.expires_at<=?`).bind(seasonId,token,expiresAt,now.toISOString()).run()
  return result.meta.changes?token:null
}

async function releaseLease(db:D1Database,seasonId:string,token:string) {
  await db.prepare('DELETE FROM tournament_lifecycle_leases WHERE season_id=? AND token=?').bind(seasonId,token).run()
}

async function rebaseRemainingSchedule(db:D1Database,round:Round,now:Date) {
  const rounds=(await db.prepare(`SELECT id FROM tournament_rounds WHERE season_id=? AND status='scheduled' AND ${roundOrder}>=(SELECT ${roundOrder} FROM tournament_rounds WHERE id=?) ORDER BY ${roundOrder}`).bind(round.seasonId,round.id).all<{id:string}>()).results
  if(!rounds.length)return
  const statements=rounds.map((item,index)=>db.prepare('UPDATE tournament_rounds SET starts_at=?,ends_at=? WHERE id=?').bind(new Date(now.getTime()+index*day).toISOString(),new Date(now.getTime()+(index+1)*day).toISOString(),item.id))
  statements.push(db.prepare('UPDATE seasons SET ends_at=?,updated_at=? WHERE id=?').bind(new Date(now.getTime()+rounds.length*day).toISOString(),now.toISOString(),round.seasonId))
  await db.batch(statements)
}

export async function startRound(env:LifecycleEnv, round:Round, actorId?:string, reason?:string, now=new Date()) {
  await ensureRoundCanStart(env.DB,round)
  const recover=Boolean(actorId)||shouldRebaseRound(round,now)
  if(recover)await rebaseRemainingSchedule(env.DB,round,now)
  const timestamp=now.toISOString()
  await env.DB.batch([
    env.DB.prepare(`UPDATE tournament_rounds SET status='live' WHERE id=? AND status='scheduled'`).bind(round.id),
    env.DB.prepare(`UPDATE matches SET status='live' WHERE round_id=? AND status='scheduled'`).bind(round.id),
    env.DB.prepare(`UPDATE seasons SET status='live',current_round_id=?,updated_at=?,updated_by=? WHERE id=?`).bind(round.id,timestamp,actorId??null,round.seasonId)
  ])
  await audit(env.DB,actorId?'round_started':recover?'round_recovered_automatically':'round_started_automatically',round,{status:'live',scheduleRebased:recover},actorId,reason)
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

async function scheduledRound(db:D1Database,season:Season) {
  if(season.status==='published'&&season.currentRoundId)return null
  if(season.currentRoundId)return db.prepare(`SELECT id,season_id AS seasonId,stage,round_number AS roundNumber,status,starts_at AS startsAt,ends_at AS endsAt FROM tournament_rounds WHERE id=? AND season_id=? AND status='scheduled'`).bind(season.currentRoundId,season.id).first<Round>()
  return db.prepare(`SELECT id,season_id AS seasonId,stage,round_number AS roundNumber,status,starts_at AS startsAt,ends_at AS endsAt FROM tournament_rounds WHERE season_id=? AND status='scheduled' ORDER BY ${roundOrder} LIMIT 1`).bind(season.id).first<Round>()
}

export async function runScheduledLifecycle(env:LifecycleEnv, now=new Date()) {
  const season=await env.DB.prepare(`SELECT id,status,schedule_mode AS scheduleMode,current_round_id AS currentRoundId FROM seasons WHERE is_current=1 AND status IN ('published','live')`).first<Season>()
  if(!season||season.scheduleMode!=='scheduled')return {closed:0,started:0,locked:false}
  const token=await acquireLease(env.DB,season.id,now)
  if(!token)return {closed:0,started:0,locked:true}
  try {
    const timestamp=now.toISOString()
    const live=(await env.DB.prepare(`SELECT id,season_id AS seasonId,stage,round_number AS roundNumber,status,starts_at AS startsAt,ends_at AS endsAt FROM tournament_rounds WHERE season_id=? AND status='live' ORDER BY ${roundOrder}`).bind(season.id).all<Round>()).results
    if(live.length>1)throw new Error('检测到多个进行中轮次，已停止自动推进')
    let closed=0; let nextRoundId:string|null=null
    if(live[0]&&live[0].endsAt&&live[0].endsAt<=timestamp) {
      try { const advancement=await closeRound(env,live[0]);closed=1;nextRoundId=advancement.nextRoundId }
      catch(error) { await audit(env.DB,'round_auto_close_failed',live[0],{error:error instanceof Error?error.message:'无法自动关闭'});throw error }
    }
    if(live.length&&!closed)return {closed:0,started:0,locked:false}
    const next=nextRoundId
      ? await env.DB.prepare(`SELECT id,season_id AS seasonId,stage,round_number AS roundNumber,status,starts_at AS startsAt,ends_at AS endsAt FROM tournament_rounds WHERE id=? AND season_id=? AND status='scheduled'`).bind(nextRoundId,season.id).first<Round>()
      : await scheduledRound(env.DB,season)
    if(!next||!next.startsAt||(!closed&&next.startsAt>timestamp))return {closed,started:0,locked:false}
    try { await startRound(env,next,undefined,undefined,now);return {closed,started:1,locked:false} }
    catch(error) { await audit(env.DB,'round_auto_start_skipped',next,{error:error instanceof Error?error.message:'无法自动开始'});return {closed,started:0,locked:false} }
  } finally { await releaseLease(env.DB,season.id,token) }
}

export async function withLifecycleLease<T>(env:LifecycleEnv,seasonId:string,operation:()=>Promise<T>,now=new Date()) {
  const token=await acquireLease(env.DB,seasonId,now)
  if(!token)throw new Error('赛程状态正在变更，请稍后重试')
  try{return await operation()}finally{await releaseLease(env.DB,seasonId,token)}
}
