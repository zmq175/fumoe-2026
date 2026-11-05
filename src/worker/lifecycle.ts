import { matchStartsSql, matchEndsSql, refreshDailyMatches } from './match-windows'
import { closeRoundAndAdvance, ensureRoundCanStart } from './progression'
import { id, iso } from './security'
import type { Env } from './types'
import { loadSeasonFormat, roundOrderSql } from './season-config'
import { snapshotSeasonStandings } from './season-results'

type Round = { id:string; seasonId:string; stage:'swiss'|'knockout'; roundNumber:number; status:string; startsAt?:string; endsAt?:string }
type LifecycleEnv = Pick<Env, 'DB'>
type Advancement = { nextRoundId:string|null; championId:string|null }
type Season = { id:string; status:string; scheduleMode:string; currentRoundId:string|null }

const leaseDuration=5*60_000
const roundOrder=roundOrderSql

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
  const rounds=(await db.prepare(`SELECT id,starts_at AS startsAt,ends_at AS endsAt FROM tournament_rounds WHERE season_id=? AND status='scheduled' AND ${roundOrder}>=(SELECT ${roundOrder} FROM tournament_rounds WHERE id=?) ORDER BY ${roundOrder}`).bind(round.seasonId,round.id).all<{id:string;startsAt:string;endsAt:string}>()).results
  if(!rounds.length)return
  const shift=now.getTime()-new Date(rounds[0].startsAt).getTime()
  const moved=rounds.map(item=>({...item,startsAt:new Date(new Date(item.startsAt).getTime()+shift).toISOString(),endsAt:new Date(new Date(item.endsAt).getTime()+shift).toISOString()}))
  const statements=moved.map(item=>db.prepare('UPDATE tournament_rounds SET starts_at=?,ends_at=? WHERE id=?').bind(item.startsAt,item.endsAt,item.id))
  statements.push(db.prepare('UPDATE seasons SET ends_at=?,updated_at=? WHERE id=?').bind(moved.at(-1)!.endsAt,now.toISOString(),round.seasonId))
  await db.batch(statements)
}

export async function startRound(env:LifecycleEnv, round:Round, actorId?:string, reason?:string, now=new Date()) {
  await ensureRoundCanStart(env.DB,round)
  const format=await loadSeasonFormat(env.DB,round.seasonId)
  if(format.version===3&&(!round.startsAt||round.startsAt>now.toISOString()))throw new Error('尚未到设定的开赛时间')
  if(format.version===3&&shouldRebaseRound(round,now))throw new Error('排期已过期，请核对赛程后恢复，不能自动移动 S2 时间')
  const recover=format.version!==3&&(Boolean(actorId)||shouldRebaseRound(round,now))
  if(recover)await rebaseRemainingSchedule(env.DB,round,now)
  const timestamp=now.toISOString()
  await env.DB.batch([
    env.DB.prepare(`UPDATE tournament_rounds SET status='live' WHERE id=? AND status='scheduled'`).bind(round.id),
    env.DB.prepare(`UPDATE matches SET status='live' WHERE round_id=? AND status='scheduled'`).bind(round.id),
    env.DB.prepare(`UPDATE seasons SET status='live',current_round_id=?,updated_at=?,updated_by=? WHERE id=?`).bind(round.id,timestamp,actorId??null,round.seasonId)
  ])
  await refreshDailyMatches(env.DB,round.id,timestamp)
  await audit(env.DB,actorId?'round_started':recover?'round_recovered_automatically':'round_started_automatically',round,{status:'live',scheduleRebased:recover},actorId,reason)
}

export async function closeRound(env:LifecycleEnv, round:Round, actorId?:string, reason?:string) {
  const advancement=await closeRoundAndAdvance(env,round)
  const timestamp=iso()
  const state=completionSeasonState(advancement,round.id)
  if(state.championId)await snapshotSeasonStandings(env.DB,round.seasonId)
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

// One read on the visitor path. Only acquire a lease/write when a real boundary
// is due; Cron still performs its full check independently every minute.
export function requestLifecycleDueStatement(db:D1Database,now=new Date()) {
  return db.prepare(`SELECT 1 AS due FROM seasons s
    WHERE s.is_current=1 AND s.rules_version='3' AND s.schedule_mode='scheduled'
      AND s.status IN ('published','live') AND (
        EXISTS(SELECT 1 FROM tournament_rounds r WHERE r.season_id=s.id AND r.status='live' AND (
          r.ends_at<=?1 OR EXISTS(SELECT 1 FROM matches m WHERE m.round_id=r.id
            AND m.status IN ('scheduled','live') AND EXISTS(SELECT 1 FROM match_windows w WHERE w.match_id=m.id)
            AND m.status!=CASE WHEN ${matchEndsSql}<=?1 THEN 'closed' WHEN ${matchStartsSql}<=?1 THEN 'live' ELSE 'scheduled' END)
        )) OR (
          NOT EXISTS(SELECT 1 FROM tournament_rounds r WHERE r.season_id=s.id AND r.status='live')
          AND NOT(s.status='published' AND s.current_round_id IS NOT NULL)
          AND EXISTS(SELECT 1 FROM tournament_rounds r WHERE r.season_id=s.id AND r.status='scheduled'
            AND (s.current_round_id IS NULL OR r.id=s.current_round_id) AND r.starts_at<=?1)
        )
      ) LIMIT 1`).bind(now.toISOString())
}

export async function hasDueRequestLifecycle(db:D1Database,now=new Date()) {
  return Boolean(await requestLifecycleDueStatement(db,now).first())
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
    if(live[0])await refreshDailyMatches(env.DB,live[0].id,timestamp)
    let closed=0; let nextRoundId:string|null=null
    if(live[0]&&live[0].endsAt&&live[0].endsAt<=timestamp) {
      try { const advancement=await closeRound(env,live[0]);closed=1;nextRoundId=advancement.nextRoundId }
      catch(error) { await audit(env.DB,'round_auto_close_failed',live[0],{error:error instanceof Error?error.message:'无法自动关闭'});throw error }
    }
    if(live.length&&!closed)return {closed:0,started:0,locked:false}
    const next=nextRoundId
      ? await env.DB.prepare(`SELECT id,season_id AS seasonId,stage,round_number AS roundNumber,status,starts_at AS startsAt,ends_at AS endsAt FROM tournament_rounds WHERE id=? AND season_id=? AND status='scheduled'`).bind(nextRoundId,season.id).first<Round>()
      : await scheduledRound(env.DB,season)
    if(!next||!next.startsAt||next.startsAt>timestamp)return {closed,started:0,locked:false}
    try { await startRound(env,next,undefined,undefined,now);return {closed,started:1,locked:false} }
    catch(error) { await audit(env.DB,'round_auto_start_skipped',next,{error:error instanceof Error?error.message:'无法自动开始'});return {closed,started:0,locked:false,failed:true} }
  } finally { await releaseLease(env.DB,season.id,token) }
}

export async function withLifecycleLease<T>(env:LifecycleEnv,seasonId:string,operation:()=>Promise<T>,now=new Date()) {
  const token=await acquireLease(env.DB,seasonId,now)
  if(!token)throw new Error('赛程状态正在变更，请稍后重试')
  try{return await operation()}finally{await releaseLease(env.DB,seasonId,token)}
}
