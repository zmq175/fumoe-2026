import { useEffect, useState } from 'react'
import { api, type PublicRound, type PublicSeason } from '../lib/api'
import { formatRoundPlans, formatSchedule, knockoutSize, legacyFormat, roundCount, seasonFormatSchema, type SeasonFormat } from '../lib/season-format'
import type { AdminSeasonEntry } from '../lib/season-admin'
import './season-configuration.css'

function localDate(iso:string){const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60_000).toISOString().slice(0,16)}
const rosterText=(entries:AdminSeasonEntry[])=>entries.map(e=>[e.characterId,e.name,e.game,e.groupCode,e.seed,e.summary??''].join('\t')).join('\n')
function parseRoster(text:string):AdminSeasonEntry[]{
  return text.trim()?text.trim().split(/\r?\n/).map((line,i)=>{
    const [characterId,name,game,groupCode,seed,summary='']=line.split('\t').map(v=>v.trim())
    if(!characterId||!name||!game||!groupCode||!Number.isInteger(Number(seed)))throw new Error(`第 ${i+1} 行需要角色 ID、名称、游戏、组别和整数种子，用制表符分隔`)
    return {characterId,name,game,groupCode,seed:Number(seed),summary}
  }):[]
}

/** Extends the existing season workspace: configure, preview, save explicitly, then publish separately. */
export function SeasonConfiguration({season,admin,onSaved,onDirtyChange}:{season:PublicSeason;admin:boolean;onSaved:()=>Promise<void>;onDirtyChange:(dirty:boolean)=>void}){
  const [format,setFormat]=useState<SeasonFormat>(()=>season.format??legacyFormat())
  const [startsAt,setStartsAt]=useState(()=>localDate(season.startsAt??new Date().toISOString()))
  const [rounds,setRounds]=useState<PublicRound[]>([])
  const [text,setText]=useState(''),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('')
  const [loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false)
  const [rosterDirty,setRosterDirty]=useState(false),[scheduleDirty,setScheduleDirty]=useState(false)
  const unsaved=dirty||rosterDirty||scheduleDirty
  useEffect(()=>{onDirtyChange(unsaved);return()=>onDirtyChange(false)},[unsaved,onDirtyChange])
  const editable=admin&&season.status==='draft'
  useEffect(()=>{let active=true;api.seasonConfiguration(season.id).then(data=>{if(active){setFormat(data.format);setRounds(data.rounds);setText(rosterText(data.entries));setLoaded(true);setLoading(false)}}).catch(e=>{if(active){setError(e.message);setLoading(false)}});return()=>{active=false}},[season.id])
  const checked=seasonFormatSchema.safeParse(format)
  const count=roundCount(format)
  const plans=Number.isInteger(count)&&count>=1&&count<=24?formatRoundPlans(format):[]
  const validDate=Number.isFinite(new Date(startsAt).getTime())
  const schedule=checked.success&&validDate?formatSchedule(checked.data,new Date(startsAt).toISOString()):[]
  const update=(changes:Partial<SeasonFormat>)=>{
    const next={...format,...changes},count=roundCount(next)
    if(Number.isInteger(count)&&count>=1&&count<=24)next.rounds=Array.from({length:count},(_,i)=>next.rounds[i]??{durationHours:24,breakHours:0})
    setFormat(next);setDirty(true)
  }
  const run=async(action:()=>Promise<void>,needsReason=true)=>{
    setError('');setMessage('')
    if(needsReason&&reason.trim().length<5){setError('请在操作原因中填写至少 5 个字符');return}
    setBusy(true);try{await action()}catch(e){setError(e instanceof Error?e.message:'操作失败，请重试')}finally{setBusy(false)}
  }
  const save=()=>run(async()=>{
    if(!checked.success)throw new Error(checked.error.issues.map(i=>i.message).join('；'))
    await api.saveSeasonConfiguration(season.id,{format:checked.data,startsAt:new Date(startsAt).toISOString(),reason})
    setDirty(false);setMessage('赛制与默认排期已保存。请检查名单后再发布。')
    setRounds((await api.seasonConfiguration(season.id)).rounds);await onSaved()
  })
  const simulate=()=>run(async()=>{
    if(unsaved)throw new Error('请先保存赛制，再模拟已保存的名单和规则')
    const result=await api.simulateSeason(season.id)
    setMessage(`模拟完成：${result.simulation.uniqueParticipants} 人，各轮 ${result.simulation.roundMatchCounts.join('、')} 场，产生 1 位冠军。模拟以种子决定胜负，不影响真实比赛。`)
  },false)
  if(loading)return <p role="status">正在读取赛季配置…</p>
  if(!loaded)return <p className="form-error" role="alert">配置读取失败：{error}。请重新打开本赛季后重试。</p>
  return <section className="season-config" aria-label="赛制与排期配置">
    <h3>赛制与排期</h3>
    <p>{editable?'先配置规则，再导入名单；保存不会发布赛季。':'本赛季规则已冻结。历史赛季继续按发布时的规则展示。'}</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {message&&<p className="notice-bar" role="status">{message}</p>}
    <fieldset disabled={!editable||busy||scheduleDirty} className="season-config__fields">
      <legend>参赛与晋级</legend>
      <label>赛制<select value={format.mode} onChange={e=>update({mode:e.target.value as SeasonFormat['mode']})}><option value="swiss-knockout">分组瑞士轮 → 单败淘汰</option><option value="knockout">直接单败淘汰</option></select></label>
      <label>参赛人数<select value={format.participants} onChange={e=>update({participants:Number(e.target.value)})}>{[2,4,8,16,32,64,128,256].map(n=><option key={n} value={n}>{n} 人</option>)}</select></label>
      {format.mode==='swiss-knockout'&&<>
        <label>分组数<select value={format.groupCount} onChange={e=>update({groupCount:Number(e.target.value)})}>{[2,4,8,16].map(n=><option key={n} value={n}>{n} 组</option>)}</select></label>
        <label>瑞士轮数<input type="number" min="1" max="16" value={format.swissRounds} onChange={e=>update({swissRounds:Number(e.target.value)})}/></label>
        <label>每组晋级人数<select value={format.qualifiersPerGroup} onChange={e=>update({qualifiersPerGroup:Number(e.target.value)})}>{[1,2,4,8,16,32,64,128].map(n=><option key={n} value={n}>{n} 人</option>)}</select></label>
        <label className="season-config__check"><input type="checkbox" checked={format.avoidSameGame} onChange={e=>update({avoidSameGame:e.target.checked})}/>瑞士轮后续配对优先避开同游戏角色</label>
      </>}
      <label>赛季开始时间<input type="datetime-local" value={startsAt} onChange={e=>{setStartsAt(e.target.value);setDirty(true)}} required/></label>
    </fieldset>
    {!checked.success&&<p className="form-error" role="alert">{checked.error.issues.map(i=>i.message).join('；')}</p>}
    {plans.length>0&&<>
      <p className="season-config__preview">{format.participants} 人 → {format.mode==='swiss-knockout'?`${format.groupCount} 组 × ${format.participants/format.groupCount} 人 → `:''}{knockoutSize(format)} 强 → 冠军 · {plans.length} 轮 · 共 {plans.reduce((n,r)=>n+r.matchCount,0)} 场{schedule.length>0&&` · 约 ${((new Date(schedule.at(-1)!.endsAt).getTime()-new Date(startsAt).getTime())/86_400_000).toFixed(1)} 天`}</p>
      <p>每轮分别设置时长和轮前休赛间隔。时间按当前设备时区输入；公开赛程显示北京时间。</p>
      <p className="season-config__scroll-hint">左右滑动查看完整排期。</p><div className="season-config__table" role="region" aria-label="轮次时长表（可横向滚动）" tabIndex={0}><table><thead><tr><th scope="col">轮次</th><th scope="col">场次</th><th scope="col">轮前休赛（小时）</th><th scope="col">比赛时长（小时）</th></tr></thead><tbody>{plans.map((r,i)=><tr key={`${r.stage}-${r.roundNumber}`}><th scope="row">{r.name}</th><td>{r.matchCount}</td>{(['breakHours','durationHours'] as const).map(key=><td key={key}><input aria-label={`${r.name}${key==='breakHours'?'轮前休赛':'比赛时长'}`} type="number" min={key==='breakHours'?0:1} max="744" value={format.rounds[i][key]} disabled={!editable||busy||scheduleDirty} onChange={e=>update({rounds:format.rounds.map((v,j)=>j===i?{...v,[key]:Number(e.target.value)}:v)})}/></td>)}</tr>)}</tbody></table></div>
      <p>积分：胜 3、平 1、负 0；依次比较积分、对手分、净票差、种子。淘汰赛平票时种子较小者晋级。</p>
    </>}
    <details><summary>本赛季阵营（{format.factions.length} 个）</summary><p>每行配置一个阵营，同一游戏只能归属一个阵营；未分配的游戏单独统计。游戏名称用中文逗号分隔。</p>
      {format.factions.map((f,i)=><fieldset className="season-config__faction" key={i} disabled={!editable||busy||scheduleDirty}><legend>阵营 {i+1}</legend>
        <label>名称<input value={f.name} onChange={e=>update({factions:format.factions.map((v,j)=>j===i?{...v,name:e.target.value}:v)})}/></label>
        <label>包含的游戏<input value={f.games.join('，')} onChange={e=>update({factions:format.factions.map((v,j)=>j===i?{...v,games:e.target.value.split(/[，,]/).map(g=>g.trim())}:v)})}/></label>
        <label>颜色<input type="color" value={f.accent} onChange={e=>update({factions:format.factions.map((v,j)=>j===i?{...v,accent:e.target.value}:v)})}/></label>
        <label>Logo 站内路径（可留空）<input value={f.logoPath??''} placeholder="/factions/example.png" onChange={e=>update({factions:format.factions.map((v,j)=>j===i?{...v,logoPath:e.target.value||null}:v)})}/></label>
        <button type="button" onClick={()=>update({factions:format.factions.filter((_,j)=>j!==i)})}>移除阵营 {i+1}</button>
      </fieldset>)}
      {editable&&<button type="button" disabled={busy} onClick={()=>update({factions:[...format.factions,{name:'',games:[],accent:'#8c98a0',logoPath:null}]})}>添加阵营</button>}
    </details>
    {admin&&<label className="season-config__reason">操作原因<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="说明本次修改的原因，至少 5 个字符"/></label>}
    {unsaved&&<p role="status">存在未保存修改，请先保存赛制、名单或日历后再发布和模拟。{scheduleDirty&&'请先保存日历，再编辑默认赛制。'}</p>}
    <div className="admin-actions">{editable&&<button className="primary-button" disabled={busy||scheduleDirty||!checked.success||!validDate} onClick={()=>void save()}>{busy?'正在处理…':dirty?'保存赛制与排期 *':'保存赛制与排期'}</button>}<button disabled={busy||unsaved} onClick={()=>void simulate()}>模拟完整赛季</button></div>
    <details><summary>导入／替换草稿名单</summary><p>从表格复制以下列，使用制表符分隔：角色 ID、名称、游戏、组别、种子、简介（可选）。导入会替换本草稿名单；新 ID 会新增到角色库。现有角色 ID 不可用于其他角色。</p>
      <label>参赛名单<textarea className="season-config__roster" value={text} readOnly={!editable} onChange={e=>{setText(e.target.value);setRosterDirty(true)}} spellCheck={false}/></label>
      {editable&&<button disabled={busy||dirty} onClick={()=>void run(async()=>{const entries=parseRoster(text);if(!entries.length)throw new Error('请至少填写一位参赛角色');await api.importSeasonRoster(season.id,entries,reason);setRosterDirty(false);setMessage(`已导入 ${entries.length} 位参赛者。`);await onSaved()})}>替换本草稿名单</button>}
    </details>
    <details><summary>逐轮日历与调整</summary><p>仅未开始的轮次可调整；后续轮次不能早于前序结束。启用自动推进后按排期开始和结算；暂停中的轮次仍需手动恢复。</p>
      {admin&&season.isCurrent&&['published','live'].includes(season.status)&&<div className="admin-actions"><button disabled={busy} onClick={()=>void run(async()=>{await api.setSeasonAutomation(season.id,true,reason);setMessage('已启用自动推进，系统将等待预定开赛时间。');await onSaved()})}>启用自动推进</button><button disabled={busy} onClick={()=>void run(async()=>{await api.setSeasonAutomation(season.id,false,reason);setMessage('已切换为手动推进。');await onSaved()})}>切换手动推进</button></div>}
      {rounds.map((r,i)=><fieldset className="season-config__fields" key={r.id} disabled={!admin||busy||dirty||r.status!=='scheduled'||!['draft','published','live'].includes(season.status)}><legend>{r.name} · {r.status}</legend>{(['startsAt','endsAt'] as const).map(key=><label key={key}>{key==='startsAt'?'开始':'结束'}<input type="datetime-local" value={localDate(r[key])} onChange={e=>{if(e.target.value){setRounds(rounds.map((v,j)=>j===i?{...v,[key]:new Date(e.target.value).toISOString()}:v));setScheduleDirty(true)}}}/></label>)}</fieldset>)}
      {admin&&['draft','published','live'].includes(season.status)&&<button disabled={busy||dirty} onClick={()=>void run(async()=>{await api.saveSeasonSchedule(season.id,rounds.filter(r=>r.status==='scheduled').map(({id,startsAt,endsAt})=>({id,startsAt,endsAt})),reason);setScheduleDirty(false);setMessage('未开始轮次的排期已更新。');await onSaved()})}>保存未开始轮次排期</button>}
    </details>
  </section>
}
