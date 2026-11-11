# 文档目录

产品介绍、安装和常用命令见[项目 README](../README.md)。开发专题资料保留在本地，`docs/` 下除本文件外的 Markdown 均由 Git 忽略。

## 公开资料

| 内容 | 入口 |
| --- | --- |
| 产品、安装、CLI 和升级 | [项目 README](../README.md) |
| 工程原则与维护边界 | [工程约定](../AGENT.md) |
| 本地开发、测试和发布流程 | [贡献指南](../CONTRIBUTING.md) |
| 宿主接入、恢复和打开 | [Agent 接入指南](../skills/pinwhy/references/setup.md) |
| 节点、关系与独立维度 | [记录语义](../skills/pinwhy/references/recording.md) |
| 多 Agent 身份与交接 | [并行 Agent](../skills/pinwhy/references/parallel-agents.md) |
| 可选记录方法 | [方法目录](../skills/pinwhy/methods/INDEX.md) |
| Node.js SDK | [pinwhy-core](../packages/pinwhy-core/README.md) |
| 官方 CLI 入口 | [pinwhy-cli](../packages/pinwhy-cli/README.md) |
| DSH 插件 | [插件说明](../plugins/dsh-pinwhy/README.md) |
| 界面与品牌 | [界面规范](../design/UI_SYSTEM.md) · [品牌素材](../design/pinwhy-logo/README.md) |

## 本地开发资料

以下文件供本地维护使用。

| 本地文件 | 用途 |
| --- | --- |
| `USAGE.md` | 完整使用参考 |
| `CONTRACT.md` | CLI、HTTP、JSON 和事件契约 |
| `ARCHITECTURE.md` | 模块职责与依赖边界 |
| `ROADMAP.md` | 发展方向与恢复试验结论 |
| `METHODS.md` | 可选方法的格式与扩展规则 |
| `BATCH.md` | 批量写入设计 |
| `history-api.md` | 历史与检查点差异接口 |
| `backup.md` | 备份校验与恢复限制 |
| `receipts.md` | 幂等写入与中断恢复 |
| `ci.md` | 构建、跨平台测试和发布验证 |
| `performance.md` | 性能测量与基线 |
| `RECOVERY_EXPERIMENT.md` | 真实任务恢复对照试验 |
