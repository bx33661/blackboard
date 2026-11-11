# 七处资料如何变成审计方法

本包 2.0 的改进对象是独立审计场景，不是 pinwhy 底座。先前版本偏重记录纪律，三个简单合成场景也未区分出相对通用 Skill 的收益；这轮把学习结果落实为调查动作，并用更复杂的场景与保留的 1.0 快照比较。

## 来源、采用与舍弃

| 来源 | 提炼的问题 | 本包中的动作 | 主动舍弃的做法 |
| --- | --- | --- | --- |
| [Cloudflare Skill](https://github.com/cloudflare/security-audit-skill) 与 [harness 实践](https://blog.cloudflare.com/build-your-own-vulnerability-harness) | 怎样让调查、验证和跨轮覆盖独立恢复？ | 以有边界的调查事项分配工作；交代假说、最强控制、证伪条件；保留未决项；验证者先尝试推翻候选；报告由裁定派生 | 固定 agent 数、完整企业平台、零发现自动重跑；不把 schema 合法当漏洞真实，不增加另一套状态库 |
| [Trail of Bits Skills](https://github.com/trailofbits/skills) | 函数到底保证了什么？相似代码怎样被安全地推广？ | 跟随调用核对前置条件、实际保证及失败路径；从已知实例逐轴放宽搜索；用变更历史解释旧控制的意图；同时质疑漏洞与想象出来的防护 | 所有函数一律逐行长文；缺证据一律 FALSE POSITIVE；把断言或内部存储默认当安全保证；依赖宿主 Stop Hook |
| [3stoneBrother/code-audit](https://github.com/3stoneBrother/code-audit) | 危险操作和缺失控制为何需要不同方法？ | 值／解释器问题逆追 sink；授权和流程从角色、资源、操作矩阵入手；配置按实际生效值与使用路径核对；借鉴动态 SQL 和二次使用分析 | 发现数量门槛、抽样比例等同全覆盖、缺注解／缺锁自动定 High、把所有模式命中自动连成利用链 |
| [RuoJi6/audit-skills](https://github.com/RuoJi6/audit-skills) | 如何处理源码以外的部署产物和证据？ | 源码优先，反编译保留来源与失败范围；组件版本命中回到实际调用；按目标原生接口描述输入和结果 | 所有目标必须有 Burp HTTP 包；构造请求等于运行复现；只按目录名复用旧反编译结果 |
| [Project Zero：Big Sleep](https://projectzero.google/2024/10/from-naptime-to-big-sleep.html) | 初始理论不够准确、实验失败时怎样继续？ | 从补丁或异常建立可推翻的假说；检查实验是否真的到达目标；环境不匹配时改最小触发条件；以观察重建根因；保留被替换的解释 | 把依赖缺失／未到达当候选被反驳；为了保住假说改目标；把一次示范当普遍检出率证明 |
| [Doyensec：Outline 人工与 AI 对照](https://blog.doyensec.com/2026/02/03/outline-audit-q32025.html) | 看似正确的防护为什么在最终行为中失效？ | 核对后续框架调用、最终响应、存储后端和部署模式；把错误报告排查成本算进评估；要求具体安全结果而非漂亮措辞 | 只看首次 setHeader／授权调用就收束；用某次历史模型比较推断当前所有模型；把文件数或报告数当质量 |
| [Testing Handbook](https://appsec.guide/) 与 [CodeQL 建模](https://appsec.guide/docs/static-analysis/codeql/advanced/) | 什么时候工具没有看到问题，而不是问题不存在？ | 先核对 source、sink、函数摘要与测试 harness；用已知正例和安全对照校准；按疑点选择污点、sanitizer、属性／差分或并发检查 | 先安装一切工具；空扫描结果当安全证明；用不包含相关扩展／模式的 harness 证明已覆盖 |

这七处的共同点是一个反复修正的过程：**代码观察 → 多种解释 → 区分解释的检查 → 根据结果继续或撤回 → 核实适用范围。** 黑板保存其中值得恢复的判断、来源和未决问题；它不替 Agent 选择解释、执行实验或确认漏洞。

## 具体落点

- [工作循环](workflow.md) 管任务分解、候选回传、独立复核与增量覆盖。工作项是一个可以回答的问题，不是一摞文件。
- [调查方法](investigation.md) 管函数契约、竞争假说、反证、变体与差分。要求指出下一项能改变判断的读取或检查。
- [技术专项](techniques.md) 管不同边界的具体分析动作，包含框架后续行为、授权矩阵、二次解释、原生产物及工具模型。
- [验证与执行](execution.md) 管实验是否有效、原始目标身份、负对照和安全执行条件。环境失败与漏洞反证分开。
- [记录与裁定](records.md) 管可恢复的调查摘要与证据身份，复用现有 CLI，不扩展底座。

## 保留原理，不复制上游流程

本包正文、示例与合成输入独立编写。上游资料作为方法来源并保留链接，没有复制其实现或整段提示词。Cloudflare 仓库使用 MIT；Trail of Bits Skills 使用 CC BY-SA 4.0，直接改编其正文需要另外遵守该许可，不能把复制品换个包名就宣称 MIT。

这里刻意保留三类裁定：成立、已反驳、尚未知。尤其是 [fp-check 门禁](https://github.com/trailofbits/skills/blob/main/plugins/fp-check/skills/fp-check/references/gate-reviews.md)把任一 gate 失败映射为 FALSE POSITIVE，包括无法证明可达；本包只在具体证据否定所述主张时撤回，缺少必要事实时保留未知。

[3stoneBrother 的覆盖矩阵](https://github.com/3stoneBrother/code-audit/blob/main/references/checklists/coverage_matrix.md)把“发现 ≥10”写入报告阶段条件。本包的结束依据是所述范围的检查与结论可复核、缺口公开；零确认问题是有效结果。

Cloudflare 文章的内部统计、社区仓库的速度与案例数量都属于作者报告，不是本包的实测数据。源码审计结论也不能因为满足 schema、得到两个模型同意或有 PoC 文本，就自动成为真实漏洞。

## 怎样检验这次重构

保留原三项基本用例的历史结果，不重复用它们宣称新版本更好。新用例重点检验：

1. 先执行的防护会被后续框架调用改变时，能否根据最终行为核对真实影响，并区分部署模式和安全对照。
2. 已知缺陷的相似路径、二次使用与工具漏建模同时出现时，能否校准搜索、核对变体，并保留未查范围。
3. 一次验证未到达目标后中断，另一会话能否恢复竞争假说、正确理解失败，并选择有区分力的后续检查。

评估使用相同输入和工具的独立上下文，对照保留的 1.0 包，不向受评者提供答案。不按节点数、标题、边数或报告长度判分；未知被正确保留也可通过。盲评、重复采样、真实项目、原生漏洞和实际运行隔离只能按实际执行范围报告，不能由少量合成结果外推。结果见 [评估说明](../evals/README.md)。

## 编写与证据规范

包结构遵循 [Agent Skills specification](https://agentskills.io/specification) 的渐进加载：入口只给选择方法和开始调查所需的内容，参考资料在相应任务出现时再读。[评估指导](https://agentskills.io/skill-creation/evaluating-skills)用于设计对照与基于实际输出的判分。

pinwhy 的节点、关系、独立维度、能力协商、批内引用和回执以[公开契约](https://github.com/bx33661/pinwhy/blob/main/docs/CONTRACT.md)为准。只有场景包变更；底座、通用 Skill、查看器与安装器没有审计专用逻辑。
