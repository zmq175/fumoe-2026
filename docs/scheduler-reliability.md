# 赛程定时推进

## 时间与重试

- Cron 每分钟触发，实际推进使用执行时的服务器时间。`scheduledTime` 仅用于计算触发延迟，不能用来判断当前投票窗口或租约是否过期。
- 首页、对局和投票请求仍可触发 S2 推进；所有入口共用数据库租约。活动租约不抢占，过期租约可恢复，完成或失败后按 token 释放。
- 自动开赛校验失败保留 `round_auto_start_skipped` 审计。Cron 将该结果上报为失败，下一分钟重新检查；公共页面仍可读取现有状态。不会跳过审核、强行开赛或修改既定起止时间。
- 投票 API 独立校验时间窗口。状态更新晚到不应延长投票期限。

## 运行记录

Workers Logs 启用应用日志，关闭自动请求日志。搜索 `event=tournament_scheduler`：

| 字段 | 含义 |
| --- | --- |
| scheduledAt / startedAt | 计划触发时间 / 实际开始时间，UTC |
| dispatchDelayMs | 平台投递延迟 |
| durationMs | 本次检查耗时 |
| outcome | ok、locked 或 failed |
| started / closed | 本次启动、结束的轮次数 |

延迟达到一分钟和锁竞争写 warning，失败写 error 并拒绝 scheduled 的 waitUntil Promise，正常运行写 info。没有新增外发通知。

排查顺序：先看是否有调用记录，再比较投递延迟和执行耗时，最后核对租约与对应赛季的审计。单次 locked 可能是请求正在推进；持续 locked 超过五分钟或连续 failed 需要检查。不要直接删有效锁或手工重写比分。

## 验证与边界

SQLite 集成测试覆盖晚到任务跨越开赛时间、有效锁阻止推进、过期锁恢复、失败释放锁及上报、重复触发只开赛一次；随后跑完整 S2 三十天和历史快照不变验证。

这仍是分钟级调度，不承诺秒级准点。下一阶段如需更严格的开赛响应，可评估独立 Durable Object Alarm 按比赛边界唤醒、Cron 保底巡检；引入前需单独验证至少一次投递、重复结算保护、故障恢复和新对象迁移。

参考：[Scheduled Handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)、[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)。
