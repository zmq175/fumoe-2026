export type Role = 'voter' | 'operator' | 'admin'

export interface Env {
  DB: D1Database
  MEDIA: R2Bucket
  ASSETS: Fetcher
  MATCH_ROOM: DurableObjectNamespace
  AUTH_SECRET: string
  BREVO_API_KEY: string
  BREVO_SENDER: string
  TURNSTILE_SECRET: string
  APP_ORIGIN: string
  ADMIN_EMAILS: string
  DEV_AUTH_BYPASS?: string
}

export type Session = { sub: string; email: string; role: Role }
