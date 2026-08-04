import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root=resolve(import.meta.dirname,'..')
const wrangler=resolve(root,'node_modules/.bin/wrangler')
const state=await mkdtemp(join(tmpdir(),'fumoe-season-simulation-'))
const port=8791
let server

const run=(args)=>execFileSync('npx',args,{cwd:root,stdio:'pipe',timeout:120_000})
const progress=(message)=>console.log(`[赛季演练] ${message}`)
const waitForServer=(child)=>new Promise((resolveReady,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('本地 Worker 启动超时')),60_000)
  const onData=(data)=>{const text=String(data);if(text.includes('Ready on')){clearTimeout(timeout);resolveReady()}}
  child.stdout.on('data',onData);child.stderr.on('data',onData);child.once('exit',(code)=>{clearTimeout(timeout);reject(new Error(`本地 Worker 提前退出：${code}`))})
})

async function inBatches(items,size,operation){
  for(let index=0;index<items.length;index+=size)await Promise.all(items.slice(index,index+size).map((item,itemIndex)=>operation(item,index+itemIndex)))
}

async function stopServer(child){
  if(!child||child.exitCode!==null)return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolveExit)=>child.once('exit',resolveExit)),
    new Promise((resolveTimeout)=>setTimeout(()=>{child.kill('SIGKILL');resolveTimeout()},3_000))
  ])
}

try {
  progress('创建隔离数据库并应用迁移')
  run(['wrangler','d1','migrations','apply','fumoe-2026','--local','--persist-to',state])
  progress('导入 128 位角色和首轮数据')
  execFileSync(process.execPath,['scripts/seed-local.mjs','--persist-to',state],{cwd:root,stdio:'pipe',timeout:120_000})
  progress('启动本地 Worker')
  server=spawn(wrangler,['dev','--local','--persist-to',state,'--port',String(port),'--var',`APP_ORIGIN:http://127.0.0.1:${port}`,'--var','DEV_AUTH_BYPASS:true','--var','ADMIN_EMAILS:admin@fumoe.local','--var','AUTH_SECRET:season-simulation-secret-at-least-32-characters'],{cwd:root,stdio:['ignore','pipe','pipe']})
  await waitForServer(server)

  let cookie=''
  async function request(path,init={}){
    const response=await fetch(`http://127.0.0.1:${port}${path}`,{...init,signal:AbortSignal.timeout(15_000),headers:{'content-type':'application/json',cookie,...init.headers}})
    const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0]
    const body=await response.json().catch(()=>({}))
    if(!response.ok)throw new Error(`${path}: ${response.status} ${body.error??'请求失败'}`)
    return body
  }

  progress('登录本地管理员')
  await request('/api/auth/request-code',{method:'POST',body:JSON.stringify({email:'admin@fumoe.local',turnstileToken:'local'})})
  await request('/api/auth/verify-code',{method:'POST',body:JSON.stringify({email:'admin@fumoe.local',code:'000000'})})

  const expected=[64,64,64,8,4,2,1]
  for(let index=0;index<7;index++){
    const rounds=(await request('/api/public/rounds')).rounds
    const round=rounds[index]
    if(!round)throw new Error(`缺少第 ${index+1} 轮`)
    progress(`第 ${index+1}/7 轮：${round.name}`)
    if(round.status==='scheduled')await request('/api/admin/tournament/control',{method:'POST',body:JSON.stringify({action:'start-now',roundId:round.id,reason:'自动完整赛季演练'})})
    const matches=(await request('/api/public/matches')).matches.filter((match)=>match.roundId===round.id)
    if(matches.length!==expected[index])throw new Error(`${round.name} 对局数错误：${matches.length}，预期 ${expected[index]}`)
    await inBatches(matches,8,(match,matchIndex)=>request(`/api/admin/matches/${match.id}`,{method:'PATCH',body:JSON.stringify({leftVotes:200+matchIndex,rightVotes:100+matchIndex,reason:'自动完整赛季演练'})}))
    await request('/api/admin/tournament/control',{method:'POST',body:JSON.stringify({action:'close',roundId:round.id,reason:'自动完整赛季演练'})})
  }

  const overview=await request('/api/public/overview')
  if(overview.season?.status!=='completed'||!overview.season.championCharacterId)throw new Error('决赛后未正确记录冠军或结束赛季')
  const finalMatches=(await request('/api/public/matches')).matches.filter((match)=>match.stage==='knockout'&&match.roundNumber===4)
  if(finalMatches.length!==1||finalMatches[0].winnerCharacterId!==overview.season.championCharacterId)throw new Error('冠军与决赛胜者不一致')
  console.log(`七轮演练通过：${expected.join('/')} 场，冠军 ${overview.season.championCharacterId}`)
} finally {
  progress('停止本地 Worker 并清理隔离数据')
  await stopServer(server)
  await rm(state,{recursive:true,force:true})
}
