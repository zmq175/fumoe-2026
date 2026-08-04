import { describe,expect,it } from 'vitest'
import { centerCropArea,clampCrop,parseCrop,rotateCrop } from './artwork-crop'

describe('素材裁剪状态',()=>{
  it('兼容旧裁剪数据并补全旋转角度',()=>{
    expect(parseCrop('{"x":0.2,"y":-0.4,"zoom":1.5}')).toEqual({x:0.2,y:-0.4,zoom:1.5,rotation:0})
  })

  it('限制位置、缩放和旋转范围',()=>{
    expect(clampCrop({x:9000,y:-9000,zoom:8,rotation:450})).toEqual({x:5000,y:-5000,zoom:4,rotation:90})
  })

  it('按九十度旋转并可循环回到零度',()=>{
    expect(rotateCrop({x:0,y:0,zoom:1,rotation:270},90).rotation).toBe(0)
    expect(rotateCrop({x:0,y:0,zoom:1,rotation:0},-90).rotation).toBe(270)
  })

  it('为尚未操作的比例生成居中裁剪区域',()=>{
    expect(centerCropArea(1600,900,3/4)).toEqual({x:462.5,y:0,width:675,height:900})
    expect(centerCropArea(900,1600,16/9)).toEqual({x:0,y:546.875,width:900,height:506.25})
  })
})
