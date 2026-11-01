# 发布候选验证

`.github/workflows/verify.yml` 是验证流程，不会发布 npm 包、创建 release、安装全局启动器、接入个人宿主或调用付费模型。

当前源码边界见[架构说明](ARCHITECTURE.md)，本地开发与检查清单见[贡献指南](../CONTRIBUTING.md)。`0.10.1` 在 0.8.0 公开契约上做兼容新增；本文描述验证器与 workflow 的覆盖，不为该版本预先记通过结果。

## 流程

1. **构建一次**：Ubuntu / Node 24 先检查 publication hygiene，再执行 `npm ci`、`npm run check:types`、`npm run check:docs`、测试及前端 build；安装 Playwright Chromium 后，执行真实查看器交互与 3D 降级验证，再用真实 CLI 生成合成报告，在浏览器中渲染 Markdown/Mermaid，并用随库固定的 OASIS schema 校验 SARIF；收集 quick 合成性能报告，再 `npm pack --ignore-scripts`。本地 `npm run check` 合并类型、文档和 publication 检查，CI 将三项分开执行以明确失败位置。
2. **同包多运行时验证**：将同一个 tarball 交给 Linux、macOS、Windows 的 Node 18 / 22 / 24 矩阵；不执行源码目录的 `npm ci`。
3. **插件独立验证**：DSH 单元测试与静态 manifest/syntax 检查单独运行在插件声明支持的 Node 22.19 / 24；不把 Host SDK 加到根包，不假装这就是实际 DSH 端到端运行。

Vite 8 的构建依赖要求 Node `^20.19.0 || >=22.12.0`。核心运行时仍是 Node ≥18；Node 18 只消费已构建的 public 产物，不承担前端构建。

`blackboard-release-candidate` artifact 保存 tarball、npm pack 清单、合成导出的渲染截图与带机器信息的 quick 基线，保留 14 天。性能报告是观测，不是跨共享 runner 的毫秒级门禁。任何完整性断言失败仍会使任务失败。

`blackboard-viewer-verification` 单独保存查看器截图、离线合成 HTML 与 `VERIFICATION.json`，保留 14 天。只要查看器步骤执行，后续上传步骤即使在验证失败时也会运行；失败报告记录已完成的检查、错误和浏览器诊断，能够截图的页面会额外保存失败现场。

## tarball smoke 的实际覆盖

```sh
# 当前源码 -> npm pack -> 全新临时消费者安装 -> CLI 检查
node scripts/verify-package.mjs

# 已有候选 tarball，CI 矩阵使用这个入口
node scripts/verify-package.mjs --tarball /absolute/path/to/blackboard-0.10.1.tgz

# 用同一验证器测试另一个源码目录
node scripts/verify-package.mjs --source /absolute/path/to/baseline
```

验证器使用临时 HOME / USERPROFILE、独立 npm cache、独立 BLACKBOARD_CWD，并在结束时删除临时目录。它检查：

- 根包没有 runtime / peer 依赖，干净消费者只有 blackboard 一个包；
- runtime 包不包含 plugins、web 源码、test、node_modules 或黑板数据；
- 完整单源 Skill 的目录与文件字节一致，不只是入口文件；
- public 的 JS / CSS 存在，HTML 引用的本地资源实际存在；
- **安装后的 CLI** 能显示版本、初始化、写节点、输出 JSON / Markdown context、只报告 lint，导出离线 HTML、Markdown、Mermaid 和带代码位置的 SARIF；运行时不依赖导出验证所需的开发依赖。
- context 保持只读 / non-prescriptive / Agent 决定下一步的契约；
- context、lint、export 前后事件日志字节不变。

它不启动服务，不修改真实项目，不执行 release install/setup/hooks，不验证 OS 专属常驻服务。矩阵通过也不应被描述成所有平台服务功能都已测过。

## 离线文档检查

`npm run check:docs` 使用 Markdown、HTML 与 GitHub 标题解析器检查公开文档中的相对链接、图片和标题片段，也检查图片 `srcset`。显式 HTML ID 和重复标题生成的锚点均参与核对；围栏示例不当成真实链接。不访问外部网站，不检查非 Markdown 资源内部的片段，也不扫描被 publication 规则排除的任务数据。诊断仅报告源文件、行号和原因，不回显链接目标。


## 导出消费端回归

```sh
npm ci
npx playwright install chromium
npm run verify:exports
# 需要保留合成报告的视觉证据时：
npm run verify:exports:text -- --out-dir /tmp/blackboard-export-consumers
```

验证器只创建临时合成黑板。Markdown 检查浏览器中显示的作者原文、章节与关系链接，并检查恶意输入没有生成可执行元素；Mermaid 使用本地官方 bundle 在 Chromium 中生成 SVG，覆盖普通图、长标题、特殊字符、分组和空图。SARIF 使用固定的官方 2.1.0 schema 校验真实 CLI 的结果，并检查有位置、缺位置和重复导出的身份语义。验证前后检查事件日志不变；不写真实项目，不依赖网络或模型账号。

这些检查不宣称已经通过 GitHub code scanning 上传或特定 IDE 的导入验收。实际平台的权限、路径解析和告警生命周期仍需在对应环境验证。

## 查看器浏览器回归

```sh
npm ci
npm run build
npx playwright install chromium
# Linux 缺少浏览器系统库时，使用 npx playwright install --with-deps chromium
BLACKBOARD_VIEWER_OUTPUT=dist/viewer-verification npm run verify:viewer
```

入口为 `web/scripts/verify-viewer.mjs`，默认使用项目已安装的 Playwright 开发依赖与其 Chromium，无需外部模块路径。构建工具的 Node 要求同上，建议 Node 24。每次先构建当前前端；验证器不会替你构建。可选 `PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs` 与 `CHROMIUM_EXECUTABLE=/absolute/path/to/chromium` 仅用于已有外部安装。未安装依赖、浏览器缺失或正常 3D 无法渲染都会失败，不会跳过。

验证器在临时目录创建明确的合成事件，使用隔离的 HOME / USERPROFILE 和 BLACKBOARD 环境，通过本地临时端口服务已构建的产物。正常 3D 显式使用 ANGLE / SwiftShader，供 CI 软件渲染；另起禁用 WebGL 的 Chromium 验证能力缺失路径。检查主体上限四分钟，单项等待、失败截图与清理也各有超时；结束时关闭浏览器、服务并删除临时数据。`BLACKBOARD_VIEWER_OUTPUT` 仅指定保留的证据目录，未指定时打印独立临时输出目录。

检查通过可见控件、实际网络行为、Canvas 像素与事件日志字节观察行为，不读取 React 私有状态或断言源码结构：

- 原有节点证据、历史、检查点变化、关联已有节点、独立字段编辑与冲突草稿；延迟历史 / 检查点响应与初始快照不会覆盖新选择或新 SSE；375px 窄屏可读性。
- 版本按钮的可见 tooltip 与公开快照中的版本、构建标识和来源信息一致；缺少该可选字段的旧版快照仍能打开详情且不显示版本按钮；离线版本提示不新增 API / SSE 请求。
- 真实进入 3D 并渲染，Escape 保持清除选择的既有语义，通过“返回平面画布”退出并恢复入口焦点；旋转与选择不发写请求、不改事件。只读服务也能查看 3D，且没有编辑或建立关系表单。
- 初始 2D 就绪后真实阻断懒加载脚本，确认确有失败请求；另在确实无法创建 WebGL context 的浏览器打开 3D。两种情况都要求显示降级提示、恢复焦点，并能在 2D 点击节点打开详情。
- 只读服务的历史仍可读，离线 HTML 明确说明历史不可用，并且不发 API / SSE 请求、不产生事件写入。

正常与失败路径均输出 `VERIFICATION.json`；已有截图不会因后续失败而丢失，失败时还会尝试截图当前页面。诊断保留刻意制造的脚本 / WebGL 故障，是否通过由实际 UI 与事件断言决定。缺少浏览器等启动前错误无法生成页面截图，但仍保留失败报告。截图、HTML 与诊断只包含本次合成数据及当前程序的构建来源，不能用真实项目替代 fixture。

## DSH 真实 Host 与付费模型检查

常规 CI 无需模型账号。发版需要真实 Host 验证时，在插件目录按其 README 显式运行 `verify:dsh`、`verify:metadata`、`verify:profile`、`verify:settings`，并使用临时 DSH_HOME / 测试黑板。它们与不加载 SDK 的 unit test 是不同层级。

`verify:e2e` 会使用真实模型配置，保留为人工触发的本地发版检查；不要把模型密钥、个人 profile 或真实研究黑板放进公共 PR runner。

## 结果措辞

此前文档记录过本地新增测试和 macOS / Node 26 tarball smoke 实跑；这是历史环境记录，不代表当前提交或 Node 18 已验证。每次交接应明确实际运行的命令、环境、结果与未运行项；GitHub Actions 矩阵只有在该 workflow 的具体运行成功后才算经过验证。提交 workflow 文件本身，不等于 Linux / Windows / Node 18 已经跑通。
