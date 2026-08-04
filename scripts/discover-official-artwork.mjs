import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const catalog = JSON.parse(await readFile(resolve(root, 'assets/source-catalog.json'), 'utf8'))
const rosterSource = await readFile(resolve(root, 'src/data/tournament.ts'), 'utf8')
const roster = [...rosterSource.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(([, name, game, summary], index) => ({ id: `c${String(index + 1).padStart(3, '0')}`, name, game, summary }))
const outputDirectory = resolve(root, 'assets/reports')
await mkdir(outputDirectory, { recursive: true })
const agent = 'FuMoe2026ArtworkBot/1.0 (+https://fumoe.example.com/artwork-policy; low-rate official-public-artwork-fetcher)'
const imagePattern = /https?:\\?\/\\?\/[^"'<>\\\s]+?\.(?:png|jpe?g|webp)(?:\?[^"'<>\\\s]*)?/gi
const htmlImagePattern = /<(?:img|source)[^>]+?(?:src|srcset|data-src)=["']([^"']+)["']/gi
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
const normalize = (value) => value.toLowerCase().replace(/[·・：:·\s\-]/g, '')
const unescapeUrl = (value) => value.replaceAll('\\/', '/').replaceAll('&amp;', '&')
const isAllowed = (url, configuration) => configuration.officialHosts.includes(new URL(url).hostname)

async function pageAssets(url, configuration) {
  if (!isAllowed(url, configuration)) throw new Error(`页面不在白名单域名：${url}`)
  const response = await fetch(url, { headers: { 'user-agent': agent, accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(25_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (!isAllowed(response.url, configuration)) throw new Error(`跳转至非白名单域名：${response.url}`)
  const text = await response.text()
  const assets = new Set()
  for (const match of text.matchAll(imagePattern)) assets.add(unescapeUrl(match[0]))
  for (const match of text.matchAll(htmlImagePattern)) {
    for (const value of match[1].split(',')) {
      const urlCandidate = value.trim().split(' ')[0]
      if (urlCandidate.startsWith('http')) assets.add(unescapeUrl(urlCandidate))
      if (urlCandidate.startsWith('/')) assets.add(new URL(urlCandidate, response.url).href)
    }
  }
  return { finalUrl: response.url, assets: [...assets].filter((asset) => { try { return isAllowed(asset, configuration) } catch { return false } }) }
}

function score(candidate, character) {
  const url = normalize(candidate.url)
  const name = normalize(character.name)
  let points = 0
  if (url.includes(name)) points += 100
  if (/character|role|avatar|portrait|full|stand|figure|card/.test(url)) points += 20
  if (/\.png|\.webp/.test(url)) points += 8
  if (candidate.context.includes(name)) points += 40
  return points
}

const byGame = new Map(roster.map((character) => [character.game, []]))
for (const character of roster) byGame.get(character.game).push(character)
const report = { generatedAt: new Date().toISOString(), crawler: agent, games: {}, candidates: [], errors: [] }

for (const [game, characters] of byGame) {
  const configuration = catalog.games[game]
  const candidates = []
  for (const startUrl of configuration.startUrls) {
    try {
      const result = await pageAssets(startUrl, configuration)
      candidates.push(...result.assets.map((url) => ({ url, sourcePage: result.finalUrl, context: '' })))
      await sleep(1_100)
    } catch (error) { report.errors.push({ game, page: startUrl, error: error instanceof Error ? error.message : String(error) }) }
  }
  report.games[game] = { pages: configuration.startUrls, assetsFound: candidates.length }
  for (const character of characters) {
    const ranked = candidates.map((candidate) => ({ ...candidate, score: score(candidate, character) })).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score)
    report.candidates.push({ ...character, officialHosts: configuration.officialHosts, candidates: ranked.slice(0, 8), recommended: ranked[0] && ranked[0].score >= 100 ? ranked[0] : null })
  }
}
await writeFile(resolve(outputDirectory, 'official-artwork-discovery.json'), `${JSON.stringify(report, null, 2)}\n`)
const recommended = report.candidates.filter((entry) => entry.recommended).length
console.log(`已扫描 ${Object.keys(report.games).length} 个官方起始页；为 ${recommended}/${roster.length} 位角色找到高置信度官方候选。`)
