# Chrome 登录状态丢失排查

用户反馈隔天需要重新输入邮箱验证码，无法取得反馈设备的请求记录。

## 已验证

- 登录接口签发的 Cookie Max-Age 为 2592000 秒，JWT 期限为 30 天。
- 真实路由与隔离 SQLite 测试：同一 Cookie 在第 1、2、29 天有效，第 31 天失效。
- 请求失败不会主动清除前端已有登录展示。
- 目前未复现反馈设备的退出原因，不把缺少缓存控制认定为根因。

## 本次防护与诊断

- 登录接口及个人选票响应设为 `private, no-store`；前端读取 `/api/auth/me` 也使用 `cache: no-store`。
- `/api/auth/me` 无有效会话时写入结构化事件 `session_unavailable`，原因分为 `missing`、`expired`、`invalid`、`account_unavailable`。
- 日志不含邮箱、Cookie、JWT、IP 或完整 User-Agent，不输出用户标识。
- `missing` 也包括正常未登录访客，不能仅凭这个计数认定 Cookie 被浏览器清理。诊断只能提供服务端类别，无法重建浏览器清理过程。
- 未延长登录期限、自动续签或修改生产账号数据。发布前尚不能从生产日志观察这些新事件。

## 观测方法

在 Worker 日志中筛选 `session_unavailable`，比较各原因发生情况。`invalid` 需结合密钥变更记录核查；`expired` 表示凭证确已过期；`account_unavailable` 需核查账号状态。不要通过放行失效凭证恢复登录。
