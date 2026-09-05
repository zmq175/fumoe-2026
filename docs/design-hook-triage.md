# styles.css 检测提示处置

此次 Stop 提示报告 17 项，针对该文件的完整复扫输出 21 处。该文件与基线 `9916d92` 无差异；本次不以赛季配置扩展为由重做全站视觉。初次处置为代理判断；用户随后明确确认必须保留首页网格和整体风格，仅允许优化设计，详见 [视觉风格约束](visual-style-contract.md)。

| 规则／行 | 对象 | 处置及依据 |
| --- | --- | --- |
| side-tab / 8 | development-code | 保留：开发验证码提示的既有识别样式。 |
| side-tab / 11 | vote-toast | 保留：绿色投票结果反馈，同时有文字说明。 |
| side-tab / 14 | notice-bar | 保留：全站状态通知的既有青色强调。 |
| side-tab / 19 | faction-contender__rank | 保留：阵营色识别。 |
| side-tab / 19 | challenger rank | 保留：另一方阵营的镜像右侧标识。 |
| side-tab / 19 | faction-method | 保留：既有规则说明块，与通知样式一致。 |
| side-tab / 19 | faction-chaser | 保留：各阵营排名行的阵营色。 |
| side-tab / 20 | roster-readiness | 保留：名单未就绪／就绪状态，兼有文字和背景变化。 |
| side-tab / 23 | champion-score | 保留：冠军区域金色赛果强调。 |
| side-tab / 16 | bracket placeholder inset stripe | 保留：尚未确定对阵的既有签表状态样式。 |
| border-accent-on-rounded / 5 | site-header | 误报：直角页眉，不是圆角卡片。 |
| border-accent-on-rounded / 9 | hero statboard | 误报：该元素未设圆角。 |
| border-accent-on-rounded / 11 | focused match | 误报：该卡片未设圆角。 |
| border-accent-on-rounded / 11 | vote draft bar | 误报：该元素未设圆角。 |
| border-accent-on-rounded / 16 | active tab underline | 误报：选中标签下划线，不是圆角卡片侧边。 |
| border-accent-on-rounded / 21 | admin stats | 误报：直角统计块。 |
| border-accent-on-rounded / 23 | season card | 误报：该卡片未设圆角。 |
| overused-font / 1 | Google Fonts import | 保留：现有 Space Grotesk 字体资源。 |
| overused-font / 6 | brand year | 保留：英文与数字品牌用字，中文另用 Noto Sans SC。 |
| overused-font / 17 | character statistics | 保留：沿用既有数字字体，字体流行程度不是功能缺陷。 |
| codex-grid-background / 9 | hero grid | 用户确认保留：首页科技风网格必须保留，后续延续整体风格；已记录文件内单规则例外。 |

通过官方管理脚本持久化三条例外：`border-accent-on-rounded=*`、`side-tab=*`、`overused-font=space grotesk`，均仅限 `src/styles.css`。前两条规则没有值级定位，使用文件内单规则例外；没有关闭整文件检查或全局规则。

用户确认后另通过官方脚本增加 `codex-grid-background=*`，仅限 `src/styles.css`，原因注明用户确认。没有关闭全局规则或整文件检查。

修复：无已确认需修改的视觉缺陷，未改 UI 源码。待确认项：无。上述例外不等于全站视觉或可访问性认证。
