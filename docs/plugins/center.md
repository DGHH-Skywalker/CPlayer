# 插件中心与 API 6

在设置界面的空白处，3 秒内按 5 次独立 Enter，显示与校园点歌平级的「插件中心」。输入框、按钮、输入法组合和长按重复不计数。解锁只在本次应用运行有效，刷新界面仍保留，退出应用后隐藏。隐藏入口不停止已启用的插件。

沿用应用的独立插件宿主、VM 上下文、注册动作和声明式设置，兼容已有 JS 插件。API 6 同时提供 `cplayer` 和兼容别名 `splayer`，新增应用设置、路由、浏览器、选定文件、插件资源与实时 DSP 参数接口。宿主校验消息来源、参数、会话与动态权限，不向插件暴露 Electron、原生对象或任意 Node 文件系统。

## 安装与权限

导入 `.js` 或 `.zip`，也可手动指定 HTTPS 脚本地址。ZIP 根目录必须含 `manifest.json`，其中 `entry` 指向 JS 入口；身份以 JS 元数据为准。包限制 256 项、解压合计 32 MiB，拒绝路径穿越、符号链接、大小写冲突和 Windows 非法路径。资源仅能读取自己的安装目录。自动远程更新保持关闭。

```js
/**
 * @id example.controller
 * @name Controller
 * @version 1.0.0
 * @apiLevel 6
 * @grant ui,control,settings,browser,files,dsp
 */
cplayer.register({
  settings: [{ key: "strength", type: "slider", label: "强度", default: 50, min: 0, max: 100 }],
});
cplayer.ui.openSettings("general");
```

| 接口                                                   | 权限       | 范围                                                                                                             |
| ------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `player.*`                                             | control    | 现有播放、暂停、音量、队列等控制；始终受上课闸门约束                                                             |
| `ui.openSettings(category?)`、`ui.navigate(path)`      | ui         | 应用内设置和路由；不能绕过插件中心隐藏条件                                                                       |
| `settings.get(path)`、`settings.set(path,value)`       | settings   | `player.autoPlay/rememberLastTrack/fadeEnabled/fadeDuration/loudnessNormalization`；经过类型校验并应用现有副作用 |
| `browser.command(command,payload?)`                    | browser    | status/navigate/back/forward/reload/theater/fullscreen；导航沿用 B 站白名单                                      |
| `files.pick("read"或"write")`                          | files      | 原生选择器返回不透明临时 token，每插件最多 16 个                                                                 |
| `files.read(token)`、`files.write(token,Uint8Array)`   | files      | 仅用户选定的单个文件，最多 8 MiB；撤权、停止、重启释放 token                                                     |
| `assets.read(relativePath)`                            | 无新增权限 | 只读本插件包资源，最多 8 MiB                                                                                     |
| `audio.registerEffect(config)`、`audio.removeEffect()` | dsp        | `kind:"dynamics"`，mode、strength、ceilingDb 经过宿主校验                                                        |

注册配置支持 switch、number、slider、text、select，以及 `when:{key,value}` 条件显示。设置最多 64 项、菜单 32 项，界面使用原有组件。任意第三方 HTML/Vue 组件、VST/DLL 或任意 Node 执行不属于当前 SDK。文件、网络、平台接口和音乐库仍使用各自权限，校园截止不提供可撤销接口。

## NoiseLimiter 包

应用首次运行会安装并默认启用 `carbonv.noise-limiter`。它是可卸载的真实插件，使用 `ui,dsp`，不获取网络或文件权限。卸载后不会在下次启动自动重装，可主动「恢复 NoiseLimiter」，也可安装 Release 附带的 `NoiseLimiter-1.1.0.cplayer.zip`。只保留动态强度与输出上限控件，参数及启用状态持久保存。原版旧脚本随应用本地升级，用户改写脚本与卸载状态保留。

详见[音频处理](../noiselimiter.md)。
