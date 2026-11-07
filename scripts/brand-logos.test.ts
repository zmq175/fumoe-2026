import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {expect,it} from 'vitest'
import logos from '../src/data/logo-variants.json' with {type:'json'}
import {legacyAsset} from '../src/lib/legacy-assets'
import {optimizedImageUrl} from '../src/lib/image-variants'

it('所有公司和游戏 LOGO 使用真实内容版本，压缩不增大且尺寸与透明度保持一致',async()=>{
  let count=0
  for(const directory of ['factions','game-logos'])for(const name of readdirSync('public/'+directory)){
    if(!/\.(png|svg)$/.test(name))continue
    count++
    const source=`/${directory}/${name}`,target=optimizedImageUrl(source)
    expect(target).toBe((logos as Record<string,string>)[legacyAsset(source)])
    const original=readFileSync('public'+source),output=readFileSync('public'+target)
    expect(output.length).toBeLessThanOrEqual(original.length)
    expect(target).toContain(createHash('sha256').update(output).digest('hex').slice(0,20))
    const originalMeta=await sharp(original).metadata(),outputMeta=await sharp(output).metadata()
    expect([outputMeta.width,outputMeta.height]).toEqual([originalMeta.width,originalMeta.height])
    if(originalMeta.hasAlpha){
      const alpha=(bytes:Buffer)=>sharp(bytes).ensureAlpha().extractChannel('alpha').raw().toBuffer()
      expect((await alpha(original)).equals(await alpha(output))).toBe(true)
    }
    // Composite both ways to include alpha correctness while ignoring invisible RGB.
    for(const background of ['#000000','#ffffff']){
      const render=(bytes:Buffer)=>{
        let pipeline=sharp(bytes)
        if(name.endsWith('.svg'))pipeline=pipeline.resize({width:880})
        return pipeline.flatten({background}).raw().toBuffer()
      }
      const a=await render(original),b=await render(output)
      expect(b.length).toBe(a.length)
      if(name.endsWith('.svg'))expect(a.equals(b),source).toBe(true)
      else {
        const meanError=a.reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0)/a.length
        expect(meanError,source+' '+background).toBeLessThan(5)
      }
    }
  }
  expect(count).toBe(16)
})
