import { useEffect,useRef,useState,type ComponentType } from 'react'
import Cropper,{type Area,type Point} from 'react-easy-crop'
import { ArrowLeft,ImagePlus,Minus,Plus,RotateCcw,RotateCw,Save,Trash2,Upload } from 'lucide-react'
import { api,type Viewer } from '../lib/api'
import { artworkOutputs } from '../lib/artwork-output'
import { artworkFileFromBlob,storedArtworkKey } from './artwork-file'
import { centerCropArea,defaultCrop,drawCropCanvas,parseCrop,renderCropBlob,rotateCrop,type Crop,type CropArea } from './artwork-crop'

type Variant='gallery'|'match'|'avatar'
type CharacterDetail={id:string;name:string;game:string;summary:string;groupCode:string;seed:number;artworkOriginalKey:string|null;artworkGalleryKey:string|null;artworkMatchKey:string|null;artworkAvatarKey:string|null;artworkSourceUrl:string|null;artworkSourceNote:string|null;artworkSourceType:'official'|'community-wiki'|'pending';artworkQualityStatus:'pending'|'verified'|'rejected';artworkGalleryCrop:string;artworkMatchCrop:string;artworkAvatarCrop:string}

const outputs:Record<Variant,{width:number;height:number;quality:number;label:string;short:string;aspect:number}>={gallery:{...artworkOutputs.gallery,label:'图鉴立绘',short:'3:4',aspect:3/4},match:{...artworkOutputs.match,label:'对局横图',short:'16:9',aspect:16/9},avatar:{...artworkOutputs.avatar,label:'头像',short:'1:1',aspect:1}}
const variants=Object.keys(outputs) as Variant[]
type EasyCropProps={image:string;crop:Point;zoom:number;rotation:number;aspect:number;minZoom:number;maxZoom:number;zoomSpeed:number;showGrid:boolean;restrictPosition:boolean;objectFit:'contain';onCropChange:(value:Point)=>void;onZoomChange:(value:number)=>void;onCropComplete:(area:Area,pixels:Area)=>void}
const EasyCrop=Cropper as unknown as ComponentType<EasyCropProps>

async function decodeBlob(blob:Blob){const url=URL.createObjectURL(blob);const image=new Image();image.src=url;try{await image.decode();return{image,url}}catch(error){URL.revokeObjectURL(url);throw error}}
async function storedArtwork(url:string,fallbackName:string){const response=await fetch(url,{cache:'no-store'});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error('原图读取失败');const blob=await response.blob();return{...(await decodeBlob(blob)),file:artworkFileFromBlob(blob,fallbackName)}}

function FinalPreview({image,area,rotation,variant}:{image:HTMLImageElement;area:CropArea;rotation:number;variant:Variant}){
  const canvas=useRef<HTMLCanvasElement>(null);const output=outputs[variant]
  useEffect(()=>{if(canvas.current)drawCropCanvas(canvas.current,image,area,rotation,output.width,output.height)},[area,image,output.height,output.width,rotation])
  return <canvas className={`crop-preview crop-preview--${variant}`} ref={canvas}/>
}

export function ArtworkEditor({id,viewer,onBack}:{id:string;viewer:Viewer;onBack:()=>void}){
  const [character,setCharacter]=useState<CharacterDetail|null>(null)
  const [image,setImage]=useState<HTMLImageElement|null>(null)
  const [sourceUrl,setSourceUrl]=useState('')
  const [file,setFile]=useState<File|null>(null)
  const [active,setActive]=useState<Variant>('gallery')
  const [crops,setCrops]=useState<Record<Variant,Crop>>({gallery:defaultCrop,match:defaultCrop,avatar:defaultCrop})
  const [areas,setAreas]=useState<Record<Variant,CropArea|null>>({gallery:null,match:null,avatar:null})
  const [summary,setSummary]=useState('')
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  const [dirty,setDirty]=useState(false)
  const [fileInfo,setFileInfo]=useState('')
  const sourceUrlRef=useRef('')

  const installImage=(next:{image:HTMLImageElement;url:string;file:File},status:string)=>{
    if(sourceUrlRef.current)URL.revokeObjectURL(sourceUrlRef.current)
    sourceUrlRef.current=next.url;setSourceUrl(next.url);setImage(next.image);setFile(next.file)
    setAreas(Object.fromEntries(variants.map((variant)=>[variant,centerCropArea(next.image.naturalWidth,next.image.naturalHeight,outputs[variant].aspect)])) as Record<Variant,CropArea>)
    setFileInfo(`${next.image.naturalWidth} × ${next.image.naturalHeight} px · ${(next.file.size/1024/1024).toFixed(2)} MB`);setMessage(status)
  }

  useEffect(()=>{let live=true;void(async()=>{try{const result=await api.character(id);if(!live)return;const value=result.character as CharacterDetail;setCharacter(value);setSummary(value.summary);setCrops({gallery:parseCrop(value.artworkGalleryCrop),match:parseCrop(value.artworkMatchCrop),avatar:parseCrop(value.artworkAvatarCrop)});const existingKey=storedArtworkKey(value.artworkOriginalKey,value.artworkGalleryKey,value.id);try{const stored=await storedArtwork(`/api/media/${existingKey}`,`${value.id}-existing.webp`);if(live)installImage(stored,value.artworkOriginalKey||value.artworkGalleryKey?'已载入最新发布版本，可继续调整后重新发布。':'已载入当前页面立绘；可调整裁切并发布为新版本。')}catch{if(live)setMessage(value.artworkOriginalKey||value.artworkGalleryKey?'已发布素材无法读取，请更换原图后重新发布。':'当前角色尚无可用立绘，请选择图片开始编辑。')}}catch(error){if(live)setMessage(error instanceof Error?error.message:'无法加载角色')}})();return()=>{live=false}},[id])
  useEffect(()=>()=>{if(sourceUrlRef.current)URL.revokeObjectURL(sourceUrlRef.current)},[])
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty])

  const loadSelectedFile=async(selected?:File)=>{if(!selected)return;if(!['image/png','image/jpeg','image/webp'].includes(selected.type)||selected.size>10*1024*1024){setMessage('请选择小于 10 MB 的 PNG、JPEG 或 WebP。');return}try{installImage({...await decodeBlob(selected),file:selected},'原图已载入。拖动定位主体，滚轮或滑杆缩放。');setCrops({gallery:defaultCrop,match:defaultCrop,avatar:defaultCrop});setDirty(true)}catch{setMessage('该图片无法解码')}}
  const updateCrop=(value:Crop)=>{setCrops((current)=>({...current,[active]:value}));setDirty(true)}
  const leave=()=>{if(!dirty||window.confirm('存在尚未发布的修改，确定返回吗？'))onBack()}
  const reset=()=>{updateCrop(defaultCrop);if(image)setAreas((current)=>({...current,[active]:centerCropArea(image.naturalWidth,image.naturalHeight,outputs[active].aspect)}))}
  const save=async()=>{if(!image||!file||!character){setMessage('请先选择原图。');return}if(variants.some((variant)=>!areas[variant])){setMessage('请依次检查三种比例后再发布。');return}setBusy(true);try{setMessage('正在生成图鉴、对局和头像素材…');const blobs=await Promise.all(variants.map((variant)=>{const output=outputs[variant];return renderCropBlob(image,areas[variant]!,crops[variant].rotation,output.width,output.height,output.quality)}));setMessage('素材已生成，正在上传并写入版本记录…');const form=new FormData();form.append('original',file);variants.forEach((variant,index)=>form.append(variant,new File([blobs[index]],`${variant}.webp`,{type:'image/webp'})));form.append('metadata',JSON.stringify({summary,sourceUrl:character.artworkSourceUrl??undefined,sourceNote:character.artworkSourceNote??'',sourceType:character.artworkSourceType,reason:'素材工作台发布',galleryCrop:crops.gallery,matchCrop:crops.match,avatarCrop:crops.avatar}));const result=await api.artwork(id,form);setCharacter({...character,...result.character} as CharacterDetail);setDirty(false);setMessage('发布成功。新版本已回写，页面将立即使用本次素材。')}catch(error){setMessage(error instanceof Error?error.message:'发布失败，当前编辑内容已保留。')}finally{setBusy(false)}}

  if(!character)return <main className="page"><p className="eyebrow">ARTWORK EDITOR</p><h1>加载角色素材…</h1></main>
  const current=outputs[active]
  return <main className="page artwork-editor"><div className="editor-top"><button className="back-button" onClick={leave}><ArrowLeft/> 返回角色与素材</button><div><p className="eyebrow">ARTWORK WORKBENCH</p><h1>{character.name}<small>{character.game}</small></h1></div><div className="editor-status"><span className={`quality quality--${character.artworkQualityStatus}`}>{character.artworkQualityStatus}</span>{dirty&&<span className="editor-dirty">未发布修改</span>}<button className="primary-button" disabled={busy||!image} onClick={()=>void save()}>{busy?'正在发布…':<>发布新版本 <Save/></>}</button></div></div>{message&&<div className="notice-bar" role="status">{message}</div>}<div className="editor-layout editor-layout--crop"><section className="editor-workspace"><header className="workspace-header"><div className="workspace-tabs">{variants.map((variant)=><button key={variant} className={active===variant?'tabs__active':''} onClick={()=>setActive(variant)}><b>{outputs[variant].label}</b><span>{outputs[variant].short}</span></button>)}</div><label className="upload-replace"><Upload/> {image?'更换原图':'选择图片'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>void loadSelectedFile(event.target.files?.[0])}/></label></header><div className="crop-stage" onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{event.preventDefault();void loadSelectedFile(event.dataTransfer.files[0])}}>{image?<EasyCrop image={sourceUrl} crop={{x:crops[active].x,y:crops[active].y}} zoom={crops[active].zoom} rotation={crops[active].rotation} aspect={current.aspect} minZoom={1} maxZoom={4} zoomSpeed={.15} showGrid restrictPosition objectFit="contain" onCropChange={(value)=>updateCrop({...crops[active],...value})} onZoomChange={(zoom)=>updateCrop({...crops[active],zoom})} onCropComplete={(_area:Area,pixels:Area)=>setAreas((value)=>({...value,[active]:pixels}))}/>:<label className="drop-empty"><ImagePlus/><b>拖入原图，或点击选择图片</b><span>PNG / JPEG / WebP · 最大 10 MB</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>void loadSelectedFile(event.target.files?.[0])}/></label>}</div><div className="crop-toolbar"><button aria-label="缩小" disabled={!image} onClick={()=>updateCrop({...crops[active],zoom:Math.max(1,crops[active].zoom-.1)})}><Minus/></button><label><span>缩放</span><input aria-label="缩放" type="range" min="1" max="4" step="0.01" value={crops[active].zoom} disabled={!image} onChange={(event)=>updateCrop({...crops[active],zoom:Number(event.target.value)})}/><b>{crops[active].zoom.toFixed(2)}×</b></label><button aria-label="放大" disabled={!image} onClick={()=>updateCrop({...crops[active],zoom:Math.min(4,crops[active].zoom+.1)})}><Plus/></button><span className="toolbar-divider"/><button disabled={!image} onClick={()=>updateCrop(rotateCrop(crops[active],-90))}><RotateCcw/> 左转</button><button disabled={!image} onClick={()=>updateCrop(rotateCrop(crops[active],90))}><RotateCw/> 右转</button><button disabled={!image} onClick={reset}>重置当前比例</button></div><footer className="workspace-meta"><span>{fileInfo||'尚未选择原图'}</span><span>输出 {current.width} × {current.height} px</span><span>拖动定位 · 滚轮缩放 · 三种比例独立保存</span></footer></section><aside className="editor-side"><section className="editor-form"><h2>角色资料</h2><label>角色简介<textarea value={summary} onChange={(event)=>{setSummary(event.target.value);setDirty(true)}}/></label><div className="editor-meta"><span>{character.groupCode} 组 · 种子 #{character.seed}</span><span>操作者：{viewer.email}</span></div>{character.artworkQualityStatus==='verified'&&<button className="danger-button" onClick={async()=>{if(!window.confirm('移除当前素材？历史赛季中的已冻结版本会保留。'))return;try{await api.deleteArtwork(id,'素材工作台移除');setImage(null);setFile(null);setSourceUrl('');setCharacter({...character,artworkQualityStatus:'pending',artworkOriginalKey:null,artworkGalleryKey:null,artworkMatchKey:null,artworkAvatarKey:null});setDirty(false);setMessage('当前与未完成赛季素材已移除，历史归档不受影响。')}catch(error){setMessage(error instanceof Error?error.message:'素材移除失败')}}}><Trash2/> 移除当前素材</button>}</section><section className="editor-previews"><h2>最终页面预览</h2>{variants.map((variant)=><button key={variant} className={active===variant?'preview-card preview-card--active':'preview-card'} onClick={()=>setActive(variant)}><span><b>{outputs[variant].label}</b><small>{outputs[variant].short} · {outputs[variant].width}×{outputs[variant].height}</small></span>{image&&areas[variant]?<FinalPreview image={image} area={areas[variant]!} rotation={crops[variant].rotation} variant={variant}/>:<div className="preview-empty">等待原图</div>}</button>)}</section></aside></div></main>
}
