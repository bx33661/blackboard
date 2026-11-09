# 使用参考

[返回首页](../README.md) · [文档目录](README.md) · [公开契约](CONTRACT.md) · [贡献指南](../CONTRIBUTING.md)

先尝试首页的[一句话开始](../README.md#quick-start)。本文保留手动安装、CLI 示例、上下文预算、配置、服务管理与升级细节；机器可读输出以公开契约为准。所有命令示例使用合成场景，示例 ID 必须替换为当前黑板返回的实际 ID。

CLI 的帮助、命令回显、错误、诊断及 `digest` / `tail` / `context --markdown` 的生成文字统一使用英文。节点标题、正文、关系标签、游标原因和检查点摘要保留记录时的原文。网页语言仍由工作台的语言设置决定。

- [手动安装](#manual-install)
- [Agent 上下文与并行身份](#agent-context)
- [CLI 与记录语义](#cli)
- [配置、数据保证与活动记录](#configuration)
- [常见问题与停止服务](#troubleshooting)
- [版本与升级](#release) · [旧命名迁移](#upgrade)

<a id="manual-install"></a>


## 手动安装

### 1. 安装稳定的本机版本

以下终端示例使用 Bash / Zsh：

```bash
git clone https://github.com/bx33661/pinwhy.git
cd pinwhy
node bin/pinwhy.js release install

# 当前终端立即可用；长期使用请加入 shell 配置
export PATH="$HOME/.local/bin:$PATH"
pinwhy --version
```

Windows PowerShell 中同样先 clone、进入仓库并运行 `node bin/pinwhy.js release install`，然后为当前终端添加启动器目录：

```powershell
$env:Path = "$HOME\.local\bin;$env:Path"
pinwhy --version
```

长期使用时将该目录加入用户 PATH。Windows 启动器为 `pinwhy.cmd`；Claude 恢复 Hook 使用 Git Bash，纯 CLI 与常驻查看器不需要 Bash。

`release install` 安装独立版本，由 `current` 指向它。日常 CLI、Skill 与服务使用这份副本，不随开发仓库分支切换。版本管理见[版本与升级](#release)。

### 2. 切回你的项目，选择对应宿主

**Claude Code：**

```bash
cd /path/to/your-project
pinwhy setup --target "$PWD" --title "项目或任务名" --open
```

`setup` 创建或复用 `.pinwhy/`，安装项目 Skill 与恢复 Hook，关闭原始工具活动自动采集。macOS、Linux、Windows 分别配置当前用户的 launchd、systemd 用户服务、计划任务；对其他项目再次执行会切换共享服务目标。服务管理器或用户会话不可用时明确报错，可用 `--no-serve` 完成其他接入，再手动 `serve`。按需使用 `--no-hooks`、`--no-skill`。

**Codex：**

```bash
cd /path/to/your-project
pinwhy init --title "项目或任务名"
pinwhy skill install --codex
pinwhy serve --open
```

已有黑板可跳过 `init`。项目 Skill 安装到 `.agents/skills/pinwhy/`；明确需要用户级安装时加 `--user`。Codex 不使用 Claude 专用 `setup` 或 Hook。

需要后台查看器时，在已初始化的项目运行 `pinwhy service install`；这只安装服务，不安装 Claude Skill 或 Hook。

**仅手动使用 CLI：**

```bash
cd /path/to/your-project
pinwhy init --title "项目或任务名"
pinwhy serve --open
```

`serve` 是前台服务，`Ctrl+C` 或在该项目运行 `pinwhy stop` 即停止。项目子目录会发现上层最近的 `.pinwhy/`；确需独立黑板时使用 `init --here`。

在终端里查看黑板使用 `pinwhy status`、`pinwhy search` 和 `pinwhy show`；需要交互浏览时打开网页工作台。终端面板和列表是静态输出，不接管键盘，不等待输入。

### 3. 核验接入结果

```bash
pinwhy status
pinwhy digest
pinwhy doctor
```

默认工作台地址为 **http://127.0.0.1:4333**，以 `status` 返回的实际地址与项目归属为准。服务在线只说明工作台可用；Agent 是否已加载 Skill、是否已记录内容，需要分别确认。

Claude 用户级 Skill 与恢复 Hook、Codex 用户级接入及其他宿主的详细说明，见[接入、恢复与打开](../skills/pinwhy/references/setup.md)。

### 统一诊断

```bash
pinwhy doctor --cwd /path/to/project
pinwhy doctor --port 4334 --json
pinwhy doctor --share --json
```

`doctor` 统一检查 Node 运行环境、CLI 版本与来源、PATH 启动器、事件日志完整性、配置与缓存、Skill/Hook/启动器的实际指向、常驻服务归属以及查看器运行构建。没有黑板也能运行，不初始化、不修复、不写日志。检查项标为 `ok`、`warning`、`error` 或 `unknown`，能给出处理命令时会附上命令；宿主是否真正加载 Skill 始终标为待核验，不能从安装文件推断。

JSON 使用 `pinwhy.doctor.v1`。报告生成成功时退出码为 0，问题等级读取顶层 `status` 和 `checks`；参数错误仍按普通 CLI 错误处理。报告不包含节点、日志正文或原始 Hook 命令；`--share` 进一步隐藏本机绝对路径，适合提交问题时附上。


## 项目手记

打开项目服务的根地址，先看到一份可阅读的项目手记。顶部“项目手记”可随时切换；“继续探索”返回画布，正文中的节点和检查点按钮会定位到相应记录。已有的节点链接、视图链接与历史时点链接仍直接打开画布；地址加 `?page=notes` 可直接进入手记。

手记的封面呈现项目名称、检查点原文和关系缩略图，正文完整列出当前快照中的检查点摘要、节点与显式关系。节点详情、来源位置、标签及独立的状态、严重度、置信度会保留；没有记录的内容不会自动补成结论。历史时点的手记带检查点标记，并等待目标快照加载完成。

“封面设置”可修改手记名称、引言、项目标志和主题色。这些阅读偏好按项目保存在本机浏览器，不改写黑板记录。标志支持不超过 1 MiB 的 PNG、JPEG 或 WebP；浏览器无法保存设置时，页面会说明仅本次有效，仍可导出。

“导出离线手记”下载一份独立 HTML，包含当前封面和完整正文，支持目录跳转、明暗主题和打印，无需服务或联网。它保存的是当前快照；需要保留完整事件历史时，使用 `pinwhy backup`。




<a id="agent-context"></a>

## 给 Agent 的只读上下文

```bash
pinwhy context                              # 默认结构化 JSON
pinwhy context --focus hy1 --depth 2 --budget 4000
pinwhy context --since cp1                   # 查询检查点之后的变化
pinwhy context --markdown                    # 人类可读形式
```

示例 ID 需替换成当前黑板中的实际 ID。服务提供同一接口：

```text
GET /api/context?agent=agent:primary&focus=hy1&depth=2&budget=4000&since=cp1
```

返回包的 `policy` 明确声明 `readOnly: true`、`prescriptive: false`、`nextStepSelection: "agent-controlled"`。它整理目标、邻域、开放问题、发现、已确认事实和检查点，不生成下一步指令。

- **原文完整或整项省略**：已带入的节点标题、detail、标签、检查点/活动摘要和关系标签保留原文与空白，不再按固定字符数切掉末尾条件。`budget` 根据紧凑 JSON 估算 Token，不是真实 tokenizer 用量，也不包含格式化输出的额外空白；预算不足或达到 `--limit`（默认每分区 24 项）时，整项省略并计入 `omitted`、`truncated`。扩大预算不等于取消条数限制。
- 同一候选窗口内，某条记录太长装不下时，仍尝试后面的完整记录；`--limit` 继续限制候选窗口，不按可装入的数量向后扩展，也不推断记录的重要性。重复正文和分区预算分配保持现有契约。
- 若记录带有 `inputTruncation`，表示写入时原输入已被截短，与当前恢复包的 `truncated` 是两回事。投影会保留这一元信息；没有标记的旧记录不反推其历史完整性。
- **焦点同样遵守预算**：焦点正文放不下时，`currentFocus: null`、`omitted.currentFocus: 1`，但 `request.focus` 保留原 ID；这表示正文未带入，不表示游标消失或结论被撤销。`pinwhy show <id> --json` 可按 ID 读取完整节点。固定的项目/请求元数据本身超过预算时，`estimatedTokens` 如实显示开销，不裁剪元数据或改写记录。
- **省略不是改判**：省略计数按分区条目统计，包含同一节点的不同视图，不等于不同缺失节点数。投影不抽取“关键句”、不推断限制条件、不改变状态/可信度或下一步。

指定 `since` 时，`recentChanges` 返回仍存在的新增或修改节点，`changes` 按新到旧报告 `relation-added`、`relation-removed`、`node-removed`；节点删除同时使其关联关系失效。检查点按事件位置划界，同一毫秒内的后续写入也纳入增量；时间戳则只包含严格晚于该时间的事件。无效检查点明确报错，不静默返回空增量。变化记录同样整项受预算约束，需检查 `omitted.changes`。节点公开投影遵循 `pinwhy.context.v2`；事件格式不变。

## 多个 Agent 并行

```bash
# 每次工具调用都显式指定身份与项目，不依赖上一次调用的 export
pinwhy node add hypothesis "待验证的猜测" --cwd /path/to/project --agent research --no-init --enter
pinwhy here --cwd /path/to/project --agent research

# 环境变量写法等价；--cwd / --agent 优先
PINWHY_AGENT=research PINWHY_CWD=/path/to/project pinwhy here

# 恢复或交接时读取指定视角
pinwhy context --cwd /path/to/project --agent research
```

默认身份是 `agent:primary`；并行 Agent 应使用不同身份，避免互相覆盖位置。`--agent research` 与 `PINWHY_AGENT=research` 一样归一化为 `agent:research`。写命令把身份记为节点和关系的 `author`、修改的 `updatedBy`、删除与重置的 `by`，用于事后回答"这条结论是谁写的"；这是归属，不是权限。`--no-init` 让写命令在项目根没有黑板时报错退出，不新建任何目录，避免路径写错时静默写进一块新的空板。`status`、`digest`、`tail`、`context` 可用 `--agent` 读取指定视角。工作台的 **Agent 视角** 下拉会同步切换当前焦点、现场投影、游标跟随和摘要，节点分享链接保留身份；没有游标时不借用其他 Agent 的位置。切换只改变阅读视角，不写事件、不移动游标；离线导出也支持已有身份的独立摘要。
Claude 恢复 Hook 仅使用其进程实际继承到的 `PINWHY_AGENT`：会话开始时恢复该身份的 Digest，压缩前保存该身份及其游标的检查点；启用工具活动采集时，活动也关联该身份。不设置时仍为 `agent:primary`，不会从宿主 `session_id` 自动创建身份。不要假设不同工具调用或所有子 Agent 会话都会继承环境；普通子 Agent 应在每次命令中显式指定身份与项目，并主动调用 `context` 恢复或交接。上下文只整理已记录的现场，不自动决定下一步。


<a id="cli"></a>

## CLI：记录一条可恢复的思路


黑板的三层互相独立：**逻辑层**记录“为什么”，**游标层**记录“在哪”，**活动层**保留可选的原始工具材料。创建节点、建立关系、移动游标不是同一件事。

下面在**新建、空白的黑板**中运行；`g1`、`o1`、`hy1` 是该示例按顺序得到的短 ID。已有记录时，请使用命令实际返回的 ID。

```bash
pinwhy init --title "内部 API 审计"

# 记录目标，显式进入
pinwhy node add goal "确认管理接口的授权边界" --enter

# 显式关联目标，并把关注点移到猜测
pinwhy node add hypothesis "读接口可能遗漏统一鉴权" \
  --parent g1 --rel related-to --enter

# 记录观察，并在创建时声明它支持猜测；不移动游标
pinwhy node add observation "匿名请求返回 200" --at evidence.txt:12 \
  --to hy1 --rel supports

# 事后才发现的关系用 link 声明，而不是让系统推断
pinwhy link o1 g1 --rel related-to

pinwhy here
pinwhy checkpoint --summary "已有匿名访问证据，正在比较中间件差异"
pinwhy digest --write
```

### 常用命令速查

| 要做的事 | 命令 |
| --- | --- |
| 看现状、列出记录 | `pinwhy status` / `pinwhy ls` / `pinwhy show hy1` |
| 筛选、统计记录 | `pinwhy search --type vuln --sev high --confidence reproduced` / `pinwhy search --type vuln --group-by severity,status` |
| 新建、编辑节点 | `pinwhy node add <类型> "标题" [--to hy1 --rel supports]` / `pinwhy edit hy1 --status active` |
| 声明、移除关系 | `pinwhy link o1 hy1 --rel supports` / `pinwhy unlink o1 hy1 --rel supports` |
| 移动、清空游标 | `pinwhy cursor hy1 --reason "继续验证"` / `pinwhy cursor none` |
| 保存、恢复现场 | `pinwhy checkpoint --summary "…"` / `pinwhy digest` / `pinwhy context` |
| 检查上下文质量 | `pinwhy lint` / `pinwhy lint --json` |
| 从图中移除节点 | `pinwhy remove hy1 --reason "合并到其他结论"`，事件历史仍保留 |

`pinwhy --help` 显示分组入口，`pinwhy help --all` 列出完整命令目录与别名。所有命令支持 `--help` / `-h`，也可用 `pinwhy help node add`、`pinwhy service install --help` 查看具体子命令；帮助不会初始化、安装、启动服务或等待输入。带值选项用 `<值>` 标明，重复选项单独注明。`init`、`setup`、`status`、`skill install`、`hooks install|uninstall`、`launcher`、`export` 支持单个 JSON 对象输出；节点写入与常用查询也可用 `--json`。

### 终端展示

人读输出采用统一的静态布局；需要稳定字段时使用 `--json`。终端支持配色，`NO_COLOR`（含空值）、`TERM=dumb` 或重定向输出时不带 ANSI。列表按中文、组合字符和 emoji 的显示宽度对齐，窄终端改用多行记录，完整正文用 `show` 读取；路径、正文与校验值不静默截断。

| 命令 | 展示内容 |
| --- | --- |
| `status` | 项目、查看器地址与模式、当前焦点、统计、接入与最新记录分区 |
| `doctor` | 检查数量与状态汇总，逐项详情，以及实际提供的修复命令 |
| `setup`、`service` | 完成或跳过的组件、服务归属、配置、地址和 HTTP 验证结果；已安装不等于宿主已加载 |
| `history`、`changes` | 按事件顺序显示时间、作者、节点和关系操作，字段原值与新值；未填写、null 与空值分别表达 |
| `release`、`version` | 当前版本与切换前后、来源、安装位置、接入刷新结果；构建哈希保留完整值 |
| `ls`、`search` | 节点列表或分组表格，明确匹配、显示与省略数量；重复标签仍取交集 |
| `show`、`here` | 节点维度、来源、完整正文、显式传入与传出关系；here 同时显示当前身份与最近轨迹 |
| `export`、`backup`、`restore` | 完成状态、实际输出或恢复位置、格式、事件数量和完整校验值 |


### 查询、统计与完整列表

```bash
pinwhy search "session cookie" --tag auth --json
pinwhy search --type vuln --sev high --confidence reproduced --json
pinwhy search --tag site=alpha.example --tag auth --group-by severity,status
pinwhy search --type vuln --group-by tag:site,severity,status --limit 1 --json
pinwhy ls --all --json
pinwhy ls --status blocked --tag auth --tag tenant --limit 10 --json
```

`search` 支持关键词、`--type`、`--status`、`--sev`、`--confidence`、可重复的 `--tag`，以及 `--rel` / `--related-to`。筛选取交集，不自动推断缺省字段。需要总数时读 JSON 的 `total`；`items` 默认最多 30 条，`--limit` 可设 1–1000，`truncated` 说明明细是否截断。

`--group-by` 支持 `severity`、`status` 和 `tag:<键>` 的组合；统计始终覆盖全部匹配，与明细的 `--limit` 无关。JSON 增加 `groupBy` 与 `groups`，每项为 `{values: {...}, count}`；文本模式只列总数和分组。未填写单列为 `null`，不等同于 `open`；已复现也不隐含某个状态。

站点用显式标签 `--tag site=alpha.example` 记录；`tag:site` 不从正文或裸域名猜测站点。一个节点可带多个站点标签，并在每个站点各计一次，所以跨站点分组的合计可能大于匹配节点数。多个标签请写 `--tag auth --tag session`；`--tag auth,session` 会保存或匹配一个带逗号的标签，不会拆分。

`ls` 支持 `--type`、`--status`、`--sev`、`--confidence` 和可重复的 `--tag`，筛选取交集，默认按创建时间列最近 30 条匹配记录；编辑旧节点不会改变它在列表中的创建顺序。`--open` 仍只筛选开放的假设和问题。人读面板显示匹配、显示和省略数量；JSON stdout 保持数组，截断提示写到 stderr。`--all` 返回全部匹配，不能与 `--limit` 同用。`features.listFilters` 声明新增字段筛选。关键词、关系、分组统计和总数使用 `search`。项目路径仍可用 `--cwd`，或在同一终端设置 `PINWHY_CWD`；跨工具与子 Agent 调用不要假设环境会自动继承。

节点公开 JSON 始终含 `status`、`severity`、`confidence`，未记录时为 `null`。相应 node/node-add/status/here/show/context/search/history/changes 输出使用 v2 schema；`ls` 保持数组形状，项版本见 `capabilities.outputs`。API、SSE 与离线快照同样保留三个可空维度。事件日志与请求指纹不变；`receipt.result` 保留原始写入结果，不补 null，因此可能与当前写命令的 JSON 投影形状不同。

`show <id>` 的文本详情显示状态、严重度、可信度、代码位置、作者、创建与修改时间，以及传入/传出关系。未记录的维度显示为 unspecified，不按节点类型推断；JSON 输出保持原有形状。



内置类型是语义提示，不是状态机；自定义类型同样可以保存。

| 用途 | 类型 |
| --- | --- |
| 入口与方向 | `start`、`goal`、`intent` |
| 证据与推理 | `observation`、`fact`、`hypothesis`、`question` |
| 行动与产出 | `action`、`result`、`finding`、`vuln` |
| 辅助记录 | `hint`、`summary`、`note` |

```bash
pinwhy node add decision "优先验证权限边界"
pinwhy node add observation "出现相同路由模式" --relate-here
pinwhy edit hy1 --title "修订后的猜测" --detail "补充证据"
```

- `--enter` 显式移动游标；`--relate-here` 显式关联当前位置，默认关系为弱语义的 `related-to`。
- `--to <id>` 让新节点指向已有节点，读作“新节点 `--rel` id”，如新证据 `--to hy1 --rel supports`；`--parent <id>` 方向相反，读作“id `--rel` 新节点”。**当前游标不是隐式父节点**。
- `--to` 可重复，用同一 `--rel` 把新节点连向多个已有节点；`--to` 不能与 `--parent`/`--relate-here` 同用，关系不同的连边用 `link`。任一目标不存在时整条命令不写入。`--rel`、`--label` 描述的是这条关系，没有 `--to`/`--parent`/`--relate-here` 时报错，不再静默忽略。
- 写命令加 `--json` 时，新节点 ID 在 `node.id`，本次建立的关系在 `edges`；不要解析给人看的回显。没有连关系的节点，回显会注明“未连关系”。
- `--at <file:line>` 记录证据位置；`--detail` / `-d` 添加详情；`--tag` / `-t` 可重复指定标签。
- ID 按类型递增，如 `g1`、`o1`、`hy1`；活动和检查点如 `act1`、`cp1`。接受 ID 的命令支持 `[hy1]`、大小写不敏感及唯一前缀，存在歧义时列出候选。
- `start`、`goal`、`intent`、`fact`、`vuln`、`hint` 可用同名简写；`focus` 是 `cursor` 的别名，`compact` 是 `checkpoint` 的别名。这些写法也不会隐式连边或进入节点。
- 未知 CLI 选项、缺失或多余的位置参数、冲突选项与无效数值会明确报错，静态输入错误不初始化黑板、不安装接入。节点标题、搜索关键词和检查点摘要仍允许多段文本。`--tag`、`--to`、`--clear` 可重复，其他单值选项不可重复。标题以 `-` 开头时放在 `--` 后；自定义节点类型和关系名仍可使用。读取 `cursor` 不带 ID 时不初始化。合法写命令默认仍自动初始化，宿主写入继续传 `--no-init`。

### 修改与清空字段

`edit` 只修改明确提供的字段；`--detail` 替换整段详情，`--tag` 替换标签集合。支持 `features.editClear` 时，显式清空用：

```bash
pinwhy edit fd1 --clear detail --clear tags
pinwhy edit fd1 --clear severity --clear confidence --json
```

`--clear` 可重复，接受完整字段名 `detail`、`tags`、`status`、`severity`、`confidence`；详情变为空字符串，标签变为空数组，三个维度变为 null。不能清空标题或内部字段，同一字段不能同时赋值和清空。省略字段不变，空值选项仍报缺值错误。清空保留在事件历史中，可重放及按 request ID 重试。


### 批量写入

一次要记多条相关记录时（例如一波并行工作结束），用 `batch` 一条命令写入，不必拆成一串单条命令。输入是 JSON Lines，每行一个 `node`、`link` 或 `edit`：

```bash
cat > wave-3.jsonl <<'EOF'
{"op":"node","ref":"h","type":"hypothesis","title":"导出接口缺少租户过滤","confidence":"suspected","to":"g1","agent":"audit-a1"}
{"op":"node","type":"observation","title":"handler 直接使用请求里的 tenantId","at":"src/export.ts:42","to":["$h","g1"],"rel":"supports","agent":"audit-a1"}
{"op":"edit","id":"hy2","status":"refuted","agent":"audit-a2"}
EOF
pinwhy batch --request-id wave-3 --file wave-3.jsonl
```

- `ref` 给本批新建的节点起本地名，后续行用 `$名字` 引用；`agent` 记为该行作者，缺省用 `--agent`。
- 整批要么全部写入，要么一条都不写；出错时写明第几行、什么原因。字段名拼错也会报错，不会被静默忽略。
- `--request-id` 必填。命令中断或不确定是否写入时，用同一 ID 重试：已提交的不会重复，写到一半的会按原计划补齐。
- 不移动游标，不包含删除、重置和检查点；需要时在导入后单独运行。完整规则见[公开契约](CONTRACT.md#批量写入)。
- 批量 `edit` 可用 `"detail":""`、`"tags":[]`、`"status":null`、`"severity":null`、`"confidence":null` 清空字段，与单条 `edit --clear` 语义相同；先检查 `features.editClear`。创建节点仍拒绝空必填字段，其他空值和纯空白文本仍拒绝。



`link <from> <to> --rel X` 读作 **“from X to”**：

| 写法 | 含义 |
| --- | --- |
| `link 观察 猜测 --rel supports` | 观察支持猜测 |
| `link 结论 观察 --rel derived-from` | 结论派生自观察 |
| `link 结论 前提 --rel depends-on` | 结论依赖前提 |
| `link 现象 原因 --rel caused-by` | 现象由原因导致 |
| `link 新结论 旧结论 --rel supersedes` | 新结论取代旧结论 |

还可使用 `proves`、`contradicts`、`refines`、`duplicates`、`resolves` 等关系，或自定义关系。默认 `related-to` 不替作者声明支持或因果。

风险、状态、可信度是三个独立维度：

```bash
pinwhy node add finding "授权绕过候选" \
  --sev medium --status active --confidence static-confirmed
pinwhy edit fd1 --status confirmed --confidence reproduced
```

`fd1` 需替换成实际 ID。可信度可取 `suspected`、`static-confirmed`、`reproduced`、`confirmed`；未声明时不会自动推断，`lint` 会对相关记录给出提示。确认过的事实、观察、结果可通过已确认状态或可信度进入 `context` 的 `confirmedFacts`。



<a id="configuration"></a>

## 配置与数据边界


### 服务地址与环境变量

端口选择顺序统一为：**`--port` → `PINWHY_PORT` → 项目配置 `viewerPort` → `4333`**。端口必须是 `1–65535` 的整数；前台 `serve --port 0` 允许系统分配空闲端口。`setup` 成功后保存所选端口（包括 `--no-serve`）；`serve` 成功启动后保存实际端口，后续 `status` 因而检查同一地址。

前台查看器用 `pinwhy serve --open` 启动。启动就绪后，终端以紧凑卡片显示版本、实际启动耗时、Local 地址、项目路径和 Editable / Read-only 模式；地址使用实际监听端口。下方显示 Ctrl+C 与 `pinwhy stop` 的停止提示。彩色输出仅用于支持颜色的终端；设置 `NO_COLOR=1` 或重定向输出时使用纯文本，不清屏、不接管键盘。

| 变量 | 用途 |
| --- | --- |
| `PINWHY_CWD` | 显式指定项目根目录 |
| `PINWHY_PORT` | 覆盖项目的服务端口 |
| `PINWHY_AGENT` | 设置 Agent 身份与游标视角 |
| `PINWHY_QUIET=1` | 静默常用写命令的成功提示 |
| `PINWHY_DEBUG=1` | 输出错误调试信息 |
| `PINWHY_LOCK_TIMEOUT_MS` | 调整普通写入的锁等待上限，默认 10 秒 |

`status --json` 提供 `cwd`、`agentId`、`stats`、`cursor`、`cursors`、`title`、`session`、`viewer`、`integration`、`latestNode`。`viewer.state` 区分 `online`、`offline`、`other-project`、`unrecognized`；不会把别的项目误报为当前项目在线。查询本身不初始化黑板或安装接入。

### 本地数据与安全

- **唯一事实源**：`.pinwhy/events.jsonl` 只追加；`state.json` 是可丢弃缓存，损坏后可由事件恢复。
- **默认不入库**：新建 `.pinwhy/` 自带 `.gitignore`。逻辑节点也可能含敏感原文，请勿将“本地记录”等同于“已经脱敏”。
- **页面写入受限**：服务仅监听 loopback，校验 Host 防 DNS 重绑定；写请求要求同 Origin、JSON 类型，大小上限 256 KB。
- **不阻断 Agent**：`lint` 只报告，始终以退出状态 0 返回；Hook 是可选辅助，不是任务前置条件。


- 新事件包含 `eventVersion` 和唯一 `eventId`；节点 ID 在写锁内分配，不依赖缓存计数器。
- 跨进程写入由文件锁串行化，不抢占仍存活的持有者；超时会报错，不强行写入。
- 回放会跳过坏行、缺少必要字段的节点、自环和缺失端点的关系，并在 `lint` 的 `log-integrity` 警告中报告计数，不静默隐藏损坏。
- 追加前清理日志尾部的不完整记录；缓存写入失败不让已追加的事件报错。
- `patch` 不改写节点的 `id` / `ts`；`remove` 从当前投影移除节点及关系，保留事件历史。
- 标题、详情、关系说明、检查点摘要上限分别为 500、20,000、500、12,000 个 UTF-16 代码单元（与 JavaScript 字符串长度一致）。现有默认裁剪行为保留：stderr 提示，JSON 结果带 `truncated`；新的节点、边、检查点事件还保存 `inputTruncation`，逐字段记录 `originalLength` 和 `storedLength`，供后续回放、context、lint 与页面查阅。它不保存被丢弃的原文，也不为旧日志猜测缺失信息。
- `node add`、节点简写、`edit`、`link`、`checkpoint`、`compact` 和 `promote` 可显式加 `--no-truncate`：超限时整条不保存，已有事件不变，记录者自行缩写、拆分或引用项目内证据文件。`capabilities --json` 以 `rejectTruncation`、`inputTruncationMetadata` 声明支持；原任务和宿主照常继续，`lint` 仍仅报告且退出 0。
- 新 Web 客户端显式发送 `rejectTruncation: true` 保存节点，超限得到 HTTP 422 `code: "input_too_long"`（含字段与长度），不显示保存成功，保留草稿。旧 API 客户端未声明此选项时仍按原约定裁剪。编辑某个文本字段会更新或清除该字段的截断提示；只改状态、风险或可信度不会清掉其他文本的提示。
- Web 画布卡片是紧凑预览，点击后详情面板读取完整已保存的标题和 detail，保留标点与换行并可滚动。侧栏超出首屏条数的记录有明确展开入口，不再直接遗漏；“现场”依然是局部视图，“全景”用于浏览整板。



只有需要保存工具调用材料时，再启用活动 Hook，并在现有 `.pinwhy/config.json` 中将 `autoRecord` 设为 `true`。保留其余配置，例如：

```json
{
  "autoRecord": true,
  "autoTools": ["Bash", "WebFetch", "Read", "Grep"],
  "maxActivities": 4000,
  "detailLimit": 1200,
  "redact": true
}
```

```bash
pinwhy hooks install --write --with-activity
pinwhy activity ls
pinwhy activity show act1
pinwhy promote act1 --kind observation --title "值得保留的观察"
```

`act1` 需替换成实际活动 ID。工具材料进入独立 `activity` 层，不自动成为事实；`promote` 也不会自动连边或移动游标。`Write` / `Edit` 等只保留文件路径，黑板 CLI 自身调用不重复采集；尽力脱敏后截断，拿不到锁时活动写入最多等 1 秒。

重新运行不带 `--with-activity` 的 `hooks install --write` 会停用活动 Hook；`setup` 会再次关闭 `autoRecord`。脱敏不是保密保证，开启前请确认工具输出的敏感程度。



<a id="troubleshooting"></a>


## 常见问题

**图里都是未连接的卡片？** 检查 Agent 是否已加载当前 Skill，并显式使用 `link`、`--to`、`--parent` 或 `--relate-here`。安装接入不会自动补建关系。

**现场视图里找不到某条记录？** 它不是全量视图。切到“全局”，或用搜索定位；没有游标时，Digest 仍会列出最近活跃节点及其关系。

**服务在线，但 Agent 没有继续写？** 服务只负责读写和展示，不会驱动 Agent。可明确说“用 pinwhy 记录这次研究”，再用 `digest` 核对实际内容。

**保存后提示服务响应损坏？** HTTP 成功状态不足以确认保存结果；响应无法读取或不是有效 JSON 对象时，页面会保留草稿并提示结果不确定。先核对节点或历史记录，再决定是否重试；页面不会自动重新提交。

**页面显示“重连中”，但画面还在？** 页面只在收到结构有效的图快照后显示“已同步”。连接中断或服务发来无法识别的数据时，页面保留上一份有效画面并显示重连中，不会清空；服务恢复推送有效快照后自动回到已同步。


**如何停用？** 用 `pinwhy stop` 关闭当前项目的查看器（前台 `serve` 也可 `Ctrl+C`）。端口属于其他项目或无法识别时，它报错且不动对方；共享服务归属当前项目时，它等同 `service stop`，之后用 `service start` 重新启动。用下面的命令移除所用范围的 Hook，再手动移除对应的 Skill 目录；不必删除黑板数据：

```bash
pinwhy hooks uninstall --user --write
# 项目级 Hook 去掉 --user；Skill 位于对应的 skills/pinwhy 目录
```

`setup` 或 `service install` 创建的常驻查看器是当前用户共享的工作区服务。先确认归属，再操作：

```bash
pinwhy service install --port 4333  # 为当前已初始化项目安装并启动服务
pinwhy service status --json       # 归属 cwd、注册端口 port、loaded/running 与状态
pinwhy service stop                # 停止并禁用自动启动，保留受管配置
pinwhy service start               # 重新启动当前项目的已有注册，保留注册端口
pinwhy service uninstall           # 停止并删除本工具受管配置与注册
```

| 平台 | 服务机制 | 启动条件 |
| --- | --- | --- |
| macOS | 用户级 launchd LaunchAgent | 用户登录会话 |
| Linux | `systemctl --user`，unit 位于用户 systemd 配置目录 | 可用的 systemd 用户会话和用户总线；不会自动开启 lingering |
| Windows | 当前用户 SID 对应的交互式计划任务 | 当前用户登录；以普通权限运行，配置位于用户 LocalAppData 下 |

`waiting` 表示已启用但未运行，不等于查看器在线；页面是否可用仍以 `status` 或 `doctor` 的实际探测为准。服务管理器不可用时 `service status` 为 `unavailable`，安装报错；仍可手动运行 `pinwhy serve`。Windows 不注册系统级 Windows Service，Linux 无 systemd 的环境继续使用前台服务。

`install` 切换共享服务目标时报告原归属与新归属。`start` 只启动当前项目已有的受管注册；`stop` / `uninstall` 针对共享服务当前归属，即使它不是命令所在项目，操作前先确认 `cwd`。这些操作不删除黑板数据、不修改其他服务。

服务替换保留原配置完整字节与启用状态；写入、启动或 HTTP 健康校验失败时恢复原配置。首次安装失败会移除失败配置与注册，回滚失败则给出保留的恢复路径。Windows 还保留原计划任务 XML；本机配置与原生注册不匹配时拒绝接管。升级保留原服务端口，原本停止的服务保持停止。


<a id="release"></a>

## 版本与升级

Pinwhy `0.11.0` 是从原 blackboard 的不兼容命名切换；独立 DSH 插件版本为 `0.3.0`。CLI、包名、路径、环境变量与机器输出 schema 命名空间一起更新为 `pinwhy` / `PINWHY_*` / `.pinwhy/`。`pinwhy.*` 保留原对象形状及 v1/v2 后缀，`EVENT_VERSION = 1`；不提供旧 CLI、环境变量、路径别名或自动迁移。

以下 `0.7.0`–`0.10.1` 版本说明属于原 blackboard 的发布历史，并非 Pinwhy 的旧发布；其中原有 schema 名称保留原名。


`0.10.1` 修正 `batch` 与 Hook 的细节：同一批里先建后改的节点，日志中的创建事件不再被后面的修改改写；批量输入拒绝空字符串、空 `tags` 和没有 `to` 的 `rel`/`label`，接受带 BOM 的文件，超过 `limits.batchMaxBytes` 时不再先整份读入内存。`node add`/`promote` 的 `--rel` 没有关系目标时报错。活动采集的脱敏在大段工具输出上不再退化为平方时间（200 KB 输出曾使 Hook 卡住数十秒），Hook 改为异步读取 stdin，Node 18 下大载荷不再因 `EAGAIN` 被当作空载荷丢弃。脱敏结果、输出与事件格式不变。

`0.10.0` 新增 `batch`：从 JSONL 文件或 stdin 一次写入多条 `node`、`link`、`edit`，批内可用 `$名字` 引用本批新建的节点，每行可写明作者。整批全部写入或全部不写，出错时报告行号；必须带 `--request-id`，中断后用同一 ID 重试会按原计划补齐。不移动游标。新增原 `blackboard.batch.v1` 输出、`features.batch` 与 `limits.batchMaxOps` / `limits.batchMaxBytes`；其他输出与事件格式不变。

`0.9.0` 修正真实长任务中暴露的接口细节：`capabilities` 接受 `--cwd`；选项写在命令前面时给出明确提示；`--to` 可重复；help 写明除 `tree`、`serve`、`hook` 外都支持 `--json`。没有 `--sev` 的 `vuln` 不再被写成 `medium`，严重度保持未记录。`checkpoint` 回显同一身份上一检查点以来的节点与关系变化（`--json` 的 `sincePrevious`），`status` 按可信度列出发现/漏洞并注明未定级数量。Skill 写明记录时机：判断形成时就记，磁盘上的日志和台账不替代节点，分波工作每波结束时记录并打检查点。新增字段均为兼容扩展，事件格式不变。

`0.8.3` 将版本包发布移入内部模块：`release install --force` 发布新目录失败时恢复原版本，current 保持可运行；回滚或清理失败时保留旧版本字节并在错误中给出恢复路径。实时服务只在有页面订阅时读取日志，慢连接只保留最新一份待发快照；工作台忽略无效快照、保留上一份画面，并在收到有效数据后才显示已同步。CLI / JSON schema 与事件格式延续 `0.8.0`。

`0.8.2` 拆分存储文件 I/O 与 HTTP 请求/写入职责，修复日志短读、文件描述符及失败锁写入的清理，损坏的成功响应会保留页面草稿并提示结果不确定；增加离线文档链接、图片和锚点检查。CLI / JSON schema 与事件格式延续 `0.8.0`。

`0.8.1` 整理内部 CLI、共享快照、前端工作台和开发验证脚本边界，并重组文档；这是兼容性维护版本，CLI / JSON schema 与事件格式延续 `0.8.0`，不增加新的导出参数。实时与离线快照统一忽略指向不存在节点的缓存焦点，修复离线曾保留失效 ID 的差异；离线 HTML 继续省略原始活动 input/output/summary 和可写标记。验证入口与覆盖限制见 [贡献指南](../CONTRIBUTING.md)和 [CI 说明](ci.md)，版本说明本身不代表本轮检查已执行。

`0.8.0` 统一节点 JSON 的三个可空维度，将受影响的输出 schema 升为 v2，并增加 Markdown、Mermaid、SARIF 导出；包含可导航的 Markdown 报告、Mermaid 默认消费端限额，以及浏览器渲染和官方 SARIF schema 的持续回归。前端与 DSH 适配同步切换；事件格式仍为 v1，旧安装可保留用于回滚。`0.7.0` 的字段筛选、完整分组统计和 `ls --all` 继续可用。

日常使用的 CLI、启动器、Skill、Hook 和常驻服务都指向 `~/.local/share/pinwhy/current`（设置了 `XDG_DATA_HOME` 时位于其下），不指向开发仓库：

```text
~/.local/share/pinwhy/
├── versions/0.11.0/   新安装的 Pinwhy 不可变版本
└── current -> versions/0.11.0
```

```bash
# 在仓库里：先按贡献指南完成本地与发布候选验证，再安装新版本并切换
# 包含 npm test、npm run check:types、npm run build、npm run verify:package
node bin/pinwhy.js release install

pinwhy release ls          # 已安装版本，* 为 current
pinwhy release use 0.11.0  # 切换已安装的 Pinwhy 版本
pinwhy --version           # 显示版本，以及运行的是 current 还是开发目录
```

`/api/status` 的 `build` 与实时 API / SSE、离线 HTML 的 `meta.build` 使用同一构建身份：`version` 为包版本，`buildId` 为已发布文件内容的 SHA-256 标识，`commit` / `dirty` 记录可获知的源码来源，`origin` 区分开发目录、已安装版本与其他包副本。来源不可获知时 `commit` / `dirty` 为 `null`，不会假装是干净的 Git checkout。安装路径和安装时间不参与构建标识；同版本号下代码或页面资产改变会得到不同标识。服务启动时缓存身份，因此比较运行中的服务与新安装内容时须重启服务；探测旧服务时允许它不提供 `build`。

点击工作台左上角 **Pinwhy → 检查更新**，或在终端执行：

```bash
pinwhy release check
pinwhy release check --json
```

检测由本机服务或 CLI 联网读取官方仓库 `main/package.json`，比较当前运行包的语义版本，显示有更新、与上游一致或本地领先。只有点击或显式运行命令时才联网；失败可重试，8 秒超时，不写黑板记录、不自动安装。离线快照保留版本信息，检查请回到实时工作台。版本相同仅代表版本号一致，不检测同版本的代码变化。

发现更新后，按升级说明在源码仓库更新代码，完成验证后执行 `node bin/pinwhy.js release install`，沿用 current 切换流程。

- **版本不可变**：同一版本号重复安装会报错，请提升 `package.json` 的版本号；确需覆盖时加 `--force`。
- **切换即生效**：`install` 和 `use` 原子地切换 `current`，再由新版本自己刷新启动器、已安装的用户级 Skill（Claude / Codex）、用户级 Hook，并重启正在运行的受管常驻服务（已停止的服务只更新配置）。从 `current` 运行的 `setup`、`skill install`、`hooks install` 也记录 `current` 路径，而不是具体版本。
- **项目级接入不自动刷新**：`setup` 写入各项目 `.claude/` 的 Skill 和 Hook 无法从这里发现；它们指向 `current` 时无需改动，若曾从开发仓库安装，请在对应项目重新运行 `pinwhy setup`。从开发目录运行安装类命令时，CLI 会在 stderr 提示接入将指向仓库。
- **跨版本读取**：每个事件带 `eventVersion`。旧版本遇到更高版本格式的事件时跳过它们、在 `lint` 中报告 `log-version`，并暂停写入以免 ID 冲突，切回较新版本即可恢复；遇到同格式下不认识的事件类型只忽略并报告 `unknown-events`，不影响写入。


<a id="upgrade"></a>

## 从旧版迁移


Pinwhy `0.11.0` 只提供 `pinwhy` 命令（`bin/pinwhy.js`）、`PINWHY_*` 环境变量和 `.pinwhy/` 项目目录。原 `blackboard` / `BLACKBOARD_*` / `.blackboard/` 与更早的 `flow` / `FLOW_*` / `.flow/` 都不再自动发现、回退或迁移。以下操作由用户明确针对自己的项目与安装执行；开发或改名任务中的 Agent 不得触碰真实用户的数据、宿主配置、全局安装或服务。

1. 确认每个项目与用户级服务的归属，停止原 blackboard（或更早 flow）的查看器、常驻服务、Hook 与所有写入者，包括其他 Agent。macOS 原受管服务身份为 `com.fruitguardians.blackboard.workspace`，新服务身份为 `com.bx33661.pinwhy.workspace`；旧身份仅用于确认并卸载旧服务。使用旧安装自身的服务卸载命令移除其受管服务，先核对其报告的项目与服务身份；不停止或卸载无关产品的服务。完整备份项目数据、原安装与相关宿主配置，保留原事件日志字节和旧不可变版本以供人工恢复。
2. 只有目标 `.pinwhy/` 完全不存在时，才把原数据目录手动改名。以下 Bash / Zsh 示例在已确认的项目根运行；`-L` 也阻止覆盖悬空符号链接：

   ```bash
   if [ ! -e .pinwhy ] && [ ! -L .pinwhy ] && [ -d .blackboard ]; then
     mv .blackboard .pinwhy
   fi
   ```

   对更早的 `.flow/`，仅在 `.pinwhy/` 与 `.blackboard/` 都不存在且没有同名符号链接时，备份后执行 `mv .flow .pinwhy`。如果任意两份旧/新数据共存，停止迁移，分别备份并核对各自来源与日志；**不要覆盖、拼接或自动合并**。不要因为新目录为空就默认它可覆盖，也不要把两份数据当作同一块板。
3. 在 shell、脚本、CI 与宿主配置中显式更新命令和环境变量。核实旧 launcher 确实属于本产品后，手动移除旧 `blackboard` / `blackboard.cmd` 或 `flow` / `flow.cmd` 启动器，以及指向旧版本的 shell alias；不删除共享 PATH 目录或无关命令。仅移除所用项目级/用户级范围内本产品的旧 `skills/blackboard`、`blackboard-code-audit`、更早 `skills/flow` 及其恢复/活动 Hook；编辑 Claude settings 时保留其他 Hook 与所有无关配置。若使用旧 DSH 插件，停用其配置并重新安装 `dsh-pinwhy` `0.3.0`，不保留双份恢复写入者。
4. 从新的官方仓库 <https://github.com/bx33661/pinwhy> 安装真正的 Pinwhy 包，在新源码目录执行 `node bin/pinwhy.js release install`。日常安装位于 `<data>/pinwhy/current`（默认 `~/.local/share/pinwhy/current`；平台与 `XDG_DATA_HOME` 决定 `<data>`）。**不要把 `<data>/blackboard/versions/` 或 flow 的旧不可变版本移到新包目录并当作 Pinwhy 使用**；旧安装可保留用于人工回滚，但新 `current` 必须指向新安装的 Pinwhy 版本。命名切换不由旧安装的更新器或 `release use` 自动完成。
5. 从新 `current` 安装完整 `skills/pinwhy` 包及所需的 `pinwhy-code-audit` 资源，按宿主重新安装 Skill、可选 Hook 和受管服务；用户级安装按需加 `--user`，Codex Skill 加 `--codex`。项目级与用户级都核对，不能假设替换一份就已退役所有旧接入。重新开启 Agent 会话，确认当前会话加载的是 Pinwhy Skill。
6. 从迁移后的项目运行 `pinwhy --version`、`pinwhy status`、`pinwhy digest` 与 `pinwhy doctor`，核对新版本、项目归属、日志与接入路径，再启动所需服务并恢复写入。若失败，停止新写入后用备份人工恢复，不让旧、新 writer 同时运行。

迁移只改目录名与接入配置，**不改写 `events.jsonl` 的任何事件字节、正文、历史作者、ID、时间戳或回执结果**。旧日志中的原名称也是历史内容；schema 命名空间的切换发生在新的机器输出中，不能对事件日志做全局替换。`EVENT_VERSION` 仍为 `1`。

旧备份的 manifest 格式标识 `blackboard-backup` 不被 Pinwhy 的 `restore` 接受。请保留备份原样，使用生成它的原版 blackboard CLI，先恢复到一个没有现有数据的隔离项目；停止该项目的所有写入者，再按上述目标不存在规则把恢复后的 `.blackboard/` 手动改名为 `.pinwhy/`。不要改写 manifest 冒充新备份，也不要绕过校验直接覆盖真实项目。迁移后可用 Pinwhy 重新创建备份。

已经导出的旧离线 HTML 继续独立、只读地展示导出时的内容与原 blackboard 界面；改名不会更新这些文件。需要 Pinwhy 界面时，从迁移后的数据重新导出，保留旧文件作为历史快照。

`.gitignore` 与 publication scanner 继续排除 `.blackboard/` 和 `.flow/`，仅为防止尚未迁移的真实数据泄露。这是发布隐私保护，不代表运行时会读取旧目录，也不提供旧路径回退或自动迁移。
