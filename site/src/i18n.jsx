import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const REPO = 'https://github.com/bx33661/pinwhy';
const C = ({ children }) => <code>{children}</code>;

/* ------------------------------------------------------------------ 简体中文 */
const zh = {
  htmlLang: 'zh-CN',
  meta: { title: 'Pinwhy — Agent 的外置记忆与可视化工作台', desc: 'Pinwhy 把 Agent 的判断、证据和当前位置记在项目本地。上下文压缩、断线或换会话之后，从同一份现场继续。' },
  prompt: '请阅读 https://github.com/bx33661/pinwhy 的接入说明，为当前项目安装或复用 Pinwhy，按当前 Agent 宿主接入完整 Skill 并打开工作台，保留已有 Pinwhy 记录，最后核验项目与服务状态并给我访问地址。',
  toast: { prompt: '接入指令已复制，发给你的 Agent 即可', cmd: '命令已复制', failed: '复制失败，请手动选择文本' },
  nav: {
    links: [['how', '原理'], ['views', '工作台'], ['features', '功能'], ['start', '接入'], ['faq', '常见问题']],
    copy: '复制接入指令', theme: '切换主题', menu: '菜单', lang: 'Language',
    themes: { light: '浅色', dark: '深色', system: '跟随系统' },
  },
  hero: {
    eyebrow: '0.10 新增整批写入', eyebrowHref: `${REPO}#release`,
    lead: [<>Agent 的<b>外置记忆</b>与可视化工作台。</>, '把判断、证据和当前位置记在项目本地；上下文压缩、断线或换会话之后，', <em key="u">从同一份现场接着做。</em>],
    meta: ['零运行时依赖', 'Node.js ≥ 18', '数据留在本机', 'MIT 开源', '四种界面语言'],
    cta: '复制接入指令', gh: '在 GitHub 查看',
  },
  stage: {
    aria: '工作台演示', badge: '合成演示数据', open: '打开实时工作台', loading: '正在载入工作台…', shield: '点击即可拖动、缩放与选择节点', hint: '悬停芯片，点亮它的证据链',
    frameTitle: 'Pinwhy 工作台演示（合成数据）',
    tabs: {
      context: ['现场', '围绕当前关注点，只看一跳邻域、目标与开放问题。Agent 在哪，你就看哪。'],
      logic: ['逻辑', '沿已记录的支持、反驳与推导关系阅读证据。图上的每一根线都是被明确写下的。'],
      all: ['全局', '浏览整个工作台，包括尚未连接的记录。分组只用于展示，不改变数据。'],
      board: ['2.5D 电路板', '每个判断是一颗芯片，高度是记录的严重度；每条显式关系是一根铜线，信号沿记录的方向流动。'],
    },
    ws: { context: '现场视图', logic: '逻辑视图', all: '全局视图', fit: '适应画布', toDark: '切换深色主题', toLight: '切换浅色主题', locale: 'zh-CN' },
  },
  how: {
    kicker: '工作原理', title: [<>上下文会丢，</>, <>判断<i>不该丢。</i></>],
    steps: [
      ['Agent 边做边记', '目标、观察、猜测和发现写成节点，支持或反驳由 Agent 明确声明，游标标出它此刻关注的位置。'],
      ['上下文被压缩', '长任务迟早撞上窗口上限。压缩、断线、换会话之后，对话里的推理和依据都看不见了。'],
      ['一条命令恢复现场', '按 Token 预算读回目标、邻域、开放问题与检查点。Agent 回到原来的位置继续，而不是从头摸索。'],
    ],
    ctx: '上下文', lost: '对话中的推理已不可见',
    ok: '✓ 已恢复 5 节点 · 4 关系 · 游标 q1',
    nodes: {
      g1: ['目标', '确认管理 API 的匿名访问边界'],
      hy1: ['猜测', '读接口可能遗漏统一鉴权', '待验证'],
      o1: ['观察', '匿名请求返回 200'],
      f1: ['发现', '匿名暴露全量用户列表', '严重 · 已确认'],
      q1: ['问题', '上传与导出能否组合利用'],
    },
    writing: 'pinwhy node add observation "匿名请求返回 200" --to hy1 --rel supports',
  },
  features: {
    kicker: '功能', title: '留下的不只是结论，还有走到这里的路',
    lead: '每条记录都能追溯、比对和交接。Pinwhy 只负责保存与呈现，不改判、不补全，也不替 Agent 推理。',
    real: '真实界面 · 合成数据',
    rows: [
      {
        shot: 'digest', k: '检查点与恢复', t: '换一个会话，读回同一份现场',
        li: [
          <>用 <C>checkpoint</C> 保存阶段性现场，之后用 <C>context --since</C> 只读回之后的新增、修改与删除。</>,
          '恢复包按 Token 预算整项带入或整项省略，省略了多少会如实计数。',
          '恢复包声明只读、非指令：它整理现场，下一步仍由 Agent 自己决定。',
        ],
      },
      {
        shot: 'agents', k: '多 Agent', t: '并行探索，各自留名',
        li: [
          <>每个 Agent 有自己的身份、游标与写入署名，用 <C>--agent</C> 显式指定视角。</>,
          '工作台切换 Agent 视角，只换观察位置，不移动任何人的游标。',
          <>0.10 新增 <C>batch</C>：一组节点、关系和修改整批写入，全部成功或全部不写。</>,
        ],
      },
      {
        shot: 'inspector', k: '每一条记录', t: '字段各自独立，依据清清楚楚',
        li: [
          '风险、状态和可信度分别记录、分别显示，彼此之间不做推断。',
          '每条关系都由记录者显式声明，在详情里逐条列出来源与去向。',
          '本地服务中可以查看字段与关系的修改历史，结论变了，旧值还在。',
        ],
      },
      {
        shot: 'stage-all', k: '导出', t: '把记录与关系带出工作台',
        li: [
          '导出为可只读浏览的离线 HTML 工作台，保留记录与显式关系。',
          '也可以导出 Markdown、Mermaid 或 SARIF，接入文档、图表与安全分析流程。',
          '导出保留已记录的原文与关系，不生成摘要，也不补全结论。',
        ],
      },
    ],
    local: {
      k: '本地优先', t: '数据留在你的项目里',
      li: [
        <><C>.pinwhy/events.jsonl</C> 是唯一事实源，缓存损坏可以从事件恢复。</>,
        <>服务只监听本机，可以用 <C>serve --read-only</C> 关闭页面写入。</>,
        '新建项目记录自带忽略规则，默认不进入版本库；分享前仍需自己检查内容。',
      ],
      tree: '唯一事实源', loopback: '127.0.0.1 · 服务只监听本机',
    },
    stats: [[0, '运行时依赖'], [3, '种阅读视图'], [4, '种导出格式'], [4, '种界面语言']],
  },
  start: {
    kicker: '接入', title: '一句话，让 Agent 自己装好',
    lead: '把一句话发给正在用的 Agent，它会按自己的宿主完成接入；也可以切到对应宿主，三步手动装好。',
    tabAuto: '让 Agent 安装', copyPrompt: '复制指令', copyCmds: '复制命令', copied: '已复制',
    cwd: '~/your-project', env: 'Node.js ≥ 18 · macOS · Linux · Windows', hint: '点击任意一行即可单独复制',
    reply: ['示例', 'Pinwhy 已接入，工作台就绪', 'http://127.0.0.1:4333'],
    auto: {
      badge: '推荐', title: '让 Agent 自己装', you: '你', to: '发给正在使用的 Agent',
      will: 'Agent 将按接入说明：',
      steps: ['识别当前宿主，接入完整 Skill', '复用已有项目记录，不覆盖任何记录', '核验项目与服务状态，给出工作台地址'],
      copy: '复制这句话', note: '只需 Node.js ≥ 18。新 Skill 的加载取决于宿主，必要时开启新会话。',
    },
    manual: {
      title: '手动接入', hostsAria: 'Agent 宿主', copy: '复制', copied: '已复制', guide: '完整接入说明', step: '第 {n} 步',
      install: {
        t: '安装稳定的本机版本', d: '独立副本由 current 指向，日常使用不随开发分支切换。Windows 用 PowerShell 设置 PATH。',
        cmds: ['git clone https://github.com/bx33661/pinwhy.git', 'cd pinwhy', 'node bin/pinwhy.js release install', 'export PATH="$HOME/.local/bin:$PATH"'],
      },
      verify: {
        t: '核验接入结果', d: '工作台默认在 127.0.0.1:4333，以 status 返回为准。服务在线不代表 Agent 已加载 Skill，请在新会话中确认。',
        cmds: ['pinwhy status', 'pinwhy doctor'],
      },
      hosts: [
        { id: 'claude', name: 'Claude Code', tag: 'Skill + 恢复 Hook', t: '在项目中一键接入', d: '创建或复用 .pinwhy/，安装项目 Skill 与恢复 Hook，并为当前用户配置常驻查看器。',
          cmds: ['cd /path/to/your-project', 'pinwhy setup --target "$PWD" --title "项目名" --open'] },
        { id: 'codex', name: 'Codex', tag: 'Codex Skill', t: '初始化并安装 Codex Skill', d: 'Skill 装到 .agents/skills/pinwhy/；Codex 不使用 Claude 的 setup 与 Hook。已有项目记录可跳过 init。',
          cmds: ['cd /path/to/your-project', 'pinwhy init --title "项目名"', 'pinwhy skill install --codex', 'pinwhy serve --open'] },
        { id: 'dsh', name: 'DeepSeek Harness', tag: '原生插件', t: '添加插件并初始化项目', d: '插件提供 9 个原生工具，调用独立安装的 CLI；不自动初始化项目，需在 profile 配置中选择项目。',
          cmds: ['dsh plugin --profile web add /absolute/path/to/pinwhy/plugins/dsh-pinwhy', 'pinwhy init --cwd /absolute/path/to/your-project --json'] },
        { id: 'skill', name: 'OMP · ZCode', tag: '完整 Skill 包', t: '复制完整 Skill 包', d: '连同 references、agents、assets 一起复制到宿主的 Skill 目录，并把 CLI 占位符展开为真实路径。',
          cmds: ['cp -R pinwhy/skills/pinwhy <宿主的 Skill 目录>/'] },
        { id: 'cli', name: '只用 CLI', tag: '不接入宿主', t: '初始化并打开工作台', d: 'serve 是前台服务，Ctrl+C 停止；终端里使用 status、search 和 show 查看记录。',
          cmds: ['cd /path/to/your-project', 'pinwhy init --title "项目名"', 'pinwhy serve --open'] },
      ],
    },
  },
  principles: {
    kicker: '原则', title: '克制，是它的设计', lead: 'Pinwhy 保存探索记录。下面三条决定了它会做什么、不会做什么。',
    items: [
      ['关系由记录者声明', '创建节点不会自动连边，也不会移动游标。图上的每一根线，都是某个 Agent 或你明确写下的。', 'pinwhy link o1 hy1 --rel supports'],
      ['它是记忆，不是指挥', '恢复包声明只读、非指令，下一步永远由 Agent 自己决定。省略只是没装下，不代表改判。', 'policy: { readOnly: true, prescriptive: false }'],
      ['本地、透明、可回放', '项目内的事件日志是唯一事实源；服务只监听本机，可以只读启动；lint 只报告，不阻断。', 'pinwhy serve --read-only'],
    ],
  },
  faq: {
    kicker: '常见问题', title: '在你开始之前', more: ['更多细节见 ', '使用参考', '。'],
    qa: [
      ['和 Agent 自带的记忆或上下文压缩有什么不同？', '压缩会把对话改写成摘要，细节和依据可能就此消失。Pinwhy 把判断、证据和关系作为独立记录存在项目里，原文完整保留；恢复时按预算整项读回，装不下的会明确计数，而不是悄悄截断。'],
      ['数据会上传到哪里吗？', <>不会。记录保存在项目内的 <C>.pinwhy/events.jsonl</C>，工作台服务只监听本机回环地址。检查更新只在你主动点击时联网。记录可能包含敏感原文，分享或提交前请自己检查。</>],
      ['它会自动帮我连线、推断结论吗？', <>不会。创建节点不会自动连边或移动游标；关系必须由 Agent 或你用 <C>link</C> 明确声明。风险、状态与可信度也分别记录，互不推断。</>],
      ['需要什么环境？支持哪些系统？', '只需 Node.js ≥ 18，使用 CLI 和工作台不需要安装开发依赖。支持 macOS、Windows 和 Linux，用户级常驻查看器分别使用 launchd、计划任务和 systemd。'],
      ['可以接入哪些 Agent？', <>Claude Code 用 <C>pinwhy setup</C> 配置 Skill 与恢复 Hook；Codex 用 <C>skill install --codex</C>；DeepSeek Harness 有独立插件；OMP、ZCode 等宿主复用完整 Skill 包。</>],
      ['接入出问题了怎么排查？', <>先运行 <C>pinwhy doctor</C>。提交问题时可以附上隐藏了本机路径的 <C>pinwhy doctor --share --json</C> 报告。</>],
    ],
  },
  finale: { title: '接着做', lead: '下一次压缩之后，不必从头开始。复制一句话，把 Pinwhy 交给你的 Agent。', cta: '复制接入指令', docs: '阅读使用参考' },
  footer: { tag: 'Agent 的外置记忆与可视化工作台', links: ['使用参考', '文档目录', '工程约定', '贡献指南', 'GitHub'], license: 'MIT 许可' },
};

/* ------------------------------------------------------------------ English */
const en = {
  htmlLang: 'en',
  meta: { title: 'Pinwhy — external memory and a visual workspace for AI agents', desc: 'Pinwhy keeps an agent’s judgments, evidence and current position inside your project, so work resumes from the same place after compaction, a dropped connection or a new session.' },
  prompt: 'Read the setup guide at https://github.com/bx33661/pinwhy. Install or reuse Pinwhy for this project, connect the full Skill for the current agent host and open the workspace. Keep any existing board records, then verify the project and service status and give me the workspace URL.',
  toast: { prompt: 'Setup prompt copied — paste it to your agent', cmd: 'Command copied', failed: 'Couldn’t copy. Select the text instead.' },
  nav: {
    links: [['how', 'How it works'], ['views', 'Workspace'], ['features', 'Features'], ['start', 'Get started'], ['faq', 'FAQ']],
    copy: 'Copy setup prompt', theme: 'Theme', menu: 'Menu', lang: '语言',
    themes: { light: 'Light', dark: 'Dark', system: 'System' },
  },
  hero: {
    eyebrow: '0.10 adds batch writes', eyebrowHref: `${REPO}#release`,
    lead: [<>An <b>external memory</b> and visual workspace for AI agents. </>, 'It keeps judgments, evidence and the current position inside your project — so after compaction, a dropped connection or a new session, ', <em key="u">work picks up right where it left off.</em>],
    meta: ['Zero runtime dependencies', 'Node.js ≥ 18', 'Data stays local', 'MIT licensed', '4 interface languages'],
    cta: 'Copy setup prompt', gh: 'View on GitHub',
  },
  stage: {
    aria: 'Workspace demo', badge: 'Synthetic demo data', open: 'Open the live workspace', loading: 'Loading the workspace…', shield: 'Click to pan, zoom and select nodes', hint: 'Hover a chip to light up its evidence',
    frameTitle: 'Pinwhy workspace demo (synthetic data)',
    tabs: {
      context: ['Context', 'Only the current focus, its one-hop neighbours, goals and open questions. Where the agent is, you are.'],
      logic: ['Logic', 'Read the evidence along recorded supports, contradictions and derivations. Every line was written down on purpose.'],
      all: ['Overview', 'The whole board, including records that aren’t connected yet. Groups are for display only.'],
      board: ['2.5D board', 'Every judgment is a chip whose height is its recorded severity; every explicit relation is a copper trace carrying signal in its recorded direction.'],
    },
    ws: { context: 'Context view', logic: 'Logic view', all: 'Overview', fit: 'Fit to screen', toDark: 'Switch to dark theme', toLight: 'Switch to light theme', locale: 'en' },
  },
  how: {
    kicker: 'How it works', title: [<>Context gets lost.</>, <>Judgment <i>shouldn’t.</i></>],
    steps: [
      ['The agent writes as it works', 'Goals, observations, hypotheses and findings become nodes. The agent declares what supports or contradicts what, and a cursor marks where it is looking.'],
      ['The context gets compacted', 'Long tasks hit the window limit. After compaction, a dropped connection or a new session, the reasoning in the chat is gone.'],
      ['One command restores the scene', 'Goals, neighbours, open questions and checkpoints come back within a token budget. The agent resumes from the same spot instead of starting over.'],
    ],
    ctx: 'Context', lost: 'The reasoning in the chat is gone',
    ok: '✓ Restored 5 nodes · 4 relations · cursor q1',
    nodes: {
      g1: ['Goal', 'Map the anonymous access boundary of the admin API'],
      hy1: ['Hypothesis', 'Read endpoints may skip shared auth', 'Open'],
      o1: ['Observation', 'Anonymous request returns 200'],
      f1: ['Finding', 'Full user list exposed anonymously', 'Critical · confirmed'],
      q1: ['Question', 'Can uploads chain with exports?'],
    },
    writing: 'pinwhy node add observation "Anonymous request returns 200" --to hy1 --rel supports',
  },
  features: {
    kicker: 'Features', title: 'Not just the conclusion — the path that led there',
    lead: 'Every record can be traced, compared and handed over. Pinwhy stores and shows; it doesn’t rewrite verdicts, fill gaps or reason for the agent.',
    real: 'Real interface · synthetic data',
    rows: [
      {
        shot: 'digest', k: 'Checkpoints and recovery', t: 'New session, same scene',
        li: [
          <>Save the scene with <C>checkpoint</C>, then read back only what was added, changed or removed with <C>context --since</C>.</>,
          'The recovery pack takes whole records or leaves them out within the token budget, and counts what it left out.',
          'It declares itself read-only and non-prescriptive: it lays out the scene; the agent still decides what to do next.',
        ],
      },
      {
        shot: 'agents', k: 'Many agents', t: 'Explore in parallel, sign your work',
        li: [
          <>Each agent has its own identity, cursor and write signature; pick a perspective explicitly with <C>--agent</C>.</>,
          'Switching perspective in the workspace changes the view only — no one’s cursor moves.',
          <>0.10 adds <C>batch</C>: a set of nodes, relations and edits lands all together or not at all.</>,
        ],
      },
      {
        shot: 'inspector', k: 'Every record', t: 'Independent fields, visible evidence',
        li: [
          'Severity, status and confidence are recorded and shown separately — none is inferred from another.',
          'Every relation is declared by whoever recorded it, and the details list each one with its source.',
          'The local service shows the edit history of fields and relations: when a verdict changes, the old value stays.',
        ],
      },
      {
        shot: 'stage-all', k: 'Export', t: 'Take records and relations beyond the workspace',
        li: [
          'Export a read-only offline HTML workspace with the recorded text and explicit relations.',
          'Export Markdown, Mermaid or SARIF for documentation, diagrams and security analysis workflows.',
          'Exports keep the recorded text and relations as written — no generated summaries, no filled-in conclusions.',
        ],
      },
    ],
    local: {
      k: 'Local first', t: 'Your data stays in your project',
      li: [
        <><C>.pinwhy/events.jsonl</C> is the single source of truth; a damaged cache can be rebuilt from events.</>,
        <>The service listens on localhost only, and <C>serve --read-only</C> turns off page writes.</>,
        'New boards ship with ignore rules and stay out of version control by default; still review before you share.',
      ],
      tree: 'source of truth', loopback: '127.0.0.1 · localhost only',
    },
    stats: [[0, 'runtime dependencies'], [3, 'reading views'], [4, 'export formats'], [4, 'interface languages']],
  },
  start: {
    kicker: 'Get started', title: 'One sentence, and your agent sets it up',
    lead: 'Send one sentence to the agent you already use and it sets Pinwhy up for its host — or pick your host and install it by hand in three steps.',
    tabAuto: 'Ask your agent', copyPrompt: 'Copy prompt', copyCmds: 'Copy commands', copied: 'Copied',
    cwd: '~/your-project', env: 'Node.js ≥ 18 · macOS · Linux · Windows', hint: 'Click any line to copy just that line',
    reply: ['Example', 'Pinwhy is connected and the workspace is ready', 'http://127.0.0.1:4333'],
    auto: {
      badge: 'Recommended', title: 'Let your agent do it', you: 'You', to: 'to the agent you’re using',
      will: 'Following the setup guide, the agent will:',
      steps: ['Detect its host and connect the full Skill', 'Reuse any existing board without overwriting records', 'Verify the project and service, then give you the URL'],
      copy: 'Copy prompt', note: 'Needs only Node.js ≥ 18. How a new Skill loads depends on the host; start a new session if needed.',
    },
    manual: {
      title: 'Manual setup', hostsAria: 'Agent hosts', copy: 'Copy', copied: 'Copied', guide: 'Full setup guide', step: 'Step {n}',
      install: {
        t: 'Install a stable local copy', d: 'A standalone copy that current points to — daily use never follows your dev branch. On Windows, set PATH in PowerShell.',
        cmds: ['git clone https://github.com/bx33661/pinwhy.git', 'cd pinwhy', 'node bin/pinwhy.js release install', 'export PATH="$HOME/.local/bin:$PATH"'],
      },
      verify: {
        t: 'Verify the setup', d: 'The workspace defaults to 127.0.0.1:4333 — trust what status reports. A running service doesn’t mean the agent loaded the Skill; check in a new session.',
        cmds: ['pinwhy status', 'pinwhy doctor'],
      },
      hosts: [
        { id: 'claude', name: 'Claude Code', tag: 'Skill + recovery hook', t: 'Connect the project in one go', d: 'Creates or reuses .pinwhy/, installs the project Skill and recovery hook, and sets up a background viewer for your user.',
          cmds: ['cd /path/to/your-project', 'pinwhy setup --target "$PWD" --title "My project" --open'] },
        { id: 'codex', name: 'Codex', tag: 'Codex Skill', t: 'Initialise and add the Codex Skill', d: 'The Skill goes to .agents/skills/pinwhy/; Codex doesn’t use Claude’s setup or hooks. Skip init if a board already exists.',
          cmds: ['cd /path/to/your-project', 'pinwhy init --title "My project"', 'pinwhy skill install --codex', 'pinwhy serve --open'] },
        { id: 'dsh', name: 'DeepSeek Harness', tag: 'Native plugin', t: 'Add the plugin and initialise', d: 'Nine native tools that call your installed CLI. It never initialises a project on its own; pick the project in your profile config.',
          cmds: ['dsh plugin --profile web add /absolute/path/to/pinwhy/plugins/dsh-pinwhy', 'pinwhy init --cwd /absolute/path/to/your-project --json'] },
        { id: 'skill', name: 'OMP · ZCode', tag: 'Full Skill package', t: 'Copy the full Skill package', d: 'Copy it with references, agents and assets into the host’s Skill directory, and expand the CLI placeholders to real paths.',
          cmds: ['cp -R pinwhy/skills/pinwhy <host-skill-dir>/'] },
        { id: 'cli', name: 'CLI only', tag: 'No host integration', t: 'Initialise and open the workspace', d: 'serve runs in the foreground — Ctrl+C stops it. Use status, search and show to inspect records in the terminal.',
          cmds: ['cd /path/to/your-project', 'pinwhy init --title "My project"', 'pinwhy serve --open'] },
      ],
    },
  },
  principles: {
    kicker: 'Principles', title: 'Restraint is the design', lead: 'Pinwhy keeps the record. These three rules decide what it does — and what it won’t.',
    items: [
      ['Relations are declared, not guessed', 'Adding a node never draws edges or moves the cursor. Every line on the board was written by an agent or by you.', 'pinwhy link o1 hy1 --rel supports'],
      ['Memory, not a manager', 'The recovery pack is read-only and non-prescriptive; the agent always chooses the next step. Omitted means it didn’t fit, not that it was overruled.', 'policy: { readOnly: true, prescriptive: false }'],
      ['Local, transparent, replayable', 'An event log in your project is the single source of truth. The service listens locally and can run read-only; lint reports, it never blocks.', 'pinwhy serve --read-only'],
    ],
  },
  faq: {
    kicker: 'FAQ', title: 'Before you start', more: ['More detail in the ', 'usage reference', '.'],
    qa: [
      ['How is this different from an agent’s own memory or compaction?', 'Compaction rewrites the chat into a summary, and details or evidence can disappear. Pinwhy keeps judgments, evidence and relations as separate records in your project, with the original text intact. Recovery reads whole records within a budget and counts what didn’t fit instead of silently cutting it.'],
      ['Does any data leave my machine?', <>No. Records live in <C>.pinwhy/events.jsonl</C> in your project, and the workspace listens on the loopback address only. Update checks go online only when you click them. Records may contain sensitive text, so review them before sharing or committing.</>],
      ['Will it connect nodes or draw conclusions for me?', <>No. Adding a node never draws edges or moves the cursor; relations must be declared with <C>link</C> by an agent or by you. Severity, status and confidence are recorded separately, too.</>],
      ['What do I need, and which systems are supported?', 'Just Node.js ≥ 18; the CLI and workspace need no dev dependencies. macOS, Windows and Linux are supported, with launchd, Task Scheduler and systemd for the background viewer.'],
      ['Which agents can use it?', <>Claude Code via <C>pinwhy setup</C> (Skill and recovery hook), Codex via <C>skill install --codex</C>, DeepSeek Harness via its own plugin, and hosts like OMP and ZCode by reusing the full Skill package.</>],
      ['Something isn’t working. Where do I start?', <>Run <C>pinwhy doctor</C>. When filing an issue, attach <C>pinwhy doctor --share --json</C>, which hides local paths.</>],
    ],
  },
  finale: { title: 'Pick up where you left off', lead: 'After the next compaction, you don’t start over. Copy one sentence and hand the board to your agent.', cta: 'Copy setup prompt', docs: 'Read the docs' },
  footer: { tag: 'External memory and a visual workspace for AI agents', links: ['Usage', 'Docs', 'Principles', 'Contributing', 'GitHub'], license: 'MIT License' },
};

export const DICTS = { zh, en };

const LangCtx = createContext({ lang: 'zh', t: zh, setLang: () => {} });

/* Each language has its own address: / is Chinese, /en/ is English (both prerendered at build time). */
export const LANG_PATH = { zh: '/', en: '/en/' };
const fromPath = () => (typeof location !== 'undefined' && /^\/en(\/|$)/.test(location.pathname) ? 'en' : 'zh');

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(fromPath);
  const t = DICTS[lang];
  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
    document.title = t.meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.desc);
  }, [t]);
  useEffect(() => {
    const onPop = () => setLangState(fromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const setLang = useCallback((l) => {
    if (l === fromPath()) return;
    history.pushState(null, '', LANG_PATH[l] + location.hash);
    setLangState(l);
  }, []);
  return <LangCtx.Provider value={{ lang, t, setLang }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
export const useT = () => useContext(LangCtx).t;
