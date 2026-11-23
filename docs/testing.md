# 验证记录

## 2026-11-20 v1.3.2 搜索失焦

[正式 Release](https://github.com/DGHH-Skywalker/CPlayer/releases/tag/v1.3.2) 已公开。[发布工作流](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/44677415052) 的 prepare、Windows 与 publish 全部 success，包括类型、Lint、全量测试、文档、Electron 与 DPI、原生模块、打包和实际便携版启动。公开验收 JSON 记录 `searchFocusPlayback=true`、`overlayClassGate=true`，既有 `bilibiliLayout`、`floatingSongButton`、`classGate` 均 true。

安装包（122452939 字节）和便携版（110835944 字节）已通过 gh-proxy.org 完整下载，分别核对 GitHub 原始附件摘要及 SHA256SUMS.txt。源码、许可、来源和验收 JSON 同样下载并通过摘要检查，来源确认到本版产品提交。安装包 SHA-256：`3cbb392eae6adfae2d9688dc7ccf08576900ac4da7a684f6a33732faaa88a2f6`；便携版：`fd6b8764ec0355b082a1ba61225a5fe95f8a5767d1fb8507eac75c2e6866184a`。第三方代理未模拟所有大陆网络条件。

Windows runner 没有实体音频输出端点，nativeAudio.verified=false，仍不能替代实体扬声器、真实休眠唤醒和账号现场验收。

产品源码为 `d2887edc6dce819dc6ea5d7a51f38421510433da`，标签 `v1.3.2`。基线为 `ed2ab448`，开发分支 `fix/bilibili-search-focus`。Node 53 项、Web 83 文件 646 项、TypeScript、ESLint 和 4 项发布工具测试通过。新增 5 项 Vue 回归覆盖弹窗仅遮挡、普通失焦、带弹窗离开、窗口隐藏/全屏和迟到 IPC；真实 Electron 44 验证网页失焦、文档仍可见、播放进度从 0.093433 秒推进至 0.698762 秒，以及关闭遮挡后保留手动暂停，既有片尾/循环/重建、原生按钮和会话隔离检查同样通过。

04:51:45 UTC，匿名真实 B 站样本 BV1Y6We6jEPQ 在 Core/no-login 开启时解码 1920×1080、readyState=4。搜索焦点转移且原生画面缩为零后，document.hasFocus=false、visibilityState=visible、paused=false，进度从 8.556696 秒推进至 9.507432 秒。随后片尾检查只报告一次结束，最终 paused=true、ended=true、currentTime=duration=973.6 秒，没有跳转下一视频。

按相同受控文档、Core 和媒体测量启动 60 秒的进程工作集：旧行为（弹窗时暂停并隐藏）557156 KiB，新行为（弹窗只遮住画面、媒体继续）561524 KiB，增加 4368 KiB，约 4.3 MiB。两次均移除悬浮按钮以复现弹窗让位场景；改后样本实际保持播放，改前已暂停。这是该场景的受控样本，不能作为完整应用或长期性能保证。

Windows 实际便携版验收增加打开顶部搜索弹窗、聚焦其输入框、网页内受控媒体保持播放，关闭弹窗保留手动暂停，页面离开暂停，以及遮挡期间上课暂停。详细程序结果以本版发布流程的 acceptance-result.json 为准；实体音频、睡眠与账号现场限制继续保留。

[Windows 三模式真实站点验收](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/44677419638) 全部 success，与产品标签为同一提交。各组均为匿名、readyState=4、远程 require 不可用，搜索焦点转移后 paused=false、visibilityState=visible、hasFocus=false，进度实际推进；随后的片尾只报告一次结束，等待 6.5 秒仍暂停在当前视频。

| Windows 模式    | 实际视频  | 失焦前进度  | 失焦后进度  |
| --------------- | --------- | ----------- | ----------- |
| Core + no-login | 1920×1080 | 3.064246 秒 | 4.069841 秒 |
| Core、关闭增强  | 640×360   | 2.722086 秒 | 3.727366 秒 |
| 关闭 Core       | 640×360   | 1.361592 秒 | 2.365375 秒 |

[Windows 正式构建与程序验收](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/44677415052) 在对应标签执行，不使用旧版本程序代替。

## 2026-11-15 v1.3.1 哔哩Song 页面与结束交接

[正式 Release](https://github.com/DGHH-Skywalker/CPlayer/releases/tag/v1.3.1) 已发布。[Windows 发布流程](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43771006387) prepare、windows、publish 均 success：类型、Lint、Node 53 / Web 641 项测试、文档、Electron、125% / 150% DPI、原生模块、安装包/便携版和实际程序验收完成。公开 acceptance-result.json 记录 `bilibiliLayout=true`、`floatingSongButton=true`、`classGate=true`。

安装包与便携版已从 gh-proxy.org 逐字节完整下载，分别为 122452731 与 110836657 字节；摘要与 GitHub 原始附件 API 和 Release 的 SHA256SUMS.txt 均一致。源码、许可、来源和验收 JSON 也已下载核验；正式程序及源码均来自下方标签提交。安装包 SHA-256：`29f47dcc59f1ebf63a979d034f7091d0b31d97f30b61d2b18b13b7d836bb9dee`；便携版：`60095be44b384b3fa1f34095463c3a0389c8131a54f41fc6dab3ad3c25b2f473`。第三方代理在各大陆网络下的实际可用性可能不同。

Windows runner 没有音频输出端点，验收 JSON 已明确记录 nativeAudio.verified=false。实体扬声器截止、真实休眠唤醒、账号与多显示器交互仍需对应设备，不由本次自动验证替代。

源码提交：`da33063e4f8881095c2fddec5bcd0ec992469e1d`，标签 `v1.3.1`。

本地 Node 53 项、Web 82 文件 641 项、TypeScript 与 ESLint 已通过。Electron 44 受控媒体覆盖自然结束、window 捕获监听顺序、站点反复开启 loop、片尾重建和中途重建；结束仅上报一次且拒绝站点再次播放。原生悬浮按钮覆盖本地视图层级、DOM 点击无法触发入队、真实输入、上课禁用及 100% / 125% / 150% 应用缩放。新增几何单测覆盖底栏入场动画、浮动播放栏及窄窗口裁剪。

09:29:33 UTC，真实匿名 B 站样本 BV1Y6We6jEPQ 在 Core/no-login 开启时实际解码 1920×1080、readyState=4；跳至片尾后继续等待 6.5 秒，09:29:42 UTC 只收到一次结束，currentTime=duration=973.6 秒、paused=true、ended=true，URL 保持当前视频。该测试验证片尾拦截，队列交接和上课代次由单元测试分别覆盖。

内存比较采用同一受控文档、可见窗口和 Core，启动后 60 秒读取 app.getAppMetrics 的进程工作集总和：改动前 433868 KiB，显示新悬浮控件后 528356 KiB，增加约 92.3 MiB。该代价来自独立的本地原生视图进程，目的是在远程 WebContentsView 上安全显示控件；它不加载 Vue、preload 或应用 IPC，实验功能关闭、页面隐藏或窗口最小化时立即销毁。此数据不是完整应用或长期性能基准。

Windows 发布与实际程序几何检查：[Actions](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43771006387)。Windows 三模式真实网站与片尾检查：[最终成功 Actions](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43771715229)，验收提交 `2062625a` 与发布标签的产品代码相同，仅改进测试取样和文档。首次运行 Core 关闭组在站点重建播放器时过早取样失败；改为连续三次稳定播放后，三组均通过。下方历史记录保留原始环境与当时的限制，不代表本轮重新出现同样问题。

| Windows 模式    | 实际解码  | 播放进度    | 片尾事件 | 等待 6.5 秒后的状态    |
| --------------- | --------- | ----------- | -------- | ---------------------- |
| Core + no-login | 1920×1080 | 2.46084 秒  | 1 次     | 暂停、已结束、同一视频 |
| Core、关闭增强  | 640×360   | 2.49407 秒  | 1 次     | 暂停、已结束、同一视频 |
| 关闭 Core       | 853×480   | 2.804493 秒 | 1 次     | 暂停、已结束、同一视频 |

三组均为匿名全新 Session，readyState=4、SESSDATA 不存在、远程 require 不可用；跳至片尾后的 currentTime 与 duration 均为 973.6 秒。真实网站验收包含站点重建和 /en/video 导航，当前网页解码结果不代表所有内容的清晰度保证。

## 2026-11-15 正式发布 v1.3.0

发布源码提交：`4fd12e4d239bea630ad7d5bef6c97b44c061fe68`，标签 `v1.3.0`。

[GitHub Actions 发布流程](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43692788842) 全部成功：版本校验、4 项发布附件工具测试、类型检查、Lint、53 项 Node / 636 项 Web 测试、文档构建、Electron 注入及 DPI、Windows 原生模块、正式安装/便携包和实际便携程序启动验收。

[正式 Release](https://github.com/DGHH-Skywalker/CPlayer/releases/tag/v1.3.0) 已公开，附安装包、便携版、对应源码、归属许可、构建来源、验收 JSON 和 SHA256SUMS.txt。附件来源核对到同一个标签提交，不使用上一轮程序替代。

中国大陆下载代理的安装包和便携版已实际整文件下载，并与 GitHub 原始附件摘要核对一致。地址、文件大小及摘要见 [本版本发布记录](releases/v1.3.0.md)。测试来自当前执行环境，第三方代理在各大陆网络下的可用性可能不同。实体设备与账号的未验证项继续保留。

## 2026-11-14 继续验收与哔哩Song

本轮新增默认关闭的哔哩Song，具体入口和行为见 bilibili-song.md。自动测试覆盖规范 URL、分 P 标识、重复结束、队尾停止、课间截止、旧页面状态、取消尚未开始的 MV；真实 Chromium 使用受控媒体自然结束验证站点续播和分 P 跳转被阻止。Core 增加根节点等待后仍在首个页面脚本之前运行，修复主题模块访问空 documentElement。

2026-11-14 00:38:17 UTC 执行 `pnpm test:bilibili-live`，全新内存会话、无 SESSDATA，Core 0.5.35 和 no-login 均开启，BV1Y6We6jEPQ 实际解码至 1920×1080、readyState=4、paused=false，进度 8.26835 秒。JSON 和网页截图保存在本地 test-results/bilibili-core-on.json、bilibili-core-on.png。本轮结果取代下方首次仅等待约十秒而未解码的结论；它只证明所测公开视频在当前网络环境可用，不代表所有视频均提供 1080P。

同一视频随后复测：00:46:55 UTC，Core 开启/no-login 关闭，640×360、readyState=4、进度 2.565561 秒；00:47:41 UTC，Core 关闭，640×360、readyState=4、进度 2.521869 秒。两次均未登录且实际播放。关闭增强后站点自动跳转 `/en/video/`，已兼容规范标识和初始跳转，后续跨视频导航继续拦截。

最终本地检查：Node 53 项、Web 81 文件 636 项通过；类型检查、ESLint、跳过 Linux 原生模块的生产编译通过。真实 Electron 在 DPI=1、1.25、1.5 均通过，记录的 devicePixelRatio 与设置一致，包含应用缩放边界、Core 首脚本前运行、媒体自然结束及会话隔离。功能入口默认关闭；网页解码失败停止并提示，不自动跳过到站点推荐视频。

相同 Core 注入 fixture 在改动前 b8476d54 和当前版本各采样启动后 60 秒的 app.getAppMetrics：进程工作集总和 431376 KiB 与 431364 KiB，均约 421.3 MiB。该比较只覆盖相同受控页面中的加载器开销，不代表完整应用、视频解码或长期运行占用。

Windows 工作流新增 125% / 150% Chromium DPI 与 100% / 125% / 150% 应用缩放的真实 WebContentsView 尺寸检查，修正边界裁剪。便携版验证新增实际输出端点检测：存在端点时加载测试音并检查从 playing 到 CLASS/stopped 的状态，缺少端点时在 acceptance-result.json 明确记录未完成，不能伪称实体扬声器检查通过。

当前环境只有 Linux 工作区和 GitHub Windows runner，没有交互式 Windows 测试机或用户 B 站登录会话。已向用户请求可用验收入口；不会索取或代填密码、Cookie。真实睡眠/唤醒、实体扬声器和账号登录的现场结论仍须对应设备与用户会话，自动时钟与 Cookie fixture 不能替代它们。

### Windows 真实网站验收

独立工作流：<https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43537761514>，三组均 success。验证分支 `test/bilibili-windows-acceptance`，提交 `f79c2f9fb636a1077c924a2b63780af034c1e19c`，产品代码与 `bb2a5c6b` 相同，仅独立工作流及触发配置不同。

| Windows 模式    | 实际视频  | readyState | paused | 播放进度    | SESSDATA |
| --------------- | --------- | ---------- | ------ | ----------- | -------- |
| Core + no-login | 1920×1080 | 4          | false  | 2.595646 秒 | 无       |
| Core、关闭增强  | 640×360   | 4          | false  | 2.293982 秒 | 无       |
| 关闭 Core       | 640×360   | 4          | false  | 0.1874 秒   | 无       |

每组均确认远程页面 `require` 不可用。增强开启和关闭时首脚本前注入成立，Core 关闭时无注入标记。截图和 JSON 下载：[1080P 增强](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43537761514/artifacts/14090123269)、[关闭增强](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43537761514/artifacts/14090871718)、[关闭 Core](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43537761514/artifacts/14090686586)。真实账号登录仍未执行，不能由匿名播放结果推断。

### 本轮 Windows 程序交付

- 产品代码：`bb2a5c6bf610be3e11b2ea11037071a2fb51be91`
- 构建：<https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43536911936>
- 产物：<https://github.com/DGHH-Skywalker/CPlayer/actions/runs/43536911936/artifacts/14090532854>
- ZIP 大小：232580408 字节；SHA-256：`b789ae28b0ef01055ed67858de264d53fddd7e3efa24ddc0682da15bf7fe4c5c`
- 内含 `Cplayer-1.2.1-x64-setup.exe`、`Cplayer-1.2.1-x64-portable.exe`、`acceptance-result.json` 等，保留 30 天

| 程序     | SHA-256                                                            |
| -------- | ------------------------------------------------------------------ |
| setup    | `4807706dc6f6179d7919dfd8a60c72d98448a2708c38b3584a9e07af8bcdeed6` |
| portable | `3fae1204475bd33dfdab9c9e781c5001bd12f77b77c64600e2486b0779fe46bb` |

全部类型检查、Lint、53 项 Node、636 项 Web、Electron 真实自然结束与隔离、Windows DPI=1/1.25/1.5、Rust 原生模块、正式 NSIS/portable 构建通过。实际便携版返回 `success=true`、`packagedPreload=true`、`classGate=true`、`packagedCore=0.5.35`，并验证 CLASS 时 stopped、进度为 0、播放被拒绝。

实际设备检测结果为 `nativeAudio.verified=false`，原因是 Windows runner 没有音频输出端点。因此本轮不能宣称真实扬声器截止已通过。主进程状态、播放闸门和清空竞态已验证；真实睡眠/唤醒、扬声器截止及账号登录/退出仍被现场设备和用户会话阻塞。DPI 自动检查不替代真实多显示器移动、系统显示设置和所有弹窗操作的人工验收。

## 环境与基线

Linux，Node 24.22.1、工程指定 pnpm 12.15.0、Electron 44.10.1。原始提交 6b26b685f67cfac9d3233747b399255620f45b87 在独立 worktree 运行：Node 53/53，Web 590/590，类型检查通过。

安装时预装 pnpm 11.25.0 不满足约束，使用 Corepack 安装指定版本。Electron 下载需继承代理，安装完成后原生 SQLite 重建成功。当前 Linux 缺 Rust、ALSA/DBus/Pulse/PipeWire 开发包；Windows 完整打包由 GitHub Actions 原生 runner 执行。

## 2026-11-13 本地验证（上一轮）

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

## 2026-11-13 Windows 构建与下载（上一轮）

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
6. B 站内搜索、登录、评论、弹幕、退出和 SPA 跳转；公开样本 1080P、Core 及 no-login 切换播放已自动实测，仍需其他内容和真实账号交互验收
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

## v1.4.0 本地验证（2026-11-23）

- Node：53 项通过；Web：90 文件、678 项通过
- Rust 可移植 DSP：6 项通过；发布工具：4 项通过
- TypeScript Node/Web、ESLint 通过
- Electron 44.10.1 真实主世界注入、iframe/子域隔离、媒体焦点、单视频结束/重建、暂停精确定位和连续定位均通过
- 真实 AudioWorklet/WASM 峰值：−12 dBFS 为 0.2511886；即时调整 −18 dBFS 为 0.1258925；禁用不重载或擅自暂停
- 2026-11-21 真实公开视频样本：Core + no-login 解码 1920×1080，音频图 running、非零且符合 −12 dBFS；搜索失焦保持播放，片尾仅一次 ended 并暂停
- 相同空闲窗口/Core/悬浮按钮夹具、启动 60 秒总工作集：基线 529188 KiB，修改后 534952 KiB，约增加 5.6 MiB；这是空闲 fixture，不代表活动 DSP 或完整应用峰值内存

Windows 原生编译、便携版和三模式真实网页结果由本版 GitHub Actions 归档，发布完成后追加实际运行编号。实体扬声器、真正睡眠恢复、真实账号及多显示器仍需现场复现：配置真实课间，播放/加载/预载/MV 时跨过上课边界，检查无声且队列与存储为空；睡眠越界后唤醒重复检查；在不同 DPI 显示器拖动底栏并进行登录退出。

### 渐进启动集成补充

2026-11-23 完整集成回归已通过 102 文件 / 707 项 Web 测试、53 项 Node 测试、类型和零警告 Lint；构建后真实 Electron 发现并修复 shared chunk 中相对 renderer/preload/worker 路径错误，补充路径回归测试。

相同普通首页、默认 NoiseLimiter、启动 60 秒的完整界面样本，工作集从 663936 KiB 到 664976 KiB（约 +1 MiB）。此 Linux 样本没有本机原生音频二进制，采样只用于界面/IPC 内存对比，不能替代音频播放、Windows 启动耗时或实体设备验收。基线只用目录映射修正已确认的 chunk 路径错误后测量，避免将错误页当作快速启动；修改后直接运行正式 JS 构建产物。

修改后该界面样本的页面时钟标记：bootstrap 282 ms、player-ready 667 ms、app-mounted 773 ms、startup-complete 1635 ms。原生音频模块缺失时相关 IPC 失败，因此不据此声称音乐已在 667 ms 可播放；真实 Windows 包会另外要求原生 DSP 配置成功。

Windows 首屏模块验证使用 CDP `Debugger.scriptParsed` 捕获实际解析的脚本。`file:` 页面的 Resource Timing 可能不列出模块，不能凭空列表判定懒加载通过。

### 发布前故障与并发回归

新增 Rust 原生适配器编译与参数快照测试，覆盖 −30/−12/−3 dBFS 上限、无效参数保留与关闭；与核心合计 7 项通过。首轮 Windows 编译发现的无符号取负问题已修正并由该测试覆盖。

插件生命周期新增 8 项：更新/重装/恢复期间不撤销原有动态保护，加载失败降为基础保护并保留输出上限；明确禁用、卸载、撤权才移除贡献。定位与片尾并发新增主进程及前端终态回归，确保当前曲目的 ended/error/stopped 不被进度过滤吞掉，旧曲目和上课后事件仍被拒绝。

真实 Electron 故障注入：AudioWorklet 的 processorerror 触发后，后备限幅重新连接输出，测得非零峰值 0.1258925，符合 −18 dBFS；资源文件缺失时，HTML 原生 autoplay 和动态 audio 均保持 paused、muted、time=0，显式禁用后可正常播放且不擅自恢复。

Windows 真实 B 站三模式运行 [45149449539](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/45149449539) 全部通过：Core+no-login 为 1920×1080，关闭增强或关闭Core为640×360；三模式 NoiseLimiter 图均 running/active、非零输出不超过 −12 dBFS，失焦继续播放，片尾唯一 ended 并保持暂停。

最终本地故障集成：105 文件 / 733 项 Web 测试、53 项 Node 测试、7 项可移植/原生适配器 Rust 测试、类型与零警告 Lint 通过。补充CDP attach/register/detach失效的主进程静音门控，不将Core关闭当作保护失败。暂停后挂起浏览器音效上下文，恢复播放再运行，避免后台持续处理静音。Windows候选构建 [45201141348](https://github.com/DGHH-Skywalker/CPlayer/actions/runs/45201141348) 的安装包生成及原生音频回归127项通过、4项忽略；其便携版媒体夹具曾在网页body出现前插入节点，已改为等待实际文档就绪，最终Release仍需完整重跑验收。
