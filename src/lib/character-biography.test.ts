import {describe, expect, it} from 'vitest'
import catalog from '../../seasons/s2/character-bios.json'
import selection from '../../seasons/s2/artwork-selection.json'
import {biographySource} from './character-biography'

describe('S2 editorial biographies', () => {
  it('covers every accepted identity once with substantive copy and a citation', () => {
    expect(catalog.entries).toHaveLength(256)
    expect(new Set(catalog.entries.map(e=>e.id)).size).toBe(256)
    for (const entry of selection.entries) {
      const bio=catalog.entries.find(e=>e.id===entry.id)
      expect(bio).toMatchObject({game:entry.game,name:entry.name})
      expect(bio!.summary.length).toBeGreaterThan(25)
      expect(bio!.summary).not.toMatch(/待补充|参赛角色|素材|\.png|\.webp|仅供参考/)
      expect(new URL(bio!.sourceUrl).protocol).toBe('https:')
    }
  })
  it('keeps same-name characters distinct across games', () => {
    for (const name of ['希儿','布洛妮娅']) {
      const entries=catalog.entries.filter(e=>e.name===name)
      expect(entries).toHaveLength(2)
      expect(new Set(entries.map(e=>e.summary)).size).toBe(2)
      expect(biographySource({...entries[0],game:entries[1].game})).toBeUndefined()
    }
  })
  it('does not attach current citations to old or edited snapshots', () => {
    const entry=catalog.entries[0]
    expect(biographySource(entry)).toBe(entry.sourceUrl)
    expect(biographySource({...entry,summary:'上一季原有介绍'})).toBeUndefined()
    expect(biographySource({...entry,name:'另一个角色'})).toBeUndefined()
  })
})
