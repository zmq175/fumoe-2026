const raw=process.env.APP_URL
if(!raw)throw new Error('请设置 APP_URL，例如 APP_URL=https://vote.example.com npm run smoke:remote')
const base=new URL(raw)
if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw new Error('APP_URL 必须使用 HTTPS')

async function fetchChecked(path,kind){
  const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(10_000),headers:{accept:kind==='json'?'application/json':'text/html'}})
  if(!response.ok)throw new Error(`${path} 返回 ${response.status}`)
  if(kind==='json')return response.json()
  const text=await response.text();if(!text.toLowerCase().includes('<!doctype html'))throw new Error(`${path} 未返回 HTML`);return text
}

const health=await fetchChecked('/api/health','json')
if(health.ok!==true)throw new Error(`健康检查未就绪：${(health.issues??[]).join(', ')}`)
const overview=await fetchChecked('/api/public/overview','json')
const seasons=await fetchChecked('/api/public/seasons','json')
for(const path of ['/api/public/rounds','/api/public/matches','/api/public/standings']){
  const body=await fetchChecked(path,'json');const key=path.split('/').at(-1);if(!Array.isArray(body[key]))throw new Error(`${path} 响应结构错误`)
}
await fetchChecked('/','html')
await fetchChecked('/seasons','html')
const slug=overview.season?.slug??seasons.seasons?.[0]?.slug
if(slug)await fetchChecked(`/seasons/${encodeURIComponent(slug)}`,'html')
console.log(`远端只读冒烟测试通过：${base.origin}${slug?` · 赛季 ${slug}`:''}`)
