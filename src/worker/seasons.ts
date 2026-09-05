import { legacyFormat, validateRoster } from '../lib/season-format'
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

export function validateSeasonRoster(entries:SeasonEntry[],format=legacyFormat()) {
  return validateRoster(entries,format)
}

export function homepageMode(input:{currentStatus:SeasonStatus|null;hasPreviousChampion:boolean}) {
  if(input.currentStatus==='live') return input.hasPreviousChampion?'live-with-defender':'live'
  if(input.currentStatus==='published'&&input.hasPreviousChampion) return 'season-transition'
  if(input.currentStatus==='completed') return 'champion'
  return 'default'
}
