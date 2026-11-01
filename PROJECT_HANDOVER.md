# 📘 VEX 赛程管理助手 (VEX Schedule Master) - 开发者交接文档

> **版本**: v2.2 (双端) | **最后更新**: 2026-10-28 | **维护者**: Kelo

---

## 0. 当前状态快照 (⭐ 接手必读，2026-10-28)

### 版本状态：v2.2 双端迭代完成，待打包 → 提交

本轮迭代 = **v2.1.1 排名修正 + v2.2 分区排行榜**，双端代码已全部完成，**尚未 git commit**。测试与操作明细全部记录在 `EXECUTION_LOG.md`（最新在上），本文件只保留交接必需信息。

| 迭代 | 内容 | 状态 |
|------|------|------|
| v2.1.1 排名修正 | 排名接口自动分页（不丢第 2 页后队伍）、`rankingsort1`(积分) 不再当排名、多赛区排名冲突仲裁、`window.VexApiSync` 挂载语句修复 | ✅ 双端完成，真实赛事验证 |
| v2.2 分区排行榜 | 底部「总表」→「🏆 排行」官方分区积分榜（VEX Via 样式） | ✅ 双端完成，真实赛事 VE-IQ-26-65732 验证 |
| Android 打包 | manifest 已升 `2.2` / code `101`；⚠️ 公共测试证书被 DCloud 停用，见下方打包指南 | ⬜ 用户手动打包中 |

### v2.2 分区排行榜（新功能要点）

* 页面：每行 = 名次(🥇🥈🥉/#N) + 队号 + 队名(超长截断) + 官方均分(整数)；右上角切分区；未开赛分区提示暂无数据；点队伍 → 单队视图看对阵详情
* 数据链路：`runFullSync` / `pullFullSchedule` → `fetchRankings`（整分区全量）+ `fetchTeamNames`（队名映射）→ `mergeRankingsToLocalStorage(data, divisionName)` 写入 `vex_rankings_detail(_ios)` → `renderLeaderboard()` 渲染
* 每次同步**整赛区覆盖** → 比赛过程中点「云端同步比分」即实时刷新榜单（含名次回落）
* 无官方榜单时（纯 PDF 导入场景）自动回退为「本地对阵 + 比分推算」版

### Android 打包指南（当前卡点与操作步骤）

**卡点**：DCloud 已停用「公共测试证书」（旧 APK 正是此证书签名，实测报错 `Android公共测试证书存在安全隐患，新应用不再支持`）。**改用其他证书后签名变化，手机上需先卸载旧版 App 再装新 APK。**

推荐顺序：
1. **云端证书**（打包对话框选「使用云端证书」，DCloud 托管免管理）。注意 CLI 帮助标注「仅适用于 uni-app 项目」，本项目是 5+ App，若 GUI 不提供该选项则走方案 2
2. **自有证书**：无 keystore 时用 JDK `keytool` 生成一个并妥善保管（以后换电脑打包必须带证书文件 + 别名 + 两个密码）

打包操作：HBuilderX 打开 `VEX_Master_Android` → 菜单「发行」→「原生App-云打包」→ 勾选 Android → 选证书 → 打包。产物在 `unpackage/release/apk/`。

**CLI 备选**（已验证可用）：`/Applications/HBuilderX.app/Contents/MacOS/cli`
```
cli project open --path /Users/jc/Documents/GitHub/VexMaster/VEX_Master_Android
cli pack --project /Users/jc/Documents/GitHub/VexMaster/VEX_Master_Android --platform android --android.packagename plus.H566AF74B --android.androidpacktype 0   # 0=自有证书, 需补证书参数
cli pack status
```
坑：HBuilderX **GUI 未登录**时 `pack` 会报 `user not login`（即使 `cli user info` 显示已登录——那是缓存）。包名沿用 `plus.H566AF74B`。

### 接手必读

* **改动验证**：任何涉及排名/同步逻辑的修改，必须跑 `node .zcode/test_rankings.js`（三份代码拷贝 × 6 组场景回归测试，0 依赖 Node 脚本）
* **测试/操作明细**：见 `EXECUTION_LOG.md`（最新在上）；本文件不记录测试日志
* **未提交清单**：`VexMaster/index.html`、`VexMaster/vex-api-sync.js`、`VEX_Master_Android/index.html`、`VEX_Master_Android/vex-api-sync.js`、`VEX_Master_Android/manifest.json`、两份 md 文档、`.zcode/`（测试脚本）
* 双端红线不变：代码严禁互混；iOS 的 `index.html` 内联副本与 `vex-api-sync.js` 是同一逻辑两份拷贝，改一处必须同步另一处

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
| **🏆 分区排行榜** | v2.2 核心 | 排名接口全量榜单 + 赛事队伍接口队名 | 赛中实时掌握每个分区的官方排名与均分 |

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
│   │                              #   - 单队视图 / 分区排行榜 (v2.2)
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
│   │                              #   - 单队视图 / 分区排行榜 (v2.2)
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
| `vex_rankings_detail` | `Object` | 分区官方榜单，格式: `{ "小学组 ES B": [{rank, team, name, avg}] }` |
| `vex_team_names` | `Object` | 队名映射，格式: `{ "5366A": "ALCTRON VEX CLUB" }`（多赛事累积） |

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
| `vex_rankings_detail_ios` | `Object` | 分区官方榜单，格式: `{ "小学组 ES B": [{rank, team, name, avg}] }` |
| `vex_team_names_ios` | `Object` | 队名映射，格式: `{ "5366A": "ALCTRON VEX CLUB" }`（多赛事累积） |

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
| `fetchRankings(eventId, divisionId, token)` | 获取指定赛区排名数据（**自动分页**，返回整赛区全量排名） | `GET /events/{eventId}/divisions/{divId}/rankings` |
| `fetchTeamNames(eventId, token)` | 拉取全赛事队名映射 `{队号: 队名}`（自动分页；排名接口不含队名，队名只能从这里拿） | `GET /events/{eventId}/teams` |
| `syncScoresToLocal(apiMatches)` | 比分静默合并到本地 | — |
| `mergeTeamNamesToLocalStorage(map)` | 队名映射累积入库 (`vex_team_names(_ios)`，多赛事 merge 不清空) | — |
| `mergeRankingsToLocalStorage(apiRankings, divisionName)` | ① 扁平排名库 `{队号: 名次}`（带多赛区仲裁）；② 传入 `divisionName` 时额外写**分区官方榜单**到 `vex_rankings_detail(_ios)`，每次同步整赛区覆盖 | — |
| `generateScheduleFromApi(apiMatches)` | 云端数据生成本地赛程 (读取 `_divisionName`) | — |
| `runFullSync(sku, token)` | 一键同步 (单 SKU：队名 → 多赛区遍历比赛+排名+榜单 → 比分) | — |
| `formatDivisionName(eventName, divName)` | 赛区名称极简净化 (如 `小学组 A区`) | — |

**VEX API 实测字段事实（2026-10-28 用真实赛事验证，编码时勿凭猜测）**：

* 排名接口条目：`rank`(名次)、`team.name`(队号)、`average_points`(**官方 Avg. Points**，如 279.67)、`high_score`、`wins/losses/ties`、`wp/ap/sp`。**排名接口不含队名**（team 对象只有 id/name/code）
* 队伍接口条目：`number`(队号)、`team_name`(队名)、`organization`、`grade`、`location`
* 均分提取优先级：`average_points` > `avg_score` > `average` > `rankingsort1`（仅兜底）
* 认证：Bearer Token；未认证请求一律 401/404。**凭猜测写的字段名在真实接口上就是 null**——改动前先打真实接口确认

**多赛区嵌套遍历**：`runFullSync` 内部先获取 `eventInfo.divisions` 列表，再对每个赛区独立调用 `fetchMatchesData` + `fetchRankings`，最后合并全量数据统一写入。队名映射每个赛事只抓一次（赛区循环外）。

**自动分页逻辑**：比赛/排名/队伍三个接口均读取响应体中的 `meta.last_page`，自动循环追加 `?page=2`, `?page=3`... 直到获取全量数据。

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

3. **排名接口分页陷阱（v2.1.1 修复）**
   - **症状**：大赛区只有部分队伍有排名，且毫无报错
   - **原因**：`/rankings` 端点与 `/matches` 一样按 `meta.last_page` 分页，v2.1 只请求了第 1 页
   - **修复**：`fetchRankings` 已改为 do-while 自动翻页，**请勿删掉该循环**

4. **`rankingsort1` 不是排名（v2.1.1 修复）**
   - **症状**：排名徽章显示的数字异常大（是排序积分而非名次）
   - **原因**：旧兜底逻辑 `entry.rank || entry.rankingsort1`，在 `rank` 缺失时会错误地把积分当排名入库
   - **修复**：只信任 `entry.rank`，`parseInt` 校验无效即跳过。**不要恢复 rankingsort1 兜底**

5. **多赛区排名覆盖冲突（v2.1.1 修复）**
   - **症状**：同一队伍的排名在 Final 赛区显示为小名次（如第 3），覆盖了 Division A 的大分区真实名次（如第 15）
   - **原因**：多赛区合并时后处理赛区直接覆盖字典
   - **修复**：`mergeRankingsToLocalStorage` 内用 `rankSourceSize`（模块级内存缓存）记录每个排名来源赛区的队伍总数，仅当新赛区规模 ≥ 来源赛区时才覆盖
   - **注意**：`rankSourceSize` 是内存态，页面刷新后清空，下次同步会重建，属预期行为

6. **注释行吞掉 `window.VexApiSync` 挂载（v2.1.1 修复）**
   - **症状**：外部 `<script src="vex-api-sync.js">` 引入时报 `VexApiSync is not defined`，而内联副本正常
   - **原因**：`VexMaster/vex-api-sync.js` 中 `// ===...===` 分隔注释与 `window.VexApiSync = {` 被合并到了同一行，赋值语句整行变成注释
   - **修复**：已分离换行。类似的分隔注释下方首行请勿与注释同行书写

### 🟡 中等问题

7. **GitHub Pages 寻址陷阱**
   - **症状**：根目录访问显示 README 而非 App
   - **修复**：根目录 `index.html` 使用 `<meta http-equiv="refresh">` 重定向至 `./VexMaster/`

8. **Android 真机调试拦截**
   - **症状**：`INSTALL_FAILED_USER_RESTRICTED` 报错
   - **修复**：开发者选项 → 开启"USB 安装" + 关闭"外部来源安全拦截"

9. **API Token 安全**
   - **注意**：Token 仅存储在本地 LocalStorage，不上传至任何第三方服务器
   - **建议**：不要在公共设备上保存 Token

### 🟢 低风险

10. **API 自动分页**
   - VEX 官方 API 单次拉取上限受限
   - `vex-api-sync.js` 内部已实现基于 `meta.last_page` 的自动循环抓取逻辑
   - **请勿随意更改此处的异步 Promise 链**

11. **PDF.js 版本差异**
   - Android 使用 v2.16.105，iOS 使用 v2.6.347
   - iOS 降级是为了解决老款 iPad 白屏问题
   - **请勿统一版本，否则会引发兼容性问题**

### 🔵 打包与实测知识（2026-10-28 增补）

12. **Android 公共测试证书已被 DCloud 停用**
    - **症状**：云打包报错 `Android公共测试证书存在安全隐患，新应用不再支持使用此证书提交打包`
    - **背景**：本应用旧 APK（`unpackage/release/apk/` 下的历史产物）正是公共测试证书签名
    - **影响**：改用云端证书/自有证书后签名变化，**手机上必须先卸载旧版再安装新 APK**，否则签名冲突装不上
    - **方案**：优先云端证书（5+ App 可能不提供，见第 0 节打包指南），其次自有证书（keytool 生成并妥善保管）

13. **HBuilderX CLI 打包的登录坑**
    - `cli pack` 报 `user not login` 时，先看 HBuilderX **主界面右上角**是否显示「未登录」——`cli user info` 读的是本地缓存，不作数
    - 修复：GUI 登录一次即可，CLI 与 GUI 共享会话

14. **浏览器验证排行榜的注意事项**
    - 本地验证：仓库根目录 `python3 -m http.server 8899`，访问 `http://127.0.0.1:8899/VexMaster/`（iOS）/ `http://127.0.0.1:8899/VEX_Master_Android/`（Android，普通浏览器可加载，`plus.*` 只在海报保存时调用）
    - 验证注入的 mock 数据会覆盖 LocalStorage，正式使用前点「清空所有数据」+ 重新云端拉取
    - iOS 端务必用无痕窗口：Safari 缓存黑洞（见 #2）会让人误判「改了没生效」

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

*   v1.0 稳定版代码（PDF 解析、单队视图）**禁止随意修改**（v2.2 起总表已被分区排行榜替换）
*   新功能开发在独立分支进行，测试通过后再合并
*   双端代码**绝对不能合并**

---

> Designed by Kelo
> 愿所有赛队都能发挥出最好的水平！保持从容，享受比赛！
