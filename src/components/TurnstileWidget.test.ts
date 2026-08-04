import { describe, expect, it } from 'vitest'
import { developmentWidgetBypassEnabled } from './turnstile-config'

describe('前端开发人机验证绕过', () => {
  it('只允许显式启用的本机页面跳过组件', () => {
    expect(developmentWidgetBypassEnabled('true', 'localhost')).toBe(true)
    expect(developmentWidgetBypassEnabled('true', '127.0.0.1')).toBe(true)
    expect(developmentWidgetBypassEnabled(undefined, '127.0.0.1')).toBe(true)
    expect(developmentWidgetBypassEnabled('true', 'vote.example.com')).toBe(false)
    expect(developmentWidgetBypassEnabled('false', 'localhost')).toBe(false)
  })
})
