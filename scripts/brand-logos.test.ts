import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {expect,it} from 'vitest'
import logos from '../src/data/logo-variants.json' with {type:'json'}
import {legacyAsset} from '../src/lib/legacy-assets'
import {optimizedImageUrl} from '../src/lib/image-variants'

it('所有公司和游戏 LOGO 使用真实内容版本，压缩不增大且可见像素保持一致',async()=>{
  let count=0
  for(const directory of ['factions','game-logos'])for(const name of readdirSync('public/'+directory)){
    if(!/\.(png|svg)$/.test(name))continue
    count++
    const source=`/${directory}/${name}`,target=optimizedImageUrl(source)
    expect(target).toBe((logos as Record<string,string>)[legacyAsset(source)])
    const original=readFileSync('public'+source),output=readFileSync('public'+target)
    expect(output.length).toBeLessThanOrEqual(original.length)
    expect(target).toContain(createHash('sha256').update(output).digest('hex').slice(0,20))
    // Composite both ways to include alpha correctness while ignoring invisible RGB.
    for(const background of ['#000000','#ffffff']){
      const render=(bytes:Buffer)=>{
        let pipeline=sharp(bytes)
        if(name.endsWith('.svg'))pipeline=pipeline.resize({width:880})
        return pipeline.flatten({background}).raw().toBuffer()
      }
      expect((await render(original)).equals(await render(output)),source+' '+background).toBe(true)
    }
  }
  expect(count).toBe(16)
})
