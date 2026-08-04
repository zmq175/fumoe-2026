import { describe, expect, it } from 'vitest'
import { characters, createSwissRound, gameQuotas, GROUPS, GROUP_SIZE, type SwissRecord } from './tournament'

describe('府萌 2026 预置名单', () => {
  it('包含且仅包含 128 位角色', () => expect(characters).toHaveLength(128))
  it('满足约定的游戏席位', () => {
    expect(gameQuotas['原神']).toBe(16)
    expect(gameQuotas['崩坏：星穹铁道']).toBe(16)
    expect(gameQuotas['绝区零']).toBe(16)
    expect(gameQuotas['鸣潮']).toBe(16)
    expect(['碧蓝航线', '蔚蓝档案', 'Fate/Grand Order', '胜利女神：妮姬'].every((game) => gameQuotas[game as keyof typeof gameQuotas] === 10)).toBe(true)
    expect(['战双帕弥什', '明日方舟：终末地', '异环'].every((game) => gameQuotas[game as keyof typeof gameQuotas] === 8)).toBe(true)
  })
  it('均分为八个十六人小组，并留有素材槽位', () => {
    expect(GROUPS.every((group) => characters.filter((character) => character.group === group).length === GROUP_SIZE)).toBe(true)
    expect(new Set(characters.map((character) => character.id)).size).toBe(128)
    expect(new Set(characters.map((character) => character.seed)).size).toBe(128)
    expect(characters.every((character) => character.officialArtworkKey.endsWith('/gallery.webp'))).toBe(true)
  })
})

describe('瑞士轮配对', () => {
  const records: SwissRecord[] = Array.from({ length: 16 }, (_, index) => characters[(index % 8) * 16 + Math.floor(index / 8)]).map((character, index) => ({ character, points: index % 4, voteDifference: 100 - index, opponentPoints: index, opponents: [] }))
  it('为十六位角色生成八场无重复对局', () => {
    const matches = createSwissRound(records, 1)
    expect(matches).toHaveLength(8)
    expect(new Set(matches.flat().map((record) => record.character.id)).size).toBe(16)
  })
  it('优先规避同游戏对阵与重复对阵', () => {
    const matches = createSwissRound(records, 2)
    expect(matches.every(([left, right]) => left.character.game !== right.character.game)).toBe(true)
    expect(matches.every(([left, right]) => !left.opponents.includes(right.character.id))).toBe(true)
  })
})
