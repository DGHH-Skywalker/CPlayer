# 校园课间点歌与 B 站 MV 改造技术基线

## 仓库与基线

- 仓库：`DGHH-Skywalker/Cplayer`
- 默认分支：`dev`
- 功能分支：`feat/campus-request-system`
- 基线提交：`6b26b685f67cfac9d3233747b399255620f45b87`
- 基线提交说明：`feat: 歌词匹配预览显示播放进度与对唱位置`
- 基线时间：2026-11-11T16:30:04Z

## 构建与依赖

- Node.js：>= 24
- pnpm：12.15.0
- Electron：44.10.1
- Vue：3.5.44
- TypeScript：6.0.3
- Pinia：4.1.0
- 原生音频：Rust、NAPI-RS、FFmpeg、rodio
- 测试：`pnpm test`、`pnpm test:native`
- 静态检查：`pnpm prettier --check .`、`pnpm lint`、`pnpm typecheck`
- Windows 构建：`pnpm build:win`，目标为 NSIS 安装包和 portable 可执行程序

## 现有播放链路

1. `src/core/player/index.ts` 管理渲染进程播放、加载 token、预加载与自动过渡。
2. `src/core/player/events.ts` 接收原生、快捷键、托盘和外部控制事件。
3. `electron/main/ipc/player.ts` 管理原生加载序号、播放 IPC、系统媒体键及设备恢复。
4. `electron/main/services/playerControl.ts` 聚合 HTTP/WS、插件和系统控制。
5. `src/stores/queue.ts` 使用 localforage 的 `splayer/queue` 存储当前队列及随机队列备份。
6. `restoreLastTrack()` 会根据普通模式设置恢复音源，因此校园调度必须在启动恢复前完成状态同步。

## 已确认的基线风险

- `queue.ts` 的 `save()` 不返回 Promise，两个写入没有串行化，调用方不能等待持久化完成。
- `clearQueue()` 没有写入代次、完成后读回验证或旧写入隔离。
- `useQueuePanel.clearAll()` 在空队列时提前返回，可能跳过原生音频停止。
- `playerControl.play()` 和系统媒体 `Play` 可直接调用原生引擎，渲染层限制无法覆盖这些入口。
- 外部 `addToQueue` 可以指定插入位置，校园模式需要在主进程统一限制为队尾。
- 主进程 IPC 和 `playerControl.stop()` 使用不同停止逻辑，需要提取共享完整停止服务。
- `electron/main/core/index.ts` 启动时执行官方更新初始化和插件更新检查。
- 原 CI 的 push 触发只覆盖 `main`、`dev`，功能分支需要独立云端工作流。

## 实施边界

- 校园时间表由主进程持有，固定使用 `Asia/Shanghai`。
- 上课状态是全局播放硬闸门；停止、清空、持久化验证完成后才发布新的强制清理代次。
- B 站页面使用独立 `persist:splayer-bilibili` Session 和受限 `WebContentsView`。
- BiliKit-Web 仅集成固定提交的 Core 构建产物，不在运行时下载脚本。
- 保留原项目 AGPL-3.0；第三方 Core 保留 MIT 许可和品牌资产声明。

## 验证状态

本文件提交时尚未声称基线或改造代码通过构建。功能分支的 Linux 检查、测试和 Windows 构建由 `.github/workflows/campus.yml` 执行；最终结果以 GitHub Actions 记录和 artifacts 为准。真实 Windows 音频设备、B 站账号能力及人工交互项目单独列入测试文档。
