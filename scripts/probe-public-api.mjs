// Public, sequential samples only. No authentication or production writes.
const origin=new URL(process.env.APP_URL??'https://moe.hooxi.co')
const rounds=Number(process.env.PERF_ROUNDS??3)
const budget=process.env.PERF_MAX_SERVER_MS?Number(process.env.PERF_MAX_SERVER_MS):Infinity
if(!Number.isInteger(rounds)||rounds<1||rounds>10||!(budget>0))throw Error('Invalid probe rounds or server budget')
const paths=['overview','matches','standings','characters','rounds','seasons']
const samples=[]
for(let round=0;round<rounds;round++)for(const endpoint of paths){
  const start=performance.now()
  const response=await fetch(new URL('/api/public/'+endpoint+(process.env.PERF_SEASON&&endpoint!=='overview'&&endpoint!=='seasons'?'?season='+encodeURIComponent(process.env.PERF_SEASON):''),origin),{signal:AbortSignal.timeout(15000)})
  const ttfb=performance.now()-start
  const bytes=(await response.arrayBuffer()).byteLength
  if(!response.ok)throw Error(`${endpoint}: HTTP ${response.status}`)
  const header=response.headers.get('server-timing')??''
  const duration=name=>{const value=header.match(new RegExp(`(?:^|, )${name};dur=([\\d.]+)`))?.[1];return value===undefined?null:Number(value)}
  const server=duration('total')
  if(server===null)throw Error(`${endpoint}: missing total Server-Timing`)
  const sample={round,endpoint,ttfbMs:Math.round(ttfb),totalMs:Math.round(performance.now()-start),serverMs:server,dbWaitMs:duration('db_wait'),dbSqlMs:duration('db_sql'),bytes,cache:response.headers.get('x-public-cache'),ray:response.headers.get('cf-ray')}
  samples.push(sample)
  console.log(JSON.stringify(sample))
}
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]
console.table(paths.map(endpoint=>{
  const rows=samples.filter(row=>row.endpoint===endpoint)
  return {endpoint,medianServerMs:median(rows.map(row=>row.serverMs)),medianTotalMs:median(rows.map(row=>row.totalMs)),overBudget:rows.filter(row=>row.serverMs>budget).length}
}))
if(samples.some(sample=>sample.serverMs>budget))process.exitCode=1
