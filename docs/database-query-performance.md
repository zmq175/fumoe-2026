# 公开接口数据库查询优化

2026-11-06，开发分支 `perf/database-query-latency`。仅修改公开读取路径；没有数据库迁移、生产写入、字体或图片改动。

## 基线和原因

对线上六个公开接口进行三轮串行请求。请求经过代理到 LAX，不能视为中国大陆三网测速；表中仅列 `Server-Timing` 的服务端总耗时。

| 接口 | 三轮范围 ms | 中位数 ms |
| --- | ---: | ---: |
| overview | 468–480 | 472 |
| matches | 386–676 | 401 |
| standings | 249–271 | 258 |
| characters | 554–900 | 824 |
| rounds | 222–347 | 232 |
| seasons | 116–123 | 117 |

稍后的同版本单轮复测中，角色接口为 433 ms，首页为 458 ms。线上尚未部署改动却已有波动，因此不能凭一次前后请求推算收益；发布验证应重复采样并比较 db 指标。

先后验证三个假设：数据库多次往返、缺失索引/重复子查询、结果传输和组装成本。

通过 D1 只读命令检查公开查询，数据库响应来自 NRT。角色主查询 SQL 为 3.44–5.33 ms，对局主查询为 4.03 ms，积分查询为 2.83 ms。D1 `meta.duration` 是 SQL 执行时间，不包括网络时间。这些采样支持“数据库调用次数/等待是优先项”，不支持“数据库执行 SQL 花费数百毫秒”。绑定等待中还包含排队、结果传输及序列化，不能全部归因于网络。

合并初稿查询的角色 SQL 为 6.22 ms，对局为 4.44 ms；它们同时返回以前另查的素材资料，因此不宣称每条 SQL 更快。最终去掉了无必要的 CTE `LIMIT 1`，避免阻止 SQLite 展开 CTE；当前赛季和 slug 已有唯一约束。隔离环境 EXPLAIN 确认角色查询不再产生临时排序。

## 索引检查

已检查生产 `sqlite_master` 和 `EXPLAIN QUERY PLAN`：

- 当前赛季命中 `seasons_current_idx`，指定 slug 命中唯一索引。
- 名单命中 `season_entries` 的 `(season_id, seed)` 唯一索引。
- 角色资料命中 `season_character_profiles` 的 `(season_id, character_id)` 主键。
- 对局命中 `tournament_rounds_season_idx`、`matches_round_idx`、两侧角色主键、赛季名单联合唯一索引。
- 时间窗口命中 `match_windows` 主键；列表由两次关联子查询改为一次 LEFT JOIN。
- 积分榜的瑞士轮选择已有 `(season_id, stage, round_number)` 唯一索引，临时积分结果使用 SQLite 自动索引。聚合后排序不应简单视为缺失持久索引。

没有发现能解释当前延迟的缺失索引，本次不增加重复索引或改写积分算法。

## 改动和调用次数

下表为正常读取时的 D1 绑定调用次数，不含 `/overview`、`/matches` 原有的一次生命周期到期检查；到期时仍执行完整推进。

| 接口 | 原先 | 现在 |
| --- | ---: | ---: |
| 首页 overview | 5 次，存在三层串行等待 | 1 次 batch，包含 5 条 SELECT |
| S2 角色名单 | 3 次串行读取 | 1 条 JOIN 查询 |
| S2 对局 | 3 次调用，赛季之后并行取对局/素材 | 1 条 JOIN 查询 |
| 轮次 | 2 次 | 1 条 JOIN 查询 |
| 当前积分 | 3 次调用，后两项并行 | 2 次调用：赛季后 batch 读取头像/积分 |
| 锁定历史积分 | 2 次 | 1 条查询，直接返回历史快照 |

首页 batch 使用同一事务读取赛季、往届冠军、轮次、比赛和公告；积分/头像也批量读取。不引入比分共享缓存，投票校验和 cron 逻辑不变。资料缺失、旧赛季字段、日窗口时区、草稿不可公开、未知赛季返回空列表均保持原行为。

## 复测方法

```sh
NODE_USE_ENV_PROXY=1 node scripts/probe-public-api.mjs
# 自定义环境、轮数和服务端阈值；超标返回非零退出码：
APP_URL=https://moe.hooxi.co PERF_ROUNDS=3 PERF_MAX_SERVER_MS=500 NODE_USE_ENV_PROXY=1 node scripts/probe-public-api.mjs
```

脚本只访问公开接口，不需要会话；仅输出耗时、响应大小和边缘标识，不输出响应正文。每次最多十轮，串行采样。

优化路径新增 Server-Timing：

- `db_wait`：公开路由内 D1 绑定调用的累计墙钟时间，包含 SQL 执行，不包括生命周期和鉴权。
- `db_sql`：D1 返回的 SQL 执行时间之和；缺少元数据时省略，不能伪报为零。
- `db_calls` / `db_queries`：绑定调用次数 / SQL 语句数，用 desc 表示，非耗时。

原有 `auth`、`lifecycle`、`app`、`total` 不变。`db_wait` 是 `app` 的一部分，不能把它们相加作为总耗时。未接入这组统计的其他接口不会返回 db 字段。

## 验证

先建立查询次数回归测试，旧代码名单为 3 次（目标 1 次），首页和积分均未使用批次，测试失败；改动后通过。只读生产 SQL 对比确认旧/新角色与比赛基础字段逐项相同。隔离 SQLite 集成测试覆盖索引计划、批次调用、SQL 元数据统计、资料缺失、历史快照、未知/草稿赛季以及 S2 三十天推进。

执行 check、132 项测试、32 项浏览器测试、完整赛季演练和生产构建。开发验证不代表线上版本已更新；发布后需在相同网络和相同数据状态下重采样。

参考：[D1 返回元数据](https://developers.cloudflare.com/d1/worker-api/return-object/)、[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)。
