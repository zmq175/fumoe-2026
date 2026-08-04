import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const input = resolve(root, 'assets/processed/characters')
const bucket = process.env.R2_BUCKET ?? 'fumoe-2026-assets'
const files = []
async function walk(directory) {
  try { await stat(directory) } catch { return }
  for (const name of await readdir(directory)) {
    const absolute = resolve(directory, name); const info = await stat(absolute)
    if (info.isDirectory()) await walk(absolute)
    else if (name.endsWith('.webp')) files.push(absolute)
  }
}
await walk(input)
const commands = files.sort().map((file) => `npx wrangler r2 object put ${bucket}/characters/${relative(input, file).replaceAll('\\\\', '/')} --file=${relative(root, file)} --content-type=image/webp --remote`)
await writeFile(resolve(root, 'assets/processed/upload-artwork.sh'), `#!/usr/bin/env bash\nset -euo pipefail\n${commands.join('\n')}\n`)
const report = JSON.parse(await readFile(resolve(root, 'assets/processed/report.json'), 'utf8'))
console.log(`已生成 ${files.length} 个 R2 上传命令；${report.processed.length} 个角色具有审核过的立绘。`)
