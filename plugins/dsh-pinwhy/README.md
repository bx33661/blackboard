# dsh-pinwhy

pinwhy 的可选 **DeepSeek Harness 适配器**，位于主仓库的 `plugins/dsh-pinwhy/`。子包独立管理依赖、版本、测试和发布，不包含嵌套 Git 仓库；pinwhy 核心不依赖、不导入 DSH。

```text
DSH → dsh-pinwhy → 独立安装的 pinwhy CLI → 项目 .pinwhy/events.jsonl
```

目标版本：DSH `0.2.2-rc.2`，使用其原生主面板、会话视图与菜单扩展接口。pinwhy 不按版本号判断，而按 `capabilities --json` 检测：`schema` 为 `pinwhy.capabilities.v1`，`features` 含 `writeAttribution`、`cwdFlag`、`noInit`、`resourcePaths`，用到的核心命令输出声明为插件读取的 schema，并声明 `writeTargets` 和绝对资源路径 `resources.cli`、`resources.skill`。缺少上述声明的构建会在诊断中报 RUNTIME_INCOMPATIBLE。内置画板另需下文说明的临时查看服务能力。Node 与 DSH 的运行要求一致：`^22.19.0 || >=24.0.0`。源码是可直接运行的 ESM，安装后不依赖构建或生命周期脚本。

## 插件展示信息

中文界面显示 **Pinwhy · 外置黑板**，英文界面显示 **Pinwhy · External Memory**；插件与所含组件共用名称、简介和品牌图标（浅色界面使用 Paper 浅底与深绿图标，深色界面使用墨黑底色与薄荷绿图标）。展示文字来自导出的 `locale/en.json`、`locale/zh.json`，图标来自包内 `assets/pinwhy-icon.svg`。这些资源随插件独立打包，不依赖仓库外路径或网络加载。

包标识为 `dsh-pinwhy`，组件 ID 为 `pinwhy`；安装与 bundle 配置须使用新标识，并重新显式选择项目，不读取旧插件配置。源码链接安装修改后，重新进入插件页查看；宿主仍缓存旧元信息时，退出并重新打开 DSH。发布包安装需要更新插件包。项目主页、代码仓库子目录和问题反馈地址同时保存在 package.json 中；具体展示项由 DSH 界面决定。

## 已实现

- **DSH 原生内置 Web 画板**：左侧「更多 → Pinwhy 画板」打开全局主面板，可选择已有项目会话；会话顶部「更多 → Pinwhy 画板」打开当前会话的全宽视图。支持宿主原生固定／取消固定入口，也在快捷键设置中注册「打开 Pinwhy 画板」（默认不绑定按键）。输入框不放置画板按钮。画板复用主项目 Web 工作台，支持 2D/3D、节点详情、关系、参与者现场及历史阅读。
- **从黑板恢复并实时同步**：打开即读取完整快照，通过内核 SSE 接收变化，包括其他 CLI 或宿主的写入；聊天工具卡片只展示单次调用结果，不承担图状态重建。
- **显式项目接入**：默认只接入配置中选择的项目；可从 DSH 已登记工作区添加项目，仍可手动填写绝对路径。自动发现已有黑板是默认关闭的可选设置；保存配置与发现黑板均不会初始化项目。
- **11 个结构化原生工具**：涵盖基础读写、只读诊断、原子批量操作 (`pinwhy_batch`) 与关键词/过滤器记忆检索 (`pinwhy_search`)。
- **Skill 提供者**：动态读取独立 CLI 暴露的 `SKILL.md` 并附着 DSH 适配指引，不复制代码副本。
- **异步 CLI 进程边界**：子进程隔离，避免 Pinwhy 同步 I/O 与文件锁阻塞 DSH 事件循环；超时、取消与销毁优雅回收。
- **安全沙箱无缝衔接**：对接 DSH `sandboxPolicy` 服务，严格核验 `writeTargets` 物理路径，拦截越界写入。

移除本插件后，黑板数据和独立 CLI 保持完全可用。

## 安装与启用

### 1. 独立安装 pinwhy

按 [pinwhy 文档](https://github.com/bx33661/pinwhy) 安装并执行其 `release install`。默认运行路径为：

```text
$XDG_DATA_HOME/pinwhy/current/bin/pinwhy.js
# 未设置 XDG_DATA_HOME 时：~/.local/share/pinwhy/current/bin/pinwhy.js
```

不要把日常插件指向开发仓库；current 指针的切换、升级与回滚由 pinwhy 自己管理。

### 2. 将插件子包安装为 DSH bundle

从主仓库中插件子包的绝对路径安装，例如：

```sh
dsh plugin --profile web add /absolute/path/to/pinwhy/plugins/dsh-pinwhy
dsh --profile web --dump-config
```

在插件子目录运行 `npm pack`，从生成的 tgz 安装。根包的发布文件列表不包含本插件，插件也不复制 pinwhy 内核或 Skill 正文。SDK 仅声明为子包的 peerDependencies，由 DSH 提供共享实例；根目录安装不需要 DSH SDK。

### 3. 显式初始化并选择项目

用户选择接入的项目后，独立执行一次：

```sh
pinwhy init --cwd /absolute/path/to/your-project --json
```

将配置示例中的目录替换为实际绝对路径，通过 profile 的 `cordis.patch.yml` 或启动 overlay 应用：

```yaml
- id: pinwhy
  config:
    projects:
      - workspace: /absolute/path/to/your-project
        boardRoot: /absolute/path/to/your-project
```

```sh
dsh web --patch /absolute/path/to/pinwhy-project.patch.yml
```

bundle 默认 `projects: []`，安装本身不启用任何项目。DSH 替换整行 config 而非深合并；自定义 runtimeCli 等字段时在同一配置中一并保留。`web` 是示例 profile，桌面端应选择实际使用的 profile。

## DSH 内的配置与卡片

打开 **插件 → Pinwhy · 外置黑板 → 包含的组件 → 配置 Pinwhy · 外置黑板**。插件携带即用的 browser client，桌面端和 Web 使用同一配置页与工具卡片，不要求用户构建。

- 添加/移除项目，填写工作区绝对路径；黑板根目录留空时使用工作区。保存配置不会创建黑板，仍须在确认的项目中显式执行 `pinwhy init --json`。
- CLI 和 Node 字段留空时恢复默认路径；超时和输出上限可直接调整。修改只提交实际变化字段，通过宿主 settings 服务保存；并发修改会被修订号拒绝，草稿保留，可重新读取后重试。
- 配置采用 volatile 字段。新调用读取完整快照；已开始的调用保留原项目、CLI、超时与输出上限，不在执行途中切换。配置保存不重新挂载插件。
- 在项目会话中输入“检查 pinwhy 接入状态”，可让 Agent 调用 `pinwhy_diagnose`。此工具在项目尚未启用时也可用，分别报告 CLI、项目/黑板、实际只读状态查询及当前宿主写策略，并给出处理提示；不自动修复、不写入或调整权限。
- 所有 pinwhy 工具提供本地化标题、节点/关系摘要、项目与参与者身份、诊断事项、可展开的原始调用/结果和轨迹入口。卡片展示是持久结果上的投影，不是新的黑板事实源；错误或旧记录没有可识别元信息时保留原始结果，不显示成功摘要。

画板是只读投影；Agent 写入继续使用原生工具并接受宿主写策略检查，不启用自动恢复或自动检查点。安装过旧版源码链接时，重启 DSH 以刷新 Config 和 browser client 清单；发布包安装需更新包。仅提供 Host 的 headless profile 仍可使用工具，无需加载浏览器资源。

### 内置画板的数据与生命周期

画板使用独立 Pinwhy CLI 提供的临时只读查看服务，要求运行时声明 `features.ephemeralViewer` 和 `outputs.serve.schema: pinwhy.viewer.v1`。不具备此能力的运行时会显示升级提示，已有工具与 Skill 不因此失效。

打开画板时，DSH Host 根据真实 Session 的原始工作区选择黑板；浏览器只传 Session ID，不能指定任意目录或命令。每个 Session 使用独立的临时端口与不可猜测的路径，同一 Session 再次打开会复用服务。Web 端通过 DSH 的认证路由转发页面、资源和实时流，桌面端直接嵌入本机地址；不需要另开浏览器，也不把宿主凭据传给 Pinwhy 服务。

服务使用 `serve --read-only --ephemeral --json --port=0 --base-path=...`，不修改项目的查看器端口配置、不初始化黑板，也不占用或停止用户已有查看服务。Session 关闭或插件卸载时回收子进程；宿主退出关闭输入管道时，临时服务也随之退出。

画板明确区分加载、接入错误和真实空黑板。全局面板保留打开时的会话选择，并在读取期间持有该 Session 引用；切换 Session 会清除旧绑定，迟到的打开结果不能覆盖新 Session。画板中的选中、高亮和视角只属于阅读状态，节点创建、查看和卡片重放都不会伪造参与者游标。

全局会话选择器按项目工作区分组，组内沿用宿主列表顺序；空会话标注「新会话」，当前持有的会话仍可保留选择。悬停选择器可查看工作区完整路径。标题与选择器按主面板实际宽度换行，侧栏展开时也不会横向挤出。

加载提示覆盖服务连接与画板页面加载两个阶段；「重新加载」会重新加载当前画板文档，即使临时服务和地址被复用。接入错误提供明确的「重新连接」按钮和可展开的错误详情。加载指示遵循系统减少动态效果设置。

工具卡片的「在画板中查看」按调用所属 Session 打开并定位记录节点，不使用当前聊天会话代替；记录的黑板身份与当前绑定不一致时拒绝定位。切换阅读视角和定位均不写事件、不移动参与者游标。

内嵌画板通过宿主公开的主题和语言服务同步明暗、界面语言、文字／代码字体及字号；宿主设置只作用于内嵌页面，不覆盖独立查看器偏好。画板支持的语言为简体中文、繁体中文、英语和日语，其他宿主语言回退英语；记录正文始终保留原文。

用户在实时画板的节点详情中显式选择引用后，插件按所属 Session 重新只读获取完整节点，将原始记录作为引用插入该会话的现有草稿，并返回该会话。引用不替换原有草稿、不自动发送、不移动黑板游标、不推断关系；历史／离线画板不提供此动作。读取失败、取消或当前输入状态拒绝编辑时如实报告，不自动重试写入。

入口的固定状态交由 DSH 管理，依照宿主语义在插件重载后重置；快捷键绑定由宿主按设备保存。插件不维护第二套导航偏好或键盘监听器。

## 配置

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `autoDiscover` | `false` | 用户显式启用后，在没有项目白名单时查找当前工作区或祖先目录的已有黑板；不会初始化 |
| `projects` | `[]` | 显式项目白名单数组；每项有绝对路径 `workspace`、可选 `boardRoot` |
| `runtimeCli` | 独立安装的 current CLI | 绝对脚本路径；支持自定义数据目录 |
| `nodeExecutable` | 宿主 process.execPath | Node 绝对路径；桌面 Electron 自动使用 Node 模式启动子进程 |
| `timeoutMs` | `10000` | 50–120000 毫秒 |
| `maxOutputBytes` | `1048576` | stdout + stderr 合计上限，1024–16777216 字节 |

项目匹配优先遵循 `projects` 显式白名单；没有显式项目且用户启用 `autoDiscover` 时，才向上查找最近的有效 `.pinwhy` 黑板。当前会话工作区以原始 `session.header.cwd` 为锚点。旧配置中明确保存的 `autoDiscover: true` 继续生效；未保存该字段的配置采用显式接入默认值。

写入身份固定为 `dsh:<session.id>`，恢复同一会话沿用该身份，子会话使用独立游标。context 的可选 agentId 只用于显式读取其他参与者现场。身份标识不构成权限隔离。

## 工具契约

| 工具 | 参数 | 行为 |
| --- | --- | --- |
| `pinwhy_diagnose` | 无 | 只读检查接入、返回问题与处理提示；不要求项目已经启用 |
| `pinwhy_status` | 无 | 读取数据及服务状态，不启动服务 |
| `pinwhy_context` | budget、focus、since、agentId 可选 | 读取恢复投影，不移动游标 |
| `pinwhy_node_get` | id | 读取节点及关联 |
| `pinwhy_node_add` | type、title；detail、status、severity、confidence、at、tags、enter 可选 | 创建节点，enter 默认关闭，不自动连边 |
| `pinwhy_node_patch` | id；至少一个 title、detail、status、severity、confidence、tags | 只更新显式字段；0.6 CLI 不支持在此清空字段或 tags |
| `pinwhy_link` | from、to、relation；label 可选 | 写入显式有向关系，支持自定义关系 |
| `pinwhy_cursor` | id；reason 可选 | 明确移动到节点或 none，不提供 next 自动选择 |
| `pinwhy_checkpoint` | summary | 保存显式交接检查点 |
| `pinwhy_search` | query、type、status、severity、confidence、tags、limit 可选 | 结构化搜索黑板节点，只读 |
| `pinwhy_batch` | operations、requestId 可选 | 原子批量执行一组 node/link/edit 操作，全部成功或全部不写入 |

原有 8 个读写工具的成功结果保持规范 JSON envelope：

```json
{
  "boardRoot": "/absolute/path/to/project",
  "agentId": "dsh:session-id",
  "data": {},
  "diagnostics": ""
}
```

`pinwhy_diagnose` 单独返回 `pinwhy.diagnostics.v1`：`readOnly: true`、`runtimeCli`、可为空的 `sessionWorkspace`/`boardRoot`/`agentId`、`readyToRead`、`readyToWrite` 和 `checks`（id/status/code/message/remedy）。预期的未接入或只读状态作为诊断数据返回；取消和卸载仍是工具执行错误。可写结论只是调用时的宿主策略检查，真正写入仍会重新授权。

data 是 CLI 的原始结构化结果，diagnostics 保留 stderr 提示（包括字段截断）。context 强制核对 `pinwhy.context.v2` 及 policy 中的 readOnly=true、prescriptive=false、nextStepSelection=agent-controlled。节点公开 JSON 的 status/severity/confidence 为字符串或 null；当前适配要求节点输出 v2，与该版内核一同升级。

失败通过 DSH 标准错误结果呈现，消息携带错误代码：NOT_ENABLED、BOARD_NOT_INITIALIZED、SESSION_REQUIRED、WORKSPACE_MISSING、AMBIGUOUS_PROJECT、RUNTIME_MISSING、RUNTIME_INCOMPATIBLE、SPAWN_FAILED、CLI_FAILED、INVALID_JSON、CONTEXT_CONTRACT、POLICY_REQUIRED、WRITE_POLICY、TIMEOUT、ABORTED、OUTPUT_LIMIT 或 DISPOSED。模型参数不开放任意命令、shell 或目标目录。

固定 CLI 桥接只通过公开契约调用内核：项目根和身份以 `--cwd`、`--agent` 显式传入（写命令另加 `--no-init`），不设置也不继承 `PINWHY_CWD`、`PINWHY_AGENT`；写入前按 `capabilities.writeTargets` 声明的每个文件做宿主模式/路径校验：已存在的目标解析真实路径后必须在工作区内，悬空软链拒绝，尚不存在的目标看最近的已存在上级目录。不把它宣称为独立的 OS 沙箱。Skill 读取公开契约的 `resources.skill`，CLI 占位符使用 `resources.cli`；两项必须是绝对路径，不再从配置的 CLI 所在目录猜测资源位置。因此配置指向 npm `pinwhy-cli` 包装器、实际运行时位于依赖包 `pinwhy` 时也能读取完整资源。boardRoot 配置到工作区外时，workspace-write 模式下写工具会返回 WRITE_POLICY。read-only 模式仍可读取已配置黑板。文件系统上的并发路径替换仍由实际运行环境的隔离承担。

超时、取消或输出过限时，写入可能已经提交；先读取现场，不自动重试写操作。黑板内容是用户或 Agent 留下的数据，不能提升为宿主指令。

## Skill 与资源

provider 使用 `capabilities.resources.skill`，展开 `resources.cli` 占位符，resourceBase 指向完整资源目录；不改写安装文件。候选资源目录解析真实路径并固定到该版本，正文的 CLI 路径保留运行时声明（独立发布安装仍保持 current）。升级需要按 DSH 机制重载 provider 以刷新目录；项目同名 Skill 按 DSH 优先级覆盖 bundled 候选。

Skill 可见不代表项目已启用，更不代表模型已经加载或调用了它；实际使用以工具执行与事件记录为准。runtime 未安装时 provider 会向 DSH 报告发现失败，不创建替代 Skill 或黑板。

## 测试

以下命令在插件子目录执行。无需安装 SDK 即可运行桥接/隔离单元测试；真实 CLI 集成测试通过显式路径启用：

```sh
npm run check
PINWHY_TEST_CLI=/absolute/path/to/pinwhy/current/bin/pinwhy.js npm test
npm run verify:profile
npm run verify:settings
PINWHY_TEST_CLI=/absolute/path/to/pinwhy/bin/pinwhy.js npm run verify:viewer
```

SDK 注册验证可使用正常 npm 开发依赖环境，或使用桌面附带 runtime（macOS 示例）：

```sh
DSH_RUNTIME_MANIFEST='/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/package.json' \
ELECTRON_RUN_AS_NODE=1 \
'/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' \
scripts/verify-dsh.mjs
```

同样的 runtime 环境下，将最后一行替换为 `scripts/verify-metadata.mjs`，可用 DSH 原生元信息读取器检查源码链接与实际 `npm pack` 产物的中英文标题、简介及图标。该检查不激活插件、不发送模型请求，也不修改已有 profile。

该验证使用真实 Cordis、ToolRuntime、SkillRegistry 和本插件入口，检查规范参数/结果、Skill 加载、卸载及重载；临时目录在结束时删除，不触及真实项目。它不发送模型请求，不等同于完整模型会话测试。

`verify:settings` 在独立 DSH_HOME 中通过真实宿主 settings/configEditor 保存配置，检查新调用即时生效、插件实例身份不变、非法值/过期修订号不落盘、重启恢复，以及诊断前后事件内容不变。设置 DSH_PLUGIN_PACKAGE 为 tgz 可检查发布产物；不发送模型请求。

`verify:profile` 另用临时 DSH_HOME 实际安装、启动和移除 bundle；创建真实会话，核对 read-only 拒绝写入、workspace-write 允许写入和 Skill 发现。它使用 PATH 中的 dsh，或 DSH_BIN 指定的可执行文件。设置 DSH_PLUGIN_PACKAGE 为 tgz 的绝对路径即可验证打包产物；测试结束移除整个临时 home。

`verify:viewer` 使用临时 DSH Web profile、真实宿主菜单及 Playwright，检查两处菜单入口、全宽布局、大图初始可读性、会话切换、关系与证据阅读、只读浏览、外部 CLI 实时更新、宿主主题同步，以及 2D/3D 实际渲染；不发送模型请求。它需要开发环境中的 Playwright 和 Chromium。`PINWHY_CANVAS_OUTPUT` 可指定截图输出目录，验证不修改已有 DSH_HOME 或真实项目。

### 真实模型端到端验收（显式运行）

```sh
npm run verify:e2e
```

此命令会发送真实模型请求，使用现有 DSH headless 模型配置和 `.env` 中的环境变量凭据，不使用模型或工具响应 mock，也不在脚本中代替模型调用插件工具。它独立打包安装插件，再通过三次自然语言任务验证：模型加载 Skill、创建节点/关系/游标/检查点；新进程恢复同一会话；新会话从黑板读取交接口令。恢复前后核对事件文件哈希。

默认读取 `$DSH_HOME/profiles/headless/cordis.patch.yml` 和 `$DSH_HOME/.env`，未设置 DSH_HOME 时使用 `~/.dsh`。测试 home 通过临时符号链接读取 `.env`，结束即移除链接；不复制密钥到报告，原模型配置和凭据文件须保持原哈希。这个入口针对已有的环境变量认证路由，不启用 GUI 托管凭据。

可选环境变量：`DSH_E2E_AUTH_HOME` 指定已有配置目录，`DSH_E2E_MODEL_PATCH` 指定模型 patch，`DSH_E2E_DIR` 指定一个全新的证据目录；DSH_BIN 和 PINWHY_TEST_CLI 的用法同上。默认保留在系统临时目录中的 `REPORT.json`、自然语言提示、模型工具调用 JSONL、会话日志和测试黑板，不写真实项目。

测试项目创建独立 Git 根并显式 `init --here`，避免继承上级黑板；测试中关闭其他文件 Skill provider，核对 pinwhy Skill 来自本插件 provider。验证用观察器只限制工具集合、记录模型路由和设置步数上限，不提供工具调用结果。该验收覆盖 headless 模型链路，桌面 UI 点击流程需另外验证。

## 移除与独立性

```sh
dsh plugin --profile web remove dsh-pinwhy
```

另外移除自己添加的项目 override。插件不删除 `.pinwhy/`，不回滚 pinwhy 自身的版本，不修改其他宿主的接入配置。

维护边界：适配代码只处理 DSH 协议、配置、身份和展示；通用图语义、锁、回放与持久化改动应在 pinwhy 主项目独立讨论和测试，不在适配包复制核心实现。
