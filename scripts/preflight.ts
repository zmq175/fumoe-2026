import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { checkDeploymentConfig } from './preflight-lib.ts'

const root=resolve(import.meta.dirname,'..')
const allowPlaceholders=process.argv.includes('--allow-placeholders')
const config=JSON.parse(await readFile(resolve(root,'wrangler.jsonc'),'utf8'))
const issues=checkDeploymentConfig(config,{turnstileSiteKey:process.env.VITE_TURNSTILE_SITE_KEY})

if(issues.length){
  console.error('生产部署预检发现以下问题：')
  for(const item of issues)console.error(`- [${item.code}] ${item.message}`)
  if(!allowPlaceholders)process.exitCode=1
  else console.log('已启用 --allow-placeholders，仅验证预检逻辑，不代表可部署。')
}else console.log('生产部署预检通过。Cloudflare secrets 仍需在控制台确认：AUTH_SECRET、BREVO_API_KEY、TURNSTILE_SECRET。')
