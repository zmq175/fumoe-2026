import { expect, it } from 'vitest'
import { Hono } from 'hono'
import { matchesRevalidation } from './matches-revalidation'

it('reads fresh data on every request but omits unchanged response bodies', async () => {
  const app = new Hono()
  let reads = 0, votes = 0
  app.use('*', matchesRevalidation)
  app.get('/', c => { reads++; return c.json({ votes }) })
  const initial = await app.request('/')
  const tag = initial.headers.get('etag')!
  expect(tag).toMatch(/^W\//)
  expect(initial.headers.get('cache-control')).toBe('private, no-cache')
  const unchanged = await app.request('/', { headers: { 'If-None-Match': tag } })
  expect(unchanged.status).toBe(304)
  expect(await unchanged.text()).toBe('')
  expect(unchanged.headers.get('cache-control')).toBe('private, no-cache')
  expect(reads).toBe(2)
  votes++
  const updated = await app.request('/', { headers: { 'If-None-Match': tag } })
  expect(updated.status).toBe(200)
  expect(await updated.json()).toEqual({ votes: 1 })
  expect(updated.headers.get('etag')).not.toBe(tag)
})

it('never substitutes a cached response for an error', async () => {
  const app = new Hono()
  app.use('*', matchesRevalidation)
  app.get('/', c => c.json({ error: 'unavailable' }, 503))
  const response = await app.request('/', { headers: { 'If-None-Match': '*' } })
  expect(response.status).toBe(503)
  expect(response.headers.get('etag')).toBeNull()
})
