import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const catalog = JSON.parse(await readFile(resolve(root, 'assets/community-source-catalog.json'), 'utf8'))
const rosterSource = await readFile(resolve(root, 'src/data/tournament.ts'), 'utf8')
const roster = [...rosterSource.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(([, name, game], index) => ({ id: `c${String(index + 1).padStart(3, '0')}`, name, game }))
const agent = 'FuMoe2026ArchiveBot/1.0 (one-time artwork archive; contact: https://fumoe.example.com)'
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds))
const normalize = (value) => value.toLowerCase().replace(/[·・：:·\s\-_]/g, '')
const report = { generatedAt: new Date().toISOString(), method: 'mediawiki-imageinfo', candidates: [], failures: [] }

function pageSlug(url) { return new URL(url).pathname.split('/').filter(Boolean).at(-1) }
function score(file, character, aliases) {
  const title = decodeURIComponent(file.title ?? '')
  const normalized = normalize(title)
  let points = 0
  if ([character.name, ...aliases].some((name) => normalized.includes(normalize(name)))) points += 140
  if (/立绘|全身|原画|角色.*(?:介绍|展示)|character.*(?:full|portrait)/i.test(title)) points += 300
  if (/皮肤|换装|时装/i.test(title)) points -= 30
  if (/头像|卡牌|技能|图标|icon|face|thumb/i.test(title)) points -= 500
  if ((file.imageinfo?.[0]?.width ?? 0) >= 600 && (file.imageinfo?.[0]?.height ?? 0) >= 900) points += 100
  if ((file.imageinfo?.[0]?.height ?? 0) / Math.max(1, file.imageinfo?.[0]?.width ?? 0) >= 1.1) points += 60
  return points
}

for (const character of roster) {
  const config = catalog.games[character.game]
  if (!config) { report.failures.push({ id: character.id, reason: '无 Wiki 配置' }); continue }
  const slug = pageSlug(config.wiki)
  const aliases = config.aliases?.[character.name] ?? catalog.aliases?.[character.game]?.[character.name] ?? []
  const names = [character.name, ...aliases]
  const candidates = []
  for (const title of names) {
    try {
      const endpoint = new URL(`https://wiki.biligame.com/${slug}/api.php`)
      endpoint.search = new URLSearchParams({ action: 'query', generator: 'images', titles: title, prop: 'imageinfo', iiprop: 'url|size|mime', gimlimit: 'max', format: 'json', formatversion: '2', origin: '*' }).toString()
      const response = await fetch(endpoint, { headers: { 'user-agent': agent, accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      for (const page of data.query?.pages ?? []) {
        const url = page.imageinfo?.[0]?.url
        if (!url?.startsWith('https://patchwiki.biligame.com/images/')) continue
        candidates.push({ url, sourcePage: `${config.wiki}${encodeURIComponent(title)}`, fileTitle: page.title, width: page.imageinfo?.[0]?.width, height: page.imageinfo?.[0]?.height, mime: page.imageinfo?.[0]?.mime, score: score(page, character, aliases) })
      }
      await sleep(700)
    } catch (error) { report.failures.push({ id: character.id, title, reason: error instanceof Error ? error.message : String(error) }) }
  }
  const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].sort((a, b) => b.score - a.score)
  report.candidates.push({ ...character, sourceType: 'community-wiki', candidates: unique.slice(0, 16), recommended: unique.find((candidate) => candidate.score >= 360) ?? null })
}
await mkdir(resolve(root, 'assets/reports'), { recursive: true })
await writeFile(resolve(root, 'assets/reports/community-artwork-api-discovery.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`Wiki 文件 API 为 ${report.candidates.filter((entry) => entry.recommended).length}/${roster.length} 位角色找到高质量候选。`)
