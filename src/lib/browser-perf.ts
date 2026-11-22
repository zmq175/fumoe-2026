import type { MetricName, PerfSample } from './perf-metrics'

const sampled = typeof window !== 'undefined' && Math.random() < 0.1
const openedOnVotes = sampled && location.pathname === '/matches'
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
  else if (sample.entry) {
    const replace = queue.findIndex(item => !item.entry)
    if (replace >= 0) queue[replace] = sample
  }
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

export function observePagePaint(name: 'home_visible' | 'vote_page_visible' | 'vote_entry_paint' | 'vote_interactive', start: number, done: () => void, entry?: PerfSample['entry'], eligible?: () => boolean) {
  if (!sampled || document.hidden) return
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      if (document.hidden || (eligible && !eligible())) return
      record({ name, ms: Math.round(performance.now() - start), status: 200, entry })
      done()
    })
  })
  return () => cancelAnimationFrame(frame)
}

// Freeze the image cohort at the first rendered voting list. Never scroll or force a lazy image to load.
export function observeVoteImages(root: HTMLElement, start: number) {
  if (!sampled || document.hidden) return
  const entry = start === 0 ? 'direct' : 'spa'
  let frame = requestAnimationFrame(snapshot)
  let groups: { name: 'vote_all_images' | 'vote_viewport_images'; images: HTMLImageElement[] }[] = []
  function snapshot() {
    const images: HTMLImageElement[] = []
    const visible: HTMLImageElement[] = []
    for (const img of root.querySelectorAll('img')) {
      const r = img.getBoundingClientRect()
      // Hidden decorative images may stay lazy forever, even after scrolling through the list.
      if (r.width <= 0 || r.height <= 0) continue
      images.push(img)
      if (r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) visible.push(img)
    }
    groups = [{ name: 'vote_viewport_images', images: visible }, { name: 'vote_all_images', images }]
    root.addEventListener('load', schedule, true)
    root.addEventListener('error', schedule, true)
    check()
  }
  function schedule() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(check)
  }
  function check() {
    groups = groups.filter(group => {
      if (!group.images.length) return false
      if (group.images.some(img => img.isConnected && !img.complete)) return true
      const ok = group.images.every(img => img.isConnected && img.naturalWidth > 0)
      if (!document.hidden) record({ name: group.name, entry, ms: Math.round(performance.now() - start), status: ok ? 200 : 0 })
      return false
    })
    if (!groups.length) stop()
  }
  function stop() {
    cancelAnimationFrame(frame)
    root.removeEventListener('load', schedule, true)
    root.removeEventListener('error', schedule, true)
  }
  return stop
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
      if (openedOnVotes) record({ name: 'vote_fcp', entry: 'direct', ms: Math.round(fcp.startTime), status: 200 })
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
