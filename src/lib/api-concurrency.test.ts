import { afterEach, expect, it, vi } from 'vitest'
import { api } from './api'

afterEach(()=>vi.unstubAllGlobals())
it('coalesces only overlapping identical public reads, then fetches fresh data',async()=>{
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  const fetcher=vi.fn(async()=>{await gate;return new Response(JSON.stringify({characters:[]}))})
  vi.stubGlobal('fetch',fetcher)
  const a=api.publicCharacters('s2'),b=api.publicCharacters('s2'),other=api.publicCharacters('s1')
  expect(fetcher).toHaveBeenCalledTimes(2)
  release();await Promise.all([a,b,other])
  await api.publicCharacters('s2')
  expect(fetcher).toHaveBeenCalledTimes(3)
})
it('removes failed reads so the next request can retry',async()=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(new Response(JSON.stringify({rounds:[]})))
  vi.stubGlobal('fetch',fetcher)
  await expect(api.publicRounds('retry')).rejects.toThrow('network')
  await expect(api.publicRounds('retry')).resolves.toEqual({rounds:[]})
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('does not combine authentication requests',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({user:null})))
  vi.stubGlobal('fetch',fetcher)
  await Promise.all([api.me(),api.me()])
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('bypasses browser caches for public reads without changing stable URLs',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({matches:[]})))
  vi.stubGlobal('fetch',fetcher)
  await api.publicMatches('s2')
  expect(fetcher).toHaveBeenCalledWith('/api/public/matches?season=s2',expect.objectContaining({cache:'no-store'}))
})

it('retries a transient public network failure once and shares that retry',async()=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(new Response(JSON.stringify({matches:[]})))
  vi.stubGlobal('fetch',fetcher)
  const [a,b]=await Promise.all([api.publicMatches('slow'),api.publicMatches('slow')])
  expect(a).toEqual({matches:[]});expect(b).toEqual(a)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('retries a temporary gateway error but stops after two attempts',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({error:'gateway'}),{status:503}))
  vi.stubGlobal('fetch',fetcher)
  await expect(api.publicRounds('unavailable')).rejects.toThrow('gateway')
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('never retries validation errors or authentication writes',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({error:'invalid'}),{status:400}))
  vi.stubGlobal('fetch',fetcher)
  await expect(api.publicRounds('invalid')).rejects.toThrow('invalid')
  await expect(api.requestCode('a@example.com')).rejects.toThrow('invalid')
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('rejects incomplete overview instead of treating it as no current season',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}')))
  await expect(api.publicOverview()).rejects.toThrow('赛事数据响应不完整')
})

it('retries an HTML gateway error as well as a JSON gateway error',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('<html>Gateway unavailable</html>',{status:502})).mockResolvedValueOnce(new Response(JSON.stringify({rounds:[]})))
  vi.stubGlobal('fetch',fetcher)
  await expect(api.publicRounds('html-gateway')).resolves.toEqual({rounds:[]})
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('rejects incomplete public lists before they can clear or crash the page',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}')))
  await expect(api.publicRounds('broken')).rejects.toThrow('赛事数据响应不完整')
  await expect(api.publicMatches('broken')).rejects.toThrow('赛事数据响应不完整')
})
