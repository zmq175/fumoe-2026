export type AdminSeasonEntry={characterId:string;name:string;game:string;groupCode:string;seed:number}

export function seasonRosterSummary(entries:AdminSeasonEntry[]){
  const groups=['A','B','C','D','E','F','G','H']
  const groupCounts=Object.fromEntries(groups.map((group)=>[group,entries.filter((entry)=>entry.groupCode===group).length])) as Record<string,number>
  const seedCounts=new Map<number,number>()
  for(const entry of entries)seedCounts.set(entry.seed,(seedCounts.get(entry.seed)??0)+1)
  const duplicateSeeds=[...seedCounts].filter(([,count])=>count>1).map(([seed])=>seed).sort((a,b)=>a-b)
  return {total:entries.length,groupCounts,duplicateSeeds,ready:entries.length===128&&duplicateSeeds.length===0&&groups.every((group)=>groupCounts[group]===16)}
}
