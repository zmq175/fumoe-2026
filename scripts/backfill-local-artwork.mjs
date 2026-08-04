import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root=resolve(import.meta.dirname,'..')
const manifest=JSON.parse(await readFile(resolve(root,'assets/characters.manifest.json'),'utf8'))
const esc=(value)=>`'${String(value??'').replaceAll("'","''")}'`
const sql=[]
for(const item of manifest.characters){
  const prefix=`characters/${item.id}`
  sql.push(`UPDATE characters SET artwork_original_key=${esc(`${prefix}/gallery.webp`)},artwork_gallery_key=${esc(`${prefix}/gallery.webp`)},artwork_match_key=${esc(`${prefix}/match.webp`)},artwork_avatar_key=${esc(`${prefix}/avatar.webp`)},artwork_key=${esc(`${prefix}/gallery.webp`)},artwork_source_url=${esc(item.sourceUrl)},artwork_source_note=${esc(item.notes??'一次性导入')},artwork_source_type=${esc(item.sourceType??'community-wiki')},artwork_quality_status='verified',artwork_verified_at=CURRENT_TIMESTAMP,artwork_verified_by='local-artwork-backfill' WHERE id=${esc(item.id)};`)
}
const directory=resolve(root,'.local');await mkdir(directory,{recursive:true});const file=resolve(directory,'backfill-artwork.sql');await writeFile(file,sql.join('\n'))
execFileSync('npx',['wrangler','d1','execute','fumoe-2026','--local','--file',file],{cwd:root,stdio:'inherit'})
console.log(`已回填 ${manifest.characters.length} 位已有立绘的元数据。`)
