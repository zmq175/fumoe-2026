import { useEffect,useRef,useState,type ReactNode } from 'react'
import { ArrowLeft,ArrowRight,Trophy } from 'lucide-react'
import type { PublicMatch,PublicRound } from '../lib/api'
import { knockoutSize,type SeasonFormat } from '../lib/season-format'
import { bracketGeometry,knockoutColumns,knockoutPlaceholder,matchResult,roundStatusLabel,tidyName } from '../lib/tournament-views'
import './knockout-bracket.css'

type PortraitProps={id:string;name:string;avatarArtworkKey?:string|null;size:'bracket'|'champion'}
type Props={matches:PublicMatch[];rounds:PublicRound[];format:SeasonFormat;renderPortrait:(props:PortraitProps)=>ReactNode}

/** Read-only bracket explorer. Larger screens spread columns; smaller screens scroll without shrinking text. */
export function KnockoutBracket({matches,rounds,format,renderPortrait}:Props){
  const viewport=useRef<HTMLDivElement>(null)
  const drag=useRef<{pointer:number;x:number;y:number;left:number;top:number;moved:boolean}|null>(null)
  const suppressClick=useRef(false)
  const [dragging,setDragging]=useState(false)
  const [size,setSize]=useState({width:0,height:0}),[mode,setMode]=useState<'fit'|'actual'>(()=>window.innerWidth<640?'actual':'fit')
  const [zoom,setZoom]=useState(1)
  const [hovered,setHovered]=useState<string|null>(null),[focused,setFocused]=useState<string|null>(null),[pinned,setPinned]=useState<string|null>(null)
  const [jump,setJump]=useState('1')
  useEffect(()=>{const el=viewport.current;if(!el)return;const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));observer.observe(el);return()=>observer.disconnect()},[])
  const columns=knockoutColumns(matches,rounds)
  const geometry=bracketGeometry(knockoutSize(format))
  const scale=mode==='fit'?Math.min(1,(size.width||1)/geometry.width,(size.height||1)/geometry.height):zoom
  const changeZoom=(next:number)=>{setMode('actual');setZoom(Math.max(.1,Math.min(2,next)))}
  const selected=pinned??focused??hovered
  const final=columns.at(-1)?.matches[0]
  const championId=final?.winnerCharacterId??null
  const champion=championId&&final?(championId===final.leftId?final.leftName:final.rightName):null
  const includes=(match:PublicMatch|undefined)=>Boolean(selected&&match&&(match.leftId===selected||match.rightId===selected))
  const selectedMatch=matches.find(m=>m.leftId===selected||m.rightId===selected)
  const selectedName=selectedMatch?(selectedMatch.leftId===selected?selectedMatch.leftName:selectedMatch.rightName):null
  const clear=()=>{setPinned(null);setHovered(null);setFocused(null)}
  const scrollBehavior=():ScrollBehavior=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'
  const pan=(direction:number)=>{const el=viewport.current;if(el)el.scrollBy({left:direction*Math.min(356,el.clientWidth*.8),behavior:scrollBehavior()})}
  const endDrag=()=>{drag.current=null;setDragging(false)}
  const jumpTo=(value:string)=>{
    setJump(value)
    const card=value==='champion'?geometry.champion:geometry.rounds[Number(value)-1]?.cards[0]
    const el=viewport.current;if(!card||!el)return
    setMode('actual');setZoom(1)
    el.scrollIntoView({block:'start',behavior:'instant'})
    requestAnimationFrame(()=>el.scrollTo({left:Math.max(0,card.x-20),top:Math.max(0,card.y-el.clientHeight/2),behavior:scrollBehavior()}))
  }
  const side=(match:PublicMatch,which:'left'|'right')=>{
    const id=which==='left'?match.leftId:match.rightId,name=which==='left'?match.leftName:match.rightName
    const votes=which==='left'?match.leftVotes:match.rightVotes,game=which==='left'?match.leftGame:match.rightGame
    const winner=matchResult(match).winnerId===id
    return <button type="button" className={`bracket-canvas__side${winner?' bracket-canvas__side--winner':''}${selected===id?' bracket-canvas__side--tracked':''}`} aria-label={`${name}，${votes} 票，查看晋级路径`} aria-pressed={pinned===id} onMouseEnter={()=>setHovered(id)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setFocused(id)} onBlur={()=>setFocused(null)} onClick={()=>setPinned(pinned===id?null:id)}>
      {renderPortrait({id,name,avatarArtworkKey:which==='left'?match.leftAvatarArtworkKey:match.rightAvatarArtworkKey,size:'bracket'})}<span><strong>{tidyName(name)}</strong><small>{game}</small></span><b className="bracket-canvas__score">{votes}</b>
    </button>
  }
  const edges=geometry.rounds.slice(0,-1).flatMap((round,roundIndex)=>round.cards.map(card=>{
    const target=geometry.rounds[roundIndex+1].cards[Math.floor(card.index/2)]
    const x=card.x+card.width,join=(x+target.x)/2
    const active=includes(columns[roundIndex]?.matches[card.index])&&includes(columns[roundIndex+1]?.matches[target.index])
    return <path key={`${roundIndex}-${card.index}`} className={active?'bracket-canvas__path--tracked':undefined} d={`M ${x} ${card.y} H ${join} V ${target.y} H ${target.x}`}/>
  }))
  return <section className="bracket-canvas-wrap bracket-explorer" aria-label="淘汰赛签表" onKeyDown={e=>{if(e.key==='Escape')clear()}}>
    <div className="bracket-explorer__toolbar">
      <div className="bracket-explorer__modes bracket-explorer__views" role="group" aria-label="签表显示方式"><button type="button" className={mode==='fit'?'bracket-explorer__view--current':undefined} aria-pressed={mode==='fit'} onClick={()=>{setMode('fit');viewport.current?.scrollTo({left:0,top:0,behavior:'instant'})}}>全图概览</button><button type="button" className={mode==='actual'?'bracket-explorer__view--current':undefined} aria-pressed={mode==='actual'&&zoom===1} onClick={()=>changeZoom(1)}>清晰大图</button></div>
      <div className="bracket-explorer__modes bracket-explorer__desktop" role="group" aria-label="签表缩放"><button type="button" disabled={scale<=.1} onClick={()=>changeZoom(scale-.2)}>缩小</button><output aria-label="当前缩放比例">{Math.round(scale*100)}%</output><button type="button" disabled={scale>=2} onClick={()=>changeZoom(scale+.2)}>放大</button></div>
      <label><span className="bracket-explorer__desktop">定位轮次</span><select aria-label="定位轮次" value={jump} onChange={e=>jumpTo(e.target.value)}>{geometry.rounds.map(r=><option value={r.roundNumber} key={r.roundNumber}>{columns[r.roundNumber-1]?.round.name??`第 ${r.roundNumber} 轮`}</option>)}<option value="champion">冠军</option></select></label>
      <button className="bracket-explorer__desktop" type="button" disabled={!selected} onClick={clear}>清除高亮</button>
      <div className="bracket-explorer__modes bracket-explorer__desktop" role="group" aria-label="横向浏览"><button type="button" aria-label="向左浏览签表" onClick={()=>pan(-1)}><ArrowLeft size={18}/>向左</button><button type="button" aria-label="向右浏览签表" onClick={()=>pan(1)}>向右<ArrowRight size={18}/></button></div>
    </div>
    <p className="bracket-explorer__help" id="bracket-pan-help"><span className="bracket-explorer__desktop">全图概览完整展示晋级结构；看票数可切换清晰大图。放大后按住拖动，手机直接滑动；点击角色锁定路径。</span><span className="bracket-explorer__mobile">滑动查看，点击角色追踪晋级。</span></p>
    <div className={`bracket-explorer__selection${selectedName?'':' bracket-explorer__selection--empty'}`}><span role="status"><span className="bracket-explorer__desktop">{selectedName?`正在追踪：${selectedName}${pinned?'（已锁定，按 Esc 清除）':''}`:'选择一位角色，查看冠军之路。'}</span><span className="bracket-explorer__mobile">{selectedName?`追踪：${selectedName}`:''}</span></span>{selectedName&&<button className="bracket-explorer__mobile" type="button" onClick={clear}>清除高亮</button>}</div>
    <div className={`bracket-explorer__viewport${dragging?' bracket-explorer__viewport--dragging':''}`} ref={viewport} tabIndex={0} role="region" aria-label="可滚动淘汰赛画布" aria-describedby="bracket-pan-help"
      onPointerDown={e=>{suppressClick.current=false;if(e.pointerType!=='mouse'||e.button!==0)return;const el=e.currentTarget;drag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop,moved:false}}}
      onPointerMove={e=>{const start=drag.current;if(!start||start.pointer!==e.pointerId)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(!start.moved&&Math.hypot(dx,dy)<6)return;if(!start.moved){start.moved=true;suppressClick.current=true;e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);setHovered(null)}e.preventDefault();e.currentTarget.scrollLeft=start.left-dx;e.currentTarget.scrollTop=start.top-dy}}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
      onPointerLeave={()=>{if(!drag.current?.moved)endDrag()}}
      onDragStart={e=>e.preventDefault()}
      onClickCapture={e=>{if(suppressClick.current&&e.detail!==0){e.preventDefault();e.stopPropagation();suppressClick.current=false}}}>
      <div className="bracket-explorer__scaled" style={{width:geometry.width*scale,height:geometry.height*scale}}>
      <div className="bracket-canvas" style={{width:geometry.width,height:geometry.height,transform:`scale(${scale})`,transformOrigin:'top left'}}>
        <svg className="bracket-canvas__lines" viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">{edges}<path className={`bracket-canvas__champion-line${selected===championId&&selected?' bracket-canvas__path--tracked':''}`} d={geometry.championPath}/></svg>
        {geometry.rounds.map((layout,roundIndex)=><div key={layout.roundNumber}>
          <header className="bracket-canvas__round-title" style={{left:layout.cards[0].x,width:layout.cards[0].width}}><span>ROUND {layout.roundNumber}</span><b>{columns[roundIndex]?.round.name??`第 ${layout.roundNumber} 轮`}</b><small>{columns[roundIndex]?roundStatusLabel(columns[roundIndex].round):'待开始'}</small></header>
          {layout.cards.map(card=>{
            const match=columns[roundIndex]?.matches[card.index]
            const style={left:card.x,top:card.y-card.height/2,width:card.width,height:card.height}
            if(!match){const p=knockoutPlaceholder(layout.roundNumber,card.index,format);return <article className="bracket-canvas__match bracket-canvas__match--placeholder" style={style} key={card.index}><div className="bracket-canvas__side"><span><strong>{p.left}</strong><small>{p.leftMeta}</small></span><b className="bracket-canvas__score bracket-canvas__slot">待定</b></div><div className="bracket-canvas__side"><span><strong>{p.right}</strong><small>{p.rightMeta}</small></span><b className="bracket-canvas__score bracket-canvas__slot">待定</b></div><footer>{p.note}</footer></article>}
            return <article key={match.id} className={`bracket-canvas__match${includes(match)?' bracket-canvas__match--tracked':''}`} style={style}>{side(match,'left')}{side(match,'right')}<footer>{matchResult(match).label}</footer></article>
          })}
        </div>)}
        <header className="bracket-canvas__round-title bracket-canvas__round-title--winner" style={{left:geometry.champion.x,width:geometry.champion.width}}><span>WINNER</span><b>冠军</b></header>
        <button type="button" disabled={!championId} aria-label={champion?`追踪冠军 ${champion}`:'冠军尚未产生'} aria-pressed={Boolean(championId&&pinned===championId)} onClick={()=>setPinned(pinned===championId?null:championId)} onMouseEnter={()=>setHovered(championId)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setFocused(championId)} onBlur={()=>setFocused(null)} className="bracket-canvas__champion" style={{left:geometry.champion.x,top:geometry.champion.y-geometry.champion.height/2,width:geometry.champion.width,height:geometry.champion.height}}>{champion&&final?renderPortrait({id:championId!,name:champion,avatarArtworkKey:championId===final.leftId?final.leftAvatarArtworkKey:final.rightAvatarArtworkKey,size:'champion'}):<Trophy/>}<strong>{champion??'等待决赛'}</strong><small>{champion?'最终胜者 · 点击追踪':'冠军席位'}</small></button>
      </div>
      </div>
    </div>
  </section>
}
