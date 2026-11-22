# 公开接口与首屏性能优化

范围：保留 Cloudflare Workers、D1、R2 架构，不修改域名、部署地域或赛季排期。

## 诊断基线

2026-11-06，三轮匿名公开接口采样经过代理到 EWR，不能代表国内运营商。预热后的总耗时：health 约 0.22 秒，overview 1.84–2.12 秒，matches 1.95–2.05 秒，rounds 约 0.58 秒，standings 约 0.8 秒。旧接口没有分段耗时，不能据此精确归因于数据库或网络。

原前端等待 overview，再等待其他五个请求全部结束才更新主内容。每 15 秒重复下载角色名单（当时 JSON 解码后约 283 KB）和赛季列表。

## 本次改动

- 普通访问先用一次只读查询判断 S2 是否存在到期轮次或需要切换的日窗口。没有到期变化时，不进入抢锁、刷新对局、释放锁的流程。边界到期时仍同步调用原生命周期逻辑。Cron 每分钟全量检查保持不变。
- 公开 GET/HEAD 与图片无需会话查询；登录、个人选票、投票和管理接口保留原有鉴权。
- 对局资料和角色展示配置并行查询；积分榜与头像映射并行查询。
- 总览返回即展示当前比赛；其他数据独立更新，不等待最慢区域。切换赛季先清空旧赛季派生数据，避免跨季混用。
- 活跃页面继续每 15 秒刷新比赛；名单、赛季列表每分钟刷新，失败则下次重试。隐藏页面暂停轮询，恢复可见时请求刷新。公开读取设 12 秒超时，避免网络挂起长期占住轮询。
- 提供 `Server-Timing` 的 auth、lifecycle、app、total，用于浏览器检查服务端处理时间。它不包含浏览器到 Worker 的完整网络成本。

没有给比分或个人选票新增共享缓存，也没有取消投票接口的时间窗口校验。

## 验证

SQLite 集成测试验证正常公开读取没有数据库写入、日切换/轮次截止可检测、S2 三十天推进与历史快照保持一致。账号冻结后后台仍拒绝访问，公开读取正常。

浏览器测试阻塞对局、名单与积分接口，验证首页比赛仍先展示；使用虚拟时钟验证名单不随每次比分轮询重拉，以及隐藏/恢复行为。既有投票、历史赛季和手机布局测试继续执行。

发布后应在相同网络、相同登录状态下比较接口 P50/P95、Server-Timing、首屏可见时间和请求数量。开发环境验证不能宣称国内端到端耗时已经降低到某个数值。

## 查询真实访客耗时

部署带有 `PERF` 绑定的 Worker 后，首次写入会产生 `fumoe_performance` 数据集。通过 Analytics Engine SQL API 可查询最近一天各指标的样本量、中位数和 P95，单位为毫秒。

```sql
SELECT blob1 AS metric, SUM(_sample_interval) AS samples,
       quantileExactWeighted(0.50)(double1, _sample_interval) AS p50_ms,
       quantileExactWeighted(0.95)(double1, _sample_interval) AS p95_ms
FROM fumoe_performance
WHERE timestamp >= NOW() - INTERVAL '1' DAY
GROUP BY metric
ORDER BY metric
```

每次打开页面独立抽样 10%。只统计加载完成且成功送达的样本，过早退出、网络断开等情况可能缺失。`page_load` 是整页加载时间，`dns`、`connect`、`request_wait`、`download` 是文档加载阶段。`standings_visible` 和 `vote_feedback` 通过浏览器绘制帧近似测量界面出现的时间。投票反馈的 `double2` 为 200 表示提交得到正常响应，为 0 表示失败。接口指标的 `double2` 是浏览器提供的 HTTP 状态码，0 表示未知。`double3` 是 Worker 报告的服务端总耗时，-1 表示缺少该数据。

[Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) · [加权分位数](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/aggregate-functions/)

### 白屏、首页、投票页和图片

| 指标 | 起点与终点 |
| --- | --- |
| `white_screen` | 打开文档到浏览器首次绘制文字或图像（FCP）。加载提示也能结束白屏。支持 Paint Timing 的浏览器每次文档加载记录一次。 |
| `home_visible` | 打开首页、点击进入首页或通过浏览器历史返回，到赛事内容或「当前暂无公开赛季」显示。加载提示和错误重试界面均不算完成。 |
| `vote_page_visible` | 打开或切换到对局中心（`/matches`），到对局列表或有效空状态显示。实际投票提交另看 `vote_feedback`。 |
| `image_eager`、`image_lazy` | 单张展示图从挂载或更换图片到浏览器触发 load，单位毫秒。懒加载图含等待进入加载范围的时间。优化图失败后回退到原图的等待也计入。成功为 200，最终错误为 0。 |

首页和投票页用绘制帧近似内容出现的时间。图片含缓存命中，覆盖使用 DisplayImage 的立绘、头像及标志。每批最多随机保留 12 个已结束的图片样本。分析图片加载速度时按 `double2 = 200` 筛选成功样本。页面加载前退出、应用脚本未执行等访问可能没有上报。

### 投票页节点

以下指标只针对 `/matches`，按 `blob2` 区分直接打开（direct）和站内切换或历史返回（spa）。耗时均从本次进入页面开始计算。

| 指标 | 结束条件 |
| --- | --- |
| `vote_fcp` | 直接打开投票页后浏览器报告首次内容绘制，包含加载提示。 |
| `vote_entry_paint` | 站内路由切换后，投票页或其加载提示完成首轮绘制的近似时间。 |
| `vote_interactive` | 赛事界面已显示，身份检查成功，已登录用户的当季选票已返回，且页面存在可操作的选手按钮。游客可以点击后进入登录。无可投对局、已全部投过或身份读取失败时不产生就绪样本。 |
| `vote_viewport_images` | 首批对局列表出现时与视口相交的图片均已加载。 |
| `vote_all_images` | 同一批对局列表内的全部图片均已加载，含屏外懒加载图片。 |

图片使用浏览器的完成状态与实际图片宽度检查缓存及加载结果。状态 200 表示该组图片全部成功，0 表示存在失败或移除的图片。没有图片、未滚动触发懒加载或提前离开的访问可能没有完成样本。统计保持 10% 抽样，沿用页面 load 后的异步批量上报。

```sql
SELECT blob2 AS entry, blob1 AS milestone,
       SUM(_sample_interval) AS samples,
       quantileExactWeighted(0.50)(double1, _sample_interval) AS p50_ms,
       quantileExactWeighted(0.95)(double1, _sample_interval) AS p95_ms
FROM fumoe_performance
WHERE timestamp >= NOW() - INTERVAL '1' DAY
  AND blob1 IN ('vote_fcp', 'vote_entry_paint', 'vote_interactive', 'vote_viewport_images', 'vote_all_images')
  AND double2 = 200
GROUP BY blob2, blob1
ORDER BY entry, milestone
```
