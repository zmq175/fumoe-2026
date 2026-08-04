import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const discovery = JSON.parse(await readFile(resolve(root, 'assets/reports/community-portrait-selection.json'), 'utf8'))
const manifestPath = resolve(root, 'assets/characters.manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const approved = new Map(manifest.characters.map((entry) => [entry.id, entry]))
const agent = 'FuMoe2026ArchiveBot/1.0 (one-time public wiki artwork archive; contact: https://fumoe.example.com)'
const output = { generatedAt: new Date().toISOString(), mode: 'one-time', downloaded: [], skipped: [], failed: [] }
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds))

for (const character of discovery.selected) {
  if (approved.has(character.id)) { output.skipped.push({ id: character.id, reason: '已有官方素材' }); continue }
  if (!character.recommended) { output.skipped.push({ id: character.id, reason: '没有候选图' }); continue }
  try {
    const response = await fetch(character.recommended.url, { headers: { 'user-agent': agent, referer: character.recommended.sourcePage }, redirect: 'follow', signal: AbortSignal.timeout(35_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const type = response.headers.get('content-type') ?? ''
    if (!/^image\/(png|jpeg|webp)/.test(type)) throw new Error(`不支持的格式：${type}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength < 20_000) throw new Error('文件过小')
    const extension = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg'
    const relativeFile = `assets/source/${character.id}${extension}`
    const destination = resolve(root, relativeFile)
    await mkdir(resolve(root, 'assets/source'), { recursive: true })
    await writeFile(`${destination}.part`, buffer); await rename(`${destination}.part`, destination)
    approved.set(character.id, { id: character.id, sourceFile: relativeFile, sourceUrl: response.url, discoveryPage: character.recommended.sourcePage, officialHost: new URL(response.url).hostname, sha256: createHash('sha256').update(buffer).digest('hex'), sourceType: 'community-wiki', status: 'approved', reviewedBy: 'fumoe-one-time-import', reviewedAt: new Date().toISOString().slice(0, 10), focus: { x: 50, y: 48 }, notes: '一次性上线前归档；生产环境不再请求第三方来源。' })
    output.downloaded.push({ id: character.id, bytes: buffer.byteLength })
    await sleep(1_000)
  } catch (error) { output.failed.push({ id: character.id, error: error instanceof Error ? error.message : String(error) }) }
}
manifest.characters = [...approved.values()].sort((a, b) => a.id.localeCompare(b.id))
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(resolve(root, 'assets/reports/community-artwork-archive.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(`已一次性归档 ${output.downloaded.length} 张；跳过 ${output.skipped.length} 张；失败 ${output.failed.length} 张。`)
