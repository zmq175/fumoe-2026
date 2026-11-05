# Cloudflare 读取加速

本次在 `perf/cloudflare-read-acceleration` 开发，包含前一分支的 SQL 批量查询改进。未部署前不视为线上能力。

## 选择与边界

- Smart Placement：配置 `placement.mode=smart`，由 Cloudflare 判断是否将请求处理放到更接近数据库的位置。直接静态资产仍走静态资产服务。不会改变 cron 的执行位置或频率。
- Cache API：使用 Hono 中间件，仅缓存 `GET /api/public/characters?season=<slug>` 的非空成功响应 30 秒。HIT 不查询数据库。名单内容对登录与匿名用户相同；不保存 Cookie、CORS 或原请求 Server-Timing。浏览器收到 `Cache-Control: no-store`，平台内部保存独立 TTL。
- 当前赛季隐式别名、重复/额外参数、Authorization、强制刷新请求绕过缓存。空名单、失败响应、带 Set-Cookie 的响应不缓存。缓存不可用时读数据库。
- 比分、首页概况、赛程、积分、投票、管理员操作、登录和定时推进不进入名单缓存。所有数据库读取仍为主库。
- 缓存是节点本地缓存，不是全局共享；不声称支持跨节点失效或 Tiered Cache。名单修改最多多显示约 30 秒旧数据，前端自身轮询周期另计。强制刷新可直接读主库。

## 本次没有启用的服务

D1 信息只读检查显示当前为 APAC，`read_replication.mode=disabled`。读副本需要数据库开关以及 Sessions API；单独开启开关不会自动加速现有查询。`first-unconstrained` 允许较旧数据，投票后读写一致性还需要书签等措施。考虑当前旧图修正与状态正确性的要求，本次优先减少数据库往返和使用有界缓存，不启用读副本。未来需要以独立实验比较名单缓存未命中时的收益，不能全局替换 DB binding。

Hyperdrive 面向 PostgreSQL/MySQL，不适配本项目 D1。KV 也不用于实时比分或开赛状态，避免额外同步与最终一致性问题。无需为了使用中间件再增加一个代理 Worker。较新的 Workers Cache 服务本次不引入，避免同时变更部署工具链。

## 验证与发布观察

本地中间件测试验证第二次名单请求不再执行读取、赛季隔离、30 秒过期、强制刷新、空结果、缓存故障降级和实时路由绕过。现有集成测试继续验证历史数据与批量查询。

发布后（需要单独授权，从 main 发布）：

1. 记录提交 SHA 和 Worker 版本；Smart Placement 需要流量学习，不能刚发布就断言生效。
2. `NODE_USE_ENV_PROXY=1 PERF_SEASON=<实际赛季slug> PERF_ROUNDS=3 node scripts/probe-public-api.mjs`。比较 `X-Public-Cache` 的 MISS/HIT，以及 `Server-Timing` 中 total/db_wait/db_sql。
3. HIT 不应包含数据库查询耗时；MISS 的数据库耗时仍可见。分别比较各端点的服务端与客户端耗时，不把两者混为一谈。
4. 从国内实际网络复测，至少覆盖登录、投票后的已投状态、午夜开赛及缓存过期后的素材更新。当前代理环境的测量不能代替国内运营商体验。
5. 如回归，关闭 `PUBLIC_ROSTER_CACHE`，或移除 placement 配置后重新发布。没有数据库迁移或历史数据写入需要回滚。

## 官方依据

- [Smart Placement](https://developers.cloudflare.com/workers/configuration/placement/)
- [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [D1 read replication / Sessions](https://developers.cloudflare.com/d1/best-practices/read-replication/)
- [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)

## 本次本地验证结果

- `npm run check` 通过；`npm test` 143 项通过。
- `npm run build`、`wrangler deploy --dry-run` 通过；构建仍有现存的大包提示。
- `npm run test:season` 七轮模拟通过，使用隔离本地数据库。
- `npm run test:e2e` 31/32 通过；降低到 2 workers 后同样 31/32。失败为 `bracket-explorer.spec.ts:38` 的手机冠军按钮点击，Playwright 连续判定元素不稳定至超时。尚未确定原因，不能宣称完整浏览器回归通过，也不满足项目合并门槛。
- 没有合并 main、推送或部署；没有变更生产数据库或读副本开关。
