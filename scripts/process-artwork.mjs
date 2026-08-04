import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'
import { missingRoster } from './artwork-candidates.ts'
import { artworkOutputs } from '../src/lib/artwork-output.ts'

const root = resolve(import.meta.dirname, '..')
const manifestPath = resolve(root, process.argv[2] ?? 'assets/characters.manifest.json')
const outputRoot = resolve(root, 'assets/processed/characters')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const rosterSource=await readFile(resolve(root,'src/data/tournament.ts'),'utf8')
const roster=[...rosterSource.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(([,name,game],index)=>({id:`c${String(index+1).padStart(3,'0')}`,name,game}))
const approved = manifest.characters.filter((entry) => entry.status === 'approved')
const missing = missingRoster(roster,new Set(approved.map((entry)=>entry.id)))
const report = { generatedAt: new Date().toISOString(), processed: [], missing, errors: [] }

for (const entry of approved) {
  try {
    const sourceUrl = new URL(entry.sourceUrl)
    if (sourceUrl.hostname !== entry.officialHost) throw new Error(`来源域名不匹配：${sourceUrl.hostname}`)
    const source = resolve(root, entry.sourceFile)
    await access(source)
    const destination = resolve(outputRoot, entry.id)
    await rm(destination, { recursive: true, force: true })
    await mkdir(destination, { recursive: true })
    const base = sharp(source, { animated: false }).rotate()
    const metadata = await base.metadata()
    const fullWidth = metadata.width ?? 0
    const fullHeight = metadata.height ?? 0
    // Official posters put a title banner up top and a caption plate at the bottom. The gallery
    // deliberately frames the face and upper body, removing those two text-heavy poster regions.
    const tall = fullHeight / Math.max(1, fullWidth) >= 1.9
    const topCut = tall ? Math.round(fullHeight * 0.16) : 0
    const bottomCut = tall ? Math.round(fullHeight * 0.34) : 0
    const cropHeight = Math.max(1, fullHeight - topCut - bottomCut)
    const prepared = tall ? base.clone().extract({ left: 0, top: topCut, width: fullWidth, height: cropHeight }) : base
    const trimmedBuffer = await prepared.png().toBuffer()
    const image = sharp(trimmedBuffer, { animated: false })
    // Landscape card: crop the upper body (top ~62% of the banner-trimmed art) so faces stay visible.
    const cardHeight = Math.round(cropHeight * 0.62)
    const cardImage = sharp(await sharp(trimmedBuffer, { animated: false }).extract({ left: 0, top: 0, width: fullWidth, height: Math.min(cropHeight, cardHeight) }).png().toBuffer(), { animated: false })
    const webp=(quality)=>({quality,effort:5,smartSubsample:true})
    // Gallery retains the full approved illustration. Cards use independent attention crops so portrait posters do not appear as thin strips.
    await Promise.all([
      image.clone().resize(artworkOutputs.gallery.width,artworkOutputs.gallery.height,{fit:'contain',background:{r:7,g:12,b:16,alpha:1},withoutEnlargement:false}).webp(webp(artworkOutputs.gallery.quality)).toFile(resolve(destination,'gallery.webp')),
      cardImage.clone().resize(artworkOutputs.match.width,artworkOutputs.match.height,{fit:'cover',position:'top',withoutEnlargement:false}).webp(webp(artworkOutputs.match.quality)).toFile(resolve(destination,'match.webp')),
      image.clone().resize(artworkOutputs.avatar.width,artworkOutputs.avatar.height,{fit:'cover',position:sharp.strategy.attention,withoutEnlargement:false}).webp(webp(artworkOutputs.avatar.quality)).toFile(resolve(destination,'avatar.webp'))
    ])
    report.processed.push({ id: entry.id, sourceUrl: entry.sourceUrl, original: { width: metadata.width, height: metadata.height }, focus: entry.focus ?? { x: 50, y: 50 }, outputs: ['gallery.webp', 'match.webp', 'avatar.webp'] })
  } catch (error) { report.errors.push({ id: entry.id, error: error instanceof Error ? error.message : String(error) }) }
}

await writeFile(resolve(root, 'assets/processed/report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`已处理 ${report.processed.length} 个角色；待审核 ${missing.length} 个；失败 ${report.errors.length} 个。`)
if (report.errors.length) process.exitCode = 1
