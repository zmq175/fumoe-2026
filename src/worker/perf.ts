import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { metricNames } from '../lib/perf-metrics'
import type { Env } from './types'

const duration = z.number().int().min(0).max(3_600_000)
const batch = z.array(z.object({
  name: z.enum(metricNames), ms: duration, status: z.number().int().min(0).max(599), serverMs: duration.optional(),
}).strict()).min(1).max(32)

export const perfRoutes = new Hono<{ Bindings: Env }>()
perfRoutes.post('/', bodyLimit({ maxSize: 4096 }), async c => {
  if (c.req.header('Origin') !== new URL(c.req.url).origin) return c.body(null, 403)
  if (!c.req.header('Content-Type')?.startsWith('application/json')) return c.body(null, 415)
  const samples = batch.safeParse(await c.req.json().catch(() => null))
  if (!samples.success) return c.body(null, 400)
  if (!c.env.PERF) return c.body(null, 503)
  for (const { name, ms, status, serverMs } of samples.data) {
    c.env.PERF.writeDataPoint({ indexes: [name], blobs: [name], doubles: [ms, status, serverMs ?? -1] })
  }
  return c.body(null, 204)
})
