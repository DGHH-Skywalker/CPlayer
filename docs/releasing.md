# Cplayer 发布维护

所有正式构建与发布在 GitHub Actions 执行。维护者先更新 package.json 的版本以及 docs/releases/v版本.md，再提交源码并创建对应 `v版本` 标签。

## 工作流

- **Cplayer Windows**：类型、Lint、单元测试、文档、真实 Electron / DPI、Rust 原生构建、NSIS / portable、实际便携版启动检查。它同时作为可复用工作流供正式发布调用
- **Cplayer Release**：验证标签与版本一致，调用完整 Windows 流程，核对构建提交及验收结果，生成源码、归属许可、来源与 SHA-256 附件，上传完整草稿后转为正式 Release
- **Cplayer Windows browser acceptance**：按需在全新匿名会话验证真实站点，保留截图与 JSON；站点接口与网络可用性单独记录
- **Cplayer Documentation**：构建文档并保留 artifact，不自动部署到未配置的 Pages 站点

## 发布命令

```bash
git tag -a v1.3.0 -m "Cplayer v1.3.0"
git push origin v1.3.0
```

也可以在 GitHub Actions 手动运行 **Cplayer Release**，输入已存在的标签；命令行等价操作：

```bash
gh workflow run release.yml --ref dev -f tag=v1.3.0
```

标签必须与 package.json 完全匹配，并有对应发布说明。发布的源码归档使用同一个 Git 提交；不会复用其他提交的安装包。若发布失败，只能重试尚未公开的草稿；已经发布的同名版本会拒绝被自动覆盖。

首次发布提交使用 `[skip ci]` 避免重复的分支检查，随后显式手动触发完整 Release 工作流；这不会跳过发布流程中的检查。

## 附件与镜像

提供 setup、portable、源码 ZIP、归属许可 ZIP、acceptance-result.json、release-provenance.json 与 SHA256SUMS.txt。原始许可及版权声明见仓库根目录 LICENSE、NOTICE.md 和 vendor/bilikit。

大陆镜像采用第三方公开 GitHub 下载代理，链接写入对应发布说明。发布后应从镜像实际下载程序，并与原始 Release 的 SHA-256 核对。运行环境中的连通性不能保证所有大陆网络运营商均可访问，可在说明中提供备用线路。

实体设备、账号与网络限制必须保留在验收结果里；不能为发布而把未执行的检查改为通过。
