// A filename saying “立绘” is not enough: event minigames also use that term.
export function rejectArtwork(title='') {
  return /暖笺贺春|[QＱ]\s*版|chibi|表情|同人|自画|自制|愚人节|涂装商店|官方介绍|代理人档案|宣传|海报|竖版介绍/i.test(title)
}
export function preferredArtwork(entry) {
  if(entry.supplementBatch&&entry.selected&&!rejectArtwork(entry.selected.title))return entry.selected
  let candidates=entry.candidates.filter(c=>!rejectArtwork(c.title))
  if(entry.game==='战双帕弥什'){
    candidates=candidates.filter(c=>!(/涂装大|模型|建模|展示动作/.test(c.title)))
    if(entry.name==='露西亚')return candidates.find(c=>/^文件:角色 露西亚 誓焰 立绘\.png$/.test(c.title))??candidates.find(c=>/露西亚.*(红莲|黎明|鸦羽|誓焰)/.test(c.title))??null
    if(entry.name==='α')return candidates.find(c=>/露西亚.*(深红之渊|深红囚影|逆冕)/.test(c.title))??null
    return candidates.find(c=>c.title===entry.selected?.title)??candidates[0]??null
  }
  if(entry.game==='明日方舟：终末地')return candidates.find(c=>c.title===`文件:${entry.name}立绘.png`)??null
  if(entry.game==='原神')return candidates.find(c=>c.title===`文件:${entry.name}抽卡立绘.png`)??null
  if(entry.game==='崩坏：星穹铁道'&&entry.name==='三月七')return candidates.find(c=>c.title==='文件:三月七•巡猎立绘.png')??null
  if(entry.game==='崩坏：星穹铁道'&&entry.name==='托帕')return candidates.find(c=>c.title==='文件:托帕&账账立绘.png')??null
  if(entry.game==='崩坏：星穹铁道')return candidates.find(c=>c.title===`文件:${entry.name}立绘.png`)??candidates.find(c=>c.title===`文件:${entry.name} 立绘.png`)??(rejectArtwork(entry.selected?.title)?null:entry.selected)
  if(entry.game==='绝区零')return candidates.find(c=>/^文件:角色立绘-[^-]+\.png$/.test(c.title))??(rejectArtwork(entry.selected?.title)?null:entry.selected)
  return rejectArtwork(entry.selected?.title)?candidates[0]??null:entry.selected
}
