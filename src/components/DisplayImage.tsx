import {useState,type ImgHTMLAttributes} from 'react'
import {optimizedImageUrl} from '../lib/image-variants'

type Props=Omit<ImgHTMLAttributes<HTMLImageElement>,'src'|'srcSet'>&{src:string;mobileSrc?:string|null}

export function DisplayImage({src,mobileSrc,onError,decoding='async',...props}:Props){
  const signature=src+'|'+(mobileSrc??'')
  const [failedSource,setFailedSource]=useState<string|null>(null)
  const source=failedSource===signature?src:optimizedImageUrl(src)
  const mobile=mobileSrc?(failedSource===signature?mobileSrc:optimizedImageUrl(mobileSrc)):null
  const img=<img {...props} src={source} decoding={decoding} onError={event=>{
    if(source!==src||(mobile&&mobile!==mobileSrc))setFailedSource(signature)
    else onError?.(event)
  }}/>
  return mobile?<picture><source media="(max-width: 720px)" srcSet={mobile}/>{img}</picture>:img
}
