import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { formatGroups, formatSchedule, seasonFormatSchema, validateRoster } from '../lib/season-format'
import { loadSeasonFormat, roundOrderSql, roundStatements } from './season-config'
import { simulateSeasonBracket } from './tournament'
import { withLifecycleLease } from './lifecycle'
import { id, iso } from './security'
import type { Env, Session } from './types'

export const configurationRoutes=new Hono<{Bindings:Env;Variables:{session:Session|null}}>()
const reason=z.string().trim().min(5).max(500)
const entrySchema=z.object({characterId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),name:z.string().trim().min(1).max(100),game:z.string().trim().min(1).max(100),summary:z.string().max(500).default(''),groupCode:z.string().regex(/^[A-P]$/),seed:z.number().int().min(1).max(256)})
const rosterSchema=z.object({entries:z.array(entrySchema).max(256),reason})
const seasonArtSchema=z.object({
  characterId:entrySchema.shape.characterId,skinName:z.string().trim().min(1).max(150),
  summary:z.string().trim().min(8).max(500),sourceUrl:z.url().refine(url=>url.startsWith('https://')),
  sourceNote:z.string().trim().min(5).max(1000),sourceType:z.enum(['official','community-wiki']),
  originalKey:z.string().min(1),galleryKey:z.string().min(1),matchKey:z.string().min(1),avatarKey:z.string().min(1),mobileKey:z.string().min(1).optional(),detailKey:z.string().min(1).optional()
})

configurationRoutes.use('*',async(c,next)=>{
  const session=c.get('session')
  if(!session||!['admin','operator'].includes(session.role))return c.json({error:'无权访问'},403)
  if(c.req.method!=='GET'&&session.role!=='admin')return c.json({error:'仅管理员可修改配置'},403)
  await next()
})
function audit(db:D1Database,seasonId:string,actor:string,action:string,reason:string,detail:unknown){return db.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,after_json,season_id) VALUES(?,?,?,?,?,?,?,?)').bind(id(),actor,action,'season',seasonId,reason,JSON.stringify(detail),seasonId)}
configurationRoutes.put('/:seasonId/artwork',zValidator('json',z.object({entries:z.array(seasonArtSchema).min(1).max(256),reason})),async c=>{
  const seasonId=c.req.param('seasonId'),input=c.req.valid('json')
  return withLifecycleLease(c.env,seasonId,async()=>{
    const season=await c.env.DB.prepare('SELECT status,rules_version AS version,starts_at AS startsAt,current_round_id AS currentRoundId FROM seasons WHERE id=?').bind(seasonId).first<{status:string;version:string;startsAt:string;currentRoundId:string|null}>()
    if(!season||season.currentRoundId||season.version!=='3'||!['draft','published'].includes(season.status)||(season.status==='published'&&season.startsAt<=iso()))return c.json({error:'仅开赛前的 S2 赛季可更新素材'},409)
    if(new Set(input.entries.map(e=>e.characterId)).size!==input.entries.length)return c.json({error:'素材名单包含重复角色'},400)
    const roster=(await c.env.DB.prepare('SELECT character_id AS id FROM season_entries WHERE season_id=?').bind(seasonId).all<{id:string}>()).results
    const statements=[]
    for(const entry of input.entries){
      if(!roster.some(r=>r.id===entry.characterId))return c.json({error:'素材角色不在本赛季名单中'},400)
      const prefix=`seasons/${seasonId}/${entry.characterId}/`
      const keys=[entry.originalKey,entry.galleryKey,entry.matchKey,entry.avatarKey]
      if(keys.some(key=>!key.startsWith(prefix)||key.includes('..')||!/^seasons\/[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(key)))return c.json({error:'素材必须使用本赛季、本角色的独立版本路径'},400)
      // Existing version keys are immutable; upload a new revision before importing.
      const extraKeys=[entry.mobileKey,entry.detailKey].filter((key):key is string=>Boolean(key))
      if(extraKeys.some(key=>!key.startsWith(prefix)||key.includes('..')||!/^seasons\/[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(key)))return c.json({error:'素材视图必须使用本赛季、本角色的版本路径'},400)
      const objects=await Promise.all([...keys,...extraKeys].map(key=>c.env.MEDIA.head(key)))
      if(objects.some(object=>!object||!object.httpMetadata?.contentType?.startsWith('image/')))return c.json({error:'素材文件尚未上传或不是图片'},400)
      statements.push(c.env.DB.prepare('UPDATE season_entries SET summary_snapshot=?,artwork_original_key_snapshot=?,artwork_gallery_key_snapshot=?,artwork_match_key_snapshot=?,artwork_avatar_key_snapshot=? WHERE season_id=? AND character_id=?').bind(entry.summary,...keys,seasonId,entry.characterId))
      statements.push(c.env.DB.prepare('INSERT INTO season_character_profiles(season_id,character_id,skin_name,source_url,source_note,source_type,verified,mobile_key,detail_key) VALUES(?,?,?,?,?,?,1,?,?) ON CONFLICT(season_id,character_id) DO UPDATE SET skin_name=excluded.skin_name,source_url=excluded.source_url,source_note=excluded.source_note,source_type=excluded.source_type,verified=1,mobile_key=excluded.mobile_key,detail_key=excluded.detail_key').bind(seasonId,entry.characterId,entry.skinName,entry.sourceUrl,entry.sourceNote,entry.sourceType,entry.mobileKey??null,entry.detailKey??null))
    }
    statements.push(audit(c.env.DB,seasonId,c.get('session')!.sub,'season_artwork_imported',input.reason,input.entries))
    await c.env.DB.batch(statements)
    return c.json({ok:true,count:input.entries.length})
  })
})
async function draft(db:D1Database,seasonId:string){
  const season=await db.prepare('SELECT status,roster_locked AS locked,starts_at AS startsAt FROM seasons WHERE id=?').bind(seasonId).first<{status:string;locked:number;startsAt:string}>()
  if(!season)throw new HTTPException(404,{message:'赛季不存在'})
  if(season.status!=='draft'||season.locked)throw new HTTPException(409,{message:'只能修改未锁定的草稿赛季'})
  const match=await db.prepare('SELECT m.id FROM matches m JOIN tournament_rounds r ON r.id=m.round_id WHERE r.season_id=? LIMIT 1').bind(seasonId).first()
  if(match)throw new HTTPException(409,{message:'草稿已有对局，不能替换配置或名单'})
  return season
}
configurationRoutes.get('/:seasonId/configuration',async c=>{
  const seasonId=c.req.param('seasonId'),format=await loadSeasonFormat(c.env.DB,seasonId)
  const entries=(await c.env.DB.prepare('SELECT se.character_id AS characterId,c.name,g.name AS game,c.summary,se.group_code AS groupCode,se.seed FROM season_entries se JOIN characters c ON c.id=se.character_id JOIN games g ON g.id=c.game_id WHERE se.season_id=? ORDER BY se.seed').bind(seasonId).all<z.infer<typeof entrySchema>>()).results
  const rounds=(await c.env.DB.prepare(`SELECT id,stage,round_number AS roundNumber,name,status,starts_at AS startsAt,ends_at AS endsAt FROM tournament_rounds WHERE season_id=? ORDER BY ${roundOrderSql}`).bind(seasonId).all()).results
  return c.json({format,entries,rounds,validation:validateRoster(entries,format)})
})
configurationRoutes.put('/:seasonId/automation',zValidator('json',z.object({enabled:z.boolean(),reason})),async c=>{
  const seasonId=c.req.param('seasonId'),input=c.req.valid('json')
  return withLifecycleLease(c.env,seasonId,async()=>{
    const season=await c.env.DB.prepare('SELECT status,is_current AS isCurrent FROM seasons WHERE id=?').bind(seasonId).first<{status:string;isCurrent:number}>()
    if(!season?.isCurrent||!['published','live'].includes(season.status))return c.json({error:'仅当前已发布或进行中的赛季可切换自动推进'},409)
    await c.env.DB.batch([c.env.DB.prepare('UPDATE seasons SET schedule_mode=?,updated_at=? WHERE id=?').bind(input.enabled?'scheduled':'manual',iso(),seasonId),audit(c.env.DB,seasonId,c.get('session')!.sub,'season_automation_updated',input.reason,{enabled:input.enabled})])
    return c.json({ok:true})
  })
})
configurationRoutes.put('/:seasonId/configuration',zValidator('json',z.object({format:seasonFormatSchema,startsAt:z.string().datetime(),reason})),async c=>{
  const seasonId=c.req.param('seasonId'),input=c.req.valid('json')
  return withLifecycleLease(c.env,seasonId,async()=>{
    await draft(c.env.DB,seasonId)
    const schedule=formatSchedule(input.format,input.startsAt)
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM tournament_rounds WHERE season_id=?').bind(seasonId),
      ...roundStatements(c.env.DB,seasonId,input.format,input.startsAt),
      c.env.DB.prepare("UPDATE seasons SET format_json=?,rules_version=?,starts_at=?,ends_at=?,updated_at=?,updated_by=? WHERE id=?").bind(JSON.stringify(input.format),String(input.format.version),input.startsAt,schedule.at(-1)!.endsAt,iso(),c.get('session')!.sub,seasonId),
      audit(c.env.DB,seasonId,c.get('session')!.sub,'season_configuration_updated',input.reason,{format:input.format,startsAt:input.startsAt})
    ])
    return c.json({ok:true})
  })
})
configurationRoutes.put('/:seasonId/roster',zValidator('json',rosterSchema),async c=>{
  const seasonId=c.req.param('seasonId'),input=c.req.valid('json')
  return withLifecycleLease(c.env,seasonId,async()=>{
    await draft(c.env.DB,seasonId)
    const format=await loadSeasonFormat(c.env.DB,seasonId),groups=formatGroups(format),entries=input.entries
    if(entries.length>format.participants||new Set(entries.map(e=>e.characterId)).size!==entries.length||new Set(entries.map(e=>e.seed)).size!==entries.length)return c.json({error:'名单超出人数限制，或角色 ID／种子重复'},400)
    if(entries.some(e=>!groups.includes(e.groupCode)||e.seed>format.participants)||groups.some(g=>entries.filter(e=>e.groupCode===g).length>format.participants/groups.length))return c.json({error:'分组或种子超出本赛季配置'},400)
    const existing=(await c.env.DB.prepare('SELECT c.id,c.name,g.name AS game FROM characters c JOIN games g ON g.id=c.game_id').all<{id:string;name:string;game:string}>()).results
    const byId=new Map(existing.map(e=>[e.id,e]))
    const collision=entries.find(e=>byId.has(e.characterId)&&(byId.get(e.characterId)!.name!==e.name||byId.get(e.characterId)!.game!==e.game))
    if(collision)return c.json({error:`角色 ID ${collision.characterId} 已属于其他角色，请保留原资料或使用新 ID`},409)
    const rows=JSON.stringify(entries.map(e=>({...e,entryId:id()})))
    const games=JSON.stringify([...new Set(entries.map(e=>e.game))].map(name=>({id:id(),name})))
    const statements=[
      c.env.DB.prepare("DELETE FROM season_character_profiles WHERE season_id=?").bind(seasonId),
      c.env.DB.prepare('DELETE FROM season_entries WHERE season_id=?').bind(seasonId),
      c.env.DB.prepare("INSERT INTO games(id,name,sort_order) SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),999 FROM json_each(?) WHERE 1 ON CONFLICT(name) DO NOTHING").bind(games),
      c.env.DB.prepare("INSERT INTO characters(id,game_id,name,summary,status) SELECT json_extract(value,'$.characterId'),(SELECT id FROM games WHERE name=json_extract(value,'$.game')),json_extract(value,'$.name'),json_extract(value,'$.summary'),'published' FROM json_each(?) WHERE 1 ON CONFLICT(id) DO NOTHING").bind(rows),
      c.env.DB.prepare("INSERT INTO season_entries(id,season_id,character_id,group_code,seed) SELECT json_extract(value,'$.entryId'),?,json_extract(value,'$.characterId'),json_extract(value,'$.groupCode'),json_extract(value,'$.seed') FROM json_each(?)").bind(seasonId,rows)
    ]
    statements.push(audit(c.env.DB,seasonId,c.get('session')!.sub,'season_roster_imported',input.reason,{count:entries.length}))
    await c.env.DB.batch(statements)
    return c.json({ok:true,validation:validateRoster(entries,format)})
  })
})
configurationRoutes.get('/:seasonId/simulation',async c=>{
  const seasonId=c.req.param('seasonId'),format=await loadSeasonFormat(c.env.DB,seasonId)
  const entries=(await c.env.DB.prepare('SELECT se.character_id AS id,g.name AS game,se.group_code AS groupCode,se.seed FROM season_entries se JOIN characters c ON c.id=se.character_id JOIN games g ON g.id=c.game_id WHERE se.season_id=?').bind(seasonId).all<{id:string;game:string;groupCode:string;seed:number}>()).results
  const validation=validateRoster(entries.map(e=>({...e,characterId:e.id})),format)
  if(!validation.valid)return c.json({error:validation.error},409)
  return c.json({simulation:simulateSeasonBracket(entries,(a,b)=>a.seed<b.seed?a.id:b.id,format),notice:'仅内存模拟，以种子较小者获胜；没有创建真实对局或投票。'})
})
configurationRoutes.put('/:seasonId/schedule',zValidator('json',z.object({rounds:z.array(z.object({id:z.string().min(1).max(150),startsAt:z.string().datetime(),endsAt:z.string().datetime()})).min(1).max(24),reason})),async c=>{
  const seasonId=c.req.param('seasonId'),input=c.req.valid('json')
  return withLifecycleLease(c.env,seasonId,async()=>{
    const season=await c.env.DB.prepare('SELECT status FROM seasons WHERE id=?').bind(seasonId).first<{status:string}>()
    if(!season||!['draft','published','live'].includes(season.status))return c.json({error:'历史赛季排期不可修改'},409)
    const rounds=(await c.env.DB.prepare(`SELECT id,status,starts_at AS startsAt,ends_at AS endsAt FROM tournament_rounds WHERE season_id=? ORDER BY ${roundOrderSql}`).bind(seasonId).all<{id:string;status:string;startsAt:string;endsAt:string}>()).results
    if(new Set(input.rounds.map(r=>r.id)).size!==input.rounds.length)return c.json({error:'轮次重复'},400)
    const changes=new Map(input.rounds.map(r=>[r.id,r]))
    if(input.rounds.some(r=>!rounds.some(old=>old.id===r.id&&old.status==='scheduled')))return c.json({error:'只能调整本赛季尚未开始的轮次'},409)
    const updated=rounds.map(r=>({...r,...changes.get(r.id)}))
    const format=await loadSeasonFormat(c.env.DB,seasonId)
    if(format.version===3&&updated.some((r,i)=>(Date.parse(r.startsAt)+8*3_600_000)%86_400_000!==0||Date.parse(r.endsAt)-Date.parse(r.startsAt)!==format.rounds[i].durationHours*3_600_000))return c.json({error:'分日赛程必须保持北京时间零点和配置时长'},400)
    if(updated.some((r,i)=>Date.parse(r.endsAt)<=Date.parse(r.startsAt)||(i>0&&Date.parse(r.startsAt)<Date.parse(updated[i-1].endsAt))))return c.json({error:'结束须晚于开始，且后续轮次不能早于前序结束'},400)
    await c.env.DB.batch([
      ...input.rounds.map(r=>c.env.DB.prepare('UPDATE tournament_rounds SET starts_at=?,ends_at=? WHERE id=? AND season_id=?').bind(r.startsAt,r.endsAt,r.id,seasonId)),
      c.env.DB.prepare('UPDATE seasons SET starts_at=?,ends_at=?,updated_at=? WHERE id=?').bind(updated[0].startsAt,updated.at(-1)!.endsAt,iso(),seasonId),
      audit(c.env.DB,seasonId,c.get('session')!.sub,'season_schedule_updated',input.reason,{before:rounds,after:updated})
    ])
    return c.json({ok:true})
  })
})
