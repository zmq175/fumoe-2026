import { expect, it, vi } from 'vitest'
import { perfRoutes } from './perf'

it('writes validated batches and rejects unbounded labels and foreign origins', async () => {
  const writeDataPoint = vi.fn()
  const send = (samples: unknown, origin = 'https://example.org') =>
    perfRoutes.request('https://example.org/', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(samples),
    }, { PERF: { writeDataPoint } })
  const sample = { name: 'standings', ms: 18, status: 200, serverMs: 5 }
  expect((await send([sample])).status).toBe(204)
  expect(writeDataPoint).toHaveBeenCalledWith({ indexes: ['standings'], blobs: ['standings'], doubles: [18, 200, 5] })
  expect((await send([sample, { ...sample, name: '/unknown' }])).status).toBe(400)
  expect((await send([sample], 'https://elsewhere.test')).status).toBe(403)
  expect(writeDataPoint).toHaveBeenCalledTimes(1)
})
