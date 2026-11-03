import { describe, expect, it } from 'vitest'
import { defaultDay, seasonDays } from './season-days'
import { s2Format } from './s2-format'
import { formatSchedule } from './season-format'
import type { PublicMatch, PublicRound } from './api'
const format=s2Format()
const rounds:PublicRound[]=formatSchedule(format,'2030-01-01T16:00:00.000Z').map((r,i)=>({...r,id:`r${i}`,status:'scheduled'}))
describe('S2 daily browsing',()=>{
 it('shows all 30 days before draws for later rounds, keeps final as one 48-hour window',()=>{
  const days=seasonDays(rounds,[],format)
  expect(days).toHaveLength(29)
  expect(days.slice(0,6).map(d=>d.count)).toEqual([24,24,24,24,16,16])
  expect(days.reduce((n,d)=>n+d.count,0)).toBe(447)
  expect(Date.parse(days.at(-1)!.endsAt)-Date.parse(days.at(-1)!.startsAt)).toBe(48*3600000)
 })
 it('switches exactly at midnight, not while the final is still in progress',()=>{
  const days=seasonDays(rounds,[],format)
  expect(defaultDay(days,Date.parse(days[0].endsAt)-1)?.id).toBe(days[0].id)
  expect(defaultDay(days,Date.parse(days[0].endsAt))?.id).toBe(days[1].id)
  expect(defaultDay(days,Date.parse(days.at(-1)!.startsAt)+86400000)?.id).toBe(days.at(-1)!.id)
 })
 it('never mixes later matches into the selected date',()=>{
  const matches=[{id:'today',roundId:'r0',startsAt:rounds[0].startsAt},{id:'tomorrow',roundId:'r0',startsAt:'2030-01-02T16:00:00.000Z'}] as PublicMatch[]
  const days=seasonDays(rounds,matches,format)
  expect(days[0].matches.map(m=>m.id)).toEqual(['today'])
  expect(days[1].matches.map(m=>m.id)).toEqual(['tomorrow'])
 })
})
