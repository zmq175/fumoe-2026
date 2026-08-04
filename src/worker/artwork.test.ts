import { describe, expect, it } from 'vitest'
import { artworkCacheControl, artworkKeys, isUnfinishedSeason, mediaFallbackIsImage } from './artwork'

describe('素材发布规则', () => {
  it('每次发布使用独立 revision 路径，避免覆盖缓存中的旧图', () => {
    expect(artworkKeys('c001','rev-2','png')).toEqual({
      original:'characters/c001/rev-2/original.png',
      gallery:'characters/c001/rev-2/gallery.webp',
      match:'characters/c001/rev-2/match.webp',
      avatar:'characters/c001/rev-2/avatar.webp'
    })
  })

  it('只让未完成赛季跟随角色素材更新', () => {
    expect(['draft','published','live'].map(isUnfinishedSeason)).toEqual([true,true,true])
    expect(['completed','archived'].map(isUnfinishedSeason)).toEqual([false,false])
  })

  it('拒绝把 SPA HTML 当成缺失图片返回', () => {
    expect(mediaFallbackIsImage('image/webp')).toBe(true)
    expect(mediaFallbackIsImage('image/png; charset=binary')).toBe(true)
    expect(mediaFallbackIsImage('text/html; charset=utf-8')).toBe(false)
    expect(mediaFallbackIsImage(null)).toBe(false)
  })

  it('让静态立绘在浏览器缓存一天并后台刷新',()=>{
    expect(artworkCacheControl()).toBe('public, max-age=86400, stale-while-revalidate=604800')
  })
})
