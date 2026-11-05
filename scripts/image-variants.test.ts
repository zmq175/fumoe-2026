import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import manifest from '../src/data/image-variants.json' with {type:'json'}

it('每个已发布展示映射都有对应的内容寻址 WebP 文件',()=>{
  const versions=new Set([...Object.values(manifest.hashes),...Object.values(manifest.paths)])
  expect(versions.size).toBeGreaterThan(0)
  for(const revision of versions){
    const bytes=readFileSync(`public/image-variants/${revision}.webp`)
    expect(createHash('sha256').update(bytes).digest('hex').slice(0,20)).toBe(revision)
    expect(bytes.toString('ascii',8,12)).toBe('WEBP')
  }
})
