# 📘 VEX 赛程管理助手 (VEX Schedule Master) - 开发者交接文档

## 1. 项目背景与业务逻辑
本项目专为高强度的 VEX 机器人赛事现场统筹而开发。教练在带队征战线下赛事（尤其是网络信号极差的地下体育馆）时，面临赛程分发滞后、比分统计混乱的痛点。
系统设计了两种核心驱动模式：
*   **纯离线模式 (v1.0 基石)**：完全依赖本地解析与 LocalStorage。教练通过微信群导入 PDF 赛程，系统自动生成对阵表，确保在零网络环境下依然能稳健运行。
*   **云端双擎模式 (v2.0 核心)**：通过接入 VEX 官方 API，输入赛事 SKU (如 `RE-VIQRC-...`) 与 API Token，一键拉取全量赛程与完赛比分，并自动与本地数据库静默合并。

## 2. 核心架构与目录规范 (⚠️ 绝对红线)
本项目采用了**"主干隔离，双线分支，切勿合并"**的双轨开发架构。未来任何开发者接手，**严禁将双端代码混用或强制合并**，否则将引发致命的原生 API 冲突。

*   📁 **`VEX_Master_Android/` (Android 原生端)**
    *   **运行环境**：依赖 HBuilderX 容器，使用 H5+ 原生生态。
    *   **核心特性**：调用了 `plus.gallery.save` 等原生底层 API，用于将战报海报一键无损保存至手机相册。
    *   **发布方式**：通过 HBuilderX 云打包生成 `.apk` 文件。
*   📁 **`VexMaster/` (iOS / PWA 网页端)**
    *   **运行环境**：纯 Web 架构，依托 GitHub Pages 部署。
    *   **核心特性**：利用 Safari 浏览器的"添加到主屏幕"功能，实现免 App Store 审核的类原生 App 体验（PWA）。海报保存依赖长按呼出系统分享菜单。
    *   **发布方式**：Git 推送至 `main` 分支触发自动部署。

## 3. 存储字典与状态流转
双端进行了严格的物理隔离，LocalStorage 的 Key 绝不互通。
*   **Android 端字典**：`vex_matches`, `vex_scores`, `vex_done`, `vex_teams`
*   **iOS 端字典**：`vex_matches_ios`, `vex_scores_ios`, `vex_done_ios`, `vex_teams_ios`

**🔄 数据流转核心逻辑 (VexApiSync 模块)**：
云端拉取模块 (`vex-api-sync.js`) 负责处理网络请求与本地持久化。它在获取数据后会重写 LocalStorage。
**注意**：写入 LocalStorage 后，必须同步调用 `JSON.parse` 更新运行在内存中的全局变量（如 `globalMatches`, `scoresDb`, `doneDb`），并触发全量重绘函数（如 `renderMasterTimeline()`），否则会导致"硬盘已更新，内存为空，UI 不渲染"的 Bug。

## 4. 历史踩坑与防雷指南 (Troubleshooting)
后续开发者在迭代时，请务必留意以下已知的"深水区"：
1.  **Safari 缓存黑洞**：iOS 端更新代码并推送到 GitHub 后，Safari 存在极强的强缓存。调试新版时，**务必使用"无痕浏览"模式**测试，或手动清除浏览器历史数据，否则会永远看到旧版页面。
2.  **GitHub Pages 寻址陷阱**：项目部署在根目录，但 iOS 入口位于子文件夹 `VexMaster/`。访问时必须通过包含子目录的完整 URL（或利用根目录下的 `index.html` meta refresh 标签进行重定向），否则 GitHub 默认渲染 README.md。
3.  **Android 真机调试拦截**：在使用 HBuilderX 进行 `运行到手机` 联调时，常见国产品牌手机（如小米、vivo）会触发 `INSTALL_FAILED_USER_RESTRICTED` 报错。必须在开发者选项中开启"USB 安装"并关闭"外部来源安全拦截"。
4.  **API 自动分页**：VEX 官方 API 单次拉取上限受限。`vex-api-sync.js` 内部已实现基于 `meta.last_page` 的自动循环抓取逻辑，请勿随意更改此处的异步 Promise 链。

---
> Designed by Kelo
> 愿所有赛队都能发挥出最好的水平！保持从容，享受比赛！
