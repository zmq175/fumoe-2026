import { expect,test } from '@playwright/test'
import { currentSeason,matches,mockPublicApi } from './fixtures'
import { formatSchedule,legacyFormat } from '../src/lib/season-format'

test('淘汰赛一侧结算后先落位，另一侧保留晋级来源',async({page})=>{
  const format=legacyFormat()
  const rounds=formatSchedule(format,'2030-08-01T00:00:00Z').map((round,index)=>({...round,id:String(index),status:'scheduled' as const}))
  const first=rounds.find(round=>round.stage==='knockout')!
  const closed={...matches[0],roundId:first.id,stage:first.stage,roundNumber:1,bracketPosition:1,status:'closed' as const,winnerCharacterId:null}
  await mockPublicApi(page,{season:{...currentSeason,format},rounds,matches:[
    closed,{...closed,id:'other-match',bracketPosition:2,status:'review'}
  ]})
  await page.goto('/')
  await page.getByRole('button',{name:'赛程赛况',exact:true}).click()
  await page.getByRole('tab',{name:'淘汰赛签表'}).click()
  const next=page.locator('.bracket-canvas__match--placeholder').filter({hasText:'16强第1场'})
  await expect(next).toContainText(closed.leftName)
  await expect(next).toContainText('已锁定')
  await expect(next).toContainText('M2 胜者')
  await expect(next).toContainText('待定')
})
