import type { MetricName, PerfSample } from './perf-metrics'

const sampled = typeof window !== 'undefined' && Math.random() < 0.1
const queue: PerfSample[] = []
const images: PerfSample[] = []
let imageCount = 0
let ready = false
let scheduled = false

function flush() {
  scheduled = false
  if (!queue.length && !images.length) return
  const body = JSON.stringify([...queue.splice(0), ...images.splice(0)])
  imageCount = 0
  void fetch('/api/perf', {
    method: 'POST', body, credentials: 'omit', keepalive: true,
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {})
}

function record(sample: PerfSample) {
  if (sample.ms < 0 || sample.ms > 3_600_000) return
  // Keep a bounded random subset so slow images have the same chance as early arrivals.
  if (sample.name.startsWith('image_')) {
    imageCount++
    const slot = images.length < 12 ? images.length : Math.floor(Math.random() * imageCount)
    if (slot < 12) images[slot] = sample
  } else if (queue.length < 20) queue.push(sample)
  if (!ready || scheduled) return
  scheduled = true
  window.setTimeout(() => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(flush, { timeout: 3000 })
    else flush()
  }, 1500)
}

export function metricStart() {
  return sampled ? performance.now() : undefined
}

export function afterPaint(name: 'vote_feedback' | 'standings_visible', start: number | undefined, status: number) {
  if (start === undefined || document.visibilityState !== 'visible') return
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (document.visibilityState === 'visible') record({ name, ms: Math.round(performance.now() - start), status })
  }))
}

export function observePagePaint(name: 'home_visible' | 'vote_page_visible', start: number, done: () => void) {
  if (!sampled || document.hidden) return
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      if (document.hidden) return
      record({ name, ms: Math.round(performance.now() - start), status: 200 })
      done()
    })
  })
  return () => cancelAnimationFrame(frame)
}

export function imageFinished(start: number | undefined, image: HTMLImageElement, success: boolean) {
  if (start === undefined) return
  record({ name: image.loading === 'lazy' ? 'image_lazy' : 'image_eager',
    ms: Math.round(performance.now() - start), status: success ? 200 : 0 })
}

function observe() {
  ready = true
  if (queue.length || images.length) { scheduled = true; window.setTimeout(flush, 1500) }
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (nav && nav.loadEventEnd > 0) {
    const timings = {
      page_load: nav.loadEventEnd - nav.startTime,
      dns: nav.domainLookupEnd - nav.domainLookupStart,
      connect: nav.connectEnd - nav.connectStart,
      request_wait: nav.responseStart - nav.requestStart,
      download: nav.responseEnd - nav.responseStart,
    }
    for (const [name, ms] of Object.entries(timings)) record({ name: name as MetricName, ms: Math.round(ms), status: nav.responseStatus || 0 })
  }
  if (typeof PerformanceObserver === 'undefined') return
  if (PerformanceObserver.supportedEntryTypes?.includes('paint')) {
    const paint = new PerformanceObserver(list => {
      const fcp = list.getEntriesByName('first-contentful-paint')[0]
      if (!fcp) return
      record({ name: 'white_screen', ms: Math.round(fcp.startTime), status: 200 })
      paint.disconnect()
    })
    paint.observe({ type: 'paint', buffered: true })
  }
  const observer = new PerformanceObserver(list => {
    for (const raw of list.getEntries()) {
      const entry = raw as PerformanceResourceTiming
      if (entry.initiatorType !== 'fetch' || !entry.name.startsWith(location.origin + '/api/')) continue
      const path = new URL(entry.name).pathname
      const match = /^\/api\/public\/(overview|seasons|matches|rounds|standings|characters)(?:\/|$)/.exec(path)
      const name = match?.[1] ?? ({ '/api/votes': 'votes', '/api/votes/mine': 'my_votes', '/api/auth/me': 'viewer' } as Record<string,string>)[path]
      if (!name) continue
      const server = entry.serverTiming?.find(item => item.name === 'total')
      record({ name: name as MetricName, ms: Math.round(entry.duration), status: entry.responseStatus || 0,
        ...(server && { serverMs: Math.round(server.duration) }) })
    }
  })
  try { observer.observe({ type: 'resource', buffered: true }) } catch { observer.disconnect() }
}

if (sampled) {
  const defer = () => window.setTimeout(observe, 0)
  if (document.readyState === 'complete') defer()
  else window.addEventListener('load', defer, { once: true })
}
