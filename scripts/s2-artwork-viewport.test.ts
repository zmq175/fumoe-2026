import {expect,it} from 'vitest'
import sharp from 'sharp'
import {viewport} from './s2-artwork-viewport.mjs'
it('脸部锚点在放大和负偏移裁切后仍准确落在眼线，留白透明',async()=>{
 const dot=await sharp({create:{width:20,height:20,channels:4,background:'#ff0000'}}).png().toBuffer()
 const source=await sharp({create:{width:200,height:200,channels:4,background:'#00000000'}}).composite([{input:dot,left:140,top:40}]).png().toBuffer()
 const output=await viewport(source,{width:512,height:512,scale:3,anchor:[150,50],target:[256,215]})
 const {data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 expect([info.width,info.height]).toEqual([512,512]);expect(data[3]).toBe(0)
 expect(data[(215*512+256)*4+3]).toBe(255)
 expect(data[(215*512+200)*4+3]).toBe(0)
})
