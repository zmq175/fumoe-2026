import { execFileSync,spawn } from 'node:child_process'
import { mkdir,rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const root=resolve(import.meta.dirname,'..')
const wrangler=resolve(root,'node_modules/.bin/wrangler')
const state=resolve(process.argv[2]??'/tmp/fumoe-midstate-preview')
const port=8792
let server
const progress=(message)=>console.log(`[预览数据] ${message}`)
const run=(args)=>execFileSync(wrangler,args,{cwd:root,stdio:'pipe',timeout:120_000})
const waitForServer=(child)=>new Promise((resolveReady,reject)=>{const timeout=setTimeout(()=>reject(new Error('本地 Worker 启动超时')),60_000);const onData=(data)=>{if(String(data).includes('Ready on')){clearTimeout(timeout);resolveReady()}};child.stdout.on('data',onData);child.stderr.on('data',onData)})
async function stopServer(child){if(!child||child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([new Promise((resolveExit)=>child.once('exit',resolveExit)),new Promise((resolveTimeout)=>setTimeout(()=>{child.kill('SIGKILL');resolveTimeout()},3_000))])}
async function inBatches(items,size,operation){for(let index=0;index<items.length;index+=size)await Promise.all(items.slice(index,index+size).map((item,itemIndex)=>operation(item,index+itemIndex)))}

try{
  progress('重建隔离数据库')
  await rm(state,{recursive:true,force:true});await mkdir(state,{recursive:true})
  run(['d1','migrations','apply','fumoe-2026','--local','--persist-to',state])
  execFileSync(process.execPath,['scripts/seed-local.mjs','--persist-to',state],{cwd:root,stdio:'pipe',timeout:120_000})
  server=spawn(wrangler,['dev','--local','--persist-to',state,'--port',String(port),'--var',`APP_ORIGIN:http://127.0.0.1:${port}`,'--var','DEV_AUTH_BYPASS:true','--var','ADMIN_EMAILS:admin@fumoe.local','--var','AUTH_SECRET:midstate-preview-secret-at-least-32-characters'],{cwd:root,stdio:['ignore','pipe','pipe']})
  await waitForServer(server)
  let cookie=''
  async function request(path,init={}){const response=await fetch(`http://127.0.0.1:${port}${path}`,{...init,signal:AbortSignal.timeout(15_000),headers:{'content-type':'application/json',cookie,...init.headers}});const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`${path}: ${response.status} ${body.error??'失败'}`);return body}
  await request('/api/auth/request-code',{method:'POST',body:JSON.stringify({email:'admin@fumoe.local',turnstileToken:'local'})})
  await request('/api/auth/verify-code',{method:'POST',body:JSON.stringify({email:'admin@fumoe.local',code:'000000'})})
  const expected=[64,64,64,8,4,2,1]
  for(let index=0;index<7;index++){
    const round=(await request('/api/public/rounds')).rounds[index];progress(`生成赛果 ${index+1}/7：${round.name}`)
    if(round.status==='scheduled')await request('/api/admin/tournament/control',{method:'POST',body:JSON.stringify({action:'start-now',roundId:round.id,reason:'中间态预览数据生成'})})
    const matches=(await request('/api/public/matches')).matches.filter((match)=>match.roundId===round.id)
    if(matches.length!==expected[index])throw new Error(`${round.name} 对局数 ${matches.length}，预期 ${expected[index]}`)
    await inBatches(matches,8,(match,offset)=>request(`/api/admin/matches/${match.id}`,{method:'PATCH',body:JSON.stringify({leftVotes:1200+index*100+offset*7,rightVotes:980+index*80+offset*5,reason:'中间态预览数据生成'})}))
    await request('/api/admin/tournament/control',{method:'POST',body:JSON.stringify({action:'close',roundId:round.id,reason:'中间态预览数据生成'})})
  }
  const completed=(await request('/api/public/overview')).season
  await request(`/api/admin/seasons/${completed.id}`,{method:'PATCH',body:JSON.stringify({announcement:'府萌 2026 已圆满结束，完整赛程与冠军之路现已归档。',reason:'完善中间态预览公告'})})
  progress('创建并发布下一赛季')
  const next=await request('/api/admin/seasons',{method:'POST',body:JSON.stringify({name:'府萌 2027 春季赛',slug:'2027-spring',startsAt:'2027-03-01T12:00:00.000Z',copyFromSeasonId:completed.id,reason:'中间态预览下一赛季'})})
  await request(`/api/admin/seasons/${next.seasonId}`,{method:'PATCH',body:JSON.stringify({announcement:'新赛季名单已经公布，3 月 1 日正式开赛。',reason:'完善中间态预览公告'})})
  await request(`/api/admin/seasons/${next.seasonId}/action`,{method:'POST',body:JSON.stringify({action:'publish',reason:'中间态预览发布新赛季'})})
  progress('推进新赛季至瑞士轮第 2 轮进行中')
  let nextRounds=(await request('/api/public/rounds')).rounds
  await request('/api/admin/tournament/control',{method:'POST',body:JSON.stringify({action:'start-now',roundId:nextRounds[0].id,reason:'中间态预览启动首轮'})})
  let nextMatches=(await request('/api/public/matches')).matches.filter((match)=>match.roundId===nextRounds[0].id)
  await inBatches(nextMatches,8,(match,offset)=>request(`/api/admin/matches/${match.id}`,{method:'PATCH',body:JSON.stringify({leftVotes:620+offset*3,rightVotes:510+offset*2,reason:'中间态预览首轮赛果'})}))
  await request('/api/admin/tournament/control',{method:'POST',body:JSON.stringify({action:'close',roundId:nextRounds[0].id,reason:'中间态预览结算首轮'})})
  nextRounds=(await request('/api/public/rounds')).rounds
  await request('/api/admin/tournament/control',{method:'POST',body:JSON.stringify({action:'start-now',roundId:nextRounds[1].id,reason:'中间态预览启动第二轮'})})
  nextMatches=(await request('/api/public/matches')).matches.filter((match)=>match.roundId===nextRounds[1].id)
  await inBatches(nextMatches,8,(match,offset)=>request(`/api/admin/matches/${match.id}`,{method:'PATCH',body:JSON.stringify({leftVotes:180+offset*2,rightVotes:150+offset,reason:'中间态预览第二轮实时票数'})}))
  const [overview,standings]=await Promise.all([request('/api/public/overview'),request('/api/public/standings')])
  if(overview.season.status!=='live'||overview.round?.roundNumber!==2||nextMatches.length!==64||standings.standings.length!==128)throw new Error('新赛季中间态数据不一致')
  progress(`完成：${state}`)
  progress('管理员 admin@fumoe.local，验证码 000000')
}finally{await stopServer(server)}
