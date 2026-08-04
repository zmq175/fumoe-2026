import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const catalog = JSON.parse(await readFile(resolve(root, 'assets/community-source-catalog.json'), 'utf8'))
const rosterSource = await readFile(resolve(root, 'src/data/tournament.ts'), 'utf8')
const roster = [...rosterSource.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(([, name, game], index) => ({ id: `c${String(index + 1).padStart(3, '0')}`, name, game }))
const agent = 'FuMoe2026ArchiveBot/1.0 (one-time artwork archive; contact: https://fumoe.example.com)'
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds))
const normalize = (value) => value.toLowerCase().replace(/[·・：:·\s\-_]/g, '')
const report = { generatedAt: new Date().toISOString(), method: 'mediawiki-batched-imageinfo', candidates: [], failures: [] }

function slug(url) { return new URL(url).pathname.split('/').filter(Boolean).at(-1) }
async function api(gameSlug, parameters) {
  const endpoint = new URL(`https://wiki.biligame.com/${gameSlug}/api.php`)
  endpoint.search = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...parameters }).toString()
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(endpoint, { headers: { 'user-agent': agent, accept: 'application/json' }, signal: AbortSignal.timeout(45_000) })
    if (response.ok) return response.json()
    if (response.status !== 567 || attempt === 2) throw new Error(`HTTP ${response.status}`)
    await sleep(8_000 * (attempt + 1))
  }
}
function scoreFile(title, character, aliases) {
  const text = decodeURIComponent(title)
  let points = [character.name, ...aliases].some((name) => normalize(text).includes(normalize(name))) ? 140 : 0
  if (/立绘|全身|原画|角色.*(?:介绍|展示)|character.*(?:full|portrait)/i.test(text)) points += 300
  if (/头像|卡牌|技能|图标|icon|face|thumb/i.test(text)) points -= 500
  return points
}

for (const [game, config] of Object.entries(catalog.games)) {
  const characters = roster.filter((character) => character.game === game)
  if (!characters.length) continue
  const aliasesByName = Object.fromEntries(characters.map((character) => [character.name, catalog.aliases?.[game]?.[character.name] ?? []]))
  const titles = characters.flatMap((character) => [character.name, ...aliasesByName[character.name]])
  const gameSlug = slug(config.wiki)
  try {
    const pageData = await api(gameSlug, { action: 'query', prop: 'images', titles: titles.join('|'), imlimit: 'max' })
    const pageMap = new Map(pageData.query?.pages?.map((page) => [page.title, page]) ?? [])
    const selections = []
    for (const character of characters) {
      const page = [character.name, ...aliasesByName[character.name]].map((title) => pageMap.get(title)).find(Boolean)
      const files = (page?.images ?? []).map((image) => image.title).map((title) => ({ title, score: scoreFile(title, character, aliasesByName[character.name]) })).filter((file) => file.score >= 350).sort((a, b) => b.score - a.score).slice(0, 3)
      selections.push({ character, files })
    }
    await sleep(3_000)
    const fileTitles = [...new Set(selections.flatMap((selection) => selection.files.map((file) => file.title)))]
    const info = fileTitles.length ? await api(gameSlug, { action: 'query', prop: 'imageinfo', titles: fileTitles.join('|'), iiprop: 'url|size|mime' }) : { query: { pages: [] } }
    const infoMap = new Map(info.query?.pages?.map((page) => [page.title, page]) ?? [])
    for (const { character, files } of selections) {
      const candidates = files.map((file) => {
        const page = infoMap.get(file.title); const image = page?.imageinfo?.[0]
        return image?.url?.startsWith('https://patchwiki.biligame.com/images/') ? { url: image.url, sourcePage: `${config.wiki}${encodeURIComponent(character.name)}`, fileTitle: file.title, width: image.width, height: image.height, mime: image.mime, score: file.score + (image.height / Math.max(1, image.width) >= 1.1 ? 60 : 0) } : null
      }).filter(Boolean).sort((a, b) => b.score - a.score)
      report.candidates.push({ ...character, sourceType: 'community-wiki', candidates, recommended: candidates[0] ?? null })
    }
    await sleep(3_000)
  } catch (error) {
    report.failures.push({ game, reason: error instanceof Error ? error.message : String(error) })
    for (const character of characters) report.candidates.push({ ...character, sourceType: 'community-wiki', candidates: [], recommended: null })
  }
}
await mkdir(resolve(root, 'assets/reports'), { recursive: true })
await writeFile(resolve(root, 'assets/reports/community-artwork-batched.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`批量文件 API 为 ${report.candidates.filter((entry) => entry.recommended).length}/128 位角色找到立绘候选。`)
