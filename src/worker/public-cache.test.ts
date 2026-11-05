import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { Env } from './types'
import { publicRosterCache } from './public-cache'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
function fixture() {
  const stored = new Map<string, Response>()
  const cache = {
    match: vi.fn(async (key: Request) => stored.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, value: Response) => { stored.set(key.url, value) }),
  }
  vi.stubGlobal('caches', { open: async () => cache })
  const app = new Hono<{ Bindings: Env }>()
  app.use('*', publicRosterCache)
  let reads = 0
  let payload = { characters: [{ name: 'Original' }] }
  app.get('*', (c) => { reads++; return c.json(payload) })
  const env = { PUBLIC_ROSTER_CACHE: 'true' } as Env
  const pending: Promise<unknown>[] = []
  const ctx = { props: {}, waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} }
  async function get(path = '/api/public/characters?season=s2', headers = {}) {
    const response = await app.request(path, { headers }, env, ctx)
    await Promise.all(pending)
    return response
  }
  return { get, cache, stored, reads: () => reads, change: (value: typeof payload) => { payload = value }, env }
}

describe('public roster cache', () => {
  it('serves a warm roster without another read and stores only public headers', async () => {
    const f = fixture()
    expect((await f.get()).headers.get('X-Public-Cache')).toBe('MISS')
    const hit = await f.get(undefined, { Cookie: 'fumoe_session=another-user' })
    expect(hit.headers.get('X-Public-Cache')).toBe('HIT')
    expect(hit.headers.get('Cache-Control')).toBe('no-store')
    expect(await hit.json()).toEqual({ characters: [{ name: 'Original' }] })
    expect(f.reads()).toBe(1)
    expect([...f.stored.values()][0].headers.has('Set-Cookie')).toBe(false)
    await f.get('/api/public/characters?season=s1')
    expect(f.reads()).toBe(2)
  })
  it.each(['/api/public/characters', '/api/public/matches?season=s2', '/api/public/overview', '/api/public/standings?season=s2', '/api/public/characters?season=s2&extra=1', '/api/public/characters?season=s2&season=s1'])('bypasses %s', async (path) => {
    const f = fixture()
    await f.get(path); await f.get(path)
    expect(f.reads()).toBe(2)
    expect(f.cache.match).not.toHaveBeenCalled()
  })
  it('expires at 30 seconds and hard refresh reads fresh data', async () => {
    const f = fixture()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(100000)
    await f.get()
    f.change({ characters: [{ name: 'Updated' }] })
    expect(await (await f.get(undefined, { 'Cache-Control': 'no-cache' })).json()).toEqual({ characters: [{ name: 'Updated' }] })
    clock.mockReturnValue(130001)
    expect((await f.get()).headers.get('X-Public-Cache')).toBe('MISS')
    expect(f.reads()).toBe(3)
  })
  it('does not cache an empty unpublished roster', async () => {
    const f = fixture(); f.change({ characters: [] })
    await f.get(); await f.get()
    expect(f.cache.put).not.toHaveBeenCalled()
  })
  it('returns the roster when an asynchronous cache write fails', async () => {
    const f = fixture()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    f.cache.put.mockRejectedValue(new Error('full'))
    expect((await f.get()).status).toBe(200)
    expect((await f.get()).status).toBe(200)
    expect(f.reads()).toBe(2)
  })
  it('fails open on a cache outage and supports disabling the feature', async () => {
    const f = fixture(); f.cache.match.mockRejectedValue(new Error('unavailable'))
    expect((await f.get()).status).toBe(200)
    f.env.PUBLIC_ROSTER_CACHE = 'false'
    expect((await f.get()).headers.get('X-Public-Cache')).toBe('BYPASS')
    expect(f.reads()).toBe(2)
  })
})
