import { describe, expect, it } from 'vitest'
import { readCachedViewer, writeCachedViewer } from './viewer-cache'

class MemoryStorage {
  value:string|null=null
  getItem(){return this.value}
  setItem(_key:string,value:string){this.value=value}
  removeItem(){this.value=null}
}

describe('登录状态缓存',()=>{
  it('在页面重载时恢复最近确认的登录用户',()=>{
    const storage=new MemoryStorage()
    writeCachedViewer(storage,{email:'voter@example.com',role:'voter'})
    expect(readCachedViewer(storage)).toEqual({email:'voter@example.com',role:'voter'})
  })

  it('忽略损坏或不合法的缓存内容',()=>{
    const storage=new MemoryStorage()
    storage.value='{"email":"x","role":"root"}'
    expect(readCachedViewer(storage)).toBeNull()
    storage.value='not-json'
    expect(readCachedViewer(storage)).toBeNull()
  })
})
