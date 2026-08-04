# 府萌 2026

128 位二游女性角色的七日人气赛事。采用 **8 组 × 16 人、三轮瑞士制**，各组前二进入 16 强单败淘汰赛；冠军成为二游群头像一个月。

## 技术栈

- React + TypeScript + Vite：移动端优先的公开赛事站
- Cloudflare Workers：Hono API、Cookie 会话、投票风控
- Cloudflare D1：赛事、角色、投票、审计日志
- Cloudflare R2：审核后的官方角色立绘
- Durable Objects + WebSocket：实时票数推送
- Cloudflare Turnstile：发送登录验证码前的人机验证
- Brevo：邮箱验证码（免费档 300 封/日）

## 本地启动

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

### 完整中间态预览

以下命令会在 `/tmp` 创建隔离 D1，瞬时生成完整七轮赛果、上一季冠军和已发布未开赛的新赛季，不修改默认本地数据库：

```bash
npm run preview:midstate:prepare
npm run preview:midstate
```

访问 `http://127.0.0.1:8788`。本地管理员账号为 `admin@fumoe.local`，验证码固定为 `000000`；该绕过仅在本机地址和显式开发配置下生效。

## Cloudflare 初始化

1. 创建私有 GitHub 仓库并推送本项目。
2. 登录 Cloudflare，创建 D1 数据库：
   ```bash
   npx wrangler d1 create fumoe-2026
   ```
   将返回的 `database_id` 写入 `wrangler.jsonc`。
3. 创建 R2 Bucket：
   ```bash
   npx wrangler r2 bucket create fumoe-2026-assets
   ```
4. 配置 Worker secrets（不要提交到 Git）：
   ```bash
   npx wrangler secret put AUTH_SECRET
   npx wrangler secret put BREVO_API_KEY
   npx wrangler secret put TURNSTILE_SECRET
   ```
   `AUTH_SECRET` 请使用至少 32 字符的随机值。
5. 在 `wrangler.jsonc` 配置 `APP_ORIGIN`、`BREVO_SENDER`、`ADMIN_EMAILS`。首个在 `ADMIN_EMAILS` 白名单中完成邮箱验证的人会自动成为管理员。
6. 运行数据库迁移：
   ```bash
   npm run db:migrate:remote
   ```
7. 在 Cloudflare Workers & Pages 新建 Worker，连接私有 GitHub 仓库；构建命令为 `npm run build`，部署命令为 `npm run deploy`。绑定自定义域名并让 DNS 由 Cloudflare 代理。

## Brevo 设置

1. 在 Brevo 验证发信域名，并在 Cloudflare DNS 添加其给出的 SPF、DKIM、DMARC 记录。
2. 邮件相关的 DNS 记录必须为 **仅 DNS**，不要开启 Cloudflare 代理。
3. 创建 SMTP/API key，并写入 `BREVO_API_KEY` secret。
4. 设置 `BREVO_SENDER` 为已验证发信地址，如 `府萌 2026 <vote@mail.example.com>`。

## Turnstile 设置

在 Cloudflare Turnstile 创建 managed widget，允许域名填正式域名和本地开发域名。将 secret key 写入 Worker secret，并在构建环境设置 `VITE_TURNSTILE_SITE_KEY`；前端会按场景渲染真实 widget 并提交一次性 token：

- `POST /api/auth/request-code`：必需 action 为 `login` 的 `turnstileToken`
- 投票使用登录会话、IP/设备风险信息与数据库唯一约束，不再重复触发 Turnstile

本地全栈开发未配置 site key 时，可在 `.dev.vars` 同时设置 `DEV_AUTH_BYPASS=true` 和 `VITE_DEV_AUTH_BYPASS=true`，且 `APP_ORIGIN` 必须是 `localhost` 或 `127.0.0.1`；前后端都只会在本机来源启用绕过。生产环境缺少 site key 或 secret 会安全拒绝请求。

## 多赛季赛事

- 同一时间仅有一个当前赛季；新赛季在后台从上一季名单复制为草稿，管理员可通过赛季名单 API 调整分组与种子，确认 128 人及每组 16 人后显式发布。
- 赛季使用固定链接 `/seasons/:slug`。发布后名称仍可修正，但 `slug` 与角色资料快照保持不变。
- `/seasons` 展示历届赛事；往届页面保留当季角色名称、游戏、立绘、积分、签表与决赛结果。
- 已结束或归档赛季默认只读，管理员只能填写原因后审计解锁纠错。
- 全站公告存于系统设置；每个赛季另有独立公告。

首页会随赛季状态变化：进行中时展示实时对局及上一季卫冕冠军横幅；新赛季已发布但未开赛时展示新季预告与上一季冠军双主视觉；决赛结束后切换为冠军加冕首屏。

## 自动赛程推进

`wrangler.jsonc` 已配置每五分钟运行一次的 cron。它只推进唯一当前赛季：自动开始到时且已生成对局的轮次，并在轮次结束后结算赛果、生成下一轮对局。决赛结算会把冠军写入当前赛季并将其标记为已结束。自动操作写入带赛季归属的审计日志；待审核票或尚未生成的对局会阻止结算。

## 赛事数据与运营

- 角色立绘必须来自官方站点或官方社媒，上传 R2 前在 `assets/characters.manifest.json` 记录 `sourceUrl`、官方域名、审核人、审核日期与画面焦点。
- `npm run artwork:process` 将已审核的原图生成完整展示的图鉴（3:4）、对局（4:5）和头像（1:1）WebP 版本；它使用 `contain`，不会裁断角色主体。`npm run artwork:upload-plan` 生成 R2 上传命令。
- AI 可预填角色介绍、标签和官方素材候选；不得生成角色立绘或使用非官方抓取图。
- 管理员可通过 API 配置赛程、调整赛况和审核异常票。每次修改必须提供原因，写入不可修改的 `audit_logs`。
- 运营员可读运营面板和审核队列；管理员可开赛、修票、审核异常票、改全局配置。

## 安全边界

- 无密码邮箱验证码，Session 30 天。
- 同邮箱每天最多 5 次验证码；同 IP 每小时最多 10 次。
- 每场每账户一票，数据库唯一约束保证幂等；用户可选择多个场次后一次确认并批量提交。
- 仅发送登录验证码前要求 Turnstile；投票不重复验证，IP/设备指纹仅作为风险评分，不自动封禁。
- 高频 IP 投票进入待审核队列，不实时计入公开票数。
- 原始 IP 只以哈希形式存储；清理策略：认证挑战记录 7 天，风控聚合和审计记录 90 天。生产环境另设 Cloudflare Logpush/定时 Worker 执行清理。

## 生产发布流程

发布前先替换 `wrangler.jsonc` 中的 D1 ID、正式域名、发件地址和管理员邮箱，并在构建环境设置 `VITE_TURNSTILE_SITE_KEY`。Cloudflare 中必须存在 `AUTH_SECRET`、`BREVO_API_KEY`、`TURNSTILE_SECRET` 三个 secret。

1. 导出远端 D1 备份，文件名包含发布时间：
   ```bash
   npx wrangler d1 export fumoe-2026 --remote --output backups/fumoe-before-<date>.sql
   ```
2. 严格执行配置预检与全部自动验证：
   ```bash
   npm run deploy:check
   ```
3. 检查备份文件有效后执行远端迁移：
   ```bash
   npm run db:migrate:remote
   ```
4. 部署 Worker：
   ```bash
   npm run deploy
   ```
5. 部署后立即执行只读冒烟测试：
   ```bash
   APP_URL=https://你的正式域名 npm run smoke:remote
   ```
6. 在 Cloudflare 控制台确认 cron、D1、R2、Durable Object、静态资源 bindings 和 Turnstile 允许域名均正确。

远端备份、迁移与部署都是外部且难以回滚的操作，不包含在自动脚本中，必须由管理员分别确认执行。

## 验证

```bash
npm run preflight -- --allow-placeholders # 仅开发/CI；不代表可部署
npm run verify
npx wrangler deploy --dry-run
```

严格的 `npm run preflight` 会在发现示例域名、占位 D1 ID或缺少构建 site key 时失败。
