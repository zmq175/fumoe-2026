export type SeasonStatus = 'draft'|'published'|'live'|'completed'|'archived'
export type Season = { id:string; slug:string; name:string; status:SeasonStatus; isCurrent:boolean; startsAt:string|null; endsAt:string|null; championCharacterId:string|null; announcement:string; historyUnlocked:boolean }
export type SeasonEntry = { characterId:string; groupCode:string; seed:number }

export function buildSeasonSlug(name:string, startsAt:string) {
  const year=new Date(startsAt).getUTCFullYear()
  const descriptor=name.toLowerCase().replace(String(year),'').replace('府萌','').trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
  return `${year}-${descriptor || 'season'}`
}

export function canEditSeason(season:{status:SeasonStatus;historyUnlocked:boolean}) {
  return !['completed','archived'].includes(season.status) || season.historyUnlocked
}

export function canEditRoster(season:{status:SeasonStatus;rosterLocked:boolean}) {
  return season.status==='draft'&&!season.rosterLocked
}

export function validateSeasonRoster(entries:SeasonEntry[]) {
  const groups=['A','B','C','D','E','F','G','H']
  const groupCounts=Object.fromEntries(groups.map((group)=>[group,0])) as Record<string,number>
  for(const entry of entries) if(entry.groupCode in groupCounts)groupCounts[entry.groupCode]++
  const result=(valid:boolean,error:string|null)=>({valid,error,groupCounts})
  if(entries.length!==128)return result(false,'赛季名单必须包含 128 位角色')
  if(new Set(entries.map((entry)=>entry.characterId)).size!==entries.length)return result(false,'赛季名单包含重复角色')
  if(new Set(entries.map((entry)=>entry.seed)).size!==entries.length)return result(false,'赛季名单包含重复种子')
  if(entries.some((entry)=>entry.seed<1||entry.seed>128))return result(false,'种子必须在 1 到 128 之间')
  if(groups.some((group)=>groupCounts[group]!==16))return result(false,'每组必须恰好包含 16 位角色')
  return result(true,null)
}

export function homepageMode(input:{currentStatus:SeasonStatus|null;hasPreviousChampion:boolean}) {
  if(input.currentStatus==='live') return input.hasPreviousChampion?'live-with-defender':'live'
  if(input.currentStatus==='published'&&input.hasPreviousChampion) return 'season-transition'
  if(input.currentStatus==='completed') return 'champion'
  return 'default'
}
