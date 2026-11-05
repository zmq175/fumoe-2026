import type { MiddlewareHandler } from 'hono'
import type { Env } from './types'

const ttl = 30

/** Only explicit-season, public roster reads. Live state always reaches D1. */
export const publicRosterCache: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const url = new URL(c.req.url)
  const season = url.searchParams.get('season')
  const eligible = c.env.PUBLIC_ROSTER_CACHE === 'true' && c.req.method === 'GET'
    && url.pathname === '/api/public/characters' && !!season && season.length <= 120
    && [...url.searchParams.keys()].length === 1
    && !/no-cache|no-store|max-age\s*=\s*0/i.test(c.req.header('Cache-Control') ?? '')
    && !/no-cache/i.test(c.req.header('Pragma') ?? '')
    && !c.req.header('Authorization')
  c.header('Cache-Control', 'no-store')
  c.header('X-Public-Cache', 'BYPASS')
  if (!eligible || typeof caches === 'undefined') { await next(); return }
  // Same host, versioned key, no cookies or request-specific headers.
  const key = new URL('/api/public/characters', url.origin)
  key.searchParams.set('season', season)
  key.searchParams.set('__cache', 'roster-v1')
  const request = new Request(key.toString())
  let cache: Cache
  const started = Date.now()
  try {
    cache = await caches.open('public-roster-v1')
    const hit = await cache.match(request)
    const created = Number(hit?.headers.get('X-Roster-Created'))
    if (hit && created > 0 && started >= created && started - created < ttl * 1000) {
      c.header('X-Public-Cache', 'HIT')
      c.header('Content-Type', 'application/json; charset=UTF-8')
      return c.body(await hit.text())
    }
  } catch { c.header('X-Public-Cache', 'ERROR'); await next(); return }
  c.header('X-Public-Cache', 'MISS')
  await next()
  if (c.res.status !== 200 || c.res.headers.has('Set-Cookie')) return
  try {
    const body = await c.res.clone().text()
    const data = JSON.parse(body) as { characters?: unknown[] }
    if (!Array.isArray(data.characters) || !data.characters.length) return
    const stored = new Response(body, { headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Roster-Created': String(started),
    } })
    c.executionCtx.waitUntil(cache.put(request, stored).catch(() => { console.warn('Public roster cache write failed') }))
  } catch { /* Cache is optional; a cache failure must not break a successful read. */ }
}
