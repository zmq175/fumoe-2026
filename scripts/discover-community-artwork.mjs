import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const catalog = JSON.parse(await readFile(resolve(root, 'assets/community-source-catalog.json'), 'utf8'))
const rosterSource = await readFile(resolve(root, 'src/data/tournament.ts'), 'utf8')
const roster = [...rosterSource.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(([, name, game], index) => ({ id: `c${String(index + 1).padStart(3, '0')}`, name, game }))
const agent = 'FuMoe2026ArchiveBot/1.0 (one-time public wiki artwork archive; contact: https://fumoe.example.com)'
const output = { generatedAt: new Date().toISOString(), mode: 'one-time', candidates: [], failed: [] }
const imagePattern = /https?:\/\/(?:patchwiki\.biligame\.com|wiki\.biligame\.com)[^"'<>\s]+?\.(?:png|jpe?g|webp)(?:\?[^"'<>\s]*)?/gi
const imageTagPattern = /<img\b[^>]*>/gi
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds))
const normalize = (value) => value.toLowerCase().replace(/[·・：:·\s\-]/g, '')
const imageScore = (url, name, tag = '') => {
  const decoded = decodeURIComponent(url)
  const alt = tag.match(/\balt=["']([^"']+)["']/i)?.[1] ?? ''
  let points = (normalize(decoded).includes(normalize(name)) ? 30 : 0) + (alt.includes(name) ? 20 : 0)
  if (alt.includes(`${name}立绘`) || alt.includes(`${name}全身`) || alt.includes(`${name}原画`)) points += 400
  if (/立绘|全身|原画|full|portrait/.test(decoded)) points += 180
  if (/thumb\/|\/\d+px-|卡牌|头像|图标|技能|icon|face/.test(decoded)) points -= 300
  if (/\.png|\.webp/.test(url)) points += 5
  return points
}

for (const character of roster) {
  const game = catalog.games[character.game]
  if (!game) { output.failed.push({ id: character.id, reason: '缺少 Wiki 目录' }); continue }
  const names = [character.name, ...(catalog.aliases?.[character.game]?.[character.name] ?? [])]
  const pageUrls = names.map((name) => `${game.wiki}${encodeURIComponent(name)}`)
  const candidates = []
  for (const pageUrl of pageUrls) {
    try {
      const response = await fetch(pageUrl, { headers: { 'user-agent': agent, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const sourcePage = response.url
      const html = await response.text()
      for (const tagMatch of html.matchAll(imageTagPattern)) {
        const tag = tagMatch[0]
        const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]
        if (!src?.startsWith('http')) continue
        const host = new URL(src).hostname
        if (!game.hosts.includes(host)) continue
        candidates.push({ url: src, sourcePage, score: imageScore(src, character.name, tag) })
      }
      for (const match of html.matchAll(imagePattern)) {
        const url = match[0].replaceAll('\\/', '/')
        const host = new URL(url).hostname
        if (!game.hosts.includes(host)) continue
        candidates.push({ url, sourcePage, score: imageScore(url, character.name) })
      }
      await sleep(1_000)
    } catch (error) { output.failed.push({ id: character.id, pageUrl, reason: error instanceof Error ? error.message : String(error) }) }
  }
  const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].sort((a, b) => b.score - a.score)
  output.candidates.push({ ...character, sourceType: 'community-wiki', candidates: unique.slice(0, 12), recommended: unique.find((candidate) => candidate.score >= 180) ?? null })
}
await mkdir(resolve(root, 'assets/reports'), { recursive: true })
await writeFile(resolve(root, 'assets/reports/community-artwork-discovery.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(`已完成一次性 Wiki 发现：${output.candidates.filter((entry) => entry.recommended).length}/${roster.length} 位角色有候选图。`)
