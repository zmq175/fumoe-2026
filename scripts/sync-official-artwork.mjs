import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const discovery = JSON.parse(await readFile(resolve(root, 'assets/reports/official-artwork-discovery.json'), 'utf8'))
const manifestPath = resolve(root, 'assets/characters.manifest.json')
const sourceDirectory = resolve(root, 'assets/source')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const agent = 'FuMoe2026ArtworkBot/1.0 (+https://fumoe.example.com/artwork-policy; low-rate official-public-artwork-fetcher)'
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
const existing = new Map(manifest.characters.map((entry) => [entry.id, entry]))
const results = { generatedAt: new Date().toISOString(), downloaded: [], skipped: [], failed: [] }

for (const character of discovery.candidates) {
  const recommendation = character.recommended
  if (!recommendation) { results.skipped.push({ id: character.id, reason: '没有高置信度官方候选' }); continue }
  const host = new URL(recommendation.url).hostname
  if (!character.officialHosts.includes(host)) { results.skipped.push({ id: character.id, reason: '候选不属于官方白名单域名' }); continue }
  if (existing.get(character.id)?.status === 'approved') { results.skipped.push({ id: character.id, reason: '已下载，未覆盖' }); continue }
  try {
    const response = await fetch(recommendation.url, { headers: { 'user-agent': agent, referer: recommendation.sourcePage }, redirect: 'follow', signal: AbortSignal.timeout(35_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (!character.officialHosts.includes(new URL(response.url).hostname)) throw new Error('图片重定向至非白名单域名')
    const contentType = response.headers.get('content-type') ?? ''
    if (!/^image\/(png|jpeg|webp)/.test(contentType)) throw new Error(`不是受支持的图片：${contentType}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength < 20_000) throw new Error('图片文件过小')
    const extension = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg'
    const relativeFile = `assets/source/${character.id}${extension}`
    const temporary = resolve(root, `${relativeFile}.part`)
    const destination = resolve(root, relativeFile)
    await mkdir(sourceDirectory, { recursive: true }); await writeFile(temporary, buffer); await rename(temporary, destination)
    const entry = { id: character.id, sourceFile: relativeFile, sourceUrl: response.url, discoveryPage: recommendation.sourcePage, officialHost: new URL(response.url).hostname, sha256: createHash('sha256').update(buffer).digest('hex'), status: 'approved', reviewedBy: 'fumoe-official-artwork-bot', reviewedAt: new Date().toISOString().slice(0, 10), focus: { x: 50, y: 48 }, notes: `自动发现，高置信度评分 ${recommendation.score}；仅使用官方公开来源。` }
    existing.set(character.id, entry); results.downloaded.push({ id: character.id, bytes: buffer.byteLength, sourceUrl: response.url })
    await sleep(1_100)
  } catch (error) { results.failed.push({ id: character.id, url: recommendation.url, error: error instanceof Error ? error.message : String(error) }) }
}
manifest.characters = [...existing.values()].sort((a, b) => a.id.localeCompare(b.id))
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
await mkdir(resolve(root, 'assets/reports'), { recursive: true })
await writeFile(resolve(root, 'assets/reports/official-artwork-sync.json'), `${JSON.stringify(results, null, 2)}\n`)
console.log(`已下载 ${results.downloaded.length} 张；跳过 ${results.skipped.length} 张；失败 ${results.failed.length} 张。`)
