# Cplayer 修改记录

## Phase 0

记录用户 Fork 的实际提交与规范，建立 feat/carbonv-school。独立原始 worktree 验证 53 项 Node / 590 项 Web 测试及类型检查。固定 Core 来源及许可。

## 校园点歌与课间调度

- shared/types/school.ts、shared/school/schedule.ts：跨进程配置、上海日期、每周和特殊日期、跨午夜重叠校验
- electron/main/services/schoolScheduler.ts、school.ts、schoolPlaybackGate.ts：主进程绝对时间状态机、清理确认、持久化代次和原生调用闸门
- ipc/player.ts、services/playerControl.ts、engine.ts：统一完整停止、原生加载和恢复检查
- src/stores/queue.ts：串行快照写入、恢复 revision、可等待且回读验证的清空
- requestPlayback、schoolScheduleBridge、schoolState：统一 FIFO 去重、状态镜像、迟到事件保护
- RequestHome、BreakStatus、BreakScheduleEditor、SchoolControlCenter、SongList、useTrackMenu、useQueuePanel：搜索点歌、明确点歌按钮、独立设置、倒计时、表单校验和可靠空队列停止

## 浏览器、Core、MV

- bilibiliBrowser、bilibiliPolicy、bilikitLoader、trustedSender：独立原生视图、专用 Session、导航白名单、受信 IPC、CDP 主世界提前注入和校验
- mvAudioCoordinator、playbackActivity：三种音频策略及自动恢复所有权
- Bilibili.vue、router、sidebarNav、默认侧栏分组：网页 / 剧场页面和旧侧栏配置补充
- vendor/bilikit：固定脚本、版本清单、MIT 和品牌条款
- scripts/verify-bilikit.mjs、run-electron-smoke.mjs、test-bilibili-electron.ts：资源校验和真实 Electron fixture

## 独立发布

Cplayer 显示名、CarbonVPlayer 全称、carbonv_player 包名、app.carbonv.player 应用标识；保留原作者版权。禁用官方 updater 初始化、弹窗、检查按钮、版本通道、启动插件更新和 Fork 上游发布。独立 Windows Actions 检查并构建 NSIS / portable 产物。

详细修改文件以 git diff 6b26b685..HEAD --stat 为准。验证与未验收项见 testing.md。
