# 贡献指南

先读[项目原则](AGENT.md)与[架构边界](docs/ARCHITECTURE.md)。Pinwhy 的改动应帮助如实记录和恢复现场，保留 Agent 自主决策；`.pinwhy/events.jsonl` 是唯一事实源。使用问题从[首页](README.md)或[使用参考](docs/USAGE.md)开始。

## 环境与依赖

安装后的 CLI 和已构建工作台支持 **Node.js ≥ 18**，根包保持零运行时依赖。源码开发需要 `npm ci`；Vite 8 要求 **Node `^20.19.0 || >=22.12.0`**，建议跟随 CI 使用 Node 24。不要把前端库、导出校验库或 Host SDK 放入根包的运行时依赖。

DSH 插件是独立子包，Node 与依赖要求见[插件说明](plugins/dsh-pinwhy/README.md)。根目录的 `npm test` 不包含插件全部测试，也不加载真实宿主。

<a id="local-development"></a>

## 本地开发

在仓库根目录安装依赖，并生成专用的合成演示板：

```bash
npm ci
node scripts/demo.js /tmp/pinwhy-dev-demo
```

`demo.js` 会重建目标目录内已有的演示黑板；只传入专用的临时目录，不使用真实项目或上级黑板。默认目标为仓库的 `demo/`。开发仓库不得写真实项目的 `.pinwhy/`，也不应让日常 Skill / Hook / 服务指向开发目录。

分别在两个终端运行，使用同一个演示板路径：

```bash
# 终端一：实际 API / SSE 服务
node bin/pinwhy.js serve --cwd /tmp/pinwhy-dev-demo
```

```bash
# 终端二：Vite 前端，默认 http://127.0.0.1:5173
PINWHY_CWD=/tmp/pinwhy-dev-demo npm run dev
```

Vite 的 `/api` 与 `/events` 代理按演示板配置解析服务端口；后端默认 `4333`。使用自定义端口时，在两个进程中明确使用一致的 `PINWHY_PORT`，不要把开发页连到真实项目服务。开发代理配置见 `vite.config.js`。

`web/` 是前端源码，`public/` 是生成的分发产物。修改前端后运行 `npm run build`，提交对应的 `public/` 变更，不手改压缩后的 JS / CSS。构建会清空并重建 `public/`；CLI 服务和离线 HTML 使用这些资产。可选方法目录的生成规则见[方法框架](docs/METHODS.md#目录由脚本生成)，不要手改生成的 `methods/INDEX.md`。

## 本地验证

在所有相关改动落地后集中运行，避免并发构建或读取半完成的产物：

```bash
npm run check
npm test
npm run build
npm run evaluate:recovery
npm run verify:recovery
npm run verify:package
```

`npm run check` 依次执行 `check:types`、`check:docs` 和 `check:publish`；需要定位问题时可单独调用。文档检查在本地解析 Markdown / HTML 的相对路径、图片和标题锚点，不依赖网络；按工作树跳过已删除或重命名的旧源文件，仍引用旧路径的链接继续报错。提交与推送前仍应重新运行 publication 检查，覆盖最终公开内容。

`npm test` 使用 Node 内置 test runner，覆盖根包行为和固定契约；部分前端纯模块测试会用本地 TypeScript 编译器，因此需要开发依赖。`evaluate:recovery` 测合成投影正确性，`verify:recovery` 验证隔离合成材料的模型适配协议，两者都不证明真实任务恢复效果。真实模型实验通过 `npm run experiment:recovery -- run ...` 显式执行，协议与前置条件见[恢复试验](docs/RECOVERY_EXPERIMENT.md)。`verify:package` 在隔离消费者安装实际 tarball，不启动真实服务、不切换 `current`。

改动导出逻辑或生成资产时，另行运行：

```bash
npx playwright install chromium
npm run verify:viewer
npm run verify:exports
```

`verify:viewer` 使用本地 Playwright/Chromium 操作合成黑板，覆盖工作区、2D/3D 切换与失败回退、离线导出及构建信息，并输出截图与结果。`verify:exports` 实际渲染 Markdown / Mermaid，并按官方 SARIF schema 校验 CLI 结果。可选 API 检查为 `npm run verify:api`；合成性能观测为 `npm run benchmark -- --quick`，显式 `--budget` 可检查本地延迟上限。细节见 [CI 与导出验证](docs/ci.md)、[历史 API](docs/history-api.md#local-postman-cli-contract-check)、[性能基线](docs/performance.md)。

涉及 DSH 适配时，在插件目录按其[测试说明](plugins/dsh-pinwhy/README.md#测试)运行单元与静态检查；通过 `PINWHY_TEST_CLI` 明确指定本次内核执行真实 CLI 集成检查。真实 Host 验证和会发送模型请求的 `verify:e2e` 是分别执行的本地检查，不以单元测试结果代替。

只为有意义的可观察行为添加测试，例如输出兼容、并发写入、身份隔离、读取不变性、草稿冲突与导出消费端行为。不要用源码字符串、内部 import 路径或复制实现的断言固定一个重构方案。

## 契约与版本

[公开契约](docs/CONTRACT.md)是 CLI 参数、JSON schema、HTTP 行为、事件格式与写入目标的唯一参考。SDK 通过 `pinwhy-core` 的根入口与声明的子路径公开能力；其他仓库内部模块路径、终端文案和目录拆分不是公开接口。

- 外部行为变化时，先更新有意义的契约或行为测试，再同步实现与文档；不要仅为新输出重新生成存档而隐藏差异。
- `lib/contracts.js` 集中声明输出、写入目标和图 schema。新增公开能力必须与 `capabilities`、固定输出和契约文档一致；适配器按能力声明检测，不解析版本号或内核文件名。
- `status`、`severity`、`confidence` 保持独立的字符串或 null，不由类型推断；`receipt.result` 保留写入时原样结果。
- 事件兼容纪律与 schema 兼容纪律分开处理：兼容新增不提高 `EVENT_VERSION`；只有旧逻辑会回放出错误投影时才提高。完整规则见契约，不创建第二份格式说明。
- 根包版本与 lockfile、固定能力输出中的版本一致；可选插件独立版本。原 blackboard 的 `0.8.1`–`0.8.3` 延续 `0.8.0` 的 CLI / JSON / 事件契约，不为内部文件移动或健壮性修复提高 schema 版本；`0.9.0` 只做兼容新增（新字段与能力标记）并停止为 vuln 补默认严重度，同样不升 schema；`0.10.0` 新增 `batch` 命令与 `blackboard.batch.v1`，其余输出不变；`0.10.1` 是修复版本，只收紧无效输入的校验，不升 schema。

Pinwhy `0.11.0` 是命名 breaking cutover，插件为 `0.3.0`：机器 schema 统一改为 `pinwhy.*`，形状和 v1/v2 后缀不变，`EVENT_VERSION = 1`。无旧命令、环境变量或目录兼容别名；事件正文、作者与回执原样保存。真实数据与宿主安装的手动迁移由用户按[迁移说明](docs/USAGE.md#upgrade)执行，开发 Agent 不操作真实副本。

## 隐私与公开内容

公开测试、截图、导出和演示只使用明确的合成数据。不要提交真实黑板、研究日志、请求/响应、模型会话、目标信息、个人绝对路径、凭据或本机接入副本；`trial/`、`recon/`、`report/`、`.pinwhy/`、`.agents/`、`.claude/` 等保留在本地。完整 Skill 的发布源是 `skills/pinwhy/`。

提交或推送前运行 `npm run check:publish`。仓库的 `.githooks/` 提供暂存与待推送历史检查；本地可用 `git config core.hooksPath .githooks` 启用。默认命令检查当前工作树可发布文件，暂存快照可用 `npm run check:publish -- --staged` 检查；pre-push 还检查待推送中间提交，不能靠末尾删除敏感内容掩盖已提交历史。真实目标匹配词只存本地 Git 的 `info/publication-deny.json`，不要放进公开扫描器或 fixture。检查输出仅给路径与规则，不回显命中内容。

## 发布与交接

本轮发布 `pinwhy-core@0.2.0`、`pinwhy@0.2.0` 与 `pinwhy-cli@0.2.0`，四包验证继续包含已发布的 `dsh-pinwhy@0.3.0`。registry 消费必须等待对应版本发布成功；版本已存在且内容未变的插件沿用原发布。

```bash
# 先按本地验证清单构建与检查，再生成全部候选
npm run pack:packages
# 实际隔离消费者安装，而非仅检查源码或 tarball 文件名
npm run verify:npm-packages
# 使用指定 registry 验证消费者安装
npm run verify:npm-packages -- --registry https://registry.npmjs.org
```

`pack:packages` 生成 `dist/npm/*.tgz` 与 `dist/npm/manifest.json`。SDK 的暂存实现从规范 `lib/` 自动生成，修改只落在单一源文件；不要编辑生成副本。`lib/core.js` 选择 SDK 根导出，子路径导出由 SDK 包元数据声明。完整 `pinwhy` 自包含且零运行时依赖，根 `LICENSE` 包含在分发中；`pinwhy-cli` 精确依赖该版本并执行其真实 CLI。适配器独立发布，DSH rc.2 门禁保持不变。

完成候选与消费者验证后，发布顺序为 **pinwhy-core → pinwhy → pinwhy-cli → dsh-pinwhy**，让官方 CLI 的精确依赖先可解析。认证、registry 可见性和每个发布结果需要单独确认，打包成功不代表发布成功。安装和 SDK import 不启用 Hook、服务或迁移；不要用真实项目、全局宿主接入或用户服务做候选验证。源码 `release install` 与不可变版本 / `current` 安装继续支持。


变更说明写清问题、行为变化、运行过的命令及结果，未执行的检查明确写明。CI 配置存在不代表矩阵通过；记录具体运行的链接或本地环境。Chromium 与 SARIF schema 校验不等于 GitHub code scanning 上传或 IDE 导入，DSH headless 模型检查不等于桌面交互验收。

发布候选流程与同一 tarball 的 Linux / macOS / Windows、Node 18 / 22 / 24 验证见 [CI 说明](docs/ci.md)。先构建并核对发布内容，再按[版本管理](docs/USAGE.md#release)安装不可变版本；日常使用从 `current` 切换。发布、真实接入和真实模型请求不由普通代码测试自动触发。

