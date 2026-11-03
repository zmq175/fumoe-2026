import {expect,it} from 'vitest'
import {rejectArtwork,preferredArtwork} from './s2-artwork-policy.mjs'
import {frameArtwork} from './s2-artwork-framing.mjs'
import sharp from 'sharp'
it('拒绝带立绘字样的暖笺贺春 Q 版，以及宣传海报和同人图',()=>{
  for(const title of ['暖笺贺春 佩丽卡 立绘1.png','陈千语Q版.png','角色立绘-简-官方介绍.png','某角色chibi.png','某角色同人立绘.png'])expect(rejectArtwork(title)).toBe(true)
  expect(rejectArtwork('文件:佩丽卡立绘.png')).toBe(false)
  expect(preferredArtwork({game:'明日方舟：终末地',name:'佩丽卡',selected:{title:'暖笺贺春 佩丽卡 立绘1.png'},candidates:[{title:'暖笺贺春 佩丽卡 立绘1.png'},{title:'文件:佩丽卡立绘.png'}]})?.title).toBe('文件:佩丽卡立绘.png')
})
it('固定画布内保留图片比例和四边安全留白',async()=>{
  const source=await sharp({create:{width:100,height:200,channels:4,background:'#ff0000'}}).png().toBuffer()
  const output=await frameArtwork(source,{width:900,height:1200,insetX:42,insetY:60})
  const {data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  expect([info.width,info.height]).toEqual([900,1200])
  expect(data[3]).toBe(0)
  expect(data[(60*900+180)*4+3]).toBeGreaterThan(240)
  expect(data[(59*900+450)*4+3]).toBe(0)
  expect(data[(1140*900+450)*4+3]).toBe(0)
})
it('按已核对的游戏文件规则选透明图，不把立绘文件名当作无字原图的证明',()=>{
  expect(preferredArtwork({game:'原神',name:'芙宁娜',candidates:[{title:'文件:芙宁娜立绘.png'},{title:'文件:芙宁娜抽卡立绘.png'}]})?.title).toBe('文件:芙宁娜抽卡立绘.png')
  expect(preferredArtwork({game:'绝区零',name:'菲欧妮',selected:{title:'文件:角色立绘-菲欧妮-官方介绍.png'},candidates:[{title:'文件:角色立绘-菲欧妮-官方介绍.png'}]})).toBeNull()
})
it('补齐的跨站来源不会被旧站点的文件命名规则误删',()=>{
 const selected={title:'洛茜 · 角色原图',url:'https://example.com/rossi.avif'}
 expect(preferredArtwork({game:'明日方舟：终末地',name:'洛西',supplementBatch:'missing-21-20261104',selected,candidates:[selected]})).toBe(selected)
})
