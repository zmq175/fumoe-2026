export type Crop={x:number;y:number;zoom:number;rotation:number;area?:CropArea}
export type CropArea={x:number;y:number;width:number;height:number}

export const defaultCrop:Crop={x:0,y:0,zoom:1,rotation:0}

export function clampCrop(value:Crop):Crop {
  const rotation=((Math.round(value.rotation/90)*90)%360+360)%360
  return {x:Math.max(-5000,Math.min(5000,value.x)),y:Math.max(-5000,Math.min(5000,value.y)),zoom:Math.max(1,Math.min(4,value.zoom)),rotation}
}

export function parseCrop(value?:string|null):Crop {
  try {
    const parsed=JSON.parse(value??'')
    const crop=clampCrop({x:Number(parsed.x)||0,y:Number(parsed.y)||0,zoom:Number(parsed.zoom)||1,rotation:Number(parsed.rotation)||0})
    if(validPercentArea(parsed.area))crop.area=parsed.area
    return crop
  } catch { return defaultCrop }
}

export function validPercentArea(area:unknown):area is CropArea {
  if(!area||typeof area!=='object')return false
  const a=area as CropArea
  return [a.x,a.y,a.width,a.height].every(Number.isFinite)&&a.x>=0&&a.y>=0&&a.width>0&&a.height>0&&a.x+a.width<=100.001&&a.y+a.height<=100.001
}

export function percentAreaToPixels(area:CropArea,width:number,height:number):CropArea {
  return {x:area.x*width/100,y:area.y*height/100,width:area.width*width/100,height:area.height*height/100}
}

export function rotateCrop(crop:Crop,amount:number):Crop {
  return clampCrop({...crop,rotation:crop.rotation+amount})
}

export function centerCropArea(imageWidth:number,imageHeight:number,aspect:number):CropArea {
  const imageAspect=imageWidth/imageHeight
  if(imageAspect>aspect){const width=imageHeight*aspect;return{x:(imageWidth-width)/2,y:0,width,height:imageHeight}}
  const height=imageWidth/aspect;return{x:0,y:(imageHeight-height)/2,width:imageWidth,height}
}

function rotatedSize(width:number,height:number,rotation:number) {
  const radians=rotation*Math.PI/180
  return {width:Math.abs(Math.cos(radians)*width)+Math.abs(Math.sin(radians)*height),height:Math.abs(Math.sin(radians)*width)+Math.abs(Math.cos(radians)*height)}
}

export function drawCropCanvas(output:HTMLCanvasElement,image:HTMLImageElement,area:CropArea,rotation:number,width:number,height:number) {
  const rotated=rotatedSize(image.naturalWidth,image.naturalHeight,rotation)
  const source=document.createElement('canvas');source.width=Math.round(rotated.width);source.height=Math.round(rotated.height)
  const sourceContext=source.getContext('2d');if(!sourceContext)throw new Error('无法创建裁剪画布')
  sourceContext.translate(source.width/2,source.height/2);sourceContext.rotate(rotation*Math.PI/180);sourceContext.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2)
  output.width=width;output.height=height
  const outputContext=output.getContext('2d');if(!outputContext)throw new Error('无法创建输出画布')
  outputContext.fillStyle='#070c10';outputContext.fillRect(0,0,width,height);outputContext.drawImage(source,area.x,area.y,area.width,area.height,0,0,width,height)
}

export async function renderCropBlob(image:HTMLImageElement,area:CropArea,rotation:number,width:number,height:number,quality=.88) {
  const output=document.createElement('canvas');drawCropCanvas(output,image,area,rotation,width,height)
  return new Promise<Blob>((resolve,reject)=>output.toBlob((blob)=>blob?resolve(blob):reject(new Error('无法生成裁切图片')),'image/webp',quality))
}
