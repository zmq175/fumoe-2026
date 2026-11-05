import { legacyFactions, type SeasonFormat } from './season-format'
import { seasonFormatSchema } from './season-format-schema'

/** S2 is opt-in. Never change legacyFormat or an existing season to select this preset. */
export function s2Format():SeasonFormat {
  const batches=[[24,24,24,24,16,16],[24,24,24,24,16,16],[24,24,24,24,16,16],[11,11,10],[6,5,5],[4,4],[4],[2],[1]]
  return seasonFormatSchema.parse({
    version:3,mode:'swiss-knockout',participants:256,groupCount:16,swissRounds:3,
    qualifiersPerGroup:4,avoidSameGame:false,defendingChampionId:'c105',artworkCutoff:'2026-11-04',
    rounds:batches.map((counts,i)=>({batches:counts,matchDurationHours:i===8?48:24,durationHours:(counts.length-1)*24+(i===8?48:24),breakHours:0})),
    factions:legacyFactions.filter(f=>['米哈游','库洛游戏','鹰角网络','Hotta Studio'].includes(f.name)).map(f=>({...f,games:f.name==='米哈游'?[...f.games,'崩坏3']:[...f.games]}))
  })
}

/** SHA-256 ordering is reproducible from the recorded seed and stable character IDs. */
export async function drawSeasonRoster<T extends {characterId:string}>(entries:T[],seed:string,groupCount=16){
  if(!seed.trim()||entries.length%groupCount||new Set(entries.map(e=>e.characterId)).size!==entries.length)throw new Error('抽签种子、名单或组数无效')
  const encoder=new TextEncoder()
  const scored=await Promise.all(entries.map(async entry=>{
    const digest=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify([seed,entry.characterId])))
    return {entry,score:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}
  }))
  scored.sort((a,b)=>a.score<b.score?-1:a.score>b.score?1:a.entry.characterId<b.entry.characterId?-1:1)
  return scored.map(({entry},i)=>({...entry,seed:i+1,groupCode:String.fromCharCode(65+Math.floor(i/(entries.length/groupCount)))}))
}
