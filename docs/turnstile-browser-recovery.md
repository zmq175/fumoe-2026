# Turnstile 浏览器恢复处理

用户反馈 Firefox 和 QQ 内置浏览器有验证失败，目前没有具体错误码；尚不能确认这些真实用户失败的根因完全相同。

已复现的问题：脚本加载 Promise 在失败后仍被全局保留。首次请求被拦截或网络失败后，重新打开登录框仍复用失败结果，不会重新加载脚本。浏览器测试先复现失败，再验证修复。

改动：

- 加载失败时移除脚本并清除失败 Promise；加载无响应 20 秒后给出超时提示。
- 提供手动“重新验证”，支持不刷新页面恢复；保留 Cloudflare 默认自动重试。
- 处理过期、交互超时、不受支持环境及错误回调，并显示错误码供反馈。
- 错误、过期、手动重试和服务端拒绝后的重置都清除旧令牌。回调在组件卸载后失效，不重复初始化旧组件。
- 窄容器使用 compact，宽容器使用 flexible；错误区可随内容增高。
- 对 QQ 内打开的访客提供系统浏览器打开指引，对 Firefox 提供更新及本站拦截设置检查提示。

没有修改服务端验证、站点密钥、域名授权或反刷规则，没有以浏览器品牌跳过验证，也没有代理或缓存 Cloudflare 验证脚本。

验证方式：完整 Chromium 页面回归，以及 Playwright Firefox 对脚本失败、超时、重试、错误码和令牌失效的定向测试。外部验证码使用模拟响应，因此能证明前端恢复流程兼容 Firefox，不能证明实际风控在每台 Firefox/QQ 设备上都通过。QQ 真机仍需在修复发布后根据错误码反馈确认。

官方依据：

- [支持浏览器与内置 WebView 限制](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/)
- [错误码说明](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/)
- [回调、重试与尺寸配置](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)

仅控制台出现 401 不一定表示验证失败；应以成功回调是否取得 token、表单是否可用为准。具体见上述错误码文档。

验证结果：check、148 项单元/集成测试、构建、40 项 Chromium 浏览器测试以及 4 项 Firefox 恢复测试全部通过。Firefox 命令：`npx playwright test --config=playwright.firefox.config.ts e2e/turnstile-recovery.spec.ts --workers=1`。超时测试先恢复被模拟阻塞的网络再重试；仍然被网络或扩展持续阻断时，重试不能绕过阻断。

本轮保留独立分支，尚未上线。下一步真实设备反馈应记录浏览器版本、是否 QQ 内打开、界面错误码；无需收集邮箱验证码或 Turnstile token。
