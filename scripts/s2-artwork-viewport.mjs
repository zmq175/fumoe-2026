import sharp from 'sharp'
export async function viewport(input,{width,height,scale,anchor,target}){
 const meta=await sharp(input).metadata(),w=Math.round(meta.width*scale),h=Math.round(meta.height*scale)
 const x=Math.round(target[0]-anchor[0]*scale),y=Math.round(target[1]-anchor[1]*scale)
 const left=Math.max(0,-x),top=Math.max(0,-y),cw=Math.min(w-left,width-Math.max(0,x)),ch=Math.min(h-top,height-Math.max(0,y))
 if(cw<=0||ch<=0)throw Error('Invalid artwork anchors')
 const resized=await sharp(input).resize(w,h).png().toBuffer()
 const cut=await sharp(resized).extract({left,top,width:cw,height:ch}).png().toBuffer()
 return sharp({create:{width,height,channels:4,background:'#00000000'}}).composite([{input:cut,left:Math.max(0,x),top:Math.max(0,y)}]).webp({quality:95}).toBuffer()
}
