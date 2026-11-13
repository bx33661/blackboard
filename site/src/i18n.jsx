import { createContext, useContext, useEffect } from 'react';
import { useRoute } from './router.jsx';

const REPO = 'https://github.com/bx33661/pinwhy';
const C = ({ children }) => <code>{children}</code>;

/* ------------------------------------------------------------------ 简体中文 */
const zh = {
  htmlLang: 'zh-CN',
  meta: {
    title: 'Pinwhy — Agent 的外置记忆与可视化工作台',
    desc: "Pinwhy 为 Agent 保存关键判断、证据与研究进展。跨会话读回项目记忆，在工作台里查看判断的依据与变化。本地优先，MIT 开源。",
  },
  prompt: '请阅读 https://github.com/bx33661/pinwhy 的接入说明，为当前项目安装或复用 Pinwhy，按当前宿主安装完整 Skill 并打开工作台。保留已有记录，完成后核验项目与服务状态并给我访问地址。',
  toast: { prompt: '接入指令已复制，发给你的 Agent 即可', cmd: '命令已复制', failed: '复制失败，请手动选择文本' },
  nav: {
    links: [
      ['views', '工作台', 'home#views'],
      ['security', '安全审计', 'security'],
      ['dsh', 'DeepSeek Harness', 'dsh'],
      ['how', '工作原理', 'home#how'],
      ['start', '快速接入', 'home#start'],
    ],
    copy: '复制接入指令',
    theme: '切换主题',
    menu: '菜单',
    lang: 'Language',
    themes: { light: '浅色', dark: '深色', system: '跟随系统' },
    palette: {
      open: '命令面板', trigger: '搜索', placeholder: '搜索页面、命令或设置…', empty: '没有匹配的结果',
      groups: { nav: '跳转', actions: '操作', prefs: '偏好' },
      top: '回到顶部', copyCmd: '复制安装命令', github: '在 GitHub 上查看', langTo: 'Switch to English',
      hint: { move: '选择', run: '执行', close: '关闭' },
    },
  },
  hero: {
    eyebrow: "v0.2.0 · 安全审计工作台与多宿主接入",
    eyebrowHref: `${REPO}#release`,
    lead: [
      <>Agent 的<b>外置记忆</b>与可视化工作台。</>,
      "把关键判断、证据与未决问题留在项目里。上下文压缩或切换会话后，",
      <em key="u">读回已有进展，接着往下做。</em>,
    ],
    meta: ['零运行时依赖', 'Node.js ≥ 18', "项目本地存储", "通用与安全审计模式", 'MIT 开源'],
    cta: '复制接入指令',
    gh: '在 GitHub 查看',
  },
  spotlights: {
    security: {
      kicker: '专项工作台',
      title: '面向安全研究与代码审计',
      desc: "围绕问题与候选发现，查看支持证据、反证和成立条件。保留已排除的解释，让长程审计中的每一次取舍都有迹可循。",
      cta: '探索安全审计模式',
      features: ['问题与候选逻辑树', "成立条件单独记录", "保留反证与判断变化", 'SARIF 2.1.0 与 Markdown 导出'],
    },
    dsh: {
      kicker: "宿主集成",
      title: 'DeepSeek Harness 原生插件',
      desc: "在 DeepSeek Harness 内使用原生工具读写项目记忆，通过内嵌画板查看判断、证据与当前关注点。沿用熟悉的宿主，接续已有工作。",
      cta: '了解 DSH 插件集成',
      features: ['DSH 原生内置 Web 画板', "11 个结构化原生工具", "独立会话身份与路径校验", "临时查看服务随宿主回收"],
    },
  },
  stage: {
    aria: '工作台演示',
    badge: '合成演示数据',
    open: "试用工作台演示",
    loading: '正在载入工作台…',
    shield: '点击即可拖动、缩放与选择节点',
    hint: '悬停芯片，点亮它的证据链',
    frameTitle: 'Pinwhy 工作台演示（合成数据）',
    tabs: {
      context: ['现场', "查看当前关注点、相邻记录、任务目标与开放问题，了解研究进行到了哪里。"],
      logic: ['逻辑', "沿已记录的支持、反驳与推导关系，查看每项判断的依据。"],
      all: ['全局', "浏览项目中的全部记录，找回其他方向与尚未建立关系的发现。"],
      board: ['2.5D 电路板', "用电路板视角浏览记录与关系。芯片高度对应已记录的严重度，连线呈现明确写入的关系。"],
    },
    ws: { context: '现场视图', logic: '逻辑视图', all: '全局视图', fit: '适应画布', toDark: '切换深色主题', toLight: '切换浅色主题', locale: 'zh-CN' },
  },
  how: {
    kicker: '工作原理',
    title: [<>会话可以切换，</>, <>关键判断<i>值得留下。</i></>],
    steps: [
      ["在探索中留下记录", "Agent 记录目标、观察与判断，明确写下支持或反驳关系，并维护当前关注点。"],
      ["对话上下文发生变化", "长任务可能经历上下文压缩或会话切换。对话中的细节未必保留，已经写入项目的记录仍可读取。"],
      ["读回记录，接续工作", "按预算读回目标、相关记录、开放问题与检查点。省略项明确计数，Agent 可按需要补读详情。"],
    ],
    ctx: '上下文',
    lost: "对话上下文已压缩，项目记录仍然保留",
    ok: '✓ 已恢复 5 节点 · 4 显式关系 · 关注点 q1',
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
    kicker: '核心特性',
    title: "让每个判断，都有来路",
    lead: "从最初的观察到后来的结论，依据与变化各有记录。下一次会话可以读回，接手的人也能沿着证据继续核对。",
    real: '真实界面 · 合成数据',
    rows: [
      {
        shot: 'digest',
        k: "检查点与上下文接续",
        t: "换一个会话，接着已有进展",
        li: [
          <>用 <C>checkpoint</C> 保存阶段性现场，之后用 <C>context --since</C> 只读回新增、修改与删除。</>,
          "上下文按估算预算带入完整记录，并明确统计省略项，便于按需补读。",
          "读回内容呈现已保存的现场，后续行动仍由 Agent 根据任务决定。",
        ],
      },
      {
        shot: 'agents',
        k: '多 Agent 并行协作',
        t: "共享记录，保留各自视角",
        li: [
          <>每个 Agent 拥有独立身份、游标与写入署名，使用 <C>--agent</C> 显式标记写入视角。</>,
          "切换 Agent 视角，查看各自的关注点；浏览不会改变参与者的工作位置。",
          <>支持原子批处理 <C>pinwhy batch</C>：一组节点、关系和修改整批提交，全部成功或全部不写。</>,
        ],
      },
      {
        shot: 'inspector',
        k: "判断与依据",
        t: "区分推测、证据与结论",
        li: [
          "严重度、状态与可信度分别记录。问题的影响、处理进展与验证程度，各有明确含义。",
          "支持与反驳关系由记录者明确写入，字段历史保留判断变化。",
          "按任务需要选择记录类型，也可保留自定义类型与关系。",
        ],
      },
      {
        shot: 'stage-all',
        k: "导出与交付",
        t: '把记录与关系带出工作台',
        li: [
          "导出为单文件 HTML，离线浏览已记录的内容与关系。",
          "用 Markdown 归档、Mermaid 表达关系，或将带有效位置的发现导出为 SARIF 2.1.0。",
          "导出内容来自已有记录，保留原文与显式关系，供后续整理和复核。",
        ],
      },
    ],
    local: {
      k: "本地优先",
      t: "把记忆留在项目里",
      li: [
        <><C>.pinwhy/events.jsonl</C> 是记录的事实源，缓存可从事件日志重建。</>,
        <>服务仅监听本机回环地址（127.0.0.1），可用 <C>serve --read-only</C> 关闭页面写入。</>,
        "新建黑板包含 Git 忽略规则；共享、导出或提交前，仍需核对记录中的敏感内容。",
      ],
      tree: '唯一事实源',
      loopback: '127.0.0.1 · 服务只监听本机',
    },
    stats: [
      [0, '运行时依赖'],
      [2, "种工作模式"],
      [4, "种导出格式"],
      [7, "种宿主的 Skill 接入"],
    ],
  },
  securityPage: {
    kicker: '安全研究与代码审计',
    title: "让审计判断，经得起复核。",
    subtitle: "记录问题、候选发现、支持证据与成立条件。在工作台里沿关系核对，保留反证和已排除的解释，让后续验证有据可循。",
    badges: ['SARIF 2.1.0 标准导出', "显式证据关系", "区分事实与推测", "项目本地存储"],
    painPoints: {
      kicker: "审计中的记录与接续",
      title: "把关键依据，留给下一轮核对",
      items: [
        {
          title: "已排除的方向需要保留",
          problem: "长程审计中，已核对的防护机制和排除条件容易散落在对话里，交接时难以找回。",
          solution: "将反证与被推翻的假设单独记录。新会话读回已有判断后，可以核对原来的验证范围与条件。",
        },
        {
          title: "候选与结论需要区分",
          problem: "发现可疑参数或敏感操作，并不意味着利用路径已经成立。中间校验、权限和业务约束仍需验证。",
          solution: "明确记录每条证据支持或反驳的论断，并区分待验证、静态核对与实际复现。",
        },
        {
          title: "成立条件需要单独核对",
          problem: "依赖特定权限、配置或版本的发现，需要在后续验证与交付中保留这些前提。",
          solution: "用 depends-on 单独记录必要条件，与支持证据、普通关联分别呈现，便于检查适用范围。",
        },
      ],
    },
    workspaceSection: {
      kicker: '安全模式',
      title: "围绕问题，查看证据与条件",
      lead: "选择一个问题或候选发现，查看相关证据、反证和必要条件。模式切换读取同一份项目记录。",
      cards: [
        {
          type: 'Question / Goal',
          tag: '问题入口',
          title: "明确调查的问题与范围",
          desc: "从资产边界或防护机制提出问题，再用显式关系或 issue 标签关联候选发现。",
        },
        {
          type: 'Candidate / Finding',
          tag: '候选论断',
          title: "分别记录影响、状态与可信度",
          desc: "保存候选主张，分别记录严重度、处理状态与可信度。一个问题的影响程度，不代表它已经得到验证。",
        },
        {
          type: 'Evidence & Rebuttal',
          tag: '证据与反证',
          title: "让证据指向具体论断",
          desc: "写清源码分析或动态观察支持到哪里、反驳了什么。保留检查条件，区分静态核对与动态复现。",
        },
        {
          type: 'Conditions',
          tag: '必要成立条件',
          title: "把必要条件单独列出",
          desc: "将所需权限、环境变量或非默认配置独立记录，方便复核发现的适用条件。",
        },
      ],
    },
    complianceSection: {
      kicker: "导出与交付",
      title: "让已有记录，进入复核与交付",
      items: [
        {
          title: '标准 SARIF 2.1.0 导出',
          desc: "将带有效代码位置的 finding 或 vuln 记录导出为 SARIF 2.1.0，供支持该格式的工具读取。",
        },
        {
          title: "Markdown 记录归档",
          desc: "导出已写入的节点、详情与关系，用于后续整理、复核和归档。内容取决于实际记录。",
        },
        {
          title: "本地存储与只读查看",
          desc: "记录保存在项目目录，查看服务监听本机回环地址，并支持只读模式。分享导出文件与调用模型时，仍需按所用环境管理敏感内容。",
        },
      ],
    },
    cta: '开始在安全任务中使用 Pinwhy',
  },
  dshPage: {
    kicker: 'DeepSeek Harness 原生插件',
    title: "在 DeepSeek Harness 里，接续项目记忆。",
    subtitle: "通过原生工具记录和读取项目记忆，在内嵌画板里查看判断、证据与当前关注点。插件连接 DSH 与独立安装的 Pinwhy CLI。",
    badges: ["适配 DSH 0.2.2-rc.2", "11 个原生工具", "随宿主回收的临时服务", "宿主沙箱与路径校验"],
    architecture: {
      kicker: '插件架构',
      title: "沿用宿主，连接项目记录",
      desc: 'dsh-pinwhy 位于主仓库 plugins/dsh-pinwhy，采用清晰的单向调用链路：DSH 宿主 → 插件适配层 → 独立安装的 Pinwhy CLI → 本地事件日志。',
    },
    highlights: [
      {
        k: '原生画板',
        t: 'DSH 原生内置 Web 画板',
        desc: "从全局主面板或当前会话打开画板，查看项目记录、证据关系与历史。主题、字体和字号跟随 DSH 宿主。",
        detail: "临时查看服务由宿主管理，动态分配端口，并在对应视图或宿主销毁时回收。",
      },
      {
        k: '原生工具',
        t: "11 个结构化原生工具",
        desc: "Agent 通过 DSH 原生工具调用，获得结构化 JSON 结果；插件负责参数校验与 CLI 调用。",
        detail: '包含 pinwhy_diagnose（只读体检）、pinwhy_context（预算恢复）、pinwhy_batch（原子批处理）、pinwhy_search（结构化过滤）等。',
      },
      {
        k: '安全沙箱',
        t: '会话身份隔离与物理路径校验',
        desc: "写入保留会话身份，各参与者维护独立关注点。插件对接 DSH sandboxPolicy，核验写入目标的物理路径。",
        detail: "CLI 调用通过异步子进程执行，支持超时、取消与宿主销毁时的进程回收。",
      },
      {
        k: '实时流',
        t: "记录同步与节点直达",
        desc: "从工具卡片打开对应节点。内嵌画板通过 SSE 接收记录变化，也能查看其他 CLI 或宿主写入的进展。",
        detail: "节点内容可作为引用插入会话草稿，由使用者确认后发送；查看记录不会自动改变工作游标。",
      },
    ],
    installSection: {
      kicker: '安装与接入',
      title: '三步完成 DSH 插件接入',
      steps: [
        {
          n: '01',
          t: '安装独立 Pinwhy CLI',
          d: '通过 npm 全局安装稳定版本：',
          cmd: 'npm install --global pinwhy@0.2.0',
        },
        {
          n: '02',
          t: '为 DSH 添加插件 bundle',
          d: "按插件文档取得插件包，再从本地子包路径添加：",
          cmd: 'dsh plugin --profile web add /path/to/pinwhy/plugins/dsh-pinwhy',
        },
        {
          n: '03',
          t: '声明项目白名单',
          d: "先初始化目标项目，再在 DSH 设置中选择工作区，或通过 cordis.patch.yml 配置：",
          code: `- id: pinwhy\n  config:\n    projects:\n      - workspace: /path/to/your-project\n        boardRoot: /path/to/your-project`,
        },
      ],
    },
    cta: "复制接入指令",
  },
  start: {
    kicker: '快速接入',
    title: "交给 Agent 接入，也可手动安装",
    lead: "复制接入指令，交给正在使用的 Agent；也可在终端选择安装范围与宿主，按说明完成配置。",
    tabAuto: '让 Agent 安装',
    copyPrompt: '复制指令',
    copyCmds: '复制命令',
    copied: '已复制',
    cwd: '~/your-project',
    env: 'Node.js ≥ 18 · macOS · Linux · Windows',
    hint: '点击任意一行即可单独复制',
    reply: ['示例', 'Pinwhy 已接入，工作台就绪', 'http://127.0.0.1:4333'],
    auto: {
      badge: '推荐',
      title: "交给 Agent 配置",
      you: '你',
      to: '发给正在使用的 Agent',
      will: 'Agent 将按接入说明：',
      steps: ['识别当前宿主，接入完整 Skill 包', '复用已有项目记录，不覆盖任何已有数据', '核验项目与服务状态，给出工作台访问地址'],
      copy: '复制这句话',
      note: '只需 Node.js ≥ 18。新 Skill 的加载取决于宿主，必要时开启新会话。',
    },
    manual: {
      title: '手动接入',
      hostsAria: 'Agent 宿主',
      copy: '复制',
      copied: '已复制',
      guide: '完整接入说明',
      step: '第 {n} 步',
      install: {
        t: '安装稳定 CLI',
        d: "通过 npm 安装 CLI、工作台与完整 Skill 包。",
        cmds: ['npm install --global pinwhy@0.2.0', 'pinwhy --version'],
      },
      verify: {
        t: '核验接入结果',
        d: '工作台默认在 127.0.0.1:4333，以 status 返回为准。服务在线不代表 Agent 已加载 Skill，请在新会话中确认。',
        cmds: ['pinwhy status', 'pinwhy doctor'],
      },
      hosts: [
        {
          id: 'claude',
          name: 'Claude Code',
          tag: 'Skill + 恢复 Hook',
          t: "在项目中配置接入",
          d: '创建或复用 .pinwhy/，安装项目 Skill 与会话恢复 Hook，并为当前用户配置常驻查看器。',
          cmds: ['cd /path/to/your-project', 'pinwhy setup --title "项目名" --open'],
        },
        {
          id: 'skill',
          name: 'Cursor · Codex · OMP · Gemini',
          tag: '全宿主交互安装',
          t: '运行交互式安装器',
          d: "选择项目或用户范围，再选择宿主的 Skill 目录。新项目需先初始化，安装后按宿主方式加载 Skill。",
          cmds: ['cd /path/to/your-project', 'pinwhy skill install', 'pinwhy serve --open'],
        },
        {
          id: 'dsh',
          name: 'DeepSeek Harness',
          tag: '原生插件',
          t: '添加插件并初始化项目',
          d: "单独安装 plugins/dsh-pinwhy，提供 11 个原生工具与内嵌只读画板。插件使用独立安装的 CLI。",
          cmds: ['dsh plugin --profile web add /path/to/pinwhy/plugins/dsh-pinwhy', 'pinwhy init --cwd /path/to/your-project --json'],
        },
        {
          id: 'cli',
          name: '只用 CLI',
          tag: '无宿主模式',
          t: '初始化并打开工作台',
          d: 'serve 是前台服务，Ctrl+C 停止；终端里使用 status、search 和 show 查看记录。',
          cmds: ['cd /path/to/your-project', 'pinwhy init --title "项目名"', 'pinwhy serve --open'],
        },
      ],
    },
  },
  principles: {
    kicker: '原则',
    title: "留下依据，保留判断的自主权",
    lead: "Pinwhy 保存已经写下的内容，让过程可读、依据可查。后续如何研究，仍由任务的参与者决定。",
    items: [
      ['关系由记录者声明', '创建节点不会自动连边，也不会自动移动游标。图上的每一根线，都是某个 Agent 或你明确写下的。', 'pinwhy link o1 hy1 --rel supports'],
      ["记忆供参考，行动由 Agent 决定", "上下文读取只呈现已有记录，不指派下一步。预算内未带入的内容会明确计数，不代表判断已经改变。", 'policy: { readOnly: true, prescriptive: false }'],
      ["本地存储，过程可追溯", "项目事件日志保存变化，可据此重建记录；查看服务支持只读模式，诊断只报告问题，不接管任务。", 'pinwhy serve --read-only'],
    ],
  },
  faq: {
    kicker: '常见问题',
    title: '在你开始之前',
    more: ['更多细节见 ', '使用参考', '。'],
    qa: [
      [
        "与 Agent 记忆和上下文压缩如何配合？",
        "宿主记忆和上下文压缩各有实现。Pinwhy 额外保存明确写下的判断、证据、关系与关注点，供跨会话读取和人工复核。它保留的是项目记录，不是完整对话或模型内部思考；读取按估算预算选择完整记录，并统计省略项。",
      ],
      [
        "记录保存在哪里？哪些内容需要自行管理？",
        <>项目记录保存在本地的 <C>.pinwhy/events.jsonl</C>，查看服务监听 127.0.0.1。新建黑板包含 Git 忽略规则；Agent 发送给模型提供方的内容取决于宿主配置，共享、导出与 Git 提交也需自行管理。</>,
      ],
      [
        "它会自动推断结论或建立关系吗？",
        <>判断与关系由 Agent 或人明确写入。创建节点不会自动连线，可用 <C>link</C> 或相关参数声明关系。严重度、状态与可信度分别记录，证据仍需由参与者核对。</>,
      ],
      [
        '需要什么环境？支持哪些操作系统？',
        "CLI 与工作台需要 Node.js ≥ 18，支持 macOS、Windows 和 Linux，没有运行时依赖。Windows 上使用 Claude Code Hook 还需 Git Bash；DSH 插件的运行环境以宿主要求为准。",
      ],
      [
        '可以接入哪些 Agent 宿主？',
        <>Claude Code、Cursor、Codex、Gemini CLI、GitHub Copilot CLI、OMP 与 OpenCode 可通过 Skill 接入，DeepSeek Harness 使用独立插件。运行 <C>pinwhy skill install</C> 可交互选择 Skill 的目标目录与安装范围。</>,
      ],
      [
        '接入出问题了怎么排查？',
        <>先在终端运行 <C>pinwhy doctor</C>。提交反馈时可以附上脱敏了本机真实路径的 <C>pinwhy doctor --share --json</C> 诊断报告。</>,
      ],
    ],
  },
  finale: {
    title: "让下一次会话，接得上。",
    lead: "给关键判断留一份记录。下一次探索，从已有依据继续。",
    cta: '复制接入指令',
    docs: '阅读使用参考',
  },
  footer: {
    tag: 'Agent 的外置记忆与可视化工作台',
    links: ['使用参考', '文档目录', '工程约定', '贡献指南', 'GitHub'],
    license: 'MIT 许可',
    cols: ['资源', '项目'],
    play: ['在点阵上移动指针，点击钉下一枚线索', '本次已钉下', '枚'],
  },
};

/* ------------------------------------------------------------------ English */
const en = {
  htmlLang: 'en',
  meta: {
    title: 'Pinwhy — external memory and a visual workspace for AI agents',
    desc: "Pinwhy keeps key judgments, evidence, and research progress in your project. Read them back across sessions and review how the work evolved. Local-first and MIT licensed.",
  },
  prompt: 'Read the setup guide at https://github.com/bx33661/pinwhy. Install or reuse Pinwhy for this project, connect the full Skill for the current agent host and open the workspace. Keep any existing board records, then verify the project and service status and give me the workspace URL.',
  toast: { prompt: 'Setup prompt copied — paste it to your agent', cmd: 'Command copied', failed: 'Couldn’t copy. Select the text instead.' },
  nav: {
    links: [
      ['views', 'Workspace', 'home#views'],
      ['security', 'Security Audit', 'security'],
      ['dsh', 'DeepSeek Harness', 'dsh'],
      ['how', 'How it works', 'home#how'],
      ['start', 'Get Started', 'home#start'],
    ],
    copy: 'Copy setup prompt',
    theme: 'Theme',
    menu: 'Menu',
    lang: '语言',
    themes: { light: 'Light', dark: 'Dark', system: 'System' },
    palette: {
      open: 'Command palette', trigger: 'Search', placeholder: 'Search pages, commands, settings…', empty: 'No results',
      groups: { nav: 'Go to', actions: 'Actions', prefs: 'Preferences' },
      top: 'Back to top', copyCmd: 'Copy install command', github: 'View on GitHub', langTo: '切换到中文',
      hint: { move: 'Select', run: 'Run', close: 'Close' },
    },
  },
  hero: {
    eyebrow: "v0.2.0 · Security audit mode and multi-host setup",
    eyebrowHref: `${REPO}#release`,
    lead: [
      <>An <b>external memory</b> and visual workspace for AI agents. </>,
      "Keep judgments, evidence, and open questions in your project. After compaction or a new session, ",
      <em key="u">continue with the work already recorded.</em>,
    ],
    meta: ['Zero runtime dependencies', 'Node.js ≥ 18', "Local project storage", 'Dual workspace modes', 'MIT licensed'],
    cta: 'Copy setup prompt',
    gh: 'View on GitHub',
  },
  spotlights: {
    security: {
      kicker: 'Dedicated Workspace',
      title: 'Built for Security Research & Code Audit',
      desc: "Review candidate findings alongside their supporting evidence, counterevidence, and necessary conditions. Keep ruled-out explanations available for the next audit session.",
      cta: 'Explore Security Audit Mode',
      features: ['Issue & candidate trees', 'Explicit condition isolation', 'Code rebuttal tracking', 'SARIF 2.1.0 & Markdown export'],
    },
    dsh: {
      kicker: 'Native Integration',
      title: 'DeepSeek Harness Native Plugin',
      desc: "Read and write project memory through native tools in DeepSeek Harness. Use the embedded canvas to review judgments, evidence, and the current focus.",
      cta: 'Discover DSH Integration',
      features: ['Embedded Web canvas in DSH', '11 typed native tools', 'Session isolation & sandbox policy', 'Ephemeral service lifecycle'],
    },
  },
  stage: {
    aria: 'Workspace demo',
    badge: 'Synthetic demo data',
    open: "Try the workspace demo",
    loading: 'Loading the workspace…',
    shield: 'Click to pan, zoom and select nodes',
    hint: 'Hover a chip to light up its evidence',
    frameTitle: 'Pinwhy workspace demo (synthetic data)',
    tabs: {
      context: ['Context', "See the current focus, related records, goals, and open questions to understand where the work stands."],
      logic: ['Logic', "Follow recorded support, counterevidence, and derivations to review the basis for a judgment."],
      all: ['Overview', "Browse the full project record, including other directions and discoveries not yet connected."],
      board: ['2.5D board', "Browse records and relations as a circuit board. Chip height reflects recorded severity; traces show explicitly authored relations."],
    },
    ws: { context: 'Context view', logic: 'Logic view', all: 'Overview', fit: 'Fit to screen', toDark: 'Switch to dark theme', toLight: 'Switch to light theme', locale: 'en' },
  },
  how: {
    kicker: 'How it works',
    title: [<>Sessions change.</>, <>The record <i>can stay.</i></>],
    steps: [
      ["Record as the work unfolds", 'Goals, observations, hypotheses and findings become nodes. The agent declares what supports or contradicts what, and a cursor marks where it is looking.'],
      ["The conversation changes", "Long tasks may outlast a context window or a session. Details in the conversation may no longer be available; saved project records remain readable."],
      ["Read back and continue", "Read goals, related records, open questions, and checkpoints within an estimated token budget. Omitted items are counted, with details available to read separately."],
    ],
    ctx: 'Context',
    lost: "The conversation is compacted; project records remain",
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
    kicker: 'Features',
    title: "Keep the path behind a judgment",
    lead: "Keep the evidence and changes behind a conclusion. The next session can read them back, and the next person can review how the work arrived there.",
    real: 'Real interface · synthetic data',
    rows: [
      {
        shot: 'digest',
        k: 'Checkpoints and recovery',
        t: "A new session with a record to build on",
        li: [
          <>Save the scene with <C>checkpoint</C>, then read back only what was added, changed or removed with <C>context --since</C>.</>,
          "Context reads use an estimated token budget, keep selected records whole, and count omitted items for follow-up reading.",
          "The context describes saved work; the agent decides how to continue the task.",
        ],
      },
      {
        shot: 'agents',
        k: 'Many agents',
        t: "Shared records, individual perspectives",
        li: [
          <>Each agent has its own identity, cursor and write signature; pick a perspective explicitly with <C>--agent</C>.</>,
          'Switching perspective in the workspace changes the view only — no one’s cursor moves.',
          <>Includes atomic batch writes <C>pinwhy batch</C>: a set of nodes, relations and edits lands all together or not at all.</>,
        ],
      },
      {
        shot: 'inspector',
        k: 'Every record',
        t: "Keep claims distinct from evidence",
        li: [
          "Record impact, progress, and confidence separately, so a suspected issue is distinct from a verified result.",
          'Every relation is declared by whoever recorded it, and the details list each one with its source.',
          'The local service shows the edit history of fields and relations: when a verdict changes, the old value stays.',
        ],
      },
      {
        shot: 'stage-all',
        k: 'Export',
        t: 'Take records and relations beyond the workspace',
        li: [
          'Export a read-only offline HTML workspace with the recorded text and explicit relations.',
          'Export Markdown, Mermaid or SARIF 2.1.0 for documentation, diagrams and security analysis workflows.',
          'Exports keep the recorded text and relations as written — no generated summaries, no filled-in conclusions.',
        ],
      },
    ],
    local: {
      k: 'Local first',
      t: 'Your data stays in your project',
      li: [
        <><C>.pinwhy/events.jsonl</C> is the single source of truth; a damaged cache can be rebuilt from events.</>,
        <>The service listens on localhost only, and <C>serve --read-only</C> turns off page writes.</>,
        'New boards ship with ignore rules and stay out of version control by default; still review before you share.',
      ],
      tree: 'Single source of truth',
      loopback: '127.0.0.1 · Localhost only',
    },
    stats: [
      [0, 'Runtime dependencies'],
      [2, 'Workspace view modes'],
      [4, 'Export formats (HTML/MD/Mermaid/SARIF)'],
      [7, "Skill-based agent hosts"],
    ],
  },
  securityPage: {
    kicker: 'Security Research & Code Audit',
    title: "Audit judgments, ready for review.",
    subtitle: "Record questions, candidate findings, supporting evidence, and necessary conditions. Review the argument, keep counterevidence, and carry verified progress into the next session.",
    badges: ['SARIF 2.1.0 Export', "Explicit evidence relations", "Separate claims and evidence", "Local project storage"],
    painPoints: {
      kicker: "Recording long-running audits",
      title: "Keep the evidence for the next review",
      items: [
        {
          title: "Keep ruled-out explanations available",
          problem: "Checks and exclusion conditions can become hard to find in a long conversation, especially when another session takes over.",
          solution: "Record counterevidence and refuted hypotheses separately, so the next session can inspect what was tested and under which conditions.",
        },
        {
          title: "Distinguish a candidate from a conclusion",
          problem: "A suspicious parameter or sensitive operation does not establish an exploit path. Validation, permissions, and business constraints still need checking.",
          solution: "State which claim each piece of evidence supports or contradicts. Keep hypotheses, static checks, and reproduced results distinct.",
        },
        {
          title: "Keep necessary conditions explicit",
          problem: "Findings that depend on particular permissions, configurations, or versions need those conditions carried into review and delivery.",
          solution: "Use depends-on to record necessary conditions separately from supporting evidence and ordinary associations.",
        },
      ],
    },
    workspaceSection: {
      kicker: 'Audit Workspace',
      title: "Review evidence around a question",
      lead: 'A dedicated reading mode built around issues and candidate findings, structuring premises, rebuttals, and conditions.',
      cards: [
        {
          type: 'Question / Goal',
          tag: 'Entry Point',
          title: 'Boundary & Asset Scope',
          desc: 'Anchors the investigation around an asset or mechanism (e.g., "Admin API upload execution rights").',
        },
        {
          type: 'Candidate / Finding',
          tag: 'Finding Candidate',
          title: "Separate impact, progress, and confidence",
          desc: 'Severity, workflow status, and confidence are decoupled. Never automatically marks a suspected finding as confirmed.',
        },
        {
          type: 'Evidence & Rebuttal',
          tag: 'Evidence & Rebuttals',
          title: 'Explicit Supports and Contradicts',
          desc: 'Targeted code references. Related checks do not automatically become counterevidence.',
        },
        {
          type: 'Conditions',
          tag: 'Preconditions',
          title: 'Depends-on Isolates Requirements',
          desc: 'Separates required admin permissions or custom configs to prevent overstating localized bugs.',
        },
      ],
    },
    complianceSection: {
      kicker: "Export & handoff",
      title: "Take recorded work into review and delivery",
      items: [
        {
          title: 'Standard SARIF 2.1.0 Export',
          desc: "Export finding or vuln records with usable code locations as SARIF 2.1.0 for tools that accept the format.",
        },
        {
          title: "Markdown record export",
          desc: "Export authored nodes, details, and relations for review and archiving. The contents reflect what has been recorded.",
        },
        {
          title: "Local storage and read-only viewing",
          desc: "Records live in the project directory. The viewer uses loopback and supports read-only mode. Manage model calls and exported files through your own environment.",
        },
      ],
    },
    cta: 'Start Auditing with Pinwhy',
  },
  dshPage: {
    kicker: 'DeepSeek Harness Native Plugin',
    title: "Project memory, inside DeepSeek Harness.",
    subtitle: "Read and write project memory through native tools, and review judgments, evidence, and the current focus in an embedded canvas. The plugin connects DSH to an installed Pinwhy CLI.",
    badges: ["Built for DSH 0.2.2-rc.2", '11 Typed Native Tools', 'Ephemeral Viewer Lifecycle', 'DSH Sandbox Path Validation'],
    architecture: {
      kicker: 'Plugin Architecture',
      title: "Your host, connected to project memory",
      desc: 'Located at plugins/dsh-pinwhy, providing a clean pipeline: DSH Host → Plugin Adapter → Installed Pinwhy CLI → Local Event Log.',
    },
    highlights: [
      {
        k: 'Canvas',
        t: 'Embedded Web Canvas',
        desc: "Open the canvas from the global panel or the current session. Review records, relations, and history with the host’s theme and typography.",
        detail: "The host manages an ephemeral viewer with a dynamically assigned port and reclaims it when the corresponding view or host is disposed.",
      },
      {
        k: 'Tools',
        t: '11 Typed Native Tools',
        desc: "Native tool calls return structured JSON. The adapter validates arguments and invokes the installed CLI.",
        detail: 'Includes pinwhy_diagnose (read-only inspection), pinwhy_context (budgeted restore), pinwhy_batch, and pinwhy_search.',
      },
      {
        k: 'Sandbox',
        t: 'Session Isolation & Sandbox Enforcement',
        desc: 'Author identity bound to dsh:<session.id>. Integrates with DSH sandboxPolicy to verify physical file paths and prevent directory traversal.',
        detail: 'Subprocess boundary prevents synchronous file locks from blocking the DSH event loop.',
      },
      {
        k: 'Realtime',
        t: 'SSE Realtime Sync & Card Focus',
        desc: "Open the corresponding node from a tool card. The canvas receives changes over SSE, including records written by another CLI or host.",
        detail: "Insert recorded node content into the active draft, then review it before sending.",
      },
    ],
    installSection: {
      kicker: 'Setup & Installation',
      title: 'Get Started in Three Steps',
      steps: [
        {
          n: '01',
          t: 'Install Pinwhy CLI',
          d: 'Install the stable package globally via npm:',
          cmd: 'npm install --global pinwhy@0.2.0',
        },
        {
          n: '02',
          t: 'Add Plugin to DSH',
          d: "Obtain the plugin bundle as described in its docs, then add its local subpackage to DSH:",
          cmd: 'dsh plugin --profile web add /path/to/pinwhy/plugins/dsh-pinwhy',
        },
        {
          n: '03',
          t: 'Configure Project Workspace',
          d: "Initialize the target project first, then select the workspace in DSH Settings or cordis.patch.yml:",
          code: `- id: pinwhy\n  config:\n    projects:\n      - workspace: /path/to/your-project\n        boardRoot: /path/to/your-project`,
        },
      ],
    },
    cta: "Copy setup prompt",
  },
  start: {
    kicker: 'Get started',
    title: "Ask your agent, or install manually",
    lead: "Send the setup prompt to your agent, or select the installation scope and host in the terminal.",
    tabAuto: 'Let the agent install',
    copyPrompt: 'Copy prompt',
    copyCmds: 'Copy commands',
    copied: 'Copied',
    cwd: '~/your-project',
    env: 'Node.js ≥ 18 · macOS · Linux · Windows',
    hint: 'Click any line to copy it',
    reply: ['Example', 'Pinwhy connected, workspace ready', 'http://127.0.0.1:4333'],
    auto: {
      badge: 'Recommended',
      title: 'Let the agent install',
      you: 'You',
      to: 'Paste to your active Agent',
      will: 'The agent will follow the setup guide to:',
      steps: ['Detect the current host and install the full Skill package', 'Reuse existing project data without overwriting', 'Verify service status and provide the workspace URL'],
      copy: 'Copy prompt',
      note: 'Requires Node.js ≥ 18. Skill loading depends on the host — restart the session if needed.',
    },
    manual: {
      title: 'Manual setup',
      hostsAria: 'Agent hosts',
      copy: 'Copy',
      copied: 'Copied',
      guide: 'Full setup guide',
      step: 'Step {n}',
      install: {
        t: 'Install CLI',
        d: 'Install globally via npm with zero runtime dependencies.',
        cmds: ['npm install --global pinwhy@0.2.0', 'pinwhy --version'],
      },
      verify: {
        t: 'Verify installation',
        d: 'Workspace runs on 127.0.0.1:4333 by default. Verify in a new session.',
        cmds: ['pinwhy status', 'pinwhy doctor'],
      },
      hosts: [
        {
          id: 'claude',
          name: 'Claude Code',
          tag: 'Skill + Recovery Hook',
          t: 'One-click setup in project',
          d: 'Initializes .pinwhy/, installs Skill & session recovery hooks, and sets up a background viewer.',
          cmds: ['cd /path/to/your-project', 'pinwhy setup --title "My Project" --open'],
        },
        {
          id: 'skill',
          name: 'Cursor · Codex · OMP · Gemini',
          tag: 'Interactive Multi-Host',
          t: 'Run interactive installer',
          d: "Choose the scope and Skill directory. Initialize new projects first, then load the installed Skill using the host’s mechanism.",
          cmds: ['cd /path/to/your-project', 'pinwhy skill install', 'pinwhy serve --open'],
        },
        {
          id: 'dsh',
          name: 'DeepSeek Harness',
          tag: 'Native Plugin',
          t: 'Add plugin & connect workspace',
          d: "Install plugins/dsh-pinwhy separately for 11 native tools and an embedded read-only canvas. It connects to an independently installed CLI.",
          cmds: ['dsh plugin --profile web add /path/to/pinwhy/plugins/dsh-pinwhy', 'pinwhy init --cwd /path/to/your-project --json'],
        },
        {
          id: 'cli',
          name: 'CLI Only',
          tag: 'No Host Required',
          t: 'Initialize & serve',
          d: 'Foreground viewer (Ctrl+C to stop). Inspect records via status, search, and show in terminal.',
          cmds: ['cd /path/to/your-project', 'pinwhy init --title "My Project"', 'pinwhy serve --open'],
        },
      ],
    },
  },
  principles: {
    kicker: 'Principles',
    title: "A record to consult. Decisions to make.",
    lead: "Pinwhy keeps authored work readable and reviewable. The people and agents doing the task decide how to proceed.",
    items: [
      ['Edges are declared by writers', 'Creating nodes never auto-links edges or moves cursors. Every edge was written explicitly by an agent or human.', 'pinwhy link o1 hy1 --rel supports'],
      ["Context informs; agents decide", 'Recovery packs declare readOnly: true and prescriptive: false. Next actions are always chosen by the agent.', 'policy: { readOnly: true, prescriptive: false }'],
      ["Local storage, traceable changes", 'The project event log is the sole source of truth. Binds to localhost, supports read-only mode, and lint never blocks.', 'pinwhy serve --read-only'],
    ],
  },
  faq: {
    kicker: 'FAQ',
    title: 'Before you begin',
    more: ['See ', 'docs', ' for more details.'],
    qa: [
      [
        "How does it work alongside agent memory and compaction?",
        "Host memory and compaction vary by tool. Pinwhy adds explicit project records of judgments, evidence, relations, and the current focus for cross-session reading and review. It stores authored records, not an entire conversation or a model’s private reasoning. Context reads use an estimated budget and count omitted items.",
      ],
      [
        "Where are records stored, and what do I manage?",
        <>Project records are stored locally in <C>.pinwhy/events.jsonl</C>. The viewer listens on 127.0.0.1 and new boards include Git ignore rules. What an agent sends to model providers depends on its host configuration; you manage sharing, exports, and Git commits.</>,
      ],
      [
        "Does it infer conclusions or create relations?",
        <>People or agents explicitly author judgments and relations. Creating a node does not automatically connect it to others. Severity, status, and confidence are separate fields; participants still need to check the evidence.</>,
      ],
      [
        'What requirements are there, and which OS are supported?',
        "The CLI and workspace require Node.js ≥ 18 and support macOS, Windows, and Linux, with no runtime dependencies. Claude Code hooks on Windows need Git Bash; the DSH plugin follows its host’s runtime requirements.",
      ],
      [
        'Which agent hosts can I use it with?',
        <>Claude Code, Cursor, Codex, Gemini CLI, Copilot CLI, OMP, and OpenCode connect through a Skill; DeepSeek Harness uses a separate plugin. Select Skill directories and scope with <C>pinwhy skill install</C>.</>,
      ],
      [
        'How do I troubleshoot if something goes wrong?',
        <>Run <C>pinwhy doctor</C>. For community support, attach the path-redacted diagnostic report via <C>pinwhy doctor --share --json</C>.</>,
      ],
    ],
  },
  finale: {
    title: "Give the next session a place to start.",
    lead: "Leave a record of what matters. Continue the next investigation with evidence to build on.",
    cta: 'Copy setup prompt',
    docs: 'Read the docs',
  },
  footer: {
    tag: 'External memory and a visual workspace for AI agents',
    links: ['Usage', 'Docs', 'Principles', 'Contributing', 'GitHub'],
    license: 'MIT License',
    cols: ['Resources', 'Project'],
    play: ['Move across the grid, click to pin a clue', 'Pinned this visit', ''],
  },
};

export const DICTS = { zh, en };

const LangCtx = createContext({ lang: 'zh', t: zh, setLang: () => {} });

export function LangProvider({ children }) {
  const { lang, switchLang } = useRoute();
  const t = DICTS[lang] || DICTS.zh;

  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
    document.title = t.meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.desc);
  }, [t]);

  return <LangCtx.Provider value={{ lang, t, setLang: switchLang }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
export const useT = () => useContext(LangCtx).t;
