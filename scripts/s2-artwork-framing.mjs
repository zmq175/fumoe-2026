import sharp from 'sharp'

/** Center a bounded figure inside a fixed transparent canvas without stretching. */
export async function frameArtwork(input,{width,height,insetX,insetY}) {
  const {data,info}=await sharp(input).resize({width:width-2*insetX,height:height-2*insetY,fit:'inside'}).png().toBuffer({resolveWithObject:true})
  return sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:data,left:Math.floor((width-info.width)/2),top:Math.floor((height-info.height)/2)}]).webp({quality:92}).toBuffer()
}
