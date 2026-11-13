# 测试与构建

## 云端入口

- 现有 `test.yml` 支持 `workflow_dispatch`，并覆盖 Ubuntu 测试、Windows 原生测试和 Linux 原生音频测试。
- 现有 `ci.yml` 在针对默认分支的 pull request 上执行格式、Lint 和类型检查。
- 当前 GitHub 授权不允许写入 `.github/workflows`（缺少 workflow scope），因此新增功能分支工作流的提交被 GitHub 拒绝；不能声称该工作流已经创建。
- 代码阶段完成后通过功能分支到 `dev` 的 pull request 触发检查，并使用已有可分发构建入口或请求具备 workflow 权限的授权补充 Windows 构建。

## 验证记录

待代码提交后记录实际运行编号、提交 SHA、结果和 artifact。未执行或未通过的项目不得标记为完成。
