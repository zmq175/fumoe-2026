import { useEffect, useRef, useState } from 'react'
import { developmentWidgetBypassEnabled } from './turnstile-config'

type TurnstileOptions = {
  sitekey: string
  action: string
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
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
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('人机验证加载失败'))
    script.onerror = () => reject(new Error('人机验证加载失败'))
    document.head.append(script)
  })
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
    void loadTurnstile().then((turnstile) => {
      if (!active || !container.current) return
      widgetId.current = turnstile.render(container.current, {
        sitekey: siteKey,
        action:'login',
        callback: (token) => { if (active) { setMessage(''); onTokenRef.current(token) } },
        'expired-callback': () => { if (active) { setMessage('人机验证已过期，请重新完成。'); onTokenRef.current(null) } },
        'error-callback': () => { if (active) { setMessage('人机验证失败，请重试。'); onTokenRef.current(null) } }
      })
    }).catch(() => { if (active) { setMessage('人机验证加载失败，请重试。'); onTokenRef.current(null) } })
    return () => {
      active = false
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [localBypass, siteKey])

  useEffect(() => {
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
  }, [resetKey])

  return <div className="turnstile" aria-label="人机验证"><div ref={container} />{message && <small>{message}</small>}</div>
}
