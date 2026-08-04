import {describe,expect,it} from 'vitest'
import {artworkOutputs} from './artwork-output'

describe('公开素材输出规格',()=>{
  it('使用适合移动端对局卡片的尺寸与质量',()=>{
    expect(artworkOutputs.match).toMatchObject({width:960,height:540,quality:80})
  })

  it('保持图鉴与头像现有尺寸',()=>{
    expect(artworkOutputs.gallery).toMatchObject({width:900,height:1200})
    expect(artworkOutputs.avatar).toMatchObject({width:512,height:512})
  })
})
