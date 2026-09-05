import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Keep the originally published files addressable by content, including after a rebuild.
const manifest=JSON.parse(readFileSync('src/data/legacy-assets.json','utf8'))
for(const [source,target] of Object.entries(manifest)){
  const file=`public${source}`
  const digest=createHash('sha256').update(readFileSync(file)).digest('hex')
  if(!target.includes(digest))throw new Error(`历史素材不可覆盖：${file}。请为新素材创建新版本路径。`)
  mkdirSync(dirname(`dist${target}`),{recursive:true})
  copyFileSync(file,`dist${target}`)
}
console.log(`已保留 ${Object.keys(manifest).length} 个历史素材的内容版本`)
