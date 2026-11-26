# Cplayer · CarbonVPlayer

面向 Windows 的校园课间点歌与 B 站 MV 桌面播放器，包名 `carbonv_player`。

[English](README.md) · [下载最新版](https://github.com/DGHH-Skywalker/CPlayer/releases/latest) · [反馈问题](https://github.com/DGHH-Skywalker/CPlayer/issues)

## 下载与安装

在 [GitHub Releases](https://github.com/DGHH-Skywalker/CPlayer/releases/latest) 下载 Windows x64 安装包（setup）或单文件便携版（portable）。每次发布均附源码、构建来源和 `SHA256SUMS.txt`。中国大陆镜像地址列在对应 Release 中；镜像为第三方下载代理，请使用同一版本的校验值核对文件。

当前版本：[Cplayer v1.4.1](docs/releases/v1.4.1.md)，含 Windows x64 安装包、便携版及已完整下载核验的大陆代理链接。

## 主要功能

- **插件中心 / NoiseLimiter**：设置空白处 3 秒内按 5 次 Enter；唯一动态压制，最高强度加强鼓点抑制，覆盖音乐和 B 站音频，支持 JS/ZIP 插件安装与权限管理
- **哔哩Song 定位**：拖动预览、松手定位、缓冲显示与暂停状态保留

- 普通音乐模式：本地音乐、流媒体、歌词、歌单与播放队列
- 校园点歌模式：纯搜索首页、FIFO 队尾点歌、去重、拖拽排序
- 课间调度：上海时区每周作息、特殊日期与停用日期，到上课时间强制停止并清空当前队列
- 独立 B 站浏览器：网页与 MV 剧场、独立登录存储、固定本地 Core、音频协调、浏览数据管理；打开顶部搜索弹窗和普通焦点转移不打断视频
- 实验性「哔哩Song」：将当前 MV 页面加入队列，结束后拦截站点续播并交接下一项
- 独立发布：通过 GitHub Actions 检查、构建和发布，不连接原官方自动更新流程

## 快速开始

1. 打开「设置 → 校园点歌」启用校园模式
2. 自行配置学校实际课间；首次启动没有预设作息
3. 搜索歌曲并点歌，队列支持拖拽调整；上课期间锁定新增和播放
4. 在「B 站与 MV」启用浏览器和所需增强
5. 如需将 MV 入队，开启「哔哩Song（实验性）」，打开视频后点击右下角悬浮按钮「加入队列」

说明：[课程调度](docs/school-scheduler.md)、[浏览器集成](docs/bilibili-integration.md)、[哔哩Song](docs/bilibili-song.md)、[架构](docs/architecture.md)、[测试与未验证项目](docs/testing.md)。真实扬声器截止、实体睡眠恢复和账号登录需要交互式测试机，自动测试不替代现场验收。

## 开发与发布

使用 Node 24.22.1、pnpm 12.15.0 及原生模块所需 Rust 工具链，依赖使用锁文件安装。

```bash
rustup toolchain install 1.100.0
pnpm install --frozen-lockfile
pnpm verify:dynamics
pnpm typecheck
pnpm lint
pnpm test
pnpm build:win --x64 --publish never
```

正式构建在 GitHub Actions Windows runner 完成，包含原生模块、单元测试、DPI 与便携包启动检查。Release 工作流上传安装包、便携版、对应源码、来源记录及校验文件。操作见 [发布维护说明](docs/releasing.md)。真实匿名视频另有独立 Windows 验收工作流。

## 许可与归属

遵循 [AGPL-3.0](LICENSE)，原作者和贡献者保留各自代码版权，来源见 [NOTICE](NOTICE.md)。Core 保留 [MIT 许可](vendor/bilikit/LICENSE) 及 [品牌资产条款](vendor/bilikit/BRAND-ASSETS.md)。平台商标、音乐与视频内容归相应权利人所有。

[插件中心与 SDK](docs/plugins/center.md) · [NoiseLimiter](docs/noiselimiter.md) · [v1.4.1](docs/releases/v1.4.1.md)

[渐进启动与按需加载](docs/startup-loading.md)：先准备播放与歌词，优先分发历史歌曲恢复，设置和非核心弹窗按点击加载。

DSP 浏览器资源固定分发，应用构建仅校验；修改 DSP 时在 Linux / WSL 安装 `wasm32-unknown-unknown` 后运行 `pnpm build:dynamics`，提交 WASM 和清单。正式 Release 会在 Linux CI 重建核对。
