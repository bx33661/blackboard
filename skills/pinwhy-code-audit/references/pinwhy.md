# CLI 与恢复约定

只调用现有公开 CLI。不 import `lib/`，不读写缓存来代替命令，不直接追加或改写事件日志，不增加命令、Hook 或内核规则。

## 选择 CLI、项目和能力

先确认 PATH 中 `pinwhy` 的来源；不可用时才使用已确认的安装路径，例如 `node "/已确认安装目录/bin/pinwhy.js"`。本包没有安装器占位符，不猜测用户主目录。以下 `pinwhy` 均可替换为已经确认的调用方式。

区分目标源码根、黑板项目根与私有输出目录。它们可以不同；每次命令显式指定板根。不要让 cwd 向上发现误选另一个项目，也不要为了试验写入现有真实黑板。

```sh
pinwhy capabilities --json
pinwhy status --cwd "/已确认黑板项目" --json
pinwhy context --cwd "/已确认黑板项目" --agent audit-main --budget 4000 --json
```

`capabilities` 不需要黑板。按 `features`、`outputs`、`limits`、`exportFormats` 协商，不根据版本字符串猜能力：同版本号的开发代码和稳定安装副本可能不同。

参数按命令区分，不要把写命令的后缀机械附给读取：`capabilities` 不接受 `--agent`，`context` 不接受 `--no-init`。普通读取不加写入选项；身份只传给支持参与者视角的命令。拿不准时查看该命令 `--help`，不通过反复试错猜参数。

基础调用需要显式项目、身份与 `--no-init` 支持。不能满足时保留错误，继续可达的源码审计并报告记录未保存；不要在本任务中重写底座或偷偷升级。`batch`、`batchCheck`、`rejectTruncation`、`incrementalContext`、`asOf` 和分组都是按能力选择的增强，缺少它们时用已支持的普通操作。

`status` 缺板会失败，不会创建。已有板直接恢复；经本次授权且目标明确的新板才显式初始化：

```sh
pinwhy init --title "已确认审计项目" --cwd "/已确认黑板项目" --json
```

`init` 如果提示上级已有黑板，先核对项目归属，不自动添加 `--here` 强建嵌套板。所有后续写入带 `--cwd`、`--agent`、`--no-init`；选项放在命令后。身份是署名，不是权限隔离。

## 创建与关联

先查本次目标，存在则复用，避免恢复时重复建板或建目标：

```sh
pinwhy search --type goal --tag audit=run-example --cwd "/已确认黑板项目" --json
pinwhy goal "审计 实际项目@实际版本" --detail "实际源码位置、范围、版本及限制" --tag audit=run-example --status active --cwd "/已确认黑板项目" --agent audit-main --no-init --json
```

创建节点的 JSON 返回 `{schema,node,edge,edges,cursor}`，读取 `node.id`。ID 不透明，不猜 `g1` 或按类型推导编号。以下尖括号须替换成命令实际返回的完整 ID：

```sh
pinwhy node add finding "候选：某边界可能缺少控制" --status open --confidence suspected --detail "实际入口、可控输入、可能结果与未知条件" --tag audit=run-example --to "<目标ID>" --cwd "/已确认黑板项目" --agent audit-main --no-init --json
pinwhy node add fact "已核对的具体源码事实" --status confirmed --confidence static-confirmed --at "src/actual-file.ts:42" --detail "实际检查内容、条件和限制" --to "<候选ID>" --rel supports --tag audit=run-example --cwd "/已确认黑板项目" --agent audit-main --no-init --json
pinwhy link "<候选ID>" "<条件ID>" --rel depends-on --cwd "/已确认黑板项目" --agent audit-main --no-init --json
```

`--to` 表达新节点在左；只有关系相同时才能用重复 `--to` 一并创建。不同关系使用独立 link，或批量操作。未知类型和关系会被保存，不会触发推理或状态迁移。

若 `features.rejectTruncation` 为 true，在承载证据的创建、编辑、连边、检查点及 batch 命令加 `--no-truncate`。否则主动控制文本长度并检查写入返回。按 `limits` 缩写、拆分或引用私有证据文件，不把半条论断当完整证据；缺少截断标记也不能反推旧输入完整。

`edit`、`done`、`block`、`revive` 返回节点字段在顶层，ID 为 `id`；它们不返回 `node.id`。编辑 `detail` 和 `tags` 是整体替换，先读旧值并保留仍有效内容。不要传未公开的 `type` 修改或用空字符串／null 猜测清空字段。

## 批量暂存、导入与重试

有 `features.batch` 时使用 JSONL。每行 `node`、`link` 或 `edit`，字段严格遵循现有契约。合成示例在 [record-example.jsonl](../assets/record-example.jsonl)，只能导入专用合成板；真实回传须替换为实际事实。

- `ref` 是本批局部名字，后续行用 `$ref` 引用，只能引用前面的 node。`to:"candidate"` 不等于 `to:"$candidate"`。
- 引用只发生在 ID 字段；detail 文本里的 `$candidate` 不会插值。报告映射应在拿到真实 ID 后写入，或显式用关系连接映射节点与 finding。
- `agent` 可覆盖该行署名；不赋予子 agent 写共享文件的权限。
- batch 不支持检查点、删除、游标移动或 `enter`。需要时写入成功后另调用。
- 按 `limits.batchMaxOps` 和 `batchMaxBytes` 分批，不硬编码规模。

有 `features.batchCheck` 时可先校验：

```sh
pinwhy batch --check --file "/私有工作目录/wave.jsonl" --cwd "/已确认黑板项目" --agent audit-main --no-init --json
pinwhy batch --request-id audit-run-example-wave-1 --file "/私有工作目录/wave.jsonl" --cwd "/已确认黑板项目" --agent audit-main --no-init --json
pinwhy receipt audit-run-example-wave-1 --cwd "/已确认黑板项目" --json
```

check 的预计 ID 没有预留，校验不是写入，也不证明语义真实。成功后读 `refs`；旧回执可能没有它，改从 `results[]` 中 `ref` 对应的 `node.id` 取得映射。

同一逻辑请求重试时保持 request-id、命令和内容完全一致；内容变化使用新的 request-id。拿不准是否完成时先查 receipt，pending 再显式同请求重试。不要新建请求盲目补写。输入校验是整批执行，但文件系统中断可能留下已提交前缀，不能把它说成数据库事务隔离；完成以回执和重新读取的事实为准。

## 恢复与完整性

先普通 context 获取现场；有增量能力且知道实际检查点时，再读取该点以来变化：

```sh
pinwhy context --since "<检查点ID>" --budget 4000 --cwd "/已确认黑板项目" --agent audit-main --json
pinwhy show "<候选ID>" --cwd "/已确认黑板项目" --json
pinwhy history "<候选ID>" --cwd "/已确认黑板项目" --json
pinwhy changes --since "<检查点ID>" --cwd "/已确认黑板项目" --json
```

检查 context 的省略／截断信息和源码版本；需要的记录用 show 补读，不能把未出现在预算包中的内容当不存在。新增、修改、移除关系均可能影响旧解释，不能只看新增节点。完整字段按所选 CLI 声明的输出 schema 理解，不把不同命令的对象形状混用。

只在 `features.asOf` 为 true 时使用 `--as-of <检查点ID>` 查看历史投影。历史投影仍不能证明当前代码；能力缺失时用现有 history、检查点与源码核对，不升级 CLI。

```sh
pinwhy checkpoint --summary "实际版本；已确认结论与ID；当前问题；关键未知；覆盖缺口；尚未执行的验证；证据位置" --cwd "/已确认黑板项目" --agent audit-main --no-init --json
```

检查点保存摘要，不会替代未写入的候选、证据和关系，也不代表任务完成。读到 context 的 `readOnly/prescriptive/nextStepSelection` 只说明底座投影策略，研究方向由 Agent 根据证据选择。

## 查询、报告与错误

```sh
pinwhy search --tag audit=run-example --type finding --group-by severity,status --cwd "/已确认黑板项目" --json
pinwhy search --tag audit=run-example --type condition --cwd "/已确认黑板项目" --json
pinwhy export --format markdown --tag audit=run-example --status confirmed --out "/私有输出目录/audit.md" --cwd "/已确认黑板项目" --json
```

仅在能力支持对应筛选／分组时使用。`search` 的 `total` 是全部匹配，`items` 有默认上限，读 `truncated`；`ls --all --json` 是全量节点裸数组，需要时按实际标签消费。分组可能多重归属，组数之和不能当节点总数。

导出成功只返回 `{schema,file,format}`，正文在指定文件；没有 `--format json`。机器读取用已支持的 search／show／ls。Markdown／Mermaid 只附一跳关系，不能假定导出递归包含完整证明；SARIF 仅选择带有效位置的 finding/vuln，并显式记录省略项。严重度、状态和可信度不会互相推断，也不会自动排除 refuted。最终审计报告需要按裁定和映射整理，不能把通用导出直接称为已验证漏洞清单。

`lint` 是底座的只读提示，退出码恒为 0；既不替场景评估漏洞，也不成为继续研究的门禁。

判断成功看退出码。声明 `features.jsonErrors` 时，失败的 stdout 为空，stderr 为 `pinwhy.error.v1`，按 `code` 与可选 line/column 诊断；成功时 stderr 仍可能有普通提示。不要解析终端文案、让通用异常被吞掉，或把失败写入声称为已保存。
