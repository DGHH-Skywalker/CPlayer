# CarbonVPlayer 架构

Cplayer 在 DGHH-Skywalker/CPlayer 上扩展，原始 SPlayer-Next AGPL-3.0 许可和作者信息保留。包名 carbonv_player，桌面应用 ID app.carbonv.player，与原版使用独立用户数据目录。

## 进程边界

- 主进程 `SchoolScheduler` 是作息和状态唯一权威，学校时区固定 Asia/Shanghai
- `schoolPlaybackGate` 在唯一原生引擎工厂 `engine.getPlayer` 拦截 load、play、prepareNext、transitionToPrepared、seek 和 reinitOutput，覆盖 IPC、外部 API、系统媒体、插件和自动恢复
- `stopPlaybackCompletely` 复用 player IPC 完整停止：递增 loadSeq，取消预载、设备恢复、播放会话，释放原生音频
- 渲染端 `schoolState` 仅缓存快照，`requestPlayback` 负责统一 FIFO、去重、拖拽接口和停止清理
- `queue` 使用串行持久化链和恢复 revision，清空等待两份队列落盘并回读校验
- 独立 `WebContentsView` 承载 B 站，专用 Session 永不借用音乐登录态或系统浏览器凭据
- `MvAudioCoordinator` 用控制代次、调度代次和暂停所有权决定恢复；上课作废所有恢复意图

## UI 与兼容

校园模式关闭时保留原首页和播放流程。开启后通过现有 SongList 搜索及明确的「点歌」按钮添加到末尾，单首循环和随机设置在校园模式下不生效。点完全部歌曲后停止，队列保留至本次课间结束用于去重和展示。

控制中心注册在现有 settingsSchema，复用 SCard、SButton、SInput、SSwitch、SDialog。侧栏沿用已有分组对账机制向旧配置补充 B 站入口。网页视图按 CSS 布局边界乘主窗口 zoom factor 转为 Electron DIP，不额外乘 devicePixelRatio。设置弹窗、菜单、全屏音乐页出现时主动隐藏原生视图，不能用 z-index 覆盖它。

## 构建

`.github/workflows/carbonv-windows.yml` 在 Windows 原生 runner 安装锁定依赖、检查 Core 校验值、类型、Lint、测试，构建 Rust 模块及 NSIS / portable EXE，上传 Actions artifact。旧上游发布工作流对本 Fork 关闭。应用 updater 和启动插件版本检查关闭，Core 只读取随程序打包的本地文件。

校园首页在挂载前读取主进程模式。Home 仅为模式入口，普通首页完整保存在 MusicHome 中并按需挂载，校园搜索页不会加载普通首页的推荐和继续收听数据。模式切换保留同一个上游全局设置、歌曲列表和播放器。
