import { describe, expect, it } from 'vitest'
import { artworkFileFromBlob, storedArtworkKey } from './artwork-file'

describe('已有立绘素材', () => {
  it('将已读取的媒体转换为可重新发布的原图文件', async () => {
    const file = artworkFileFromBlob(new Blob(['artwork'], { type: 'image/webp' }), 'c001-existing.webp')

    expect(file.name).toBe('c001-existing.webp')
    expect(file.type).toBe('image/webp')
    expect(await file.text()).toBe('artwork')
  })

  it('数据库尚未回填时从角色的静态图鉴素材恢复编辑画面', () => {
    expect(storedArtworkKey(null, null, 'c001')).toBe('characters/c001/gallery.webp')
    expect(storedArtworkKey('characters/c001/rev/original.png', 'characters/c001/rev/gallery.webp', 'c001')).toBe('characters/c001/rev/original.png')
  })
})
