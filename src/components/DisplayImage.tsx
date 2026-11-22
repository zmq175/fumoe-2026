import {useCallback,useRef,useState,type ImgHTMLAttributes} from 'react'
import {optimizedImageUrl} from '../lib/image-variants'
import {imageFinished,metricStart} from '../lib/browser-perf'

type Props=Omit<ImgHTMLAttributes<HTMLImageElement>,'src'|'srcSet'>&{src:string;mobileSrc?:string|null}

export function DisplayImage({src,mobileSrc,onLoad,onError,decoding='async',...props}:Props){
  const signature=src+'|'+(mobileSrc??'')
  const [failedSource,setFailedSource]=useState<string|null>(null)
  const source=failedSource===signature?src:optimizedImageUrl(src)
  const mobile=mobileSrc?(failedSource===signature?mobileSrc:optimizedImageUrl(mobileSrc)):null
  const attempt=useRef<{signature:string;start:number|undefined}|null>(null)
  const attach=useCallback((node:HTMLImageElement|null)=>{
    if(node)attempt.current={signature,start:metricStart()}
  },[signature])
  function finish(node:HTMLImageElement,success:boolean){
    if(attempt.current?.signature!==signature)return
    imageFinished(attempt.current.start,node,success)
    attempt.current=null
  }
  const img=<img {...props} ref={attach} src={source} decoding={decoding} onLoad={event=>{
    finish(event.currentTarget,true)
    onLoad?.(event)
  }} onError={event=>{
    if(source!==src||(mobile&&mobile!==mobileSrc))setFailedSource(signature)
    else {
      finish(event.currentTarget,false)
      onError?.(event)
    }
  }}/>
  return mobile?<picture><source media="(max-width: 720px)" srcSet={mobile}/>{img}</picture>:img
}
