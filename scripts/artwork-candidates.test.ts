import { describe,expect,it } from 'vitest'
import { candidateDecision,contactSheetLayout,mergeApprovedCandidate,missingRoster,normalizeArtworkName,scoreCandidate } from './artwork-candidates'

describe('立绘候选筛选',()=>{
  it('统一中文标点、空格与中点差异',()=>{
    expect(normalizeArtworkName('阿尔托莉雅 · 潘德拉贡')).toBe('阿尔托莉雅潘德拉贡')
    expect(normalizeArtworkName('Fate／Grand Order')).toBe('fategrandorder')
  })

  it('优先角色本人默认全身立绘',()=>{
    const score=scoreCandidate({title:'文件:阿尔托莉雅·潘德拉贡_角色全身立绘.png',width:1600,height:2400},'阿尔托莉雅·潘德拉贡',['Artoria Pendragon'])
    expect(score).toBeGreaterThanOrEqual(700)
  })

  it('拒绝头像、技能、卡牌、多人和皮肤素材',()=>{
    for(const title of ['芙宁娜头像.png','芙宁娜技能图标.png','芙宁娜卡牌.png','芙宁娜多人合照.png','芙宁娜皮肤立绘.png']){
      expect(candidateDecision({title,width:1200,height:1800},'芙宁娜',[]).status).toBe('rejected')
    }
  })

  it('拒绝未命中角色名或别名的高分辨率图片',()=>{
    expect(candidateDecision({title:'其他角色全身立绘.png',width:2000,height:3000},'芙宁娜',[])).toMatchObject({status:'rejected',reason:'文件名未命中角色名或别名'})
  })

  it('只发现尚未通过质量检查的角色',()=>{
    const roster=[{id:'c001',name:'甲',game:'一'},{id:'c002',name:'乙',game:'二'}]
    expect(missingRoster(roster,new Set(['c001']))).toEqual([{id:'c002',name:'乙',game:'二'}])
  })

  it('为候选审核表生成稳定网格',()=>{
    expect(contactSheetLayout(7,3,360,520,24)).toEqual({columns:3,rows:3,width:1176,height:1656})
  })

  it('归档人工确认候选时替换同角色旧条目且不影响其他角色',()=>{
    const manifest=[{id:'c001',status:'approved'},{id:'c040',status:'pending'}]
    expect(mergeApprovedCandidate(manifest,{id:'c040',status:'approved',sourceFile:'assets/source/c040.png'})).toEqual([{id:'c001',status:'approved'},{id:'c040',status:'approved',sourceFile:'assets/source/c040.png'}])
  })
})
