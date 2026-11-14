# B 站与固定 Core

## 安全和生命周期

使用 WebContentsView，nodeIntegration=false、contextIsolation=true、sandbox=true、webSecurity=true，不安装主程序 preload。浏览器管理 IPC 只接受主窗口的主框架。HTTPS 顶层导航必须使用 URL 解析后匹配 bilibili.com 或其子域，拒绝凭据、非标准端口和伪造后缀。新窗口请求接管到当前内部视图并保留历史，不调用 shell.openExternal。子资源不套用顶层白名单。站点不获得摄像头、麦克风、位置或通知权限。

分区固定 `persist:splayer-bilibili`。网页浏览与 MV 剧场共用当前 WebContents 和 Session；离开、隐藏、上课（默认开启）暂停网页媒体。清除数据先暂停并销毁视图，再对专用 Session 调用 clearData、clearCache、clearStorageData，验证 SESSDATA 消失，按应用配置重建干净视图。不会清除 persist:main、校园配置、音乐库和音乐队列。

浏览器异常时可在页面或控制中心重新初始化。网页错误不会阻断校园调度或原生音乐。设置弹窗覆盖原生视图时隐藏，恢复后重算布局边界。

## Core 来源与构建

- 原项目：<https://github.com/shiinayane/BiliKit-Web>
- Commit：`8b4fe351a95d01ec37a75a970f29773c8bbcaf89`
- Core 实际版本：0.5.35（仓库 package.json 的 0.1.0 不是脚本版本）
- 入口 src/entry-core.ts，构建 pnpm install --frozen-lockfile / pnpm build:core
- 产物、MIT、品牌声明与 SHA-256 位于 vendor/bilikit
- 本地分发产物移除 @icon，替换脚本面板品牌显示文字；原作者版权和源仓库记录保留
- 校验命令：node scripts/verify-bilikit.mjs

仅集成 Core，不含 Feed 或其他接口拦截扩展。运行时不下载远程可执行脚本。

## document-start

BilikitLoader 先通过本地 about:blank 初始化 CDP 文档目标，再 attach CDP、启用 Page 并 addScriptToEvaluateOnNewDocument，在首次远程 B 站 loadURL 前完成注册。不指定 worldName，因此处于网页主世界。脚本包装器校验域名。通过 Target.setAutoAttach + waitForDebuggerOnStart 对跨进程 iframe 在继续运行前注册脚本；同进程 iframe 由 Page 的新文档脚本覆盖。每次变更先 removeScriptToEvaluateOnNewDocument，再注册下一份。临时禁用只改内存标志并重新加载，不清 Cookie；退出后恢复持久配置。

Core 开始前仅修改 bilikit:settings 中 module.no-login.enabled，并合并跨子域 bilikit_settings Cookie；写 Cookie 时过滤凭据键，保留其他非敏感配置，不将本域私密键复制到 Cookie。关闭 Core 也同步关闭免登录状态，并清除没有真实登录指纹的模拟 DedeUserID。真实 SESSDATA 不由配置同步层读取或传播。

媒体状态采用原生媒体事件与文档捕获事件桥接，不依赖固定视频选择器；暂停、结束、元素重建、页面隐藏和关闭均进入协调器。Runtime binding 仅接受媒体布尔值，不暴露任何管理 API。

## 兼容性边界

免登录模块使用上游官方试看接口，无法保证所有视频 1080P 或会员画质。真实登录/退出、B 站实时搜索、弹幕、评论、SPA 页面和接口可用性需要网络环境及用户实际账号验证。自动化 fixture 只能证明 Electron 注入时机和会话隔离，不能替代这些站点验收。Core 关闭后原生网页功能保留。

浏览器使用保留 Chromium 版本的标准桌面 User-Agent，移除应用和 Electron 产品标识。2026-11-14 延长冷启动网络等待后，匿名公开视频在 Core 与 no-login 均开启时已实际解码至 1920×1080、readyState=4、进度超过 8 秒，具体证据见 testing.md。早期注入等待文档根节点创建，但仍在首个页面脚本前运行，避免主题模块访问空 documentElement。真实账号仍需由用户在受控 Windows 测试机内自行登录验收。
