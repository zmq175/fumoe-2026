import type { MiddlewareHandler } from 'hono'

/** Revalidate against fresh DB output, never serve a time-based score cache. */
export const matchesRevalidation: MiddlewareHandler = async (c, next) => {
  await next()
  if (!['GET', 'HEAD'].includes(c.req.method) || c.res.status !== 200) return
  const hash = await crypto.subtle.digest('SHA-256', await c.res.clone().arrayBuffer())
  // Weak validators remain valid when the CDN changes content encoding.
  const tag = `W/"${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}"`
  c.header('ETag', tag)
  c.header('Cache-Control', 'private, no-cache')
  const requested = c.req.header('If-None-Match')
  if (requested?.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === tag.slice(2))) {
    const headers = new Headers(c.res.headers)
    headers.delete('Content-Type')
    headers.delete('Content-Length')
    headers.delete('Content-Encoding')
    c.res = new Response(null, { status: 304, headers })
  }
}
