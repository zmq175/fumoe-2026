import {expect,it} from 'vitest'
import {preferredArtwork} from './s2-artwork-policy.mjs'
it('keeps Alpha frames out of Gray Raven Lucia and excludes costume model renders',()=>{
 const candidates=[{title:'文件:涂装大 露西亚 逆冕 雾夜赤冕.png'},{title:'文件:角色 露西亚 深红囚影 立绘.png'},{title:'文件:角色 露西亚 誓焰 立绘.png'}]
 expect(preferredArtwork({game:'战双帕弥什',name:'露西亚',selected:candidates[0],candidates})).toEqual(candidates[2])
 expect(preferredArtwork({game:'战双帕弥什',name:'α',selected:candidates[0],candidates})).toEqual(candidates[1])
})
it('does not substitute a model render when an illustration is missing',()=>{
 const selected={title:'文件:涂装大 赛琳娜 岚音 宁芙浪谣.png'}
 expect(preferredArtwork({game:'战双帕弥什',name:'赛琳娜',selected,candidates:[selected]})).toBeNull()
})
