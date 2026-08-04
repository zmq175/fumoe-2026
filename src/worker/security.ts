import { jwtVerify, SignJWT } from 'jose'
import type { Env, Session } from './types'

const encoder = new TextEncoder()
const secret = (value: string) => encoder.encode(value)

export const id = () => crypto.randomUUID()
export const iso = () => new Date().toISOString()

export async function digest(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function normalizeEmail(value: string) { return value.trim().toLowerCase() }

export function isDisposableEmail(email: string) {
  const disposable = ['10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'tempmail.com', 'yopmail.com']
  return disposable.includes(email.split('@')[1] ?? '')
}

export function developmentBypassEnabled(env: { DEV_AUTH_BYPASS?: string; APP_ORIGIN: string }) {
  if (env.DEV_AUTH_BYPASS !== 'true') return false
  try {
    const hostname = new URL(env.APP_ORIGIN).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch { return false }
}

type RuntimeConfig = Pick<Env,'AUTH_SECRET'|'BREVO_API_KEY'|'BREVO_SENDER'|'TURNSTILE_SECRET'|'APP_ORIGIN'|'ADMIN_EMAILS'|'DEV_AUTH_BYPASS'>

export function runtimeConfigIssues(env:RuntimeConfig) {
  const issues:string[]=[]
  if((env.AUTH_SECRET??'').length<32)issues.push('AUTH_SECRET')
  if(developmentBypassEnabled(env))return issues
  if(!env.BREVO_API_KEY)issues.push('BREVO_API_KEY')
  if(!env.BREVO_SENDER||env.BREVO_SENDER.includes('@example.com'))issues.push('BREVO_SENDER')
  if(!env.TURNSTILE_SECRET)issues.push('TURNSTILE_SECRET')
  try { const origin=new URL(env.APP_ORIGIN); if(origin.protocol!=='https:'||origin.hostname.endsWith('example.com'))issues.push('APP_ORIGIN') } catch { issues.push('APP_ORIGIN') }
  if(!env.ADMIN_EMAILS.trim())issues.push('ADMIN_EMAILS')
  return issues
}

export async function createSession(session: Session, env: Env) {
  return new SignJWT({ email: session.email, role: session.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.sub)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret(env.AUTH_SECRET))
}

export async function readSession(token: string | undefined, env: Env): Promise<Session | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(env.AUTH_SECRET))
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || !['voter', 'operator', 'admin'].includes(String(payload.role))) return null
    return { sub: payload.sub, email: payload.email, role: payload.role as Session['role'] }
  } catch { return null }
}

type SessionUser = { id:string;email:string;role:Session['role'];status:string }

export function sessionForUser(claims:Session|null,user:SessionUser|null):Session|null {
  if(!claims||!user||user.status!=='active'||user.id!==claims.sub||normalizeEmail(user.email)!==normalizeEmail(claims.email))return null
  return {sub:user.id,email:user.email,role:user.role}
}

export function loginChallengeAllowed(localBypass:boolean,turnstileVerified:boolean) {
  return localBypass||turnstileVerified
}

export function voteRiskDecision(recentIpVotes:number) {
  return {riskStatus:'approved' as const,recordVelocityEvent:recentIpVotes>=12}
}

export function cookie(name: string, value: string, maxAge?: number) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/;${maxAge ? ` Max-Age=${maxAge};` : ''}`
}

export function getCookie(header: string | undefined, name: string) {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}

export function clientIp(request: Request) { return request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For')?.split(',')[0] ?? 'unknown' }
