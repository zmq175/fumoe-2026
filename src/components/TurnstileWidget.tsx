import { useEffect, useRef, useState } from 'react'
import { developmentWidgetBypassEnabled } from './turnstile-config'

type TurnstileOptions = {
  sitekey: string
  action: string
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': (code: string) => void
  'timeout-callback': () => void
  'unsupported-callback': () => void
  size: 'compact' | 'flexible'
}

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileOptions) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

let loading: Promise<TurnstileApi> | null = null

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loading) loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    const finish = (error?: Error) => {
      clearTimeout(timer)
      script.onload = null
      script.onerror = null
      if (error) { script.remove(); reject(error) }
      else resolve(window.turnstile!)
    }
    const timer = window.setTimeout(() => finish(new Error('人机验证加载超时，请检查网络后重试。')), 20_000)
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => finish(window.turnstile ? undefined : new Error('人机验证加载失败，请重试。'))
    script.onerror = () => finish(new Error('人机验证加载失败，请重试。'))
    document.head.append(script)
  }).catch(error => { loading = null; throw error })
  return loading
}

type Props = {
  onToken: (token: string | null) => void
  resetKey?: number
}

export function TurnstileWidget({ onToken, resetKey = 0 }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [canRetry, setCanRetry] = useState(false)
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY
  const localBypass = developmentWidgetBypassEnabled(import.meta.env.VITE_DEV_AUTH_BYPASS, window.location.hostname)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!siteKey) {
      if (localBypass) {
        onTokenRef.current('development-placeholder')
        setMessage('本地开发已启用人机验证绕过。')
      } else {
        onTokenRef.current(null)
        setMessage('人机验证尚未配置，请联系运营。')
      }
      return
    }
    let active = true
    setCanRetry(false)
    setMessage('正在加载人机验证…')
    onTokenRef.current(null)
    const failed = (message: string) => {
      if (active) { setMessage(message); setCanRetry(true); onTokenRef.current(null) }
    }
    void loadTurnstile().then((turnstile) => {
      if (!active || !container.current) return
      setMessage('')
      widgetId.current = turnstile.render(container.current, {
        sitekey: siteKey,
        action:'login',
        size:container.current.clientWidth < 300 ? 'compact' : 'flexible',
        callback: (token) => { if (active) { setMessage(''); setCanRetry(false); onTokenRef.current(token) } },
        'expired-callback': () => failed('人机验证已过期，请重新完成。'),
        'timeout-callback': () => failed('人机验证超时，请重新验证；也请检查设备时间是否正确。'),
        'unsupported-callback': () => failed('当前浏览器环境暂不受支持，请更新浏览器，或在系统浏览器中打开。'),
        'error-callback': (code) => {
          const detail = ['110100','110110','110200','400020','400021','400070'].includes(code)
            ? '验证服务配置异常，请将错误码反馈给运营。'
            : code === '200500' ? '验证页面未能加载，请检查网络或本站的内容拦截设置。'
            : ['110600','110620','200100'].includes(code) ? '验证超时或设备时间异常，请检查系统时间后重试。'
            : '人机验证未完成，请重试；若持续失败，可检查本站的隐私或内容拦截设置。'
          failed(`${detail}${code ? `（错误码：${code}）` : ''}`)
        }
      })
    }).catch(error => failed(error instanceof Error ? error.message : '人机验证加载失败，请重试。'))
    return () => {
      active = false
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current) } catch { /* Already removed by the provider. */ }
      }
      widgetId.current = null
    }
  }, [localBypass, siteKey, attempt, resetKey])

  return <div className="turnstile" aria-label="人机验证"><div ref={container} />{message && <small role="status">{message}</small>}{canRetry && <div className="turnstile__help"><button type="button" className="dialog-text-button" onClick={() => { onTokenRef.current(null); setCanRetry(false); setAttempt(value => value + 1) }}>重新验证</button><p>若在 QQ 内打开，请用右上角菜单选择在系统浏览器中打开。Firefox 可先更新至最新版，并检查本站的扩展拦截设置。</p><a href="https://debug.challenges.cloudflare.com/" target="_blank" rel="noopener noreferrer">检查浏览器兼容性</a></div>}</div>
}
