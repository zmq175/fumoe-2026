import { describe, expect, it } from 'vitest'
import { normalizePortraitName, portraitCandidateDecision, selectPortraitCandidate } from './portrait-candidates'

describe('角色头像候选筛选', () => {
  it('统一角色名中的标点差异', () => {
    expect(normalizePortraitName('阿尔托莉雅 · 潘德拉贡')).toBe('阿尔托莉雅潘德拉贡')
  })

  it('接受命中角色名的方形游戏头像', () => {
    expect(portraitCandidateDecision({ title: '文件:无背景-角色-芙宁娜.png', width: 106, height: 106, mime: 'image/png' }, '芙宁娜')).toMatchObject({ status: 'recommended' })
  })

  it('拒绝立绘、卡牌和皮肤素材', () => {
    for (const title of ['芙宁娜立绘头像.png', '角色头像-芙宁娜卡牌.png', '芙宁娜皮肤头像.png']) {
      expect(portraitCandidateDecision({ title, width: 256, height: 256 }, '芙宁娜').status).toBe('rejected')
    }
  })

  it('拒绝未命中角色名、尺寸过小和非方形素材', () => {
    expect(portraitCandidateDecision({ title: '角色头像-其他人.png', width: 256, height: 256 }, '芙宁娜').status).toBe('rejected')
    expect(portraitCandidateDecision({ title: '角色头像-芙宁娜.png', width: 32, height: 32 }, '芙宁娜').status).toBe('rejected')
    expect(portraitCandidateDecision({ title: '角色头像-芙宁娜.png', width: 100, height: 200 }, '芙宁娜').status).toBe('rejected')
  })

  it('优先选择更高分辨率的合格头像', () => {
    const selected = selectPortraitCandidate([
      { title: '角色头像-芙宁娜.png', width: 106, height: 106, mime: 'image/png' },
      { title: '角色头像-芙宁娜.webp', width: 256, height: 256, mime: 'image/webp' },
    ], '芙宁娜')
    expect(selected?.width).toBe(256)
  })
})
