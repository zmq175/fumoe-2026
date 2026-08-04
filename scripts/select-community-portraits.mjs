import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..')
const discoveryPath = resolve(root, 'assets/reports/community-artwork-discovery.json')
const manifest = JSON.parse(await readFile(resolve(root, 'assets/characters.manifest.json'), 'utf8'))
const discovery = JSON.parse(await readFile(discoveryPath, 'utf8'))
const existing = new Set(manifest.characters.map((entry) => entry.id))
const agent = 'FuMoe2026ArchiveBot/1.0 (one-time public wiki artwork archive; contact: https://fumoe.example.com)'
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds))
const report = { generatedAt: new Date().toISOString(), mode: 'one-time', selected: [], skipped: [], failed: [] }

for (const character of discovery.candidates) {
  if (existing.has(character.id)) { report.skipped.push({ id: character.id, reason: '已归档' }); continue }
  const candidates = character.candidates.filter((candidate) => /\.(png|jpe?g|webp)(?:\?|$)/i.test(candidate.url) && !/thumb\/|\/\d+px-|头像|卡牌|图标|技能|icon|face/i.test(decodeURIComponent(candidate.url))).slice(0, 8)
  const measured = []
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, { headers: { 'user-agent': agent, referer: candidate.sourcePage }, signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const type = response.headers.get('content-type') ?? ''
      if (!/^image\/(png|jpeg|webp)/.test(type)) throw new Error('非静态图片')
      const buffer = Buffer.from(await response.arrayBuffer())
      const metadata = await sharp(buffer, { animated: false }).metadata()
      const width = metadata.width ?? 0; const height = metadata.height ?? 0
      if (width < 300 || height < 400 || buffer.byteLength < 45_000) continue
      const portraitRatio = height / width
      // Portrait-like tall illustrations score highest; large portrait art wins ties.
      const quality = Math.round(Math.min(portraitRatio, 3) * 1_000_000 + Math.log10(width * height) * 100_000 + candidate.score * 100)
      measured.push({ ...candidate, width, height, bytes: buffer.byteLength, quality })
    } catch (error) { report.failed.push({ id: character.id, url: candidate.url, error: error instanceof Error ? error.message : String(error) }) }
    await sleep(550)
  }
  const best = measured.filter((candidate) => candidate.height / candidate.width >= 1.05).sort((a, b) => b.quality - a.quality)[0]
  if (best) report.selected.push({ id: character.id, name: character.name, game: character.game, sourceType: 'community-wiki', recommended: best })
  else report.skipped.push({ id: character.id, reason: '未找到足够大的竖版图' })
}
await writeFile(resolve(root, 'assets/reports/community-portrait-selection.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`自动选择 ${report.selected.length} 张竖版角色图；跳过 ${report.skipped.length} 张；候选检查失败 ${report.failed.length} 次。`)
