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

## 最终补充

- Home / MusicHome 分离，挂载前同步校园模式，避免校园首页初始化普通推荐请求
- 队列快照逐项解除 Vue 代理，清空落盘后回读；历史恢复和标签恢复校验代次
- 前端拒绝上课后的迟到状态，调度补偿重投未确认事件，已确认事件不误清下一课间
- 标签编辑在开始前固定校园代次和恢复意图，停止等待跨上课边界不恢复旧歌曲
- B 站视图保留 Chromium 版本，使用标准桌面浏览器标识
- 特殊日期的首首自动播放覆盖每周设置；每周冲突验证不受临时停用日期掩盖
- 原生视图监听窗口隐藏、最小化和关闭，滚动时同步边界，视频全屏期间保留正确尺寸
- Windows Actions 保留失败缓存和便携版启动日志；严格 NSIS 默认头图兼容修复

## 实际修改文件

```text
.github/workflows/beta.yml
.github/workflows/carbonv-windows.yml
.github/workflows/dev.yml
.github/workflows/docs.yml
.github/workflows/nightly.yml
.github/workflows/release.yml
.gitignore
.prettierignore
README.md
README.zh-CN.md
build/installer/installer.nsh
build/installer/ui.nsh
build/installer/uninstaller.nsh
docs/architecture.md
docs/bilibili-integration.md
docs/changes.md
docs/school-scheduler.md
docs/technical-baseline.md
docs/testing.md
electron-builder.config.ts
electron/main/apis/common/lyric/ttml.ts
electron/main/apis/musicbrainz.ts
electron/main/core/index.ts
electron/main/ipc/bilibili.ts
electron/main/ipc/config.spec.ts
electron/main/ipc/config.ts
electron/main/ipc/index.ts
electron/main/ipc/player.ts
electron/main/ipc/playerTransition.spec.ts
electron/main/ipc/school.ts
electron/main/ipc/trustedSender.ts
electron/main/plugins/registry.ts
electron/main/server/index.ts
electron/main/services/bilibiliBrowser.ts
electron/main/services/bilibiliPolicy.spec.ts
electron/main/services/bilibiliPolicy.ts
electron/main/services/bilikitLoader.ts
electron/main/services/engine.ts
electron/main/services/mcp/http.ts
electron/main/services/mcp/injector.ts
electron/main/services/mcp/server.ts
electron/main/services/mvAudioCoordinator.spec.ts
electron/main/services/mvAudioCoordinator.ts
electron/main/services/nowPlaying.ts
electron/main/services/playbackActivity.ts
electron/main/services/playerControl.ts
electron/main/services/playerPreloadReset.spec.ts
electron/main/services/school.ts
electron/main/services/schoolPlaybackGate.spec.ts
electron/main/services/schoolPlaybackGate.ts
electron/main/services/schoolScheduler.spec.ts
electron/main/services/schoolScheduler.ts
electron/main/services/streaming/adapters/jellyfin.ts
electron/main/services/streaming/adapters/subsonic.ts
electron/main/services/updater.spec.ts
electron/main/services/updater.ts
electron/main/window/desktopLyric.ts
electron/preload/index.d.ts
electron/preload/index.ts
eslint.config.mjs
index.html
package.json
scripts/run-electron-smoke.mjs
scripts/test-bilibili-electron.ts
scripts/test-packaged-windows.ts
scripts/verify-bilikit.mjs
shared/constants/customBuild.ts
shared/defaults/settings.ts
shared/school/schedule.ts
shared/types/bilibili.ts
shared/types/school.ts
shared/types/settings.ts
src/apis/github.ts
src/components/layout/SideBarLogo.vue
src/components/list/SongList.vue
src/components/school/BreakScheduleEditor.vue
src/components/school/BreakStatus.vue
src/components/settings/custom/AboutSettings.vue
src/components/settings/custom/McpConfigDialog.vue
src/components/settings/custom/SchoolControlCenter.vue
src/composables/useQueuePanel.ts
src/composables/useTrackMenu.ts
src/core/player/events.ts
src/core/player/index.ts
src/core/player/sourceRecovery.spec.ts
src/i18n/locales/en-US.json
src/i18n/locales/zh-CN.json
src/layouts/MainLayout.vue
src/main.ts
src/pages/Bilibili.vue
src/pages/Home.vue
src/pages/MusicHome.vue
src/pages/RequestHome.vue
src/router/index.ts
src/services/requestPlayback.spec.ts
src/services/requestPlayback.ts
src/services/schoolScheduleBridge.spec.ts
src/services/schoolScheduleBridge.ts
src/settings/schema.ts
src/stores/queue.spec.ts
src/stores/queue.ts
src/stores/queuePersistence.spec.ts
src/stores/school.ts
src/types/settings.ts
src/utils/lyric/poster.ts
src/utils/sidebarNav.ts
vendor/bilikit/BRAND-ASSETS.md
vendor/bilikit/LICENSE
vendor/bilikit/bilikit-core.user.js
vendor/bilikit/manifest.json
```
