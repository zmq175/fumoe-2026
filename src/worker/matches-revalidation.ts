import type { MiddlewareHandler } from 'hono'

/** Public data must reach the database, even when a browser has an old validator. */
export const matchesRevalidation: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('Cache-Control', 'private, no-store')
  c.header('CDN-Cache-Control', 'no-store')
  c.header('Cloudflare-CDN-Cache-Control', 'no-store')
  c.header('ETag', undefined)
}
