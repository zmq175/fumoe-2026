import { formatGroups, legacyFormat, validateRoster } from './season-format'
export type AdminSeasonEntry={characterId:string;name:string;game:string;summary?:string;groupCode:string;seed:number}

export function seasonRosterSummary(entries:AdminSeasonEntry[],format=legacyFormat()){
  const groups=formatGroups(format)
  const groupCounts=Object.fromEntries(groups.map((group)=>[group,entries.filter((entry)=>entry.groupCode===group).length])) as Record<string,number>
  const seedCounts=new Map<number,number>()
  for(const entry of entries)seedCounts.set(entry.seed,(seedCounts.get(entry.seed)??0)+1)
  const duplicateSeeds=[...seedCounts].filter(([,count])=>count>1).map(([seed])=>seed).sort((a,b)=>a-b)
  return {total:entries.length,groupCounts,duplicateSeeds,ready:validateRoster(entries,format).valid}
}
