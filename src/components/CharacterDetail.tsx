import { DisplayImage } from './DisplayImage'
import { GameWatermark } from './GameWatermark'
import { useEffect, useRef } from 'react'
import { Trophy, X } from 'lucide-react'
import type { Character } from '../data/tournament'
import type { PublicMatch, PublicSeason, PublicStanding, PublicRound } from '../lib/api'
import { artworkUrls } from '../lib/artwork'
import { beijingTime } from '../lib/season-days'
import { groupStandings } from '../lib/tournament-views'
import { biographySource } from '../lib/character-biography'

export function CharacterDetail({character,season,seasons,matches,standings,rounds,onClose}:{character:Character;season:PublicSeason|null;seasons:PublicSeason[];matches:PublicMatch[];standings:PublicStanding[];rounds:PublicRound[];onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close()},[])
  const games=matches.filter(m=>m.leftId===character.id||m.rightId===character.id).sort((a,b)=>a.startsAt.localeCompare(b.startsAt))
  const standing=standings.find(s=>s.id===character.id)
  const honors=seasons.filter(s=>s.championCharacterId===character.id&&s.championGame===character.game&&['completed','archived'].includes(s.status))
  const defending=season?.format?.defendingChampionId===character.id
  const last=games.filter(m=>m.status==='closed').at(-1)
  const format=season?.format
  const rank=format?groupStandings(standings,format).find(g=>g.group===character.group)?.rows.findIndex(r=>r.id===character.id):undefined
  const swissDone=format&&rounds.some(r=>r.stage==='swiss'&&r.roundNumber===format.swissRounds&&['closed','archived'].includes(r.status))
  const eliminated=last?.stage==='knockout'&&last.winnerCharacterId!==character.id||swissDone&&rank!==undefined&&rank>=format!.qualifiersPerGroup
  const status=season?.championCharacterId===character.id?'本季冠军':eliminated?'已淘汰':season?.status==='published'?'等待开赛':last?.stage==='knockout'&&last.winnerCharacterId===character.id?'晋级下一轮':swissDone?'晋级淘汰赛':'本季参赛'
  const imageKey=character.detailArtworkKey??character.galleryArtworkKey??character.officialArtworkKey
  const image=artworkUrls(imageKey)[0]
  const source=character.sourceUrl?.startsWith('https://')?character.sourceUrl:null
  const bioSource=biographySource(character)
  return <dialog ref={ref} className="character-detail" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose()}} aria-labelledby="character-detail-title">
    <button className="dialog-close" onClick={onClose} aria-label="关闭角色详情" autoFocus><X/></button>
    <div className="character-detail__layout">
      <a className={season?.format?.version===3?'character-detail__art character-detail__art--season':'character-detail__art'} data-game={character.game} href={image} target="_blank" rel="noreferrer" aria-label={`放大${character.name}立绘`}>{season?.format?.version===3&&<GameWatermark game={character.game} className="artwork__logo"/>}<DisplayImage src={image} alt={`${character.game} · ${character.name}本季立绘`}/><span>查看完整原尺寸 ↗</span></a>
      <section><p className="eyebrow">{season?.name??'角色档案'} · {character.game}</p><h2 id="character-detail-title">{character.name}</h2>{defending&&<span className="defending-mark"><Trophy size={14}/> 卫冕冠军</span>}<p>{character.summary||'角色介绍待补充。'}</p>
        {bioSource&&<p className="character-detail__note"><a href={bioSource} target="_blank" rel="noreferrer">角色资料参考 ↗</a></p>}
        <dl className="character-detail__facts"><div><dt>本季形态 / 服装</dt><dd>{character.skinName||'使用本季存档素材'}</dd></div><div><dt>分组</dt><dd>{character.group} 组 · 种子 #{character.seed}</dd></div><div><dt>当前积分</dt><dd>{standing?.points??0} 分</dd></div><div><dt>赛事状态</dt><dd>{status}</dd></div></dl>
        {source&&<p><a href={source} target="_blank" rel="noreferrer">查看素材来源 ↗</a></p>}{character.sourceNote&&<p className="character-detail__note">{character.sourceNote}</p>}
        <h3>历史荣誉</h3>{honors.length?<ul>{honors.map(s=><li key={s.id}><Trophy size={14}/> {s.name} · 冠军</li>)}</ul>:<p>暂无已归档的冠军荣誉。</p>}
        <h3>本季对局</h3>{games.length?<ol className="character-detail__matches">{games.map(m=><li key={m.id}><small>{m.roundName} · {beijingTime(m.startsAt)}</small><b>{m.leftName} <span>{m.status==='scheduled'?'VS':`${m.leftVotes} : ${m.rightVotes}`}</span> {m.rightName}</b><small>{m.status==='live'?'投票中':m.status==='scheduled'?'等待开赛':m.status==='review'?'赛果复核中':'已结束'}</small></li>)}</ol>:<p>对手将在抽签或前序赛程结束后公布。</p>}
      </section>
    </div>
  </dialog>
}
