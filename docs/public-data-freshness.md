# 公共数据新鲜度与发布缓存

本次在 `fix/public-data-freshness` 开发；未合并、未上线。没有数据库迁移或历史数据修改。

## 行为与边界

- 所有 `/api/public/*` 响应（包括错误）使用 `Cache-Control: private, no-store`，同时发送 CDN 和 Cloudflare CDN 的 `no-store`。不再计算全响应 SHA 或返回 304。客户端公共请求与首屏提前请求均使用 `cache: no-store`。
- `PUBLIC_ROSTER_CACHE=false`：关闭原有 30 秒名单缓存。未来如需重启，必须先引入数据版本及失效验证，不能直接重新开启来换速度。
- 保留当前 15 秒赛事轮询、60 秒名单/赛季列表刷新、隐藏页面暂停、并发请求和相同在途请求合并。恢复可见、网络恢复和手动重试强制刷新名单。不存在“零延迟实时”的保证。正常状态不显示常驻更新时间栏，仅加载失败时显示提示和重试按钮。
- 首次总览未成功前显示加载/重试状态，不进入默认的旧赛制布局。总览明确返回无赛季时显示空状态。
- 更新失败保留已有数据并提示可能过时，不标记为成功更新。失败轮次会等待并发请求结束后才开始下一轮；切季仍丢弃旧赛季响应。
- HTML 入口使用 `no-cache, max-age=0, must-revalidate`，每次导航校验。带内容哈希的 `/assets/*` 和 `/image-variants/*` 保留一年 immutable 缓存，不能在同名地址覆盖内容。
- 构建后的启动脚本带 `data-cfasync=false`，避免 Rocket Loader 改变应用和首屏请求的执行时机。
- 已打开的旧版页面不会自动换掉运行中的 JS；发布后需重新加载。浏览器以前存下的长 TTL HTML、错误的 CDN 规则和网络故障，不能仅靠新代码保证立即消失。

## Cloudflare 配套配置（上线前核查）

截图尚未包含 Cache Rules / Page Rules，不能声明已经核查或修改。针对 `moe.hooxi.co`：

1. 添加/核查缓存绕过规则：`(http.host eq "moe.hooxi.co" and starts_with(http.request.uri.path, "/api/"))`，Cache eligibility 选择 Bypass cache。确保其他匹配规则不会随后覆盖它；检查旧 Page Rules。
2. HTML 不应用强制 Edge TTL / Browser TTL 或全站 Cache Everything。若需显式绕过，限定首页及应用页面路径，保留 `/assets/*`、`/image-variants/*` 的静态缓存。HTML 遵循源站的重新校验头。
3. 不忽略 API 的 `season` 查询参数，不用全站的 Ignore Query String 自定义缓存键。
4. Rocket Loader 保持关闭；无需同时改 HTTP/2、HTTP/3、TLS 或其他性能开关。
5. 授权发布之后，如确认之前缓存过旧 HTML/API，对受影响 URL 定向清理。不要先清空所有图片缓存造成大量冷启动请求。浏览器强制刷新/无痕窗口与 CDN 清理是不同动作。

## 验证

- 单元测试：公共 fetch 绕过浏览器缓存；旧条件请求返回新数据；错误也不缓存。
- 浏览器测试：首次总览失败不呈现旧布局；重试恢复；部分接口失败提示；慢接口不阻塞总览；切季丢弃旧响应；隐藏/恢复轮询。
- 用本地 Wrangler 验证真实静态资产头（Vite preview 不处理 `_headers`）：首页、赛程、历史深链接应重新校验，哈希资源应 immutable。
- 发布必须从 main，另需明确授权。发布后记录 SHA/部署版本，从上海真实用户网络复测。无法用当前代理环境推断国内运营商延迟。

参考：[Workers 静态响应头](https://developers.cloudflare.com/workers/static-assets/headers/)、[Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)、[Rocket Loader 排除脚本](https://developers.cloudflare.com/speed/optimization/content/rocket-loader/ignore-javascripts/)。

## 本次验证结果

- `npm run check` 通过。
- `npm test`：36 个文件、154 项测试全部通过。
- `npm run test:e2e -- --workers=2`：44 项全部通过；预览启动时执行的 `npm run build` 成功，仍有原有的大 chunk 提示。
- 新增首次加载失败用例在修复前失败，修复后通过；公共请求缓存策略测试同样完成失败→通过验证。
- 隔离本地 Wrangler 验证 `/`、`/matches`、`/seasons/s2`、`/admin/characters/c001` 的 HTML 均重新校验；构建 JS/CSS 均返回一年 immutable 缓存。
- 手机 390px 宽错误状态截图检查通过，无横向溢出。
- 未修改赛制推进或数据库，未合并、推送、部署，也未修改 Cloudflare 控制台规则。
