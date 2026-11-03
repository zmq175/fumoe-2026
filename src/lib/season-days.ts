import type { PublicMatch, PublicRound } from './api'
import type { SeasonFormat } from './season-format'

export type SeasonDay = { id:string; round:PublicRound; startsAt:string; endsAt:string; count:number; matches:PublicMatch[] }
/** Windows match the server's batch offsets; a 48-hour final is one voting window. */
export function seasonDays(rounds:PublicRound[], matches:PublicMatch[], format:SeasonFormat):SeasonDay[] {
  return rounds.flatMap(round=>{
    const index=round.stage==='swiss'?round.roundNumber-1:(format.mode==='knockout'?0:format.swissRounds)+round.roundNumber-1
    const plan=format.rounds[index]
    const roundMatches=matches.filter(m=>m.roundId===round.id)
    if(!plan?.batches)return [{id:round.id,round,startsAt:round.startsAt,endsAt:round.endsAt,count:roundMatches.length,matches:roundMatches}]
    return plan.batches.map((count,day)=>{
      const start=Date.parse(round.startsAt)+day*86400000
      const startsAt=new Date(start).toISOString(),endsAt=new Date(start+(plan.matchDurationHours??24)*3600000).toISOString()
      return {id:`${round.id}-${day}`,round,startsAt,endsAt,count,matches:roundMatches.filter(m=>Date.parse(m.startsAt)===start)}
    })
  })
}
export function defaultDay(days:SeasonDay[],now=Date.now()) {
  return days.find(d=>Date.parse(d.startsAt)<=now&&now<Date.parse(d.endsAt))??days.find(d=>Date.parse(d.startsAt)>now)??days.at(-1)
}
export const beijingTime=(value:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value))
