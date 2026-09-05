import { legacyPortrait } from '../lib/legacy-assets'
import { calculateSeasonStandingsV1, snapshotSeasonStandings } from './season-results'
import { readFormat, legacyFormat, formatSchedule, formatGroups, seasonFormatSchema } from '../lib/season-format'
import { insertPairStatement, loadSeasonFormat, roundStatements } from './season-config'
import { firstRoundPairs } from './tournament'
import { configurationRoutes } from './configuration-routes'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { cors } from 'hono/cors'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { sendLoginCode } from './email'
import { clientIp, cookie, createSession, developmentBypassEnabled, digest, getCookie, id, isDisposableEmail, iso, loginChallengeAllowed, normalizeEmail, readSession, runtimeConfigIssues, sessionForUser, voteRiskDecision } from './security'
import { normalizeVoteRequest, planBatchVotes, scheduleScorePublications, type ExistingVote, type VoteMatch } from './vote-batch'
import { MatchRoom } from './match-room'
import { closeRound, runScheduledLifecycle, startRound, withLifecycleLease } from './lifecycle'
import { buildSeasonSlug, canEditRoster, canEditSeason, validateSeasonRoster, type SeasonStatus } from './seasons'
import { artworkCacheControl, artworkKeys, mediaFallbackIsImage } from './artwork'
import type { Env, Role, Session } from './types'

export { MatchRoom }

type Variables = { session: Session | null }
const app = new Hono<{ Bindings: Env, Variables: Variables }>()
app.use('/api/*', cors({ origin: (origin, c) => origin === c.env.APP_ORIGIN ? origin : c.env.APP_ORIGIN, credentials: true }))
app.use('/api/*', async (c, next) => {
  const claims=await readSession(getCookie(c.req.header('Cookie'),'fumoe_session'),c.env)
  const user=claims?await c.env.DB.prepare('SELECT id,email,role,status FROM users WHERE id=?').bind(claims.sub).first<{id:string;email:string;role:Role;status:string}>():null
  c.set('session',sessionForUser(claims,user))
  await next()
})

app.route('/api/admin/seasons',configurationRoutes)

const requestCodeInput = z.object({ email: z.string().email().max(254), turnstileToken: z.string().min(1).optional() })
const verifyCodeInput = z.object({ email: z.string().email().max(254), code: z.string().regex(/^\d{6}$/) })
const voteChoiceInput=z.object({matchId:z.string().min(1).max(80),characterId:z.string().min(1).max(80)})
const voteInput = z.union([
  z.object({choices:z.array(voteChoiceInput).min(1).max(128),deviceFingerprint:z.string().min(12).max(256).optional()}),
  voteChoiceInput.extend({deviceFingerprint:z.string().min(12).max(256).optional(),turnstileToken:z.string().optional()})
])
const editMatchInput = z.object({ status: z.enum(['scheduled', 'live', 'closed', 'review']).optional(), leftVotes: z.number().int().min(0).optional(), rightVotes: z.number().int().min(0).optional(), reason: z.string().min(5).max(500) })
const reviewVoteInput = z.object({ action: z.enum(['approve', 'reject', 'revoke']), reason: z.string().min(5).max(500) })
const settingInput = z.object({ value: z.string().max(5000), reason: z.string().min(5).max(500) })
const characterUpdateInput = z.object({ summary: z.string().min(8).max(500).optional(), groupCode: z.string().regex(/^[A-P]$/).optional(), seed: z.number().int().min(1).max(256).optional(), artworkSourceUrl: z.string().url().optional(), artworkSourceNote: z.string().max(500).optional(), artworkSourceType: z.enum(['official','community-wiki','pending']).optional(), artworkQualityStatus: z.enum(['pending','verified','rejected']).optional(), artworkFocusX: z.number().int().min(0).max(100).optional(), artworkFocusY: z.number().int().min(0).max(100).optional(), reason: z.string().min(5).max(500) })
const roundControlInput = z.object({ action: z.enum(['start-now','pause','resume','close','publish-schedule','lock-roster','unlock-roster']), roundId: z.string().max(80).optional(), scheduledStartAt: z.string().datetime().optional(), reason: z.string().min(5).max(500) })
const localActionInput = z.object({ action: z.enum(['reset','simulate-round','clear-votes']), reason: z.string().min(5).max(500) })
const cropAreaInput=z.object({x:z.number().min(0).max(100),y:z.number().min(0).max(100),width:z.number().positive().max(100),height:z.number().positive().max(100)}).refine(a=>a.x+a.width<=100.001&&a.y+a.height<=100.001)
const cropInput = z.object({ x: z.number().min(-5000).max(5000), y: z.number().min(-5000).max(5000), zoom: z.number().min(1).max(4), rotation:z.number().min(0).max(270).optional().default(0),area:cropAreaInput.optional() })
const artworkMetadataInput = z.object({ summary:z.string().min(8).max(500), sourceUrl: z.string().url().optional(), sourceNote: z.string().max(500).optional(), sourceType: z.enum(['official','community-wiki','pending']), reason: z.string().min(5).max(500), galleryCrop: cropInput, matchCrop: cropInput, avatarCrop: cropInput })
const seasonCreateInput = z.object({ name:z.string().min(3).max(80), slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(), startsAt:z.string().datetime(), copyFromSeasonId:z.string().max(80).optional(), format:seasonFormatSchema.optional(), reason:z.string().min(5).max(500) })
const seasonActionInput = z.object({ action:z.enum(['publish','archive','unlock-history','lock-history']), reason:z.string().min(5).max(500) })
const seasonUpdateInput = z.object({ name:z.string().min(3).max(80).optional(), announcement:z.string().max(5000).optional(), reason:z.string().min(5).max(500) })
const seasonEntryInput = z.object({ groupCode:z.string().regex(/^[A-P]$/), seed:z.number().int().min(1).max(256), reason:z.string().min(5).max(500) })
const imageMimeTypes = new Set(['image/png','image/jpeg','image/webp'])
async function validImageSignature(file: File) { const bytes = new Uint8Array(await file.slice(0,16).arrayBuffer()); return (bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47)||(bytes[0]===0xff&&bytes[1]===0xd8)||(bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50) }
const isLocalDev = (env: Env) => developmentBypassEnabled(env)

function requireRole(session: Session | null, roles: Role[]) { return !!session && roles.includes(session.role) }

type SeasonRow = { formatJson?:string|null;rulesVersion?:string;id:string;slug:string;name:string;status:SeasonStatus;isCurrent:number;startsAt:string|null;endsAt:string|null;championCharacterId:string|null;championName?:string|null;championGame?:string|null;championArtworkKey?:string|null;announcement:string;historyUnlocked:number;rosterLocked:number;scheduleMode:string;currentRoundId:string|null }
const seasonColumns = `format_json AS formatJson,rules_version AS rulesVersion,id,slug,name,status,is_current AS isCurrent,starts_at AS startsAt,ends_at AS endsAt,champion_character_id AS championCharacterId,announcement,history_unlocked AS historyUnlocked,roster_locked AS rosterLocked,schedule_mode AS scheduleMode,current_round_id AS currentRoundId`
async function resolveSeason(db:D1Database,slug?:string|null) {
  return slug
    ? db.prepare(`SELECT ${seasonColumns} FROM seasons WHERE slug=?`).bind(slug).first<SeasonRow>()
    : db.prepare(`SELECT ${seasonColumns} FROM seasons WHERE is_current=1`).first<SeasonRow>()
}

function publicMatchPortraits(match:Record<string,unknown>,season:SeasonRow){
  return {...match,leftAvatarArtworkKey:season.rulesVersion==='1'?legacyPortrait(String(match.leftId)):match.leftAvatarArtworkKey,rightAvatarArtworkKey:season.rulesVersion==='1'?legacyPortrait(String(match.rightId)):match.rightAvatarArtworkKey}
}
function publicSeason(season:SeasonRow|null) {
  return season?{...season,format:readFormat(season.formatJson,season.rulesVersion),isCurrent:Boolean(season.isCurrent),historyUnlocked:Boolean(season.historyUnlocked)}:null
}

async function checkTurnstile(token: string, action: 'login', request: Request, env: Env) {
  if (!env.TURNSTILE_SECRET) return false
  try {
    const ip = clientIp(request)
    const form = new FormData(); form.append('secret', env.TURNSTILE_SECRET); form.append('response', token); form.append('remoteip', ip)
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
    const result = await response.json() as { success: boolean; action?: string }
    return response.ok && result.success && result.action === action
  } catch { return false }
}

app.get('/api/health', (c) => {
  const issues=runtimeConfigIssues(c.env)
  return issues.length?c.json({ok:false,timestamp:iso(),issues},503):c.json({ok:true,timestamp:iso()})
})

app.get('/api/public/overview', async (c) => {
  const season=await resolveSeason(c.env.DB)
  const previous=await c.env.DB.prepare(`SELECT ${seasonColumns.split(',').map((column)=>`s.${column}`).join(',')},COALESCE(se.name_snapshot,c.name) AS championName,COALESCE(se.game_snapshot,g.name) AS championGame,se.artwork_gallery_key_snapshot AS championArtworkKey FROM seasons s LEFT JOIN characters c ON c.id=s.champion_character_id LEFT JOIN games g ON g.id=c.game_id LEFT JOIN season_entries se ON se.season_id=s.id AND se.character_id=s.champion_character_id WHERE s.status IN ('completed','archived') AND s.id!=COALESCE(?, '') ORDER BY COALESCE(s.completed_at,s.ends_at) DESC LIMIT 1`).bind(season?.id??null).first<SeasonRow>()
  const [round,activeMatches,siteAnnouncement]=season?await Promise.all([
    c.env.DB.prepare("SELECT id,stage,round_number AS roundNumber,name,starts_at AS startsAt,ends_at AS endsAt,status FROM tournament_rounds WHERE season_id=? AND status='live' ORDER BY starts_at DESC LIMIT 1").bind(season.id).first(),
    c.env.DB.prepare(`SELECT m.id,m.group_code AS groupCode,m.bracket_position AS bracketPosition,m.left_votes AS leftVotes,m.right_votes AS rightVotes,m.status,m.winner_character_id AS winnerCharacterId,r.id AS roundId,r.stage,r.round_number AS roundNumber,r.name AS roundName,r.starts_at AS startsAt,r.ends_at AS endsAt,lc.id AS leftId,COALESCE(le.name_snapshot,lc.name) AS leftName,COALESCE(le.game_snapshot,lg.name) AS leftGame,le.artwork_match_key_snapshot AS leftArtworkKey,rc.id AS rightId,COALESCE(re.name_snapshot,rc.name) AS rightName,COALESCE(re.game_snapshot,rg.name) AS rightGame,re.artwork_match_key_snapshot AS rightArtworkKey FROM matches m JOIN tournament_rounds r ON r.id=m.round_id JOIN characters lc ON lc.id=m.left_character_id JOIN games lg ON lg.id=lc.game_id JOIN characters rc ON rc.id=m.right_character_id JOIN games rg ON rg.id=rc.game_id LEFT JOIN season_entries le ON le.season_id=r.season_id AND le.character_id=lc.id LEFT JOIN season_entries re ON re.season_id=r.season_id AND re.character_id=rc.id WHERE r.season_id=? AND m.status='live' ORDER BY m.group_code,m.bracket_position LIMIT 32`).bind(season.id).all(),
    c.env.DB.prepare("SELECT value FROM settings WHERE key='announcement'").first<{value:string}>()
  ]):[null,{results:[]},await c.env.DB.prepare("SELECT value FROM settings WHERE key='announcement'").first<{value:string}>()]
  return c.json({season:publicSeason(season),previousSeason:publicSeason(previous),round,matches:activeMatches.results,siteAnnouncement:siteAnnouncement?.value??'',seasonAnnouncement:season?.announcement??''})
})

app.get('/api/public/seasons', async (c) => {
  const result=await c.env.DB.prepare(`SELECT s.${seasonColumns.replaceAll(',',',s.')},COALESCE(se.name_snapshot,c.name) AS championName,COALESCE(se.game_snapshot,g.name) AS championGame,se.artwork_gallery_key_snapshot AS championArtworkKey FROM seasons s LEFT JOIN characters c ON c.id=s.champion_character_id LEFT JOIN games g ON g.id=c.game_id LEFT JOIN season_entries se ON se.season_id=s.id AND se.character_id=s.champion_character_id WHERE s.status!='draft' ORDER BY s.is_current DESC,COALESCE(s.starts_at,s.created_at) DESC`).all<SeasonRow>()
  return c.json({seasons:result.results.map(publicSeason)})
})

app.get('/api/public/seasons/:slug', async (c) => {
  const season=await c.env.DB.prepare(`SELECT ${seasonColumns.split(',').map((column)=>`s.${column}`).join(',')},COALESCE(se.name_snapshot,c.name) AS championName,COALESCE(se.game_snapshot,g.name) AS championGame,se.artwork_gallery_key_snapshot AS championArtworkKey FROM seasons s LEFT JOIN characters c ON c.id=s.champion_character_id LEFT JOIN games g ON g.id=c.game_id LEFT JOIN season_entries se ON se.season_id=s.id AND se.character_id=s.champion_character_id WHERE s.slug=?`).bind(c.req.param('slug')).first<SeasonRow>()
  if(!season||season.status==='draft')return c.json({error:'赛季不存在'},404)
  return c.json({season:publicSeason(season)})
})

app.get('/api/public/matches', async (c) => {
  const season=await resolveSeason(c.env.DB,c.req.query('season')); if(!season)return c.json({matches:[]})
  const round=c.req.query('round')
  const result=await c.env.DB.prepare(`SELECT m.id,m.group_code AS groupCode,m.bracket_position AS bracketPosition,m.left_votes AS leftVotes,m.right_votes AS rightVotes,m.status,m.winner_character_id AS winnerCharacterId,r.id AS roundId,r.stage,r.round_number AS roundNumber,r.name AS roundName,r.starts_at AS startsAt,r.ends_at AS endsAt,lc.id AS leftId,COALESCE(le.name_snapshot,lc.name) AS leftName,COALESCE(le.game_snapshot,lg.name) AS leftGame,le.artwork_match_key_snapshot AS leftArtworkKey,rc.id AS rightId,COALESCE(re.name_snapshot,rc.name) AS rightName,COALESCE(re.game_snapshot,rg.name) AS rightGame,re.artwork_match_key_snapshot AS rightArtworkKey FROM matches m JOIN tournament_rounds r ON r.id=m.round_id JOIN characters lc ON lc.id=m.left_character_id JOIN games lg ON lg.id=lc.game_id JOIN characters rc ON rc.id=m.right_character_id JOIN games rg ON rg.id=rc.game_id LEFT JOIN season_entries le ON le.season_id=r.season_id AND le.character_id=lc.id LEFT JOIN season_entries re ON re.season_id=r.season_id AND re.character_id=rc.id WHERE r.season_id=? ${round?'AND r.id=?':''} ORDER BY r.starts_at DESC,r.round_number DESC,m.group_code,m.bracket_position`).bind(...(round?[season.id,round]:[season.id])).all()
  return c.json({matches:result.results.map(match=>publicMatchPortraits(match,season))})
})

app.get('/api/public/rounds', async (c) => {
  const season=await resolveSeason(c.env.DB,c.req.query('season')); if(!season)return c.json({rounds:[]})
  const result=await c.env.DB.prepare(`SELECT id,stage,round_number AS roundNumber,name,starts_at AS startsAt,ends_at AS endsAt,status FROM tournament_rounds WHERE season_id=? ORDER BY starts_at,round_number`).bind(season.id).all()
  return c.json({rounds:result.results})
})

app.get('/api/public/standings', async (c) => {
  const season=await resolveSeason(c.env.DB,c.req.query('season')); if(!season)return c.json({standings:[]})
  if(['completed','archived'].includes(season.status)){
    const saved=await c.env.DB.prepare('SELECT standings_json AS standings FROM season_result_snapshots WHERE season_id=?').bind(season.id).first<{standings:string}>()
    if(saved&&!season.historyUnlocked)return c.json({standings:JSON.parse(saved.standings)})
  }
  const entries=(await c.env.DB.prepare('SELECT character_id AS id,artwork_avatar_key_snapshot AS key FROM season_entries WHERE season_id=?').bind(season.id).all<{id:string;key:string|null}>()).results
  const avatars=new Map(entries.map(e=>[e.id,season.rulesVersion==='1'?legacyPortrait(e.id):e.key]))
  return c.json({standings:(await calculateSeasonStandingsV1(c.env.DB,season.id)).map(row=>({...row,avatarArtworkKey:avatars.get(row.id)??null}))})
})

app.get('/api/public/characters',async(c)=>{
  const season=await resolveSeason(c.env.DB,c.req.query('season'));if(!season)return c.json({characters:[]})
  const result=await c.env.DB.prepare(`SELECT se.character_id AS id,COALESCE(se.name_snapshot,c.name) AS name,COALESCE(se.game_snapshot,g.name) AS game,COALESCE(se.summary_snapshot,c.summary) AS summary,se.group_code AS groupCode,se.seed,se.artwork_gallery_key_snapshot AS galleryArtworkKey,se.artwork_match_key_snapshot AS matchArtworkKey,se.artwork_avatar_key_snapshot AS avatarArtworkKey FROM season_entries se JOIN characters c ON c.id=se.character_id JOIN games g ON g.id=c.game_id WHERE se.season_id=? ORDER BY se.seed`).bind(season.id).all()
  return c.json({characters:result.results})
})

app.get('/api/media/:key{.+}', async (c) => {
  const key = c.req.param('key')
  const object = await c.env.MEDIA.get(key)
  if (!object) {
    if(key.split('/').length>3)return c.json({error:'该版本素材不存在'},404)
    // The Vite build copies approved preview assets to dist/artwork for complete local E2E runs.
    const fallback=await c.env.ASSETS.fetch(new Request(new URL(`/artwork/${key.replace('characters/', '')}`, c.req.url),c.req.raw))
    return fallback.ok&&mediaFallbackIsImage(fallback.headers.get('content-type'))?fallback:c.json({error:'素材不存在'},404)
  }
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('etag', object.httpEtag); headers.set('cache-control', 'public, max-age=31536000, immutable')
  return new Response(object.body, { headers })
})

app.post('/api/auth/request-code', zValidator('json', requestCodeInput), async (c) => {
  const { email: rawEmail, turnstileToken } = c.req.valid('json')
  const email = normalizeEmail(rawEmail)
  const localBypass = isLocalDev(c.env)
  if (localBypass) {
    const ipHash = await digest(clientIp(c.req.raw))
    await c.env.DB.prepare('INSERT INTO auth_challenges(id,email,code_hash,expires_at,ip_hash) VALUES(?,?,?,?,?)').bind(id(), email, await digest('000000'), new Date(Date.now() + 10 * 60_000).toISOString(), ipHash).run()
    return c.json({ ok: true, expiresInSeconds: 600, developmentCode: '000000' })
  }
  if (isDisposableEmail(email)) return c.json({ error: '请使用常用邮箱地址' }, 400)
  const ipHash = await digest(clientIp(c.req.raw))
  const now = Date.now()
  const [byEmail, byIp] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM auth_challenges WHERE email=? AND created_at > datetime('now','-1 day')").bind(email).first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM auth_challenges WHERE ip_hash=? AND created_at > datetime('now','-1 hour')").bind(ipHash).first<{ count: number }>()
  ])
  if ((byEmail?.count ?? 0) >= 5) return c.json({ error: '该邮箱今日验证码请求已达上限' }, 429)
  if ((byIp?.count ?? 0) >= 10) return c.json({ error: '该网络请求过于频繁，请稍后再试' }, 429)
  const turnstileVerified=Boolean(turnstileToken&&await checkTurnstile(turnstileToken,'login',c.req.raw,c.env))
  if(!loginChallengeAllowed(localBypass,turnstileVerified))return c.json({error:'请先完成人机验证'},400)
  const code = String(Math.floor(100000 + Math.random() * 900000))
  await c.env.DB.prepare('INSERT INTO auth_challenges(id,email,code_hash,expires_at,ip_hash) VALUES(?,?,?,?,?)').bind(id(), email, await digest(code), new Date(now + 10 * 60_000).toISOString(), ipHash).run()
  await sendLoginCode(c.env, email, code)
  return c.json({ ok: true, expiresInSeconds: 600 })
})

app.post('/api/auth/verify-code', zValidator('json', verifyCodeInput), async (c) => {
  const { email: rawEmail, code } = c.req.valid('json'); const email = normalizeEmail(rawEmail)
  const challenge = await c.env.DB.prepare("SELECT id, code_hash AS codeHash, expires_at AS expiresAt, attempts FROM auth_challenges WHERE email=? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(email).first<{ id: string, codeHash: string, expiresAt: string, attempts: number }>()
  if (!challenge || new Date(challenge.expiresAt).getTime() < Date.now()) return c.json({ error: '验证码已失效，请重新获取' }, 400)
  if (challenge.attempts >= 5) return c.json({ error: '验证码尝试次数过多，请重新获取' }, 429)
  const valid = (await digest(code)) === challenge.codeHash
  if (!valid) { await c.env.DB.prepare('UPDATE auth_challenges SET attempts=attempts+1 WHERE id=?').bind(challenge.id).run(); return c.json({ error: '验证码不正确' }, 400) }
  await c.env.DB.prepare('UPDATE auth_challenges SET consumed_at=? WHERE id=?').bind(iso(), challenge.id).run()
  const admins = c.env.ADMIN_EMAILS.split(',').map(normalizeEmail).filter(Boolean)
  const existing = await c.env.DB.prepare('SELECT id,email,role,status FROM users WHERE email=?').bind(email).first<{ id: string, email: string, role: Role, status: string }>()
  if (existing?.status === 'frozen') return c.json({ error: '该账户已被冻结' }, 403)
  const user = existing ?? { id: id(), email, role: admins.includes(email) ? 'admin' as Role : 'voter' as Role, status: 'active' }
  if (!existing) await c.env.DB.prepare('INSERT INTO users(id,email,role) VALUES(?,?,?)').bind(user.id, user.email, user.role).run()
  await c.env.DB.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(iso(), user.id).run()
  const session = await createSession({ sub: user.id, email: user.email, role: user.role }, c.env)
  const response = c.json({ ok: true, user: { email: user.email, role: user.role } })
  response.headers.append('Set-Cookie', cookie('fumoe_session', session, 60 * 60 * 24 * 30))
  return response
})

app.post('/api/auth/logout', (c) => { const response = c.json({ ok: true }); response.headers.append('Set-Cookie', cookie('fumoe_session', '', 0)); return response })
app.get('/api/auth/me', (c) => { const session = c.get('session'); return session ? c.json({ user: { email: session.email, role: session.role } }) : c.json({ user: null }) })

app.get('/api/votes/mine',async(c)=>{
  const session=c.get('session');if(!session)return c.json({votes:[]})
  const season=await resolveSeason(c.env.DB,c.req.query('season'));if(!season)return c.json({votes:[]})
  const result=await c.env.DB.prepare(`SELECT v.match_id AS matchId,v.character_id AS characterId,v.risk_status AS riskStatus,v.created_at AS createdAt FROM votes v JOIN matches m ON m.id=v.match_id JOIN tournament_rounds r ON r.id=m.round_id WHERE v.voter_id=? AND r.season_id=? ORDER BY v.created_at DESC`).bind(session.sub,season.id).all()
  return c.json({votes:result.results})
})

app.post('/api/votes', zValidator('json', voteInput), async (c) => {
  const session=c.get('session');if(!session)return c.json({error:'请先登录后投票'},401)
  const {choices,deviceFingerprint,legacy}=normalizeVoteRequest(c.req.valid('json'))
  const matchIds=choices.map((choice)=>choice.matchId)
  const placeholders='SELECT value FROM json_each(?)'
  const matchIdsJson=JSON.stringify(matchIds)
  const [matchRows,existingRows]=await Promise.all([
    c.env.DB.prepare(`SELECT m.id,m.left_character_id AS leftCharacterId,m.right_character_id AS rightCharacterId,m.status,r.starts_at AS startsAt,r.ends_at AS endsAt,s.status AS seasonStatus,s.is_current AS isCurrent FROM matches m JOIN tournament_rounds r ON r.id=m.round_id JOIN seasons s ON s.id=r.season_id WHERE m.id IN (${placeholders})`).bind(matchIdsJson).all<VoteMatch>(),
    c.env.DB.prepare(`SELECT match_id AS matchId,character_id AS characterId,risk_status AS riskStatus,created_at AS createdAt FROM votes WHERE voter_id=? AND match_id IN (${placeholders})`).bind(session.sub,matchIdsJson).all<ExistingVote>()
  ])
  const plan=planBatchVotes(choices,matchRows.results,existingRows.results,iso())
  if(!plan.ok)return c.json({error:plan.error},plan.error.includes('角色')?400:409)
  const ipHash=await digest(clientIp(c.req.raw));const deviceHash=deviceFingerprint?await digest(deviceFingerprint):null
  const sameIpVotes=await c.env.DB.prepare("SELECT COUNT(*) AS count FROM votes WHERE ip_hash=? AND created_at > datetime('now','-10 minutes')").bind(ipHash).first<{count:number}>()
  const createdAt=iso()
  const created=plan.newVotes.map((choice,index)=>({choice,voteId:id(),risk:voteRiskDecision((sameIpVotes?.count??0)+index)}))
  const rows=JSON.stringify(created.map(({choice,voteId,risk},index)=>({...choice,voteId,riskStatus:risk.riskStatus,auditId:id(),eventId:id(),recordEvent:risk.recordVelocityEvent?1:0,velocity:(sameIpVotes?.count??0)+index})))
  const statements=created.length?[
    c.env.DB.prepare(`INSERT INTO votes(id,match_id,voter_id,character_id,risk_status,ip_hash,device_hash,created_at) SELECT json_extract(value,'$.voteId'),json_extract(value,'$.matchId'),?,json_extract(value,'$.characterId'),json_extract(value,'$.riskStatus'),?,?,? FROM json_each(?)`).bind(session.sub,ipHash,deviceHash,createdAt,rows),
    c.env.DB.prepare(`WITH selected AS (SELECT json_extract(value,'$.matchId') AS matchId,json_extract(value,'$.characterId') AS characterId FROM json_each(?)) UPDATE matches SET left_votes=left_votes+CASE WHEN left_character_id=(SELECT characterId FROM selected WHERE matchId=matches.id) THEN 1 ELSE 0 END,right_votes=right_votes+CASE WHEN right_character_id=(SELECT characterId FROM selected WHERE matchId=matches.id) THEN 1 ELSE 0 END,updated_at=? WHERE id IN (SELECT matchId FROM selected)`).bind(rows,createdAt),
    c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,after_json) SELECT json_extract(value,'$.auditId'),?,'vote_cast','vote',json_extract(value,'$.voteId'),json_object('matchId',json_extract(value,'$.matchId'),'characterId',json_extract(value,'$.characterId'),'riskStatus',json_extract(value,'$.riskStatus')) FROM json_each(?)`).bind(session.sub,rows),
    c.env.DB.prepare(`INSERT INTO risk_events(id,vote_id,user_id,event_type,score,detail_json) SELECT json_extract(value,'$.eventId'),json_extract(value,'$.voteId'),?,'velocity_observed',40,json_object('count',json_extract(value,'$.velocity'),'action','counted') FROM json_each(?) WHERE json_extract(value,'$.recordEvent')=1`).bind(session.sub,rows)
  ]:[]
  if(statements.length)await c.env.DB.batch(statements)
  const scoreRows=await c.env.DB.prepare(`SELECT id AS matchId,left_votes AS leftVotes,right_votes AS rightVotes FROM matches WHERE id IN (${placeholders})`).bind(matchIdsJson).all<{matchId:string;leftVotes:number;rightVotes:number}>()
  const scoresByMatch=new Map(scoreRows.results.map((scores)=>[scores.matchId,scores]))
  const publications=created.map(({choice})=>{
    const scores=scoresByMatch.get(choice.matchId)
    const room=c.env.MATCH_ROOM.get(c.env.MATCH_ROOM.idFromName(choice.matchId))
    return room.fetch('https://match-room/publish',{method:'POST',body:JSON.stringify({type:'score',matchId:choice.matchId,...scores})})
  })
  scheduleScorePublications(publications,(task)=>c.executionCtx.waitUntil(task))
  const votes=[
    ...plan.existingVotes.map((selection)=>({status:'already_voted' as const,selection,scores:scoresByMatch.get(selection.matchId)})),
    ...created.map(({choice,risk})=>({status:'counted' as const,selection:{...choice,riskStatus:risk.riskStatus,createdAt},scores:scoresByMatch.get(choice.matchId)}))
  ]
  if(legacy){const vote=votes[0];return c.json({ok:true,...vote})}
  return c.json({ok:true,votes})
})

app.get('/api/realtime/matches/:matchId', (c) => {
  const matchId = c.req.param('matchId')
  if (c.req.header('Upgrade') !== 'websocket') return c.json({ error: 'WebSocket upgrade required' }, 426)
  return c.env.MATCH_ROOM.get(c.env.MATCH_ROOM.idFromName(matchId)).fetch(c.req.raw)
})

app.get('/api/admin/dashboard', async (c) => {
  const session=c.get('session'); if(!requireRole(session,['operator','admin']))return c.json({error:'无权访问'},403)
  const [pending,active]=await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM votes v JOIN matches m ON m.id=v.match_id JOIN tournament_rounds r ON r.id=m.round_id JOIN seasons s ON s.id=r.season_id WHERE s.is_current=1 AND v.risk_status='pending'`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM matches m JOIN tournament_rounds r ON r.id=m.round_id JOIN seasons s ON s.id=r.season_id WHERE s.is_current=1 AND m.status='live'`).first()
  ])
  return c.json({pendingVotes:pending?.count??0,activeMatches:active?.count??0})
})

app.get('/api/admin/seasons', async (c) => {
  const session=c.get('session'); if(!requireRole(session,['operator','admin']))return c.json({error:'无权访问'},403)
  const result=await c.env.DB.prepare(`SELECT ${seasonColumns},roster_locked AS rosterLocked,schedule_mode AS scheduleMode FROM seasons ORDER BY is_current DESC,created_at DESC`).all()
  return c.json({seasons:result.results.map(row=>publicSeason(row as SeasonRow))})
})

app.get('/api/admin/seasons/:seasonId/entries',async(c)=>{
  const session=c.get('session');if(!requireRole(session,['operator','admin']))return c.json({error:'无权访问'},403)
  const result=await c.env.DB.prepare(`SELECT se.character_id AS characterId,se.group_code AS groupCode,se.seed,c.name,g.name AS game FROM season_entries se JOIN characters c ON c.id=se.character_id JOIN games g ON g.id=c.game_id WHERE se.season_id=? ORDER BY se.seed`).bind(c.req.param('seasonId')).all()
  return c.json({entries:result.results})
})

app.patch('/api/admin/seasons/:seasonId/entries/:characterId',zValidator('json',seasonEntryInput),async(c)=>{
  const session=c.get('session');if(!requireRole(session,['admin']))return c.json({error:'仅管理员可调整名单'},403)
  const seasonId=c.req.param('seasonId');const characterId=c.req.param('characterId');const input=c.req.valid('json');const season=await c.env.DB.prepare(`SELECT status,roster_locked AS rosterLocked FROM seasons WHERE id=?`).bind(seasonId).first<{status:SeasonStatus;rosterLocked:number}>()
  if(!season)return c.json({error:'赛季不存在'},404);if(!canEditRoster({status:season.status,rosterLocked:Boolean(season.rosterLocked)}))return c.json({error:'只能调整未锁定的草稿赛季名单'},409)
  const format=await loadSeasonFormat(c.env.DB,seasonId)
  if(!formatGroups(format).includes(input.groupCode)||input.seed>format.participants)return c.json({error:'分组或种子超出本赛季配置'},400)
  const duplicate=await c.env.DB.prepare(`SELECT character_id FROM season_entries WHERE season_id=? AND seed=? AND character_id!=?`).bind(seasonId,input.seed,characterId).first();if(duplicate)return c.json({error:'种子序号已被占用'},409)
  const updated=await c.env.DB.prepare(`UPDATE season_entries SET group_code=?,seed=? WHERE season_id=? AND character_id=?`).bind(input.groupCode,input.seed,seasonId,characterId).run();if(!updated.meta.changes)return c.json({error:'参赛角色不存在'},404)
  await c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,after_json,season_id) VALUES(?,?,?,?,?,?,?,?)`).bind(id(),session!.sub,'season_entry_updated','season_entry',characterId,input.reason,JSON.stringify({groupCode:input.groupCode,seed:input.seed}),seasonId).run();return c.json({ok:true})
})

app.post('/api/admin/seasons',zValidator('json',seasonCreateInput),async(c)=>{
  const session=c.get('session'); if(!requireRole(session,['admin']))return c.json({error:'仅管理员可创建赛季'},403)
  const input=c.req.valid('json'); const startTime=new Date(input.startsAt).getTime(); if(Number.isNaN(startTime))return c.json({error:'赛季开始时间无效'},400)
  const seasonId=id(); const slug=input.slug??buildSeasonSlug(input.name,input.startsAt); const sourceId=input.copyFromSeasonId||null
  const format=input.format??legacyFormat()
  const schedule=formatSchedule(format,input.startsAt)
  const exists=await c.env.DB.prepare('SELECT id FROM seasons WHERE slug=?').bind(slug).first();if(exists)return c.json({error:'赛季链接标识已存在'},409)
  if(sourceId&&!await c.env.DB.prepare('SELECT id FROM seasons WHERE id=?').bind(sourceId).first())return c.json({error:'复制来源不存在'},404)
  const statements=[c.env.DB.prepare('INSERT INTO seasons(id,slug,name,starts_at,ends_at,updated_by,rules_version,format_json) VALUES(?,?,?,?,?,?,?,?)').bind(seasonId,slug,input.name,input.startsAt,schedule.at(-1)!.endsAt,session!.sub,'2',JSON.stringify(format))]
  if(sourceId)statements.push(c.env.DB.prepare(`INSERT INTO season_entries(id,season_id,character_id,group_code,seed) SELECT ?||'-'||character_id,?,character_id,group_code,seed FROM season_entries WHERE season_id=?`).bind(seasonId,seasonId,sourceId))
  statements.push(...roundStatements(c.env.DB,seasonId,format,input.startsAt))
  statements.push(c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,after_json,season_id) VALUES(?,?,?,?,?,?,?,?)`).bind(id(),session!.sub,'season_created','season',seasonId,input.reason,JSON.stringify({name:input.name,slug,sourceId}),seasonId))
  await c.env.DB.batch(statements); return c.json({ok:true,seasonId,slug},201)
})

app.post('/api/admin/seasons/:seasonId/action',zValidator('json',seasonActionInput),async(c)=>{
  const session=c.get('session'); if(!requireRole(session,['admin']))return c.json({error:'仅管理员可控制赛季'},403)
  const seasonId=c.req.param('seasonId'); const input=c.req.valid('json');
  return withLifecycleLease(c.env,seasonId,async()=>{
  const season=await c.env.DB.prepare(`SELECT id,status,history_unlocked AS historyUnlocked FROM seasons WHERE id=?`).bind(seasonId).first<{id:string;status:SeasonStatus;historyUnlocked:number}>(); if(!season)return c.json({error:'赛季不存在'},404)
  if(input.action==='publish'){
    if(season.status!=='draft')return c.json({error:'只能发布草稿赛季'},409)
    const entries=(await c.env.DB.prepare(`SELECT character_id AS characterId,group_code AS groupCode,seed FROM season_entries WHERE season_id=?`).bind(seasonId).all<{characterId:string;groupCode:string;seed:number}>()).results; const validation=validateSeasonRoster(entries,await loadSeasonFormat(c.env.DB,seasonId)); if(!validation.valid)return c.json({error:validation.error,groupCounts:validation.groupCounts},409)
    const other=await c.env.DB.prepare("SELECT id FROM seasons WHERE is_current=1 AND status IN ('published','live') AND id!=?").bind(seasonId).first();if(other)return c.json({error:'请先结束当前赛季，再发布新赛季'},409)
    const format=await loadSeasonFormat(c.env.DB,seasonId)
    const firstRound=await c.env.DB.prepare(`SELECT id FROM tournament_rounds WHERE season_id=? AND stage=? AND round_number=1`).bind(seasonId,format.mode==='knockout'?'knockout':'swiss').first<{id:string}>(); if(!firstRound)return c.json({error:'首轮不存在'},409)
    const existing=await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM matches WHERE round_id=?`).bind(firstRound.id).first<{count:number}>(); if((existing?.count??0)!==0)return c.json({error:'草稿首轮已有对局，无法安全发布'},409)
    const pairs=firstRoundPairs(entries.map(e=>({id:e.characterId,game:'',groupCode:e.groupCode,seed:e.seed})),format)
    const pairStatements=[insertPairStatement(c.env.DB,firstRound.id,pairs,pairs.map(([left])=>format.mode==='knockout'?null:left.groupCode))]
    await c.env.DB.batch([...pairStatements,c.env.DB.prepare(`UPDATE seasons SET is_current=0 WHERE is_current=1`),c.env.DB.prepare(`UPDATE seasons SET status='published',is_current=1,roster_locked=1,published_at=?,updated_at=?,updated_by=? WHERE id=?`).bind(iso(),iso(),session!.sub,seasonId),c.env.DB.prepare(`UPDATE season_entries SET name_snapshot=(SELECT name FROM characters WHERE id=character_id),game_snapshot=(SELECT g.name FROM characters c JOIN games g ON g.id=c.game_id WHERE c.id=character_id),summary_snapshot=(SELECT summary FROM characters WHERE id=character_id),artwork_original_key_snapshot=(SELECT artwork_original_key FROM characters WHERE id=character_id),artwork_gallery_key_snapshot=(SELECT artwork_gallery_key FROM characters WHERE id=character_id),artwork_match_key_snapshot=(SELECT artwork_match_key FROM characters WHERE id=character_id),artwork_avatar_key_snapshot=(SELECT artwork_avatar_key FROM characters WHERE id=character_id) WHERE season_id=?`).bind(seasonId)])
  } else if(input.action==='archive') { const result=await c.env.DB.prepare(`UPDATE seasons SET status='archived',is_current=0,archived_at=?,updated_at=?,updated_by=? WHERE id=? AND status='completed'`).bind(iso(),iso(),session!.sub,seasonId).run(); if(!result.meta.changes)return c.json({error:'只能归档已结束赛季'},409) }
  else { const result=await c.env.DB.prepare(`UPDATE seasons SET history_unlocked=?,updated_at=?,updated_by=? WHERE id=? AND status IN ('completed','archived')`).bind(input.action==='unlock-history'?1:0,iso(),session!.sub,seasonId).run(); if(!result.meta.changes)return c.json({error:'只有已结束或归档赛季可调整历史锁'},409) }
  if(input.action==='lock-history')await snapshotSeasonStandings(c.env.DB,seasonId)
  await c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,after_json,season_id) VALUES(?,?,?,?,?,?,?,?)`).bind(id(),session!.sub,`season_${input.action}`,'season',seasonId,input.reason,JSON.stringify({action:input.action}),seasonId).run()
  return c.json({ok:true})
  })
})

app.patch('/api/admin/seasons/:seasonId',zValidator('json',seasonUpdateInput),async(c)=>{
  const session=c.get('session'); if(!requireRole(session,['admin']))return c.json({error:'仅管理员可修改赛季'},403)
  const input=c.req.valid('json'); const seasonId=c.req.param('seasonId'); const updates=[]; const values:unknown[]=[]
  if(input.name!==undefined){updates.push('name=?');values.push(input.name)} if(input.announcement!==undefined){updates.push('announcement=?');values.push(input.announcement)} if(!updates.length)return c.json({error:'没有可更新内容'},400)
  await c.env.DB.batch([c.env.DB.prepare(`UPDATE seasons SET ${updates.join(',')},updated_at=?,updated_by=? WHERE id=?`).bind(...values,iso(),session!.sub,seasonId),c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,after_json,season_id) VALUES(?,?,?,?,?,?,?,?)`).bind(id(),session!.sub,'season_updated','season',seasonId,input.reason,JSON.stringify(input),seasonId)])
  return c.json({ok:true})
})

app.get('/api/admin/tournament', async (c) => {
  const session = c.get('session'); if (!requireRole(session, ['operator', 'admin'])) return c.json({ error: '无权访问' }, 403)
  const season=await resolveSeason(c.env.DB); if(!season)return c.json({error:'当前没有赛季'},404)
  const [rounds,artwork]=await Promise.all([
    c.env.DB.prepare(`SELECT id,stage,round_number AS roundNumber,name,starts_at AS startsAt,ends_at AS endsAt,status FROM tournament_rounds WHERE season_id=? ORDER BY starts_at,round_number`).bind(season.id).all(),
    c.env.DB.prepare(`SELECT artwork_quality_status AS status,COUNT(*) AS count FROM characters GROUP BY artwork_quality_status`).all()
  ])
  return c.json({season:publicSeason(season),settings:{tournament_status:season.status,roster_locked:String(Boolean(season.rosterLocked)),schedule_mode:season.scheduleMode,current_round_id:season.currentRoundId??'',champion_id:season.championCharacterId??'',announcement:season.announcement},rounds:rounds.results,artwork:artwork.results})
})

app.post('/api/admin/tournament/control', zValidator('json', roundControlInput), async (c) => {
  const session = c.get('session'); if (!requireRole(session, ['admin'])) return c.json({ error: '仅管理员可控制赛事' }, 403)
  const actor=session!; const input=c.req.valid('json'); const now=iso(); const season=await resolveSeason(c.env.DB); if(!season)return c.json({error:'当前没有赛季'},409)
  if(!canEditSeason({status:season.status,historyUnlocked:Boolean(season.historyUnlocked)}))return c.json({error:'历史赛季已锁定'},409)
  if(input.action==='lock-roster'||input.action==='unlock-roster') {
    const value=input.action==='lock-roster'?1:0
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE seasons SET roster_locked=?,updated_at=?,updated_by=? WHERE id=?`).bind(value,now,actor.sub,season.id),
      c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,after_json,season_id) VALUES(?,?,?,?,?,?,?,?)`).bind(id(),actor.sub,input.action,'season',season.id,input.reason,JSON.stringify({rosterLocked:Boolean(value)}),season.id)
    ])
    return c.json({ ok:true })
  }
  if (input.action === 'publish-schedule') {
    if (!input.scheduledStartAt) return c.json({ error:'请提供首轮开始时间' },400)
    if(season.status!=='published')return c.json({error:'只能为未开始的已发布赛季启用自动排期'},409)
    const used=await c.env.DB.prepare("SELECT id FROM tournament_rounds WHERE season_id=? AND status!='scheduled' LIMIT 1").bind(season.id).first();if(used)return c.json({error:'已有轮次开始，不能重置赛程'},409)
    const first = new Date(input.scheduledStartAt).getTime(); if (Number.isNaN(first)) return c.json({ error:'赛程时间无效' },400)
    const rounds=await c.env.DB.prepare(`SELECT id,round_number AS roundNumber,stage FROM tournament_rounds WHERE season_id=? ORDER BY starts_at,round_number`).bind(season.id).all<{id:string;roundNumber:number;stage:string}>()
    const schedule=formatSchedule(await loadSeasonFormat(c.env.DB,season.id),input.scheduledStartAt)
    const statements=rounds.results.map(round=>{const planned=schedule.find(r=>r.stage===round.stage&&r.roundNumber===round.roundNumber);if(!planned)throw new Error('轮次与赛制不一致');return c.env.DB.prepare('UPDATE tournament_rounds SET starts_at=?,ends_at=? WHERE id=?').bind(planned.startsAt,planned.endsAt,round.id)})
    statements.push(c.env.DB.prepare("UPDATE seasons SET schedule_mode='scheduled',starts_at=?,ends_at=?,current_round_id=NULL,updated_at=?,updated_by=? WHERE id=?").bind(input.scheduledStartAt,schedule.at(-1)!.endsAt,now,actor.sub,season.id))
    statements.push(c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,after_json,season_id) VALUES(?,?,?,?,?,?,?,?)`).bind(id(),actor.sub,'schedule_published','season',season.id,input.reason,JSON.stringify({scheduledStartAt:input.scheduledStartAt}),season.id))
    await c.env.DB.batch(statements); return c.json({ok:true})
  }
  if (!input.roundId) return c.json({ error:'请选择轮次' },400)
  const round=await c.env.DB.prepare(`SELECT id,season_id AS seasonId,stage,round_number AS roundNumber,status FROM tournament_rounds WHERE id=? AND season_id=?`).bind(input.roundId,season.id).first<{id:string;seasonId:string;stage:'swiss'|'knockout';roundNumber:number;status:string}>(); if(!round)return c.json({error:'轮次不存在'},404)
  if (input.action === 'close') {
    if (round.status !== 'live') return c.json({error:'只能关闭进行中的轮次'},409)
    try { const advancement=await withLifecycleLease(c.env,season.id,()=>closeRound(c.env,round,actor.sub,input.reason)); return c.json({ok:true,status:'closed',advancement}) } catch (error) { return c.json({error:error instanceof Error?error.message:'轮次关闭失败'},409) }
  }
  if ((input.action === 'start-now' || input.action === 'resume') && round.status === 'closed') return c.json({error:'已关闭轮次不能重新开始'},409)
  if (input.action === 'pause' && round.status !== 'live') return c.json({error:'只能暂停进行中的轮次'},409)
  if (input.action === 'start-now' || input.action === 'resume') {
    try { await withLifecycleLease(c.env,season.id,()=>startRound(c.env,round,actor.sub,input.reason)); return c.json({ok:true,status:'live'}) } catch (error) { return c.json({error:error instanceof Error?error.message:'无法开始本轮'},409) }
  }
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE tournament_rounds SET status='scheduled' WHERE id=?`).bind(round.id),
    c.env.DB.prepare(`UPDATE matches SET status='scheduled' WHERE round_id=? AND status!='closed'`).bind(round.id),
    c.env.DB.prepare(`UPDATE seasons SET status='published',current_round_id=?,updated_at=?,updated_by=? WHERE id=?`).bind(round.id,now,actor.sub,season.id),
    c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,after_json,season_id) VALUES(?,?,?,?,?,?,?,?)`).bind(id(),actor.sub,'round_pause','round',round.id,input.reason,JSON.stringify({status:'scheduled'}),season.id)
  ])
  return c.json({ok:true,status:'scheduled'})
})

app.get('/api/admin/characters', async (c) => {
  const session = c.get('session'); if (!requireRole(session,['operator','admin'])) return c.json({error:'无权访问'},403)
  const game = c.req.query('game'); const quality = c.req.query('quality'); const term = c.req.query('q')?.trim() ?? ''
  const filters=['s.is_current=1']; const binds:string[]=[]
  if(game){filters.push('g.name=?');binds.push(game)} if(quality){filters.push('c.artwork_quality_status=?');binds.push(quality)} if(term){filters.push('c.name LIKE ?');binds.push(`%${term}%`)}
  const result=await c.env.DB.prepare(`SELECT c.id,c.name,c.summary,se.group_code AS groupCode,se.seed,c.artwork_key AS artworkKey,c.artwork_source_url AS artworkSourceUrl,c.artwork_source_note AS artworkSourceNote,c.artwork_source_type AS artworkSourceType,c.artwork_quality_status AS artworkQualityStatus,c.artwork_focus_x AS artworkFocusX,c.artwork_focus_y AS artworkFocusY,g.name AS game FROM season_entries se JOIN seasons s ON s.id=se.season_id JOIN characters c ON c.id=se.character_id JOIN games g ON g.id=c.game_id WHERE ${filters.join(' AND ')} ORDER BY se.seed`).bind(...binds).all()
  return c.json({characters:result.results})
})

app.patch('/api/admin/characters/:characterId', zValidator('json', characterUpdateInput), async (c) => {
  const session = c.get('session'); if (!requireRole(session,['operator','admin'])) return c.json({error:'无权访问'},403)
  const actor=session!; const characterId=c.req.param('characterId'); const input=c.req.valid('json'); const season=await resolveSeason(c.env.DB); if(!season)return c.json({error:'当前没有赛季'},409)
  if(input.groupCode!==undefined||input.seed!==undefined){
    if(!canEditRoster({status:season.status,rosterLocked:Boolean(season.rosterLocked)}))return c.json({error:'只能修改草稿赛季的名单'},409)
    const format=await loadSeasonFormat(c.env.DB,season.id)
    if(input.groupCode&&!formatGroups(format).includes(input.groupCode)||input.seed&&input.seed>format.participants)return c.json({error:'分组或种子超出本赛季配置'},400)
  }
  const before=await c.env.DB.prepare(`SELECT c.*,se.group_code AS groupCode,se.seed FROM characters c LEFT JOIN season_entries se ON se.character_id=c.id AND se.season_id=? WHERE c.id=?`).bind(season.id,characterId).first(); if(!before)return c.json({error:'角色不存在'},404)
  const characterFields:Record<string,unknown>={summary:input.summary,artwork_source_url:input.artworkSourceUrl,artwork_source_note:input.artworkSourceNote,artwork_source_type:input.artworkSourceType,artwork_quality_status:input.artworkQualityStatus,artwork_focus_x:input.artworkFocusX,artwork_focus_y:input.artworkFocusY}; const characterUpdates=Object.entries(characterFields).filter(([,value])=>value!==undefined); const statements=[]
  if(characterUpdates.length)statements.push(c.env.DB.prepare(`UPDATE characters SET ${characterUpdates.map(([field])=>`${field}=?`).join(',')},updated_at=? WHERE id=?`).bind(...characterUpdates.map(([,value])=>value),iso(),characterId))
  if(input.groupCode!==undefined||input.seed!==undefined)statements.push(c.env.DB.prepare(`UPDATE season_entries SET group_code=COALESCE(?,group_code),seed=COALESCE(?,seed) WHERE season_id=? AND character_id=?`).bind(input.groupCode??null,input.seed??null,season.id,characterId))
  if(!statements.length)return c.json({error:'没有可更新内容'},400)
  statements.push(c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,before_json,after_json,season_id) VALUES(?,?,?,?,?,?,?,?,?)`).bind(id(),actor.sub,'character_updated','character',characterId,input.reason,JSON.stringify(before),JSON.stringify(input),season.id)); await c.env.DB.batch(statements)
  return c.json({ok:true})
})

app.get('/api/admin/characters/:characterId', async (c) => {
  const session = c.get('session'); if (!requireRole(session,['operator','admin'])) return c.json({error:'无权访问'},403)
  const result=await c.env.DB.prepare(`SELECT c.id,c.name,c.summary,se.group_code AS groupCode,se.seed,c.artwork_original_key AS artworkOriginalKey,c.artwork_gallery_key AS artworkGalleryKey,c.artwork_match_key AS artworkMatchKey,c.artwork_avatar_key AS artworkAvatarKey,c.artwork_source_url AS artworkSourceUrl,c.artwork_source_note AS artworkSourceNote,c.artwork_source_type AS artworkSourceType,c.artwork_quality_status AS artworkQualityStatus,c.artwork_gallery_crop_json AS artworkGalleryCrop,c.artwork_match_crop_json AS artworkMatchCrop,c.artwork_avatar_crop_json AS artworkAvatarCrop,g.name AS game FROM characters c JOIN games g ON g.id=c.game_id LEFT JOIN season_entries se ON se.character_id=c.id AND se.season_id=(SELECT id FROM seasons WHERE is_current=1) WHERE c.id=?`).bind(c.req.param('characterId')).first()
  if (!result) return c.json({error:'角色不存在'},404)
  return c.json({character:result})
})

app.post('/api/admin/characters/:characterId/artwork', async (c) => {
  const session=c.get('session'); if(!requireRole(session,['operator','admin'])) return c.json({error:'无权上传素材'},403)
  const actor=session!; const characterId=c.req.param('characterId'); const character=await c.env.DB.prepare(`SELECT id FROM characters WHERE id=?`).bind(characterId).first(); if(!character)return c.json({error:'角色不存在'},404)
  const form=await c.req.raw.formData(); const rawMetadata=form.get('metadata')
  if(typeof rawMetadata!=='string') return c.json({error:'缺少素材元数据'},400)
  const parsed=artworkMetadataInput.safeParse(JSON.parse(rawMetadata)); if(!parsed.success)return c.json({error:'素材元数据无效'},400)
  const input=parsed.data; const original=form.get('original'); const gallery=form.get('gallery'); const match=form.get('match'); const avatar=form.get('avatar')
  if(![original,gallery,match,avatar].every((file)=>file instanceof File)) return c.json({error:'需要原图、图鉴、对局和头像四个文件'},400)
  const files={original:original as File,gallery:gallery as File,match:match as File,avatar:avatar as File}
  if(files.original.size>10*1024*1024||[files.gallery,files.match,files.avatar].some((file)=>file.size>4*1024*1024))return c.json({error:'图片文件超出大小限制'},400)
  for(const file of Object.values(files)) if(!imageMimeTypes.has(file.type)||!(await validImageSignature(file)))return c.json({error:'只允许有效的 PNG、JPEG 或 WebP 图片'},400)
  const ext=files.original.type==='image/png'?'png':files.original.type==='image/jpeg'?'jpg':'webp'; const revision=id(); const keys=artworkKeys(characterId,revision,ext)
  try {
    await Promise.all([
      c.env.MEDIA.put(keys.original,files.original.stream(),{httpMetadata:{contentType:files.original.type}}),
      c.env.MEDIA.put(keys.gallery,files.gallery.stream(),{httpMetadata:{contentType:'image/webp'}}),
      c.env.MEDIA.put(keys.match,files.match.stream(),{httpMetadata:{contentType:'image/webp'}}),
      c.env.MEDIA.put(keys.avatar,files.avatar.stream(),{httpMetadata:{contentType:'image/webp'}})
    ])
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE characters SET summary=?,artwork_original_key=?,artwork_gallery_key=?,artwork_match_key=?,artwork_avatar_key=?,artwork_key=?,artwork_source_url=?,artwork_source_note=?,artwork_source_type=?,artwork_quality_status='verified',artwork_gallery_crop_json=?,artwork_match_crop_json=?,artwork_avatar_crop_json=?,artwork_verified_at=?,artwork_verified_by=?,updated_at=? WHERE id=?`).bind(input.summary,keys.original,keys.gallery,keys.match,keys.avatar,keys.gallery,input.sourceUrl??null,input.sourceNote??null,input.sourceType,JSON.stringify(input.galleryCrop),JSON.stringify(input.matchCrop),JSON.stringify(input.avatarCrop),iso(),actor.sub,iso(),characterId),
      c.env.DB.prepare(`UPDATE season_entries SET summary_snapshot=?,artwork_original_key_snapshot=?,artwork_gallery_key_snapshot=?,artwork_match_key_snapshot=?,artwork_avatar_key_snapshot=? WHERE character_id=? AND season_id IN (SELECT id FROM seasons WHERE status IN ('draft','published','live'))`).bind(input.summary,keys.original,keys.gallery,keys.match,keys.avatar,characterId),
      c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,after_json) VALUES(?,?,?,?,?,?,?)`).bind(id(),actor.sub,'artwork_published','character',characterId,input.reason,JSON.stringify({keys,sourceType:input.sourceType,revision}))
    ])
  } catch(error) { await Promise.all(Object.values(keys).map((key)=>c.env.MEDIA.delete(key))); throw error }
  return c.json({ok:true,keys,character:{artworkQualityStatus:'verified',artworkOriginalKey:keys.original,artworkGalleryKey:keys.gallery,artworkMatchKey:keys.match,artworkAvatarKey:keys.avatar,artworkGalleryCrop:JSON.stringify(input.galleryCrop),artworkMatchCrop:JSON.stringify(input.matchCrop),artworkAvatarCrop:JSON.stringify(input.avatarCrop)}})
})

app.delete('/api/admin/characters/:characterId/artwork', async (c) => {
  const session=c.get('session'); if(!requireRole(session,['operator','admin']))return c.json({error:'无权移除素材'},403)
  const actor=session!; const body=await c.req.json<{reason?:string}>(); if(!body.reason||body.reason.trim().length<5)return c.json({error:'请填写至少5字的原因'},400)
  const characterId=c.req.param('characterId'); const row=await c.env.DB.prepare(`SELECT id FROM characters WHERE id=?`).bind(characterId).first(); if(!row)return c.json({error:'角色不存在'},404)
  await c.env.DB.batch([c.env.DB.prepare(`UPDATE characters SET artwork_original_key=NULL,artwork_gallery_key=NULL,artwork_match_key=NULL,artwork_avatar_key=NULL,artwork_key=NULL,artwork_quality_status='pending',updated_at=? WHERE id=?`).bind(iso(),characterId),c.env.DB.prepare(`UPDATE season_entries SET artwork_original_key_snapshot=NULL,artwork_gallery_key_snapshot=NULL,artwork_match_key_snapshot=NULL,artwork_avatar_key_snapshot=NULL WHERE character_id=? AND season_id IN (SELECT id FROM seasons WHERE status IN ('draft','published','live'))`).bind(characterId),c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason) VALUES(?,?,?,?,?,?)`).bind(id(),actor.sub,'artwork_removed','character',characterId,body.reason)])
  return c.json({ok:true})
})

app.post('/api/admin/local-data', zValidator('json', localActionInput), async (c) => {
  const session=c.get('session'); if(!requireRole(session,['admin'])||!isLocalDev(c.env)) return c.json({error:'此操作仅限本地管理员测试'},403)
  const actor=session!; const input=c.req.valid('json')
  if(input.action==='clear-votes') await c.env.DB.batch([c.env.DB.prepare(`DELETE FROM votes`),c.env.DB.prepare(`UPDATE matches SET left_votes=0,right_votes=0`),c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason) VALUES(?,?,?,?,?,?)`).bind(id(),actor.sub,'local_clear_votes','local','votes',input.reason)])
  if(input.action==='simulate-round') await c.env.DB.batch([c.env.DB.prepare(`UPDATE matches SET left_votes=left_votes+100,right_votes=right_votes+80 WHERE status='live'`),c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason) VALUES(?,?,?,?,?,?)`).bind(id(),actor.sub,'local_simulate_round','local','round',input.reason)])
  return c.json({ok:true})
})

app.get('/api/admin/matches', async (c) => {
  const session = c.get('session'); if (!requireRole(session, ['operator', 'admin'])) return c.json({ error: '无权访问' }, 403)
  const result=await c.env.DB.prepare(`SELECT m.id,m.group_code AS groupCode,m.left_votes AS leftVotes,m.right_votes AS rightVotes,m.status,COALESCE(le.name_snapshot,lc.name) AS leftName,COALESCE(re.name_snapshot,rc.name) AS rightName,r.name AS roundName FROM matches m JOIN tournament_rounds r ON r.id=m.round_id JOIN seasons s ON s.id=r.season_id JOIN characters lc ON lc.id=m.left_character_id JOIN characters rc ON rc.id=m.right_character_id LEFT JOIN season_entries le ON le.season_id=s.id AND le.character_id=lc.id LEFT JOIN season_entries re ON re.season_id=s.id AND re.character_id=rc.id WHERE s.is_current=1 ORDER BY r.starts_at DESC,m.group_code,m.bracket_position LIMIT 128`).all()
  return c.json({ matches: result.results })
})

app.get('/api/admin/audit-logs', async (c) => {
  const session = c.get('session'); if (!requireRole(session, ['operator', 'admin'])) return c.json({ error: '无权访问' }, 403)
  const result = await c.env.DB.prepare(`SELECT a.id,a.action,a.entity_type AS entityType,a.entity_id AS entityId,a.reason,a.created_at AS createdAt,u.email AS actorEmail FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100`).all()
  return c.json({ logs: result.results })
})

app.get('/api/admin/settings', async (c) => {
  const session = c.get('session'); if (!requireRole(session, ['operator', 'admin'])) return c.json({ error: '无权访问' }, 403)
  const result = await c.env.DB.prepare('SELECT key,value,updated_at AS updatedAt,updated_by AS updatedBy FROM settings ORDER BY key').all()
  return c.json({ settings: result.results })
})

app.put('/api/admin/settings/:key', zValidator('json', settingInput), async (c) => {
  const session = c.get('session'); if (!requireRole(session, ['admin'])) return c.json({ error: '仅管理员可修改系统配置' }, 403)
  const actor = session!
  const key = c.req.param('key'); const { value, reason } = c.req.valid('json')
  const before = await c.env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first<{ value:string }>()
  if (!before) return c.json({ error: '配置项不存在' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE settings SET value=?,updated_at=?,updated_by=? WHERE key=?').bind(value, iso(), actor.sub, key),
    c.env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,before_json,after_json) VALUES(?,?,?,?,?,?,?,?)').bind(id(), actor.sub, 'setting_updated', 'setting', key, reason, JSON.stringify(before), JSON.stringify({ value }))
  ])
  return c.json({ ok: true })
})

app.patch('/api/admin/matches/:matchId', zValidator('json', editMatchInput), async (c) => {
  const session = c.get('session'); if (!requireRole(session, ['admin'])) return c.json({ error: '仅管理员可调整赛况' }, 403)
  const actor = session!
  const matchId = c.req.param('matchId'); const input = c.req.valid('json')
  const before=await c.env.DB.prepare(`SELECT m.status,m.left_votes AS leftVotes,m.right_votes AS rightVotes,s.id AS seasonId,s.status AS seasonStatus,s.history_unlocked AS historyUnlocked FROM matches m JOIN tournament_rounds r ON r.id=m.round_id JOIN seasons s ON s.id=r.season_id WHERE m.id=?`).bind(matchId).first<{status:string;leftVotes:number;rightVotes:number;seasonId:string;seasonStatus:SeasonStatus;historyUnlocked:number}>()
  if(!before)return c.json({error:'对局不存在'},404)
  if(!canEditSeason({status:before.seasonStatus,historyUnlocked:Boolean(before.historyUnlocked)}))return c.json({error:'历史赛季已锁定'},409)
  const after = { ...before, status: input.status ?? before.status, leftVotes: input.leftVotes ?? before.leftVotes, rightVotes: input.rightVotes ?? before.rightVotes }
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE matches SET status=?,left_votes=?,right_votes=?,updated_at=? WHERE id=?').bind(after.status, after.leftVotes, after.rightVotes, iso(), matchId),
    c.env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,before_json,after_json,season_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(id(),actor.sub,'match_adjusted','match',matchId,input.reason,JSON.stringify(before),JSON.stringify(after),before.seasonId)
  ])
  const room = c.env.MATCH_ROOM.get(c.env.MATCH_ROOM.idFromName(matchId))
  await room.fetch('https://match-room/publish', { method:'POST', body:JSON.stringify({ type:'score', matchId, leftVotes:after.leftVotes, rightVotes:after.rightVotes }) })
  return c.json({ ok: true, match: after })
})

app.get('/api/admin/risk/votes', async (c) => {
  const session = c.get('session'); if (!requireRole(session, ['operator', 'admin'])) return c.json({ error: '无权访问' }, 403)
  const result=await c.env.DB.prepare(`SELECT v.id,v.match_id AS matchId,v.character_id AS characterId,v.created_at AS createdAt,u.email FROM votes v JOIN users u ON u.id=v.voter_id JOIN matches m ON m.id=v.match_id JOIN tournament_rounds r ON r.id=m.round_id JOIN seasons s ON s.id=r.season_id WHERE s.is_current=1 AND v.risk_status='pending' ORDER BY v.created_at ASC LIMIT 100`).all()
  return c.json({ votes: result.results })
})

app.post('/api/admin/risk/votes/:voteId', zValidator('json', reviewVoteInput), async (c) => {
  const session = c.get('session'); if (!requireRole(session, ['admin'])) return c.json({ error: '仅管理员可审核异常票' }, 403)
  const actor = session!
  const voteId = c.req.param('voteId'); const { action, reason } = c.req.valid('json')
  const vote = await c.env.DB.prepare('SELECT id,match_id AS matchId,character_id AS characterId,risk_status AS riskStatus FROM votes WHERE id=?').bind(voteId).first<{id:string,matchId:string,characterId:string,riskStatus:string}>()
  if (!vote || vote.riskStatus !== 'pending') return c.json({ error: '异常票不存在或已处理' }, 404)
  const status = action === 'approve' ? 'approved' : action === 'revoke' ? 'revoked' : 'rejected'
  const statements = [c.env.DB.prepare('UPDATE votes SET risk_status=?,reviewed_at=?,reviewed_by=?,review_note=? WHERE id=?').bind(status, iso(), actor.sub, reason, voteId)]
  if (status === 'approved') statements.push(c.env.DB.prepare('UPDATE matches SET left_votes=left_votes + CASE WHEN left_character_id=? THEN 1 ELSE 0 END,right_votes=right_votes + CASE WHEN right_character_id=? THEN 1 ELSE 0 END,updated_at=? WHERE id=?').bind(vote.characterId,vote.characterId,iso(),vote.matchId))
  statements.push(c.env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,reason,before_json,after_json) VALUES(?,?,?,?,?,?,?,?)').bind(id(),actor.sub,'risk_vote_reviewed','vote',voteId,reason,JSON.stringify({riskStatus:'pending'}),JSON.stringify({riskStatus:status})))
  await c.env.DB.batch(statements)
  return c.json({ ok: true, status })
})

app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: '接口不存在' }, 404)
  const response=await c.env.ASSETS.fetch(c.req.raw)
  if(!c.req.path.startsWith('/artwork/'))return response
  const cached=new Response(response.body,response)
  cached.headers.set('cache-control',artworkCacheControl())
  return cached
})
app.onError((error, c) => { if(error instanceof HTTPException)return c.json({error:error.message},error.status);console.error(error); return c.json({ error: '服务器暂时不可用' }, 500) })

export default {
  fetch: app.fetch,
  scheduled: async (controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduledLifecycle(env,new Date(controller.scheduledTime)))
  }
}
