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
