import type { Env } from './types'

export async function sendLoginCode(env: Env, email: string, code: string) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: '府萌 2026', email: env.BREVO_SENDER.match(/<(.+)>/)?.[1] ?? env.BREVO_SENDER },
      to: [{ email }],
      subject: '府萌 2026 登录验证码',
      htmlContent: `<div style="font-family:sans-serif"><h2>府萌 2026</h2><p>你的登录验证码是：</p><p style="font-size:30px;font-weight:700;letter-spacing:6px">${code}</p><p>验证码 10 分钟内有效。若非本人操作，请忽略此邮件。</p></div>`
    })
  })
  if (!response.ok) throw new Error(`Email delivery failed: ${response.status}`)
}
