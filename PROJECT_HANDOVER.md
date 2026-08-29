# 📘 VEX 赛程管理助手 (VEX Schedule Master) - 开发者交接文档

> **版本**: v2.1 | **最后更新**: 2026-08-29 | **维护者**: Kelo

---

## 1. 项目背景与业务逻辑

本项目专为高强度的 VEX 机器人赛事现场统筹而开发。教练在带队征战线下赛事（尤其是网络信号极差的地下体育馆）时，面临以下痛点：

*   赛程分发滞后（微信群发 PDF 容易遗漏）
*   比分统计混乱（手动记录容易出错）
*   网络不稳定导致数据丢失

系统设计了两种核心驱动模式：

| 模式 | 版本 | 数据来源 | 适用场景 |
|------|------|----------|----------|
| **📶 纯离线模式** | v1.0 基石 | 本地 PDF 解析 + LocalStorage | 体育馆无网络环境 |
| **🌐 云端双擎模式** | v2.0 核心 | VEX 官方 API + 本地兜底 | 赛前联网拉取完整赛程 |
| **🔥 多赛区并发模式** | v2.1 核心 | 多 SKU + 多 Division + 排名 | 大型赛事多组别聚合 |

---

## 2. 核心架构与目录规范 (⚠️ 绝对红线)

本项目采用了 **"主干隔离，双线分支，切勿合并"** 的双轨开发架构。未来任何开发者接手，**严禁将双端代码混用或强制合并**，否则将引发致命的原生 API 冲突。

### 📱 Android 原生端 (`VEX_Master_Android/`)

| 属性 | 说明 |
|------|------|
| **运行环境** | HBuilderX 容器 + H5+ 原生生态 |
| **核心特性** | 调用 `plus.gallery.save` 等原生 API，海报直接保存到系统相册 |
| **发布方式** | HBuilderX 云打包 → `.apk` 文件 |
| **PDF.js 版本** | v2.16.105 (最新稳定版) |
| **CDN 节点** | cdn.staticfile.net |
| **键盘适配** | 无特殊处理 |

**Android 专属能力**：
*   `plus.gallery.save` — 海报一键无损保存至手机相册
*   `plus.io` — 本地文件读写（如有需要）
*   原生 Toast 提示

### 🍎 iOS / PWA 网页端 (`VexMaster/`)

| 属性 | 说明 |
|------|------|
| **运行环境** | 纯 Web 架构，GitHub Pages 部署 |
| **核心特性** | Safari "添加到主屏幕" 实现免审核类原生体验 (PWA) |
| **发布方式** | Git 推送 → GitHub Pages 自动部署 |
| **PDF.js 版本** | v2.6.347 (兼容老款 iPad) |
| **CDN 节点** | lib.baomitu.com (360 企业级节点，防 Safari 拦截) |
| **键盘适配** | `focusout` 事件监听，防回弹留白 |

**iOS 专属适配**：
*   海报保存：引导用户长按图片 → 系统分享菜单 → 保存到相册
*   键盘防回弹：`window.scrollTo(0, document.body.scrollTop)` 强制复位
*   CDN 节点替换：所有外部组件使用 `lib.baomitu.com`，防止 iCloud 代理拦截

---

## 3. 项目目录与文件清单

```
VEX_Schedule_Master/
│
├── 📄 README.md                    # 项目说明文档 (v2.0)
├── 📄 PROJECT_HANDOVER.md          # 本文件 - 开发者交接文档
├── 📄 CHANGELOG.md                 # 迭代日志 (时间倒序)
├── 📄 EXECUTION_LOG.md             # 执行日志 (操作记录)
├── 📄 index.html                   # GitHub Pages 根入口 (自动跳转至 VexMaster/)
│
├── 📁 VEX_Master_Android/          # ===== Android 原生端 =====
│   ├── 📄 index.html               # 核心主页面 (940 行)
│   │                              #   - PDF 解析引擎
│   │                              #   - 单队视图 / 大师总表
│   │                              #   - 云端同步 UI (Token + SKU 输入框)
│   │                              #   - 海报生成 (Canvas)
│   │                              #   - LocalStorage 读写
│   │
│   ├── 📄 vex-api-sync.js          # API 通信模块 (522 行)
│   │                              #   - fetchEventId(): SKU → 赛事 ID
│   │                              #   - fetchMatchesData(): 获取比赛数据 (自动分页)
│   │                              #   - syncScoresToLocal(): 比分静默合并
│   │                              #   - generateScheduleFromApi(): 云端生成赛程
│   │                              #   - runFullSync(): 一键同步入口
│   │
│   ├── 📄 manifest.json            # HBuilderX 应用配置
│   ├── 📁 css/                     # 样式文件 (预留)
│   ├── 📁 js/                      # 脚本文件 (预留)
│   ├── 📁 img/                     # 图标资源
│   │   └── 📄 VEX_App_Icon_1024.png  # 应用图标 (1024x1024)
│   ├── 📁 .hbuilderx/              # HBuilderX 项目配置
│   └── 📁 unpackage/               # 打包产物目录
│       └── 📁 cache/wgt/           # 缓存的 wgt 包
│
├── 📁 VexMaster/                   # ===== iOS / PWA 网页端 =====
│   ├── 📄 index.html               # 核心主页面 (单文件架构)
│   │                              #   - PDF 解析引擎 (pdf.js v2.6.347)
│   │                              #   - 单队视图 / 大师总表
│   │                              #   - 云端同步 UI (Token + SKU 输入框)
│   │                              #   - 海报生成 (Canvas + 长按保存)
│   │                              #   - 键盘防回弹适配
│   │                              #   - LocalStorage 读写 (_ios 后缀)
│   │
│   ├── 📄 vex-api-sync.js          # API 通信模块 (522 行)
│   │                              #   - 与 Android 版逻辑相同
│   │                              #   - 但使用 _ios 后缀的 LocalStorage Key
│   │
│   ├── 📄 icon.png.png            # PWA 应用图标
│   └── 📄 VEX_Schedule_Master_Handover.md  # 早期交接文档 (v1.0)
│
└── 📁 .freebuff/                   # Freebuff 配置
    └── 📄 run.md                   # 预览运行文档
```

---

## 4. 存储字典与状态流转

双端进行了严格的物理隔离，LocalStorage 的 Key 绝不互通。

### Android 端字典

| Key | 数据类型 | 说明 |
|-----|----------|------|
| `vex_matches` | `Array<Object>` | 赛程数据数组 |
| `vex_scores` | `Object` | 比分数据库，格式: `{ "Q1_53168C": "236" }` |
| `vex_done` | `Object` | 完赛状态，格式: `{ "Q1": true }` |
| `vex_teams` | `Array<String>` | 关注队伍列表 |
| `vex_current_team` | `String` | 当前查看的队伍号 |
| `vex_api_token` | `String` | API Bearer Token |
| `vex_event_sku` | `String` | 赛事 SKU (JSON 数组，支持多 SKU) |
| `vex_rankings` | `Object` | 排名数据库，格式: `{ "53168C": 1, "12345A": 12 }` |

### iOS 端字典

| Key | 数据类型 | 说明 |
|-----|----------|------|
| `vex_matches_ios` | `Array<Object>` | 赛程数据数组 |
| `vex_scores_ios` | `Object` | 比分数据库，格式: `{ "Q1_53168C": "236" }` |
| `vex_done_ios` | `Object` | 完赛状态，格式: `{ "Q1": true }` |
| `vex_teams_ios` | `Array<String>` | 关注队伍列表 |
| `vex_current_team_ios` | `String` | 当前查看的队伍号 |
| `vex_api_token_ios` | `String` | API Bearer Token |
| `vex_event_sku_ios` | `String` | 赛事 SKU (JSON 数组，支持多 SKU) |
| `vex_rankings_ios` | `Object` | 排名数据库，格式: `{ "53168C": 1, "12345A": 12 }` |

### 单场比赛数据结构

```json
{
  "matchId": "Q1",
  "field": "Field A",
  "time": "周六 10:00 AM",
  "timeValue": 600,
  "team1": "53168C",
  "team2": "12345A",
  "division": "初中"
}
```

### 比分数据库 Key 格式

```
${matchId}_${team}  →  如 "Q1_53168C"
```

---

## 5. 核心模块说明

### vex-api-sync.js (API 通信模块)

该模块是 v2.0 的核心新增，负责与 VEX Events 官方 API 通信。

| 函数 | 功能 | API 端点 |
|------|------|----------|
| `fetchEventId(sku, token)` | 通过 SKU 获取赛事信息 (含 divisions 列表) | `GET /events?sku={sku}` |
| `fetchMatchesData(eventId, divisionId, token)` | 获取指定赛区比赛数据 (自动分页) | `GET /events/{eventId}/divisions/{divId}/matches` |
| `fetchRankings(eventId, divisionId, token)` | 获取指定赛区排名数据 | `GET /events/{eventId}/divisions/{divId}/rankings` |
| `syncScoresToLocal(apiMatches)` | 比分静默合并到本地 | — |
| `mergeRankingsToLocalStorage(apiRankings)` | 排名数据合并到本地 ({ 队伍号: 排名 }) | — |
| `generateScheduleFromApi(apiMatches)` | 云端数据生成本地赛程 (读取 `_divisionName`) | — |
| `runFullSync(sku, token)` | 一键同步 (单 SKU，多赛区遍历 + 排名抓取) | — |
| `formatDivisionName(eventName, divName)` | 赛区名称极简净化 (如 `小学组 A区`) | — |

**多赛区嵌套遍历**：`runFullSync` 内部先获取 `eventInfo.divisions` 列表，再对每个赛区独立调用 `fetchMatchesData` + `fetchRankings`，最后合并全量数据统一写入。

**自动分页逻辑**：读取响应体中的 `meta.last_page`，自动循环追加请求 `?page=2`, `?page=3`... 直到获取全量数据。

---

## 6. 历史踩坑与防雷指南 (Troubleshooting)

后续开发者在迭代时，请务必留意以下已知的"深水区"：

### 🔴 高危问题

1. **内存状态不同步 Bug**
   - **症状**：数据已写入 LocalStorage，但 UI 不渲染
   - **原因**：只更新了 localStorage，未更新内存中的全局变量
   - **修复**：写入 localStorage 后，必须调用 `JSON.parse` 更新 `globalMatches`, `scoresDb`, `doneDb`，并触发 `renderMasterTimeline()`

2. **Safari 缓存黑洞**
   - **症状**：推送新代码后，Safari 永远显示旧版页面
   - **修复**：使用"无痕浏览"模式测试，或手动清除浏览器历史数据

### 🟡 中等问题

3. **GitHub Pages 寻址陷阱**
   - **症状**：根目录访问显示 README 而非 App
   - **修复**：根目录 `index.html` 使用 `<meta http-equiv="refresh">` 重定向至 `./VexMaster/`

4. **Android 真机调试拦截**
   - **症状**：`INSTALL_FAILED_USER_RESTRICTED` 报错
   - **修复**：开发者选项 → 开启"USB 安装" + 关闭"外部来源安全拦截"

5. **API Token 安全**
   - **注意**：Token 仅存储在本地 LocalStorage，不上传至任何第三方服务器
   - **建议**：不要在公共设备上保存 Token

### 🟢 低风险

6. **API 自动分页**
   - VEX 官方 API 单次拉取上限受限
   - `vex-api-sync.js` 内部已实现基于 `meta.last_page` 的自动循环抓取逻辑
   - **请勿随意更改此处的异步 Promise 链**

7. **PDF.js 版本差异**
   - Android 使用 v2.16.105，iOS 使用 v2.6.347
   - iOS 降级是为了解决老款 iPad 白屏问题
   - **请勿统一版本，否则会引发兼容性问题**

---

## 7. 开发工作流

### 新增功能的标准流程

1. **确认目标端**：明确是 Android 端、iOS 端还是双端都需要
2. **修改对应目录**：只在 `VEX_Master_Android/` 或 `VexMaster/` 中操作
3. **测试验证**：
   - Android: HBuilderX → 运行到手机
   - iOS: 本地服务器 → Safari 无痕浏览
4. **更新日志**：在 `EXECUTION_LOG.md` 最前面追加执行记录
5. **提交代码**：`git add` → `git commit` → `git push`

### 代码冻结原则

*   v1.0 稳定版代码（PDF 解析、单队视图、大师总表）**禁止随意修改**
*   新功能开发在独立分支进行，测试通过后再合并
*   双端代码**绝对不能合并**

---

> Designed by Kelo
> 愿所有赛队都能发挥出最好的水平！保持从容，享受比赛！
