import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import sharp from 'sharp'
import { selectPortraitCandidate } from './portrait-candidates.ts'

const root = resolve(import.meta.dirname, '..')
const catalog = JSON.parse(await readFile(resolve(root, 'assets/community-source-catalog.json'), 'utf8'))
const rosterSource = await readFile(resolve(root, 'src/data/tournament.ts'), 'utf8')
const roster = [...rosterSource.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(([, name, game], index) => ({ id: `c${String(index + 1).padStart(3, '0')}`, name, game }))
const portraitRoot = resolve(root, 'assets/portraits')
const sourceRoot = resolve(portraitRoot, 'source')
const processedRoot = resolve(portraitRoot, 'processed')
const reportPath = resolve(root, 'assets/reports/portrait-discovery.json')
const contactSheetPath = resolve(root, 'assets/reports/portrait-contact-sheet.webp')
const agent = 'FuMoe2026PortraitBot/1.0 (low-rate public character-icon archiver; contact: https://fumoe.example.com)'
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds))

function wikiSlug(url) {
  return new URL(url).pathname.split('/').filter(Boolean).at(-1)
}

async function pageImages(configuration, title) {
  const endpoint = new URL(`https://wiki.biligame.com/${wikiSlug(configuration.wiki)}/api.php`)
  endpoint.search = new URLSearchParams({ action: 'query', generator: 'images', titles: title, prop: 'imageinfo', iiprop: 'url|size|mime', gimlimit: 'max', format: 'json', formatversion: '2', origin: '*' }).toString()
  const response = await fetch(endpoint, { headers: { 'user-agent': agent, accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`MediaWiki API HTTP ${response.status}`)
  const data = await response.json()
  return (data.query?.pages ?? []).flatMap((page) => {
    const info = page.imageinfo?.[0]
    if (!info?.url?.startsWith('https://patchwiki.biligame.com/images/')) return []
    return [{ title: page.title, width: info.width ?? 0, height: info.height ?? 0, mime: info.mime, url: info.url }]
  })
}

async function download(candidate, character, sourcePage) {
  const response = await fetch(candidate.url, { headers: { 'user-agent': agent, referer: sourcePage }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`头像下载 HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const metadata = await sharp(buffer, { animated: false }).metadata()
  if (!metadata.hasAlpha) throw new Error('头像没有透明通道')
  if ((metadata.width ?? 0) < 64 || (metadata.height ?? 0) < 64) throw new Error('头像尺寸低于 64×64')
  const extension = extname(new URL(response.url).pathname).toLowerCase() || '.png'
  const sourceFile = resolve(sourceRoot, `${character.id}${extension}`)
  await writeFile(sourceFile, buffer)
  const outputFile = resolve(processedRoot, `${character.id}.webp`)
  await sharp(buffer, { animated: false })
    .rotate()
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: sharp.kernel.lanczos3 })
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toFile(outputFile)
  const outputMetadata = await sharp(outputFile).metadata()
  if (outputMetadata.width !== 512 || outputMetadata.height !== 512 || !outputMetadata.hasAlpha) throw new Error('标准化头像输出不合格')
  return {
    id: character.id,
    name: character.name,
    game: character.game,
    sourceType: 'in-game-icon-via-community-wiki',
    sourceTitle: candidate.title,
    sourceUrl: response.url,
    discoveryPage: sourcePage,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    sourceSha256: createHash('sha256').update(buffer).digest('hex'),
    outputFile: `assets/portraits/processed/${character.id}.webp`,
    status: 'automatic-pass',
  }
}

async function buildContactSheet(entries) {
  const cardWidth = 160
  const cardHeight = 190
  const columns = 8
  const gap = 12
  const rows = Math.ceil(entries.length / columns)
  const composites = []
  for (const [index, entry] of entries.entries()) {
    const image = await sharp(resolve(root, entry.outputFile)).resize(128, 128, { fit: 'contain' }).png().toBuffer()
    const x = gap + (index % columns) * (cardWidth + gap)
    const y = gap + Math.floor(index / columns) * (cardHeight + gap)
    composites.push({ input: image, left: x + 16, top: y + 8 })
    const label = Buffer.from(`<svg width="${cardWidth}" height="42"><style>text{font-family:sans-serif;fill:#e8eef4;text-anchor:middle}</style><text x="80" y="16" font-size="12">${entry.id} ${entry.name}</text><text x="80" y="34" font-size="10" fill="#93a4b4">${entry.game}</text></svg>`)
    composites.push({ input: label, left: x, top: y + 140 })
  }
  await sharp({ create: { width: columns * cardWidth + (columns + 1) * gap, height: rows * cardHeight + (rows + 1) * gap, channels: 4, background: '#101821' } })
    .composite(composites)
    .webp({ quality: 88, effort: 6 })
    .toFile(contactSheetPath)
}

await rm(portraitRoot, { recursive: true, force: true })
await mkdir(sourceRoot, { recursive: true })
await mkdir(processedRoot, { recursive: true })
await mkdir(resolve(root, 'assets/reports'), { recursive: true })

const report = { generatedAt: new Date().toISOString(), policy: 'Structured square character icons only; no illustration crops or generated redraws.', accepted: [], missing: [], failed: [] }
for (const character of roster) {
  const configuration = catalog.games[character.game]
  if (!configuration) {
    report.missing.push({ ...character, reason: '没有 Wiki 配置' })
    continue
  }
  const aliases = configuration.aliases?.[character.name] ?? catalog.aliases?.[character.game]?.[character.name] ?? []
  const candidates = []
  for (const title of [character.name, ...aliases]) {
    try {
      candidates.push(...await pageImages(configuration, title))
    } catch (error) {
      report.failed.push({ id: character.id, stage: 'discover', title, error: error instanceof Error ? error.message : String(error) })
    }
    await sleep(350)
  }
  const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()]
  const selected = selectPortraitCandidate(unique, character.name, aliases)
  if (!selected) {
    report.missing.push({ ...character, reason: '没有符合命名、尺寸和方形规则的头像', candidateTitles: unique.map((candidate) => candidate.title).filter((title) => [character.name, ...aliases].some((name) => title.includes(name))).slice(0, 20) })
    continue
  }
  try {
    report.accepted.push(await download(selected, character, `${configuration.wiki}${encodeURIComponent(character.name)}`))
  } catch (error) {
    report.failed.push({ id: character.id, stage: 'download', url: selected.url, error: error instanceof Error ? error.message : String(error) })
  }
  await sleep(350)
}

await writeFile(resolve(portraitRoot, 'manifest.json'), `${JSON.stringify({ version: 1, ...report }, null, 2)}\n`)
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
if (report.accepted.length) await buildContactSheet(report.accepted)
console.log(`标准头像自动通过 ${report.accepted.length}/${roster.length}；缺失 ${report.missing.length}；失败 ${report.failed.length}。`)
if (report.accepted.length !== roster.length) process.exitCode = 1
