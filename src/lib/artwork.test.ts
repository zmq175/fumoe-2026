import { legacyAsset, legacyPortrait } from './legacy-assets'
import { describe,expect,it } from 'vitest'
import { artworkKey,artworkUrls,portraitArtworkUrls,withArtworkKeys } from './artwork'
import { characters } from '../data/tournament'

describe('运行时立绘键',()=>{
  it('优先使用 API 返回的版本化素材键',()=>{
    const character=withArtworkKeys(characters[0],{galleryArtworkKey:'characters/c001/rev-2/gallery.webp',matchArtworkKey:'characters/c001/rev-2/match.webp',avatarArtworkKey:'characters/c001/rev-2/avatar.webp'})
    expect(artworkKey(character,'gallery')).toBe('characters/c001/rev-2/gallery.webp')
    expect(artworkKey(character,'match')).toBe('characters/c001/rev-2/match.webp')
    expect(artworkKey(character,'avatar')).toBe('characters/c001/rev-2/avatar.webp')
  })

  it('没有运行时键时保留构建预览素材',()=>{
    expect(artworkKey(characters[0],'match')).toBe('characters/c001/match.webp')
  })

  it('旧素材使用内容归档，版本素材缺失时不替换为其他版本',()=>{
    expect(artworkUrls('characters/c001/match.webp')).toEqual([legacyAsset('/artwork/c001/match.webp')])
    expect(artworkUrls('characters/c001/rev-2/match.webp')).toEqual(['/api/media/characters/c001/rev-2/match.webp'])
  })

  it('赛季快照优先，未提供快照的旧头像使用内容归档',()=>{
    expect(portraitArtworkUrls('c001','characters/c001/rev-2/avatar.webp')).toEqual([
      '/api/media/characters/c001/rev-2/avatar.webp'
    ])
    expect(portraitArtworkUrls('c128','characters/c128/avatar.webp')).toEqual([
      legacyAsset('/artwork/c128/avatar.webp')
    ])
  })
  it('未知角色不借用其他头像',()=>{expect(portraitArtworkUrls('new-id',null)).toEqual([]);expect(portraitArtworkUrls('c001',null)).toEqual([legacyPortrait('c001')])})
})
