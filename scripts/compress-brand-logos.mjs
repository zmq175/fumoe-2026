import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {optimize} from 'svgo'

// Independent of portrait compression: originals and historical revisions stay intact.
const legacy=JSON.parse(await readFile('src/data/legacy-assets.json','utf8'))
const variants=JSON.parse(await readFile('src/data/image-variants.json','utf8'))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,20)
const paths={},report=[]
await mkdir('public/image-variants',{recursive:true})
for(const directory of ['factions','game-logos'])for(const file of (await readdir('public/'+directory)).sort()){
  if(!/\.(png|svg)$/i.test(file))continue
  const source=`/${directory}/${file}`,canonical=legacy[source]??source
  const original=await readFile('public'+source)
  const archivedHash=canonical.match(/^\/archive\/([a-f0-9]{64})\./)?.[1]
  if(archivedHash&&createHash('sha256').update(original).digest('hex')!==archivedHash)throw Error('Original differs from archived revision: '+source)
  const id=canonical.match(/^\/archive\/([a-f0-9]{64})\./)?.[1]?.slice(0,20)
  const prior=(id?variants.hashes[id]:undefined)??variants.paths[source]
  let bytes=prior?await readFile(`public/image-variants/${prior}.webp`):original
  const before=bytes.length
  let extension=prior?'webp':file.split('.').at(-1)
  if(file.endsWith('.svg')){
    const candidate=Buffer.from(optimize(original.toString(),{multipass:true,floatPrecision:6}).data)
    // Only accept SVG transformations that preserve rendered pixels at 2x display scale.
    const render=b=>sharp(b).resize({width:880}).ensureAlpha().raw().toBuffer()
    if(candidate.length<bytes.length&&(await render(original)).equals(await render(candidate))){bytes=candidate;extension='svg'}
  }else{
    const lossless=await sharp(original).webp({lossless:true,effort:6}).toBuffer()
    if(lossless.length<bytes.length){bytes=lossless;extension='webp'}
    // Keep the original resolution and exact alpha; only accept worthwhile lossy savings.
    const lossy=await sharp(original).webp({quality:80,alphaQuality:100,effort:6}).toBuffer()
    if(lossy.length<bytes.length*0.95){bytes=lossy;extension='webp'}
  }
  const output=`/image-variants/${hash(bytes)}.${extension}`
  await writeFile('public'+output,bytes)
  paths[canonical]=output
  report.push({source,output,originalBytes:original.length,previousBytes:before,bytes:bytes.length})
}
await writeFile('src/data/logo-variants.json',JSON.stringify(Object.fromEntries(Object.entries(paths).sort()),null,2)+'\n')
await mkdir('.local/image-compression',{recursive:true})
await writeFile('.local/image-compression/logos-report.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({count:report.length,originalBytes:report.reduce((n,x)=>n+x.originalBytes,0),previousBytes:report.reduce((n,x)=>n+x.previousBytes,0),bytes:report.reduce((n,x)=>n+x.bytes,0),entries:report},null,2))
