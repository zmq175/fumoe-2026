import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import sharp from 'sharp'
const root=new URL('../',import.meta.url).pathname,dir=root+'.local/s2-artwork/'
const m=JSON.parse(await readFile(dir+'manifest.json','utf8')),batch=JSON.parse(await readFile(root+'seasons/s2/artwork-supplement.json','utf8'))
assert.equal(m.entries.length,256);assert.equal(new Set(m.entries.map(e=>e.game+'|'+e.name)).size,256)
assert.equal(batch.entries.length,21)
// Close portraits may be fully occupied by hair/hat. Require actual transparent
// background on the full silhouette, and preserve alpha on all cropped exports.
let derivatives=0
for(const spec of batch.entries){const e=m.entries.find(e=>e.id===spec.id&&e.game===spec.game);assert.ok(e?.processedArtwork,e?.name+' processing missing');const a=e.processedArtwork;assert.equal(a.sourceSha256,e.sha256);assert.equal(createHash('sha256').update(await readFile(dir+e.original)).digest('hex'),e.sha256)
 for(const [key,w,h]of[['image',900,1200],['avatarImage',512,512],['matchImage',960,540],['mobileImage',540,540]]){const path=dir+a[key],meta=await sharp(path).metadata(),stats=await sharp(path).stats();assert.equal(meta.width,w);assert.equal(meta.height,h);assert.equal(meta.hasAlpha,true);if(key==='image')assert.equal(stats.channels[3].min,0);assert.ok(stats.channels[3].max>200);derivatives++}
}
const report={checkedAt:new Date().toISOString(),total:256,withSource:m.entries.filter(e=>e.original).length,supplemented:21,processed:21,derivatives,sourceHashes:'pass',transparentDimensions:'pass',productionWritten:false}
await writeFile(root+'seasons/s2/artwork-verification.json',JSON.stringify(report,null,2));console.log(report)
