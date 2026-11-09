import { expect, it } from 'vitest'
import { Hono } from 'hono'
import { matchesRevalidation } from './matches-revalidation'

it('always returns fresh data even with an old browser validator', async () => {
  const app = new Hono()
  let reads = 0, votes = 0
  app.use('*', matchesRevalidation)
  app.get('/', c => { reads++; return c.json({ votes }) })
  const initial = await app.request('/')
  expect(initial.headers.get('cache-control')).toBe('private, no-store')
  expect(initial.headers.get('etag')).toBeNull()
  votes++
  const updated = await app.request('/', { headers: { 'If-None-Match': '*' } })
  expect(updated.status).toBe(200)
  expect(await updated.json()).toEqual({ votes: 1 })
  expect(reads).toBe(2)
  expect(updated.headers.get('CDN-Cache-Control')).toBe('no-store')
  expect(updated.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store')
})

it('also prevents caching failures', async () => {
  const app = new Hono()
  app.use('*', matchesRevalidation)
  app.get('/', c => c.json({ error: 'unavailable' }, 503))
  const response = await app.request('/', { headers: { 'If-None-Match': '*' } })
  expect(response.status).toBe(503)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
