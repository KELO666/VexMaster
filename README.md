# VEX 赛程管理助手 (VEX Schedule Master)

一款专为 VEX 机器人竞赛教练和队员设计的硬核赛程管理工具。支持 **Android 原生 App** 和 **iOS/PWA** 双端，采用"主干隔离，双线分支"的维护模式。

## 🌟 核心特性

* **多格式 PDF 高速解析**：支持导入赛事官方下发的 PDF 对阵表，自动识别赛区、场地、时间、红蓝方联盟。
* **单队视图与海报生成**：输入己方队伍号，自动过滤该队所有比赛，支持完赛比分记录，一键生成分享海报。
* **大师总表 (Master Timeline)**：统筹多支队伍赛程，按时间流排序，支持"隐藏已赛"、自动标记"NOW (当前待赛)"、按赛区筛选。
* **零延迟本地存储**：数据基于 LocalStorage 实时存储，无需联网，赛场断网环境下依然稳定可靠。
* **红蓝阵线设计**：视觉上沿袭 VEX 经典的红蓝联队色，配合极简几何 UI，信息层级清晰分明。

## 📁 项目结构

```
├── VEX_Master_Android/    # Android 原生版 (HBuilderX 项目)
│   ├── index.html         # 核心代码
│   ├── manifest.json      # HBuilderX 配置
│   └── unpackage/         # 打包产物 (.apk)
│
├── VexMaster/             # iOS/PWA 版本
│   ├── index.html         # 核心代码 (iOS 适配)
│   └── icon.png.png       # 应用图标
│
└── README.md              # 本文件
```

## 🚀 快速开始

### Android 端 (APK)

1. 使用 **HBuilderX** 打开 `VEX_Master_Android` 文件夹。
2. 修改核心代码 `index.html`。
3. 双击 `manifest.json`，确认 App 名称和图标配置。
4. 顶部菜单：`发行` → `原生App-云打包` → 勾选 Android → 使用公共测试证书。
5. 打包完成后，在 `unpackage/release/apk/` 目录下提取 `.apk` 文件。

### iOS 端 (PWA)

1. 将代码推送到 GitHub 仓库。
2. 在 GitHub 仓库的 `Settings > Pages` 中，选择 `main` 分支并保存。
3. 等待 1 分钟后，访问 `https://<your-name>.github.io/<repo-name>/`。
4. 在 Safari 中点击"分享" → "添加到主屏幕"即可安装。

## 📲 iOS 用户安装指南

为了获得最佳体验，建议将应用"安装"到桌面：

1. 在 **Safari 浏览器** 中打开 App 网址。
2. 点击底部的 **"分享"** 按钮（方块带向上箭头）。
3. 在弹出的菜单中下滑，点击 **"添加到主屏幕"**。
4. 回到桌面，点击图标即可进入无边框的沉浸式模式。

## 📂 PDF 导入操作流

由于 iOS 系统的沙盒机制，网页无法直接访问微信内部文件夹，请按照以下标准流程操作：

1. **暂存文件**：在微信群点开 PDF → 点击"用其他应用打开" → 选择 **"存储到'文件'"**。
2. **应用导入**：回到"VEX 大师"App → 点击"导入" → 选择 **"选取文件"** → 选中刚存好的 PDF。

## ⚠️ 重要：双端维护原则

**切勿合并双端代码！**

Android 端使用了 H5+ 专属 API（如 `plus.gallery.save` 直接保存海报到相册），这些代码在 iOS 浏览器环境会直接报错阻断运行。请严格遵守 `VEX_Master_Android` 与 `VexMaster` 分离维护的原则。

| 特性 | Android | iOS |
|---|---|---|
| PDF.js 版本 | v2.16.105 | v2.6.347 (兼容老款iPad) |
| CDN 节点 | cdn.staticfile.net | lib.baomitu.com |
| 海报保存 | plus.gallery.save (直接写入相册) | 引导用户长按保存 |
| 键盘适配 | 无 | focusout 防回弹留白 |

## 🛡️ 隐私与安全说明

* **本地运行**：本工具为纯前端架构，不设后端服务器，不记录任何用户信息。
* **数据隔离**：所有导入的赛程、录入的比分均仅存在于用户本人的设备物理内存中。
* **安全可信**：iOS 版不申请相册写入权限，海报生成采用 Canvas 渲染 + 手动长按保存模式。

## 📝 后续迭代方向

* **数据导出备份**：LocalStorage 存在被误清空的风险，建议加入"导出 JSON 备份"功能。
* **真离线化改造**：将 CDN 依赖（pdf.js、html2canvas）本地化，应对无信号地下体育馆环境。
* **架构升级**：若需深入重构，可考虑引入 Vite + React + TypeScript，或使用 UniApp 跨平台框架。

---

**Designed by Kelo** *致敬每一位在赛场上奔波的教练。愿所有赛队都能发挥出最好的水平！*
