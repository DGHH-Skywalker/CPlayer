# CarbonVPlayer 技术基线

- 仓库：<https://github.com/DGHH-Skywalker/CPlayer>，基准分支 `dev`
- 基准提交：`6b26b685f67cfac9d3233747b399255620f45b87`
- 开发分支：`feat/carbonv-school`
- 已阅读根目录 AGENTS.md、CLAUDE.md、README、package.json、锁文件、Electron 构建配置和 Actions
- 原项目许可证 AGPL-3.0 保留；Cplayer 全称 CarbonVPlayer，内部包名 carbonv_player
- 基线依赖：Node >=24、pnpm 12.15.0、Electron 44.10.1、Vue 3.5.44、Pinia 4.1.0、TypeScript 6.0.3（实际锁文件优先）
- 环境：Linux，Node 24.22.1；预装 pnpm 11.25.0 不满足工程约束，正在通过 Corepack 获取工程指定版本
- BiliKit-Web：`8b4fe351a95d01ec37a75a970f29773c8bbcaf89`，版本 0.1.0，MIT，仅读取 Core 编译产物，不复制品牌资产

## 已有入口与依赖

渲染端 `core/player/index.ts` 汇总搜索、右键、批量队列和外部事件；`stores/queue.ts` 使用 localforage，`QueuePopover` 与全屏队列复用拖拽排序。原队列两个异步写操作没有串行保证，clearQueue 无等待结果。`useQueuePanel` 空队列时跳过 stop，需修正。

主进程 `ipc/player.ts` 持有 loadSeq、原生预载取消、设备重建取消及完整停止流程；`services/playerControl.ts` 聚合外部 API、媒体键、插件，但原 stop 不含完整失效逻辑。`services/engine.ts` 为原生实例唯一入口，适合最后一道播放闸门。

全局设置 `settings/schema.ts` 支持独立分类组件；主配置 `main/store` 支持原子写入和立即落盘。侧栏 `utils/sidebarNav.ts` 与保存分组需兼容新增入口。主窗口使用 `persist:main`，B 站必须另建 Session。

上游 `core/index.ts` 启动 updater 和插件更新检查；MainLayout 挂载 UpdateDialog；AboutSettings 和 schema 引入版本设置。Actions 已有 Windows 原生构建和 NSIS/portable 打包流程，需要隔离上游发布。

## 实施顺序

先建立主进程学校配置和纯时间计算，再实现绝对边界调度与原生闸门；渲染端统一点歌和队列持久化；独立 WebContentsView 与固定 Core 注入；最后协调 MV、完善控制中心、运行验证并通过 Actions 构建 Windows。每阶段单独提交。

## 基线验证

首次 `pnpm install --frozen-lockfile` 被环境 pnpm 版本拒绝，尚未执行类型检查和测试。后续结果在 testing.md 记录，不能将未执行视为通过。
