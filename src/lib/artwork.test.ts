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

  it('标准素材走静态资源，版本素材失败时回退到同角色静态图',()=>{
    expect(artworkUrls('characters/c001/match.webp')).toEqual(['/artwork/c001/match.webp'])
    expect(artworkUrls('characters/c001/rev-2/match.webp')).toEqual(['/api/media/characters/c001/rev-2/match.webp','/artwork/c001/match.webp'])
  })

  it('透明头像优先，并保留版本化和静态旧头像回退',()=>{
    expect(portraitArtworkUrls('c001','characters/c001/rev-2/avatar.webp')).toEqual([
      '/portraits/c001.png',
      '/api/media/characters/c001/rev-2/avatar.webp',
      '/artwork/c001/avatar.webp'
    ])
    expect(portraitArtworkUrls('c128','characters/c128/avatar.webp')).toEqual([
      '/portraits/c128.png',
      '/artwork/c128/avatar.webp'
    ])
  })
})
