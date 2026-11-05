import {describe,expect,it,vi} from 'vitest'
import {optimizedImageUrl} from './image-variants'

vi.mock('../data/image-variants.json',()=>({default:{hashes:{aaaaaaaaaaaaaaaaaaaa:'bbbbbbbbbbbbbbbbbbbb'},paths:{'/game-logos/test.png':'cccccccccccccccccccc'}}}))

describe('展示图版本映射',()=>{
  it('只匹配已知内容版本，历史原图 URL 本身不变',()=>{
    expect(optimizedImageUrl('/archive/'+ 'a'.repeat(64)+'.png')).toBe('/image-variants/'+ 'b'.repeat(20)+'.webp')
    expect(optimizedImageUrl('/api/media/seasons/s2/c1/'+ 'a'.repeat(20)+'/avatar.png')).toBe('/image-variants/'+ 'b'.repeat(20)+'.webp')
    expect(optimizedImageUrl('/api/media/seasons/s2/c1/new-version/avatar.png')).toBe('/api/media/seasons/s2/c1/new-version/avatar.png')
    expect(optimizedImageUrl('/archive/'+ 'd'.repeat(64)+'.png')).toBe('/archive/'+ 'd'.repeat(64)+'.png')
  })
  it('矢量和外部图片不误替换',()=>{
    expect(optimizedImageUrl('/game-logos/test.png')).toBe('/image-variants/'+ 'c'.repeat(20)+'.webp')
    expect(optimizedImageUrl('/game-logos/test.svg')).toBe('/game-logos/test.svg')
    expect(optimizedImageUrl('https://example.com/archive/'+ 'a'.repeat(64)+'.png')).toBe('https://example.com/archive/'+ 'a'.repeat(64)+'.png')
  })
})
