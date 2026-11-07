import { describe, expect, it, vi } from 'vitest'
import { createSession, inspectSession, developmentBypassEnabled, loginChallengeAllowed, runtimeConfigIssues, sessionForUser, voteRiskDecision } from './security'

describe('开发认证绕过', () => {
  it('只允许显式启用的本机来源使用绕过', () => {
    expect(developmentBypassEnabled({ DEV_AUTH_BYPASS:'true', APP_ORIGIN:'http://127.0.0.1:8787' })).toBe(true)
    expect(developmentBypassEnabled({ DEV_AUTH_BYPASS:'true', APP_ORIGIN:'http://localhost:8787' })).toBe(true)
    expect(developmentBypassEnabled({ DEV_AUTH_BYPASS:'true', APP_ORIGIN:'https://vote.example.com' })).toBe(false)
    expect(developmentBypassEnabled({ DEV_AUTH_BYPASS:'false', APP_ORIGIN:'http://localhost:8787' })).toBe(false)
  })

  it('安全报告生产运行时缺失项且不返回 secret 内容', () => {
    const issues=runtimeConfigIssues({AUTH_SECRET:'short',BREVO_API_KEY:'',BREVO_SENDER:'vote@example.com',TURNSTILE_SECRET:'secret-value',APP_ORIGIN:'https://vote.example.com',ADMIN_EMAILS:''})
    expect(issues).toEqual(['AUTH_SECRET','BREVO_API_KEY','BREVO_SENDER','APP_ORIGIN','ADMIN_EMAILS'])
    expect(issues.join(' ')).not.toContain('secret-value')
  })

  it('允许本机显式绕过邮件和人机验证依赖', () => {
    expect(runtimeConfigIssues({AUTH_SECRET:'a'.repeat(32),BREVO_API_KEY:'',BREVO_SENDER:'',TURNSTILE_SECRET:'',APP_ORIGIN:'http://127.0.0.1:8787',ADMIN_EMAILS:'',DEV_AUTH_BYPASS:'true'})).toEqual([])
  })
})

describe('登录人机验证',()=>{
  it('生产环境只在 Turnstile 校验成功后发送验证码',()=>{
    expect(loginChallengeAllowed(false,true)).toBe(true)
    expect(loginChallengeAllowed(false,false)).toBe(false)
    expect(loginChallengeAllowed(true,false)).toBe(true)
  })
})

describe('会话用户校验', () => {
  const claims={sub:'user-1',email:'admin@example.com',role:'admin' as const}

  it('拒绝数据库中已不存在或已停用的旧会话', () => {
    expect(sessionForUser(claims,null)).toBeNull()
    expect(sessionForUser(claims,{id:'user-1',email:'admin@example.com',role:'admin',status:'frozen'})).toBeNull()
    expect(sessionForUser(claims,{id:'user-1',email:'admin@example.com',role:'admin',status:'deleted'})).toBeNull()
  })

  it('使用数据库中的当前角色而不是旧令牌角色', () => {
    expect(sessionForUser(claims,{id:'user-1',email:'admin@example.com',role:'operator',status:'active'})).toEqual({sub:'user-1',email:'admin@example.com',role:'operator'})
  })
})

describe('投票风控决策', () => {
  it('高频 IP 投票仍自动计票，但记录速度异常', () => {
    expect(voteRiskDecision(12)).toEqual({riskStatus:'approved',recordVelocityEvent:true})
    expect(voteRiskDecision(64)).toEqual({riskStatus:'approved',recordVelocityEvent:true})
  })

  it('正常投票自动计票且不产生异常记录', () => {
    expect(voteRiskDecision(11)).toEqual({riskStatus:'approved',recordVelocityEvent:false})
  })
})

describe('登录诊断不返回凭证内容',()=>{
  it('区分缺失、无效、过期与有效凭证',async()=>{
    const env={AUTH_SECRET:'isolated-test-secret-at-least-32-characters'} as Parameters<typeof createSession>[1]
    vi.useFakeTimers({toFake:['Date']})
    try {
      vi.setSystemTime(new Date('2026-11-07T12:00:00Z'))
      const token=await createSession({sub:'test',email:'test@example.com',role:'voter'},env)
      expect(await inspectSession(undefined,env)).toEqual({session:null,reason:'missing'})
      expect(await inspectSession('invalid-token',env)).toEqual({session:null,reason:'invalid'})
      expect((await inspectSession(token,env)).reason).toBe('valid')
      expect((await inspectSession(token,{...env,AUTH_SECRET:'different-test-secret-at-least-32-characters'})).reason).toBe('invalid')
      vi.setSystemTime(new Date('2026-12-08T12:00:00Z'))
      expect(await inspectSession(token,env)).toEqual({session:null,reason:'expired'})
    } finally {vi.useRealTimers()}
  })
})
