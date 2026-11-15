# AGENTS.md — VEX 赛程管理助手

> 给 AI 代理的快速上下文。与用户交流使用**中文**；维护者是带队教练（非全职工程师），解释时避免堆技术黑话。
>
> 深入背景读 `PROJECT_HANDOVER.md`（架构 / API 实测字段事实 / 踩坑 #1~#17 / 打包指南），完整操作历史读 `EXECUTION_LOG.md`（最新在上）。本文只放**违反会出事故**的规则和常用操作，与那两份文档冲突时以它们为准。

## 项目是什么

VEX 机器人赛事的赛程/比分/排名管理工具（官方 App「VEX Via」安卓不可用，本项目是其替代 + 教练端增强）。**纯前端、无后端**，数据存 localStorage，数据源 `https://events.vex.com/api/v2`（Bearer Token）。双端独立：`VexMaster/`（iOS/PWA，GitHub Pages 部署）与 `VEX_Master_Android/`（HBuilderX 打包 APK）。当前版本 v2.6。

## 铁律（违反必出事故）

1. **双端目录绝不合并**：Android 用 `plus.*` 原生 API（iOS 环境会直接报错）。PDF.js 版本也不许统一（Android 2.16.105 / iOS 2.6.347，老 iPad 兼容）。
2. **核心逻辑存在三份拷贝，必须逐字一致**（仅 localStorage Key 后缀 `_ios` 差异）：
   - `VexMaster/index.html` 内联模块（页面实际加载的是它）
   - `VexMaster/vex-api-sync.js`（镜像拷贝）
   - `VEX_Master_Android/vex-api-sync.js`
   改任何数据层逻辑 → 三处同步 → 跑回归测试。
3. **数据层规则已用真实赛事验证，勿凭猜测修改**：
   - matchId：资格赛 `Q{matchnum}`；决赛（`round===15`）单赛区 `F{matchnum}`、多赛区 `F{赛区序号}-{matchnum}`，统一由 `resolveMatchIds()` 解析（幂等）。决赛 matchnum 从 1 重新编号，与资格赛撞号是 v2.3 前的重大事故根源
   - 比分键 `${matchId}_${队号}`，改格式会污染历史数据
   - 决赛排名路径参数是赛区 **order** 不是 id；分页一律带 `per_page=250`（>250 条时翻页循环保留）；所有请求走 `authFetch`（自动重试一次）
   - `runFullSync(sku, token, onProgress?)` 只抓取+合并排名/技能赛/队名并**返回 matches**；赛程由调用方聚合**多 SKU** 后统一 `generateScheduleFromApi` + `syncScoresToLocal`（顺序错了多赛事会互相覆盖）
4. **v1.0 PDF 解析引擎 `parseV4Engine` 冻结**，不要重构。
5. **不凭猜测写字段名**：API 字段事实全部实测记录在 `PROJECT_HANDOVER.md` 第 5 节，编码前先看；没验证过的字段在真实接口上就是 null。

## 常用命令

```bash
# 回归测试（改任何数据层/UI 逻辑后必跑：三份拷贝 × 12 组场景 327 断言，0 依赖）
node .zcode/test_rankings.js

# 本地起服务（浏览器验证；iOS 端务必用无痕窗口，Safari 缓存黑洞会让人误判"改了没生效"）
python3 -m http.server 8899
#   iOS:     http://127.0.0.1:8899/VexMaster/
#   Android: http://127.0.0.1:8899/VEX_Master_Android/  (plus.* 仅海报保存时调用)

# git push（本机 VPN 关闭时直连会报 127.0.0.1:7890 连接失败 → 用下面写法绕过）
git -c http.proxy= -c https.proxy= push origin main

# curl 一律加 --noproxy '*'；但 curl 只能测无鉴权行为（302/404），
# 带 Token 的 API 调试必须用浏览器页面内 fetch（与 App 同构），见下
curl --noproxy '*' -H "Accept: application/json" "https://events.vex.com/api/v2/events?sku=..."

# Android 打包：HBuilderX GUI 需已登录 → 打开 VEX_Master_Android → 发行 → 原生App-云打包
# （换证书后真机必须先卸载旧版；manifest 版本号每次发布前递增）
```

## 调试 API 的正确姿势（踩过的大坑）

1. 起本地服务 + 浏览器打开页面，在**页面上下文**里 `fetch(..., { headers: { Authorization: 'Bearer ' + token } })` —— 与 App 运行时同构。
2. **curl / curl_cffi(模拟 Chrome TLS) 一律 401**：Cloudflare Bot Management 会剥掉非浏览器客户端的 Authorization 头再转发 —— 不是 Token 失效，别往 Token 方向排查。
3. 连续自动化请求会触发边缘限流：页面内 fetch 全挂（无 CORS 头的 Failed to fetch）但顶层导航正常 → 等冷却即可，用户真机不受影响。判别：`fetch(url, {mode:'no-cors'})` 返回 opaque 即网络通。
4. 未公开端点从平台 SPA bundle 反查：`events.vex.com/build/assets/app-*.js` 里 grep `getPaged(`（已探明：matches / rankings / `divisions/{order}/finalistRankings` / skills / teams / awards）。
5. 排名接口不含队名（队名在 `/teams`）；比赛条目 `round`: 2=资格赛、15=决赛；决赛 `scheduled` 为 null 用 `started`；`scored` 字段不可靠（判断完赛用 score>0）。

## 验证与提交纪律

1. 改动 → `node .zcode/test_rankings.js` 全过 → 本地服务浏览器验证 → 更新 `EXECUTION_LOG.md`（最新在上）+ `PROJECT_HANDOVER.md` 状态快照 → commit。
2. `main` 分支直接提交是本项目惯例；提交信息格式 `vX.Y + 一句话要点`。
3. 用户设备上的 localStorage 数据是真实比赛数据，**不要清**；测试一律用 mock 数据注入或测试浏览器，测完清理。对话中暴露过的 Token 提醒用户去官网重置。
4. UI 有 alert() 的流程（同步完成弹窗）在自动化测试里会阻塞渲染器 —— 测试时用 evaluate 直接驱动管线函数，别点真按钮。

## 目录结构

```
├── AGENTS.md                  # 本文件 — AI 代理上下文
├── README.md                  # 项目说明 (v2.6，面向使用者)
├── PROJECT_HANDOVER.md        # ⭐ 交接文档：架构/API 字段事实/存储字典/踩坑 #1~#17/打包指南
├── EXECUTION_LOG.md           # ⭐ 执行日志（每次迭代的操作与测试全记录，最新在上）
├── index.html                 # GitHub Pages 根入口（重定向到 VexMaster/）
├── vex-sync.js                # v1 遗留文件，未使用
├── VEX_Schedule_Master_Handover.md  # v1.0 早期交接（历史存档）
├── .zcode/
│   └── test_rankings.js       # ⭐ 回归测试（改逻辑必跑）
├── VexMaster/                 # ===== iOS/PWA 端 =====
│   ├── index.html             # 主页面（单文件：内联 API 模块 + 全部 UI）
│   ├── vex-api-sync.js        # API 模块镜像拷贝
│   └── icon.png.png           # PWA 图标
└── VEX_Master_Android/        # ===== Android 端（HBuilderX 项目）=====
    ├── index.html             # 主页面（UI 内联 + 加载外部 API 模块）
    ├── vex-api-sync.js        # Android 的 API 模块
    ├── manifest.json          # 应用配置（当前 2.6 / code 105，发布前递增）
    ├── img/                   # 应用图标
    └── unpackage/             # 打包产物与构建缓存（无需手工修改）
```

## 存储字典（Key 前缀 `vex_`，iOS 端全部带 `_ios` 后缀）

| Key | 内容 |
|-----|------|
| `vex_matches` | 赛程数组 `{matchId, field, time, timeValue, team1, team2, division}` |
| `vex_scores` | `{ "Q1_5366N": "262" }`；`vex_done`: `{ "Q1": true }` |
| `vex_teams` / `vex_current_team` | 关注队伍列表 / 当前查看队伍号 |
| `vex_api_token` / `vex_event_sku` | API Token / SKU 数组（JSON 字符串） |
| `vex_rankings` / `vex_rankings_detail` | `{队号: 名次}` / `{赛区名: [{rank,team,name,avg}]}`（资格赛官方榜） |
| `vex_finalist_rankings` / `vex_finalist_detail` | `{队号: 名次}` / `{赛区名: [{rank,team,name,score}]}`（决赛官方榜） |
| `vex_skills` | `{队号: {rank, driver:{attempts,best}, programming:{attempts,best}, total}}`（driver=手动，programming=自动） |
| `vex_team_names` / `vex_team_grades` | `{队号: 队名}` / `{队号: grade}`（多赛事累积，不清空） |
| `vex_auto_refresh` | 自动刷新开关 '1'/'0'（默认开，数据页每 30s 静默同步） |

## 当前状态速览（2026-11-16，v2.6 双端）

已上线：单按钮全量同步（并行 + per_page=250 + 重试，实测 ~2s）/ 自动刷新 30s / 决赛 F 编号 + 金色标识 / 联队排行榜（资格赛/决赛切换）/ 技能赛排行榜（小学/初中过滤）/ 双排名徽章 / 海报。

待排期（用户已认可的优先级）：数据备份/恢复 → 我的赛程+下一场提醒 → 官方比分条 → 奖项页 → Token 获取指引。
