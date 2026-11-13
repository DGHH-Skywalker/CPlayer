# 验证记录

## 环境与基线

Linux，Node 24.22.1、工程指定 pnpm 12.15.0、Electron 44.10.1。原始提交 6b26b685f67cfac9d3233747b399255620f45b87 在独立 worktree 运行：Node 53/53，Web 590/590，类型检查通过。

安装时预装 pnpm 11.25.0 不满足约束，使用 Corepack 安装指定版本。Electron 下载需继承代理，安装完成后原生 SQLite 重建成功。当前 Linux 缺 Rust、ALSA/DBus/Pulse/PipeWire 开发包；Windows 完整打包由 GitHub Actions 原生 runner 执行。

## 已完成的最终本地验证

| 检查                              | 结果                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- |
| pnpm typecheck                    | Node 与 Web 均通过                                                      |
| pnpm lint                         | 通过，0 errors                                                          |
| pnpm test:node                    | 53 项全部通过                                                           |
| pnpm test:web                     | 80 个文件、629 项全部通过                                               |
| pnpm test:electron                | Electron 44.10.1 真实文档、子域、跨进程框架和 Session 隔离验证通过      |
| Core 上游 pnpm test               | 19 个文件、107 项全部通过                                               |
| node scripts/verify-bilikit.mjs   | 固定资源 SHA-256 通过                                                   |
| SKIP_NATIVE_BUILD=true pnpm build | Electron 主进程、preload 与全部 Vue 生产编译通过；不包含 Linux 原生模块 |
| 本地 pnpm build                   | Rust 工具链缺失，原生构建阶段失败，转由 Windows Actions 完整构建        |

功能测试覆盖 FIFO、去重、人工排序、课间边界、启动清理、跨午夜、特殊日期、周期间冲突、停用日期不能掩盖周表重叠、系统时间跳变、睡眠后跨入新课间、重复确认、未确认清理重投、旧写入迟到、Vue 代理快照、恢复与清空并发、迟到历史恢复、迟到状态与曲尾事件、MV 恢复所有权和安全导航。

Windows Actions 已验证所有 Rust 模块、类型、Lint、单元测试和真实 Electron fixture。前两轮在 NSIS 打包处发现默认头图缺失、未初始化句柄引发的严格警告，已分别修复。

## 最终 Windows 构建与下载

- 产品代码提交：`29c67cb41cea75035fa3d667e7f4a6b14c5b52a5`
- 分支：`feat/carbonv-school`，仓库：<https://github.com/DGHH-Skywalker/CPlayer>
- Actions：<https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43454412395>
- 完成时间：2026-11-13 15:52:48 UTC，结论 success
- 下载：<https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43454412395/artifacts/14053439420>
- Artifact 名称：`Cplayer-Windows-x64-29c67cb41cea75035fa3d667e7f4a6b14c5b52a5`，大小 232570551 字节，保留 30 天
- Artifact ZIP SHA-256：`f742c49fd8e435acdac074d84cc4e360028b93f5eae81c27cde0279344ea84bf`
- 安装包：`Cplayer-1.2.1-x64-setup.exe`
- 便携版：`Cplayer-1.2.1-x64-portable.exe`

| 文件     | SHA-256                                                            |
| -------- | ------------------------------------------------------------------ |
| setup    | `aed02ae17aa175f3173e2dd6a5e5c12b527e7bc94c6d74b7c5dbcff6dd2f0658` |
| portable | `b012d1c22e9b90e96c0578fbce0a428ea56d53a42ac3f686c88d6b759cdb7e49` |

该轮在 Windows 原生 runner 完成全部 Rust 模块构建、类型检查、Lint、53 项 Node 和 629 项 Web 测试、真实 Electron 隔离及提前注入验证、NSIS 和 portable 打包。随后实际启动生成的 portable EXE，确认打包后的 preload 可用、校园空时间表进入 CLASS、原生播放被拒绝、打包 Core 为 0.5.35，并关闭校园模式恢复 DISABLED。Actions 的便携版检查步骤输出 `success=true`、`packagedPreload=true`、`classGate=true`；artifact 内的 portable-smoke.log 本轮为空，检查结论以该步骤日志为准。

两个 EXE 未配置代码签名证书。NSIS 已成功生成，安装、卸载向导的人工交互尚未执行。最终文档提交不改变上述产品代码，使用 `[skip ci]` 避免重复打包。

## 需要 Windows / 实际账号验收

1. 下载 Actions 的 setup 或 portable EXE，启动普通模式播放本地歌曲，检查搜索、歌词、音频输出和拖拽
2. 开启校园模式，配置上海时区当前分钟附近的实际测试课间，依次点 A/B/C，重复 B 不改变顺序
3. 在正在播放、加载、预载、交叉过渡、空队列残留音频、最小化和托盘场景到达结束点，确认扬声器立即静音，队列为空
4. 上课期间分别用 UI、插件、外部 API、媒体键、快捷键和快速连续点击尝试播放，应保持锁定
5. 睡眠越过结束点后唤醒，课间内重启及上课中重启，应不恢复旧音乐；校验永久歌单和本地文件保留
6. B 站内搜索、播放、登录、评论、弹幕、退出、真实 1080P 试看和 SPA 跳转；切换 Core 及 no-login 开关后刷新验收
7. 100% / 125% / 150% DPI、应用缩放、侧栏折叠、设置弹窗、视频全屏和退出全屏，确认原生视图边界与遮挡正确
8. MV 自动暂停后，手动暂停音乐再结束 MV 不恢复；上课后所有 MV 事件不得恢复音乐
9. 清除 B 站数据后验证账号退出，音乐平台账号、音乐队列、永久歌单和时间表保持

未执行的物理音频、真实账号和 Windows 交互不得标记为已通过。

## Electron 44 实测

已在 Linux Xorg dummy 显示服务中运行 `pnpm test:electron`，返回 success=true：首个页面脚本读取到主世界提前注入标记；同源 iframe、B 站子域、独立进程的非白名单 iframe 均验证注入或过滤行为；子域导航、SPA pushState、免登录开关 true/false、Core 禁用后原生文档、远程页 require 不可用、Cookie 隔离及清理范围均通过。

该测试使用受控 HTTPS fixture，不访问真实账号，不代表 B 站实时接口或 1080P 已验证。为初始化 CDP，先加载本地 about:blank；在首次远程 B 站导航前完成注册。最初直接对无文档 WebContentsView 执行 Page.enable 会等待，这一实测问题已修复。

固定 Core 上游测试：19 个文件、107 项通过。资源 SHA-256：`5f7d1fe6d76138fd1ce1ea8a756f9fc5a0b69c7d7e52219fb06f570ffd52de2f`。

同一受控文档中，Core 关闭与开启后 `app.getAppMetrics()` 的各进程工作集总和分别约 490.7 MiB、503.0 MiB，增加约 12.3 MiB。此为短时 fixture 样本，包含 Browser、GPU、Utility 及 iframe 进程，不代表真实 B 站长期运行占用或完整应用性能基准；长期使用应继续观察应用启动 60 秒及每 10 分钟的现有内存日志。

## 真实 B 站访问记录

在全新、未登录的内存 Session 中实测，B 站首页与 nav 接口 HTTP 200，页面可完整加载。采用标准桌面 Chromium 标识、关闭 Core 时，公开视频实际解码播放：readyState=4，分辨率 494×360，SESSDATA 不存在，远程页面 require 不可用。

开启 Core 与免登录增强后，主世界提前注入已确认，playurl 接口 HTTP 200、CDN 范围请求 HTTP 206，但所测视频在观察时间内未输出解码帧；1080P 试看不能记为通过。热门列表接口另观察到 code=-352，旧测试视频链接曾跳转站点错误页。真实账号登录/退出、其他视频、弹幕和评论交互、增强清晰度仍按上方人工步骤验收。关闭 Core 的原生网页和基本播放已实测可用。
