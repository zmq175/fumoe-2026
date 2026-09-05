import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import worker from './index'
import { createSession } from './security'
import { legacyFormat, type SeasonFormat } from '../lib/season-format'
import { runScheduledLifecycle } from './lifecycle'
import { calculateSeasonStandingsV1 } from './season-results'
import type { Env } from './types'

const databases:DatabaseSync[]=[]
afterEach(()=>{databases.splice(0).forEach(db=>db.close())})
function database(){
  const sql=new DatabaseSync(':memory:');databases.push(sql)
  sql.exec('PRAGMA foreign_keys=ON')
  const prepare=(query:string,values:Array<string|number|null>=[])=>({
    bind:(...args:Array<string|number|null>)=>{if(args.length>100)throw new Error('D1 bound parameter limit exceeded');return prepare(query,args)},
    first:async(column?:string)=>{const row=sql.prepare(query).get(...values);return column?row?.[column]??null:row??null},
    all:async()=>({results:sql.prepare(query).all(...values),success:true}),
    run:async()=>{const result=sql.prepare(query).run(...values);return {success:true,results:[],meta:{changes:Number(result.changes)}}}
  })
  const db={prepare,batch:async(statements:ReturnType<typeof prepare>[])=>{sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result}catch(error){sql.exec('ROLLBACK');throw error}}} as unknown as D1Database
  const files=readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort()
  for(const file of files.filter(f=>f<'0008'))sql.exec(readFileSync(`migrations/${file}`,'utf8'))
  sql.exec("INSERT INTO users(id,email,role) VALUES('admin','admin@test.example','admin'); INSERT INTO games(id,name,sort_order) VALUES('old-game','旧游戏',1)")
  for(let i=0;i<128;i++)sql.prepare("INSERT INTO characters(id,game_id,name,summary) VALUES(?,'old-game',?,'旧简介')").run(`old-${i}`,`旧角色${i}`)
  sql.exec("UPDATE seasons SET is_current=0; INSERT INTO seasons(id,slug,name,status,is_current,champion_character_id) VALUES('old','old','上一赛季','completed',1,'old-0')")
  for(let i=0;i<128;i++)sql.prepare("INSERT INTO season_entries(id,season_id,character_id,group_code,seed,name_snapshot,game_snapshot) VALUES(?,'old',?,?,?,?, '旧游戏')").run(`entry-${i}`,`old-${i}`,String.fromCharCode(65+i%8),i+1,`旧角色${i}`)
  sql.exec("INSERT INTO tournament_rounds(id,season_id,stage,round_number,name,starts_at,ends_at,status) VALUES('old-final','old','knockout',4,'决赛','2029-01-01','2029-01-02','closed'); INSERT INTO matches(id,round_id,left_character_id,right_character_id,left_votes,right_votes,status,winner_character_id) VALUES('old-match','old-final','old-0','old-1',999,888,'closed','old-0')")
  const before={entries:sql.prepare('SELECT * FROM season_entries ORDER BY id').all(),matches:sql.prepare('SELECT * FROM matches ORDER BY id').all(),rounds:sql.prepare('SELECT * FROM tournament_rounds ORDER BY id').all()}
  for(const file of files.filter(f=>f>='0008'))sql.exec(readFileSync(`migrations/${file}`,'utf8'))
  const env={DB:db,APP_ORIGIN:'http://localhost',AUTH_SECRET:'integration-test-secret-at-least-32-characters',MATCH_ROOM:{idFromName:()=>({}),get:()=>({fetch:async()=>new Response('{}')})}} as unknown as Env
  return {sql,db,env,before}
}
async function client(env:Env){
  const cookie=`fumoe_session=${await createSession({sub:'admin',email:'admin@test.example',role:'admin'},env)}`
  return async(path:string,method='GET',body?:unknown)=>{
    const response=await worker.fetch(new Request(`http://localhost${path}`,{method,headers:{cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env,{waitUntil:()=>{}} as unknown as ExecutionContext)
    return {status:response.status,body:await response.json() as {seasonId:string;simulation:{roundMatchCounts:number[]};season:{format:SeasonFormat;championCharacterId:string};characters:unknown[];matches:unknown[];rounds:Array<{id:string;startsAt:string;endsAt:string}>}}
  }
}
const reason='隔离数据库配置验证'
const format256=():SeasonFormat=>({...legacyFormat(),participants:256,groupCount:16,swissRounds:5,rounds:Array.from({length:10},()=>({durationHours:48,breakHours:24})),factions:[{name:'新阵营',games:['新游戏'],accent:'#123456',logoPath:null}]})

describe('真实 SQLite 迁移、路由与赛季推进',()=>{
  it('迁移逐项保留旧名单、比分、冠军和轮次，移除 A–H 限制',async()=>{
    const {sql,db,before}=database()
    expect(sql.prepare('SELECT * FROM season_entries ORDER BY id').all()).toEqual(before.entries)
    expect(sql.prepare('SELECT * FROM matches ORDER BY id').all()).toEqual(before.matches)
    expect(sql.prepare('SELECT * FROM tournament_rounds ORDER BY id').all()).toEqual(before.rounds)
    expect(sql.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect((await calculateSeasonStandingsV1(db,'old'))).toHaveLength(128)
    expect(()=>sql.prepare("UPDATE seasons SET format_json='{}' WHERE id='old'").run()).toThrow('frozen')
  })
  it('256 人新游戏赛季跑完 30 天，休赛日不提前开赛，旧结果不变',async()=>{
    const {sql,env,before}=database(),request=await client(env),format=format256()
    const oldStandings=await calculateSeasonStandingsV1(env.DB,'old')
    const created=await request('/api/admin/seasons','POST',{name:'256 人月赛',slug:'monthly',startsAt:'2030-01-01T00:00:00.000Z',format,reason})
    expect(created.status,JSON.stringify(created.body)).toBe(201)
    const seasonId=created.body.seasonId
    const entries=Array.from({length:256},(_,i)=>({characterId:`new-${i}`,name:`新角色${i}`,game:'新游戏',summary:'新游戏参赛角色',groupCode:String.fromCharCode(65+i%16),seed:i+1}))
    const imported=await request(`/api/admin/seasons/${seasonId}/roster`,'PUT',{entries,reason})
    expect(imported.status,JSON.stringify(imported.body)).toBe(200)
    expect((await request(`/api/admin/seasons/${seasonId}/simulation`)).body.simulation.roundMatchCounts).toEqual([128,128,128,128,128,16,8,4,2,1])
    expect(sql.prepare('SELECT COUNT(*) AS n FROM matches').get()?.n).toBe(1)
    const published=await request(`/api/admin/seasons/${seasonId}/action`,'POST',{action:'publish',reason})
    expect(published.status,JSON.stringify(published.body)).toBe(200)
    expect((await request('/api/public/overview')).body.season.format.participants).toBe(256)
    expect((await request('/api/public/characters')).body.characters).toHaveLength(256)
    expect((await request('/api/public/matches')).body.matches).toHaveLength(128)
    const locked=await request(`/api/admin/seasons/${seasonId}/configuration`,'PUT',{format,startsAt:'2030-01-01T00:00:00.000Z',reason})
    expect(locked.status).toBe(409)
    sql.prepare("UPDATE seasons SET schedule_mode='scheduled' WHERE id=?").run(seasonId)
    const rounds=sql.prepare('SELECT id,starts_at AS startsAt,ends_at AS endsAt FROM tournament_rounds WHERE season_id=? ORDER BY starts_at').all(seasonId) as Array<{id:string;startsAt:string;endsAt:string}>
    expect((await runScheduledLifecycle(env,new Date('2030-01-01T00:00:00.000Z'))).started).toBe(0)
    for(const [i,round] of rounds.entries()){
      expect((await runScheduledLifecycle(env,new Date(round.startsAt))).started).toBe(1)
      expect(sql.prepare('SELECT COUNT(*) AS n FROM matches WHERE round_id=?').get(round.id)?.n).toBe([128,128,128,128,128,16,8,4,2,1][i])
      sql.prepare('UPDATE matches SET left_votes=20,right_votes=10 WHERE round_id=?').run(round.id)
      const closed=await runScheduledLifecycle(env,new Date(round.endsAt))
      expect(closed.closed).toBe(1);expect(closed.started).toBe(0)
    }
    expect(sql.prepare('SELECT status,champion_character_id FROM seasons WHERE id=?').get(seasonId)).toMatchObject({status:'completed',champion_character_id:expect.any(String)})
    expect(sql.prepare('SELECT standings_json FROM season_result_snapshots WHERE season_id=?').get(seasonId)).toBeTruthy()
    expect(sql.prepare("SELECT * FROM matches WHERE round_id='old-final'").all()).toEqual(before.matches)
    expect(await calculateSeasonStandingsV1(env.DB,'old')).toEqual(oldStandings)
    expect(sql.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect((await request('/api/public/seasons/old')).body.season.championCharacterId).toBe('old-0')
  })
  it('阻止陌生角色 ID 覆盖、错误名单与重叠排期，草稿可修改',async()=>{
    const {env}=database(),request=await client(env),format=format256()
    const created=await request('/api/admin/seasons','POST',{name:'下一赛季',slug:'draft',startsAt:'2030-01-01T00:00:00.000Z',format,reason}),id=created.body.seasonId
    expect((await request(`/api/admin/seasons/${id}/roster`,'PUT',{entries:[{characterId:'old-0',name:'覆盖旧角色',game:'新游戏',groupCode:'A',seed:1}],reason})).status).toBe(409)
    expect((await request(`/api/admin/seasons/${id}/action`,'POST',{action:'publish',reason})).status).toBe(409)
    const config=await request(`/api/admin/seasons/${id}/configuration`)
    const first=config.body.rounds[0],second=config.body.rounds[1]
    expect((await request(`/api/admin/seasons/${id}/schedule`,'PUT',{rounds:[{id:second.id,startsAt:first.startsAt,endsAt:first.endsAt}],reason})).status).toBe(400)
    expect((await request(`/api/admin/seasons/${id}/configuration`,'PUT',{format,startsAt:'2030-02-01T00:00:00.000Z',reason})).status).toBe(200)
  })
  it('128 场批量投票不超出 D1 参数限制，重复提交保持幂等',async()=>{
    const {sql,env}=database(),request=await client(env),format=format256()
    format.rounds[0].breakHours=0
    const created=await request('/api/admin/seasons','POST',{name:'批量投票测试',slug:'batch',startsAt:new Date(Date.now()-60_000).toISOString(),format,reason}),seasonId=created.body.seasonId
    const entries=Array.from({length:256},(_,i)=>({characterId:`batch-${i}`,name:`角色${i}`,game:'新游戏',groupCode:String.fromCharCode(65+i%16),seed:i+1}))
    expect((await request(`/api/admin/seasons/${seasonId}/roster`,'PUT',{entries,reason})).status).toBe(200)
    expect((await request(`/api/admin/seasons/${seasonId}/action`,'POST',{action:'publish',reason})).status).toBe(200)
    expect((await request(`/api/admin/seasons/${seasonId}/automation`,'PUT',{enabled:true,reason})).status).toBe(200)
    expect((await runScheduledLifecycle(env)).started).toBe(1)
    const choices=sql.prepare("SELECT m.id AS matchId,m.left_character_id AS characterId FROM matches m JOIN tournament_rounds r ON r.id=m.round_id WHERE r.season_id=? AND m.status='live'").all(seasonId)
    expect(choices).toHaveLength(128)
    const voted=await request('/api/votes','POST',{choices})
    expect(voted.status,JSON.stringify(voted.body)).toBe(200)
    expect(sql.prepare('SELECT COUNT(*) AS n FROM votes').get()?.n).toBe(128)
    expect((await request('/api/votes','POST',{choices})).status).toBe(200)
    expect(sql.prepare('SELECT COUNT(*) AS n FROM votes').get()?.n).toBe(128)
    expect(sql.prepare("SELECT SUM(left_votes) AS n FROM matches m JOIN tournament_rounds r ON r.id=m.round_id WHERE r.season_id=?").get(seasonId)?.n).toBe(128)
  })
})
