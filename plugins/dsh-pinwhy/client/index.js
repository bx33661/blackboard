/* Authored DSH lazy-CJS browser entry: no build, network requests or module-body side effects. */
window.__ModuleLoader__.load({ id: 'dsh-pinwhy', factory(require) {
  const React = require('react');
  const h = React.createElement;
  const NS = 'pinwhy';
  const actions = ['status', 'context', 'node_get', 'node_add', 'node_patch', 'link', 'cursor', 'checkpoint', 'diagnose', 'batch', 'search'];
  const dictionaries = {
    zh: {
      status: '黑板状态', context: '恢复研究现场', node_get: '查看节点', node_add: '记录判断', node_patch: '更新节点',
      link: '关联证据', cursor: '切换关注位置', checkpoint: '保存交接', diagnose: '接入诊断', batch: '批量记录', search: '搜索记忆',
      boardTitle: 'Pinwhy 画板',
      viewNode: '在画板中查看', openCommand: '打开 Pinwhy 画板',
      pin: '固定画板入口', unpin: '取消固定画板入口',
      autoDiscover: '自动发现已有黑板（可选）', workspacePick: '从 DSH 工作区添加',
      referenceAdded: '已插入所属会话草稿，尚未发送。', referenceFailed: '未能完成引用操作，请检查所属会话草稿。',
      viewerLoading: '正在连接 Pinwhy 画板…', viewerReload: '重新加载', viewerReconnect: '重新连接',
      readOnlyBadge: '只读', noSession: '选择一个项目会话，查看它留下的判断、证据与现场。',
      viewerFailed: '画板未能打开。', viewerInvalid: '画板返回的地址无法安全打开。',
      viewerErrorDetails: '错误详情', ungrouped: '未分组项目', blankSession: '新会话',
      boardSubtitle: '在项目中留下判断、证据与现场', chooseSession: '选择会话',
      viewerLoadingHint: '正在读取项目黑板，已有记录会在此恢复。',
      upgradeHint: '请升级独立 Pinwhy 运行时，以启用内置画板。',
      runtimeHint: '请在插件设置中选择已安装的 Pinwhy CLI。',
      setupHint: '请在插件设置中启用此项目，并显式初始化黑板。',
      retryHint: '请检查项目接入状态后重新连接。',
      settings: '项目与运行时配置', summary: '显式选择接入项目；保存不会初始化黑板。', project: '项目工作区', board: '黑板根目录（可选）',
      add: '添加项目', remove: '移除项目', runtime: 'pinwhy CLI（留空使用 current）', node: 'Node（留空使用宿主运行时）',
      timeout: '超时（毫秒）', output: '输出上限（字节）', save: '保存配置', reload: '重新读取配置',
      saved: '配置已保存，新调用即时生效。', conflict: '保存未被接受；草稿已保留，请重新读取配置后重试。',
      readonly: '当前配置不可编辑。', loading: '正在加载配置…',
      guide: '在项目会话中输入“检查 pinwhy 接入状态”可运行只读诊断；不会创建黑板或修改权限。',
      projectsSection: '项目与工作区', projectsSectionDesc: '配置接入 Pinwhy 的工作区；保存配置不会初始化新黑板。',
      autoDiscoverDesc: '在工作区父级目录中自动查找已存在的 .pinwhy 黑板。',
      emptyProjects: '尚未配置接入项目。可从下方工作区快速选择，或手动添加路径。',
      runtimeSection: '运行时与 CLI', runtimeSectionDesc: '指定独立安装的 Pinwhy CLI 与 Node.js 解释器路径。',
      runtimePlaceholder: '留空使用内置/全局 current', nodePlaceholder: '留空使用宿主运行时',
      limitsSection: '执行与限制', limitsSectionDesc: '限制工具调用的单次执行时长与输出字节大小，防止长时间阻塞。',
      timeoutHint: '范围 50 ~ 120,000 ms', outputHint: '范围 1,024 ~ 16,777,216 bytes',
      addManual: '手动添加路径', boardPlaceholder: '留空同工作区路径',
      rowHint: '点击下方组件的配置按钮，添加项目或调整 CLI。', running: '执行中', preparing: '准备中', done: '完成', failed: '执行失败',
      detail: '查看原始调用与结果', inspect: '查看轨迹', read: '可读取', write: '可写入', yes: '是', no: '否',
      failureDetail: '操作未成功，原始结果如下。', unknown: '缺少可识别的卡片信息，原始记录如下。'
    },
    en: {
      status: 'Board status', context: 'Restore context', node_get: 'Read node', node_add: 'Record judgment', node_patch: 'Update node',
      link: 'Link evidence', cursor: 'Change focus', checkpoint: 'Save handoff', diagnose: 'Setup diagnosis', batch: 'Batch record', search: 'Search memory',
      boardTitle: 'Pinwhy Board',
      viewNode: 'View in board', openCommand: 'Open Pinwhy board',
      pin: 'Pin board entry', unpin: 'Unpin board entry',
      autoDiscover: 'Discover existing boards automatically (optional)', workspacePick: 'Add from DSH workspaces',
      referenceAdded: 'Inserted into the owning conversation draft; not sent.', referenceFailed: 'The reference could not be completed. Check the owning conversation draft.',
      viewerLoading: 'Connecting to the Pinwhy board…', viewerReload: 'Reload', viewerReconnect: 'Reconnect',
      readOnlyBadge: 'Read-only', noSession: 'Choose a project session to read its judgments, evidence and context.',
      viewerFailed: 'The board could not open.', viewerInvalid: 'The board returned an address that cannot be embedded.',
      viewerErrorDetails: 'Error details', ungrouped: 'Ungrouped projects', blankSession: 'New session',
      boardSubtitle: 'Judgments, evidence and context for your project', chooseSession: 'Choose a session',
      viewerLoadingHint: 'Reading the project board and restoring its recorded memory.',
      upgradeHint: 'Update the independent Pinwhy runtime to enable the embedded board.',
      runtimeHint: 'Select the installed Pinwhy CLI in plugin settings.',
      setupHint: 'Enable this project in plugin settings and initialize its board explicitly.',
      retryHint: 'Check the project connection, then reconnect.',
      settings: 'Projects and runtime', summary: 'Enable projects explicitly; saving never initializes a board.', project: 'Workspace', board: 'Board root (optional)',
      add: 'Add project', remove: 'Remove project', runtime: 'pinwhy CLI (blank uses current)', node: 'Node (blank uses host runtime)',
      timeout: 'Timeout (ms)', output: 'Output limit (bytes)', save: 'Save configuration', reload: 'Reload configuration',
      saved: 'Saved. New calls use this configuration immediately.', conflict: 'Save was not accepted. Draft retained; reload before retrying.',
      readonly: 'Configuration is not editable.', loading: 'Loading configuration…',
      guide: 'Ask “check pinwhy setup” in a project session for a read-only diagnosis. It never initializes a board or changes permissions.',
      projectsSection: 'Projects & Workspaces', projectsSectionDesc: 'Configure workspaces connected to Pinwhy; saving never initializes a board.',
      autoDiscoverDesc: 'Automatically search parent directories for existing .pinwhy boards.',
      emptyProjects: 'No projects configured yet. Pick an open workspace below or add a path manually.',
      runtimeSection: 'Runtime & CLI', runtimeSectionDesc: 'Specify paths to an independently installed Pinwhy CLI and Node executable.',
      runtimePlaceholder: 'Blank uses current', nodePlaceholder: 'Blank uses host runtime',
      limitsSection: 'Execution Limits', limitsSectionDesc: 'Bound tool call execution duration and output buffer size.',
      timeoutHint: 'Range: 50 ~ 120,000 ms', outputHint: 'Range: 1,024 ~ 16,777,216 bytes',
      addManual: 'Add path manually', boardPlaceholder: 'Blank defaults to workspace path',
      rowHint: 'Use the component configuration button below to add projects or change the CLI.', running: 'Running', preparing: 'Preparing', done: 'Completed', failed: 'Failed',
      detail: 'Raw call and result', inspect: 'Inspect trace', read: 'Readable', write: 'Writable', yes: 'Yes', no: 'No',
      failureDetail: 'Operation failed; original result follows.', unknown: 'No recognized card metadata; original record follows.'
    },
  };

  const box = { border: '1px solid var(--dsw-alias-border-l1, #e5e7eb)', borderRadius: 8, padding: 16, margin: '12px 0' };

  const initial = value => ({
    autoDiscover: value?.autoDiscover ?? false,
    projects: (value?.projects ?? []).map(row => ({ workspace: row.workspace, boardRoot: row.boardRoot ?? '' })),
    runtimeCli: value?.runtimeCli ?? '',
    nodeExecutable: value?.nodeExecutable ?? '',
    timeoutMs: value?.timeoutMs ?? 10000,
    maxOutputBytes: value?.maxOutputBytes ?? 1048576,
  });

  const wire = draft => ({
    ...draft,
    projects: draft.projects.map(row => ({ workspace: row.workspace, ...(row.boardRoot ? { boardRoot: row.boardRoot } : {}) })),
  });

  function edits(draft, base) {
    const next = wire(draft), previous = wire(base);
    return Object.keys(next).filter(key => JSON.stringify(next[key]) !== JSON.stringify(previous[key])).map(key =>
      ['runtimeCli', 'nodeExecutable'].includes(key) && next[key] === '' ? { op: 'unset', path: [key] } : { op: 'set', path: [key], value: next[key] });
  }

  function Editor({ form, t, useWorkspaces }) {
    const workspaces = (typeof useWorkspaces === 'function' ? useWorkspaces(state => state.items) : null) || [];
    const state = form?.state;
    const [draft, setDraft] = React.useState(() => initial(state?.value));
    const [base, setBase] = React.useState(() => initial(state?.value));
    const [revision, setRevision] = React.useState(state?.revision);
    const [dirty, setDirty] = React.useState(false), [busy, setBusy] = React.useState(false), [notice, setNotice] = React.useState('');
    const reset = () => { const next = initial(state?.value); setDraft(next); setBase(next); setRevision(state?.revision); setDirty(false); setNotice(''); };
    React.useEffect(() => {
      if (!dirty && state?.revision !== revision) {
        const next = initial(state?.value); setDraft(next); setBase(next); setRevision(state?.revision);
      }
    }, [state?.revision, state?.status, dirty, revision]);
    const change = (key, value) => { setDraft(old => ({ ...old, [key]: value })); setDirty(true); setNotice(''); };
    const ready = state?.status === 'ready' && state.writable && typeof revision === 'number';
    async function save(event) {
      event.preventDefault(); if (!ready || busy) return;
      setBusy(true); setNotice('');
      try {
        const accepted = await form.mutate(edits(draft, base), revision);
        if (accepted) { setDirty(false); setBase(draft); setNotice(t('saved')); }
        else setNotice(t('conflict'));
      } catch (error) { setNotice(`${t('conflict')} ${String(error.message ?? error)}`); }
      finally { setBusy(false); }
    }
    return h('form', { onSubmit: save, 'data-pinwhy-settings': true, className: 'pinwhy-settings-wrap' },
      h('fieldset', { disabled: !ready || busy, style: { border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 } },
        h('header', { className: 'pinwhy-settings-header' },
          h('div', { className: 'pinwhy-settings-title' },
            h(PinwhyIcon, { size: 18 }),
            h('h3', null, t('settings'))),
          h('p', { className: 'pinwhy-settings-desc' }, t('summary'))),
        h('section', { className: 'pinwhy-settings-card' },
          h('div', { className: 'pinwhy-settings-header' },
            h('h4', { className: 'pinwhy-settings-title' }, t('projectsSection')),
            h('p', { className: 'pinwhy-settings-desc' }, t('projectsSectionDesc'))),
          h('label', { className: 'pinwhy-toggle-row' },
            h('div', { className: 'pinwhy-toggle-info' },
              h('span', { className: 'pinwhy-toggle-title' }, t('autoDiscover')),
              h('span', { className: 'pinwhy-toggle-desc' }, t('autoDiscoverDesc'))),
            h('input', { type: 'checkbox', className: 'pinwhy-toggle-checkbox', checked: draft.autoDiscover,
              onChange: event => change('autoDiscover', event.target.checked) })),
          draft.projects.length === 0
            ? h('div', { className: 'pinwhy-projects-empty' }, t('emptyProjects'))
            : h('div', { className: 'pinwhy-projects-list' },
              ...draft.projects.map((row, index) => h('div', { key: index, className: 'pinwhy-project-card' },
                h('div', { className: 'pinwhy-project-card-header' },
                  h('div', { className: 'pinwhy-project-badge' },
                    h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' })),
                    h('span', null, `${t('project')} #${index + 1}`)),
                  h('button', { type: 'button', className: 'pinwhy-btn pinwhy-btn-danger',
                    onClick: () => change('projects', draft.projects.filter((_, i) => i !== index)) },
                    h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('polyline', { points: '3 6 5 6 21 6' }), h('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' })),
                    h('span', null, t('remove')))),
                h('div', { className: 'pinwhy-project-fields' },
                  h('div', { className: 'pinwhy-field' },
                    h('label', { className: 'pinwhy-field-label' }, t('project')),
                    h('input', { required: true, className: 'pinwhy-input', value: row.workspace, placeholder: '/absolute/path/to/project',
                      onChange: event => change('projects', draft.projects.map((item, i) => i === index ? { ...item, workspace: event.target.value } : item)) })),
                  h('div', { className: 'pinwhy-field' },
                    h('label', { className: 'pinwhy-field-label' }, t('board')),
                    h('input', { className: 'pinwhy-input', value: row.boardRoot, placeholder: t('boardPlaceholder'),
                      onChange: event => change('projects', draft.projects.map((item, i) => i === index ? { ...item, boardRoot: event.target.value } : item)) })))))),
          h('div', { className: 'pinwhy-project-add-bar' },
            h('select', { className: 'pinwhy-input', style: { flex: 1 }, value: '', 'aria-label': t('workspacePick'),
              onChange: event => {
                const workspace = workspaces.find(w => w.path === event.target.value);
                if (workspace && !draft.projects.some(p => p.workspace === workspace.path)) {
                  change('projects', [...draft.projects, { workspace: workspace.path, boardRoot: '' }]);
                }
              } },
              h('option', { value: '' }, t('workspacePick')),
              ...workspaces.map(w => h('option', { key: w.id, value: w.path, disabled: draft.projects.some(p => p.workspace === w.path) }, w.path))),
            h('button', { type: 'button', className: 'pinwhy-btn pinwhy-btn-outline',
              onClick: () => change('projects', [...draft.projects, { workspace: '', boardRoot: '' }]) }, `+ ${t('addManual')}`))),
        h('section', { className: 'pinwhy-settings-card' },
          h('div', { className: 'pinwhy-settings-header' },
            h('h4', { className: 'pinwhy-settings-title' }, t('runtimeSection')),
            h('p', { className: 'pinwhy-settings-desc' }, t('runtimeSectionDesc'))),
          h('div', { className: 'pinwhy-grid-2' },
            h('div', { className: 'pinwhy-field' },
              h('label', { className: 'pinwhy-field-label' },
                h('span', null, t('runtime'))),
              h('input', { className: 'pinwhy-input', value: draft.runtimeCli, placeholder: t('runtimePlaceholder'),
                onChange: event => change('runtimeCli', event.target.value) })),
            h('div', { className: 'pinwhy-field' },
              h('label', { className: 'pinwhy-field-label' },
                h('span', null, t('node'))),
              h('input', { className: 'pinwhy-input', value: draft.nodeExecutable, placeholder: t('nodePlaceholder'),
                onChange: event => change('nodeExecutable', event.target.value) })))),
        h('section', { className: 'pinwhy-settings-card' },
          h('div', { className: 'pinwhy-settings-header' },
            h('h4', { className: 'pinwhy-settings-title' }, t('limitsSection')),
            h('p', { className: 'pinwhy-settings-desc' }, t('limitsSectionDesc'))),
          h('div', { className: 'pinwhy-grid-2' },
            h('div', { className: 'pinwhy-field' },
              h('label', { className: 'pinwhy-field-label' },
                h('span', null, t('timeout')),
                h('span', { className: 'pinwhy-field-hint' }, t('timeoutHint'))),
              h('input', { type: 'number', required: true, min: 50, max: 120000, step: 1, className: 'pinwhy-input', value: draft.timeoutMs,
                onChange: event => change('timeoutMs', Number(event.target.value)) })),
            h('div', { className: 'pinwhy-field' },
              h('label', { className: 'pinwhy-field-label' },
                h('span', null, t('output')),
                h('span', { className: 'pinwhy-field-hint' }, t('outputHint'))),
              h('input', { type: 'number', required: true, min: 1024, max: 16777216, step: 1, className: 'pinwhy-input', value: draft.maxOutputBytes,
                onChange: event => change('maxOutputBytes', Number(event.target.value)) })))),
        h('div', { className: 'pinwhy-guide-callout' },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            h('circle', { cx: 12, cy: 12, r: 10 }),
            h('line', { x1: 12, y1: 16, x2: 12, y2: 12 }),
            h('line', { x1: 12, y1: 8, x2: 12.01, y2: 8 })),
          h('span', null, t('guide'))),
        h('footer', { className: 'pinwhy-settings-footer' },
          h('div', { role: 'status', className: 'pinwhy-notice' },
            notice ? (notice.includes(t('saved'))
              ? h('span', { className: 'pinwhy-notice-success' }, `✓ ${notice}`)
              : h('span', { className: 'pinwhy-notice-error' }, `⚠ ${notice}`))
              : (!state || state.status === 'loading'
                ? h('span', null, t('loading'))
                : !ready
                  ? h('span', null, t('readonly'))
                  : null)),
          h('div', { className: 'pinwhy-actions-group' },
            h('button', { type: 'button', className: 'pinwhy-btn pinwhy-btn-outline', disabled: busy || state?.status !== 'ready', onClick: reset }, t('reload')),
            h('button', { type: 'submit', className: 'pinwhy-btn pinwhy-btn-primary', disabled: !dirty }, t('save'))))));
  }

  const bounded = value => typeof value === 'string' ? value.slice(0, 1000) : '';

  function cardMeta(block, name) {
    const value = block?.meta?.pinwhy;
    if (!value || value.schema !== 'pinwhy.card.v1' || value.action !== name) return null;
    if (!['summary', 'boardRoot', 'agentId', 'nodeId', 'diagnostics'].every(key => typeof value[key] === 'string')) return null;
    if (name === 'pinwhy_diagnose' && (typeof value.readyToRead !== 'boolean' || typeof value.readyToWrite !== 'boolean' || !Array.isArray(value.checks) || value.checks.length > 8 || value.checks.some(check => !check || !['id', 'status', 'code', 'message', 'remedy'].every(key => typeof check[key] === 'string')))) return null;
    return value;
  }

  function ToolCard({ toolName, phase, block, t, inspect, sessionId, onOpenNode }) {
    const action = toolName.replace(/^pinwhy_/, '');
    const meta = phase === 'result' && block?.isError === false ? cardMeta(block, toolName) : null;
    const failed = phase === 'result' && block?.isError === true;
    const state = phase === 'preparing' ? 'preparing' : phase === 'result' ? (failed ? 'failed' : 'done') : 'running';
    const raw = (() => { try { return JSON.stringify({ call: block?.call, args: block?.argsRaw, content: block?.content, error: block?.error, meta: block?.meta }, null, 2); } catch { return 'Invalid recorded result'; } })();

    return h('article', { 'data-pinwhy-tool': toolName, style: { ...box, borderRadius: 12, background: 'var(--dsw-alias-card-fill, transparent)', borderLeft: `3px solid ${failed ? 'var(--dsw-alias-state-error-primary, #db5050)' : phase === 'result' ? '#10b981' : 'var(--dsw-alias-border-l2, #d4d4d8)'}` } },
      h('header', { style: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 } },
        h('span', null, t(action)),
        h('span', { style: { opacity: .4 } }, '·'),
        h('span', { style: { fontSize: 12, fontWeight: 500, color: failed ? 'var(--dsw-alias-state-error-primary, #db5050)' : phase === 'result' ? '#10b981' : 'var(--dsw-alias-label-tertiary, #71717a)' } }, t(state))),
      meta ? h(React.Fragment, null,
        meta.summary ? h('p', null, bounded(meta.summary)) : null,
        h('small', { style: { display: 'block', opacity: .7 } }, [meta.nodeId, meta.agentId, meta.boardRoot].filter(Boolean).map(bounded).join(' · ')),
        action === 'diagnose' ? h(React.Fragment, null,
          h('p', null, `${t('read')}: ${t(meta.readyToRead ? 'yes' : 'no')} · ${t('write')}: ${t(meta.readyToWrite ? 'yes' : 'no')}`),
          h('ul', null, ...meta.checks.map((check, i) => h('li', { key: i }, `${check.status === 'ok' ? '✓' : '•'} ${bounded(check.code)} — ${bounded(check.message)}`, check.remedy ? h('p', null, bounded(check.remedy)) : null)))) : null,
        meta.diagnostics ? h('p', null, bounded(meta.diagnostics)) : null) : phase === 'result' ? h('p', null, t(failed ? 'failureDetail' : 'unknown')) : null,
      h('details', { open: failed || (phase === 'result' && !meta) }, h('summary', null, t('detail')), h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto', fontSize: 12 } }, raw)),
      meta?.nodeId && sessionId && typeof onOpenNode === 'function' ? h('button', { type: 'button', className: 'pinwhy-btn pinwhy-btn-outline', style: { height: 28, fontSize: 12, marginRight: 8, marginTop: 8 }, 'data-pinwhy-node-link': meta.nodeId,
        onClick: () => onOpenNode(sessionId, meta.nodeId, meta.boardRoot) }, t('viewNode')) : null,
      typeof inspect === 'function' ? h('button', { type: 'button', className: 'pinwhy-btn pinwhy-btn-outline', style: { height: 28, fontSize: 12, marginTop: 8 }, onClick: inspect }, t('inspect')) : null);
  }

  function PinwhyIcon({ size = 16, ...props }) {
    return h('svg', { width: size, height: size, viewBox: '0 0 128 128', fill: 'none', 'aria-hidden': true, ...props },
      h('path', { d: 'M73 20H38C28.059 20 20 28.059 20 38V90C20 99.941 28.059 108 38 108H90C99.941 108 108 99.941 108 90V65', stroke: 'currentColor', strokeWidth: 12, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('path', { d: 'M46 80L76 50', stroke: 'currentColor', strokeWidth: 12, strokeLinecap: 'round' }),
      h('circle', { cx: 98, cy: 28, r: 10, fill: 'currentColor' }));
  }

  function MenuEntry({ t, onDismiss, open, kind, entries = [], onPinnedChange }) {
    const entry = entries.find(row => row.id === 'pinwhy');
    // The shipped global More menu owns unpinned entries, including their pin action.
    if (kind === 'global' && entry?.pinned === false) return null;
    const pinned = entry?.pinned !== false;
    return h('div', { className: 'pinwhy-menu-row' },
      !entry || kind === 'global' ? h('button', { type: 'button', role: 'menuitem', className: 'pinwhy-menu-entry',
        [`data-pinwhy-${kind}-entry`]: true,
        onClick: () => { open(); onDismiss(); } }, h(PinwhyIcon, {}), h('span', null, t('boardTitle'))) : null,
      typeof onPinnedChange === 'function' ? h('button', { type: 'button', role: 'menuitem', className: 'pinwhy-menu-entry',
        'data-pinwhy-pin': kind, 'aria-label': t(pinned ? 'unpin' : 'pin'),
        onClick: () => { onPinnedChange('pinwhy', !pinned); onDismiss(); } },
        h('span', { 'aria-hidden': true }, pinned ? '−' : '+'), h('span', null, t(pinned ? 'unpin' : 'pin'))) : null);
  }

  // Reader selection only. Board data stays in the CLI snapshot and event stream.
  function createPanelSelection() {
    let value, focus = { nodeId: null, boardRoot: null, revision: 0 };
    const listeners = new Set();
    return {
      getSnapshot: () => value,
      getFocusSnapshot: () => focus,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      select: (id, nodeId = null, boardRoot = null) => {
        if (value === id && !nodeId && !focus.nodeId) return;
        value = id; focus = { nodeId, boardRoot, revision: focus.revision + 1 };
        for (const notify of listeners) notify();
      },
    };
  }

  function GlobalPanel({ useSessions, t, selection, openViewer, retainSession, hostPresentation, referenceNode }) {
    const catalog = useSessions(value => value);
    const selected = React.useSyncExternalStore(selection.subscribe, selection.getSnapshot);
    const focus = React.useSyncExternalStore(selection.subscribe, selection.getFocusSnapshot);
    const rows = catalog.ids.map(id => catalog.byId[id]).filter(Boolean);
    if (selected && !catalog.ids.includes(selected) && catalog.byId[selected]) rows.push(catalog.byId[selected]);
    const groups = new Map();
    for (const row of rows) {
      const project = row.cwd || '';
      if (!groups.has(project)) groups.set(project, []);
      groups.get(project).push(row);
    }
    const selectedRow = catalog.byId[selected];
    return h('section', { className: 'pinwhy-global', 'data-pinwhy-global-panel': true },
      h('header', { className: 'pinwhy-global-header' },
        h('div', { className: 'pinwhy-global-heading' }, h(PinwhyIcon, { size: 20 }),
          h('div', null, h('h1', null, t('boardTitle')), h('p', null, t('boardSubtitle')))),
        h('label', { className: 'pinwhy-session-picker' }, h('span', null, t('chooseSession')),
          h('select', { value: selected ?? '', title: selectedRow?.cwd, 'aria-label': t('chooseSession'), 'data-pinwhy-session-picker': true,
            onChange: event => selection.select(event.target.value || undefined) },
          h('option', { value: '' }, t('chooseSession')),
          ...Array.from(groups, ([project, sessions]) => h('optgroup', { key: project, label: project ? boardName(project) : t('ungrouped') },
            ...sessions.map(row => h('option', { key: row.id, value: row.id, title: [row.cwd, row.id].filter(Boolean).join('\n') },
              `${row.displayTitle || row.id}${row.blank ? ` · ${t('blankSession')}` : ''}`))))))),
      h(ViewerPanel, { sessionId: selected, t, openViewer, retainSession, hostPresentation, referenceNode, focus }));
  }

  function embeddedUrl(url, presentation, canReference = false) {
    const parsed = new URL(url, 'http://host.invalid');
    parsed.searchParams.set('embed', '1');
    for (const key of ['theme', 'fontFamily', 'codeFontFamily', 'fontSize', 'codeFontSize']) {
      if (presentation[key] !== undefined) parsed.searchParams.set(key, String(presentation[key]));
    }
    if (presentation.locale) parsed.searchParams.set('lang', presentation.locale);
    if (canReference) parsed.searchParams.set('reference', '1');
    return url.startsWith('/') ? parsed.pathname + parsed.search + parsed.hash : parsed.href;
  }
  const boardName = root => root.replace(/\\/g, '/').split('/').filter(Boolean).pop() || root;

  const clientCss = `
    .pinwhy-menu-entry{display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,inherit);font:var(--dsw-font-sm-14,inherit);font-size:14px;text-align:left;cursor:pointer}
    .pinwhy-menu-entry:hover,.pinwhy-menu-entry:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#f4f4f5);outline:none}
    .pinwhy-menu-entry svg{flex:none}
    .pinwhy-global,.pinwhy-viewer{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;overflow:hidden;background:var(--dsw-alias-bg-base,transparent);color:var(--dsw-alias-label-primary,inherit)}
    .pinwhy-global{padding-top:var(--dsh-frame-top-clearance,0px);container:pinwhy-panel / inline-size}
    .pinwhy-global-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 28px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb)}
    .pinwhy-global-heading{display:flex;align-items:center;gap:12px;min-width:0}
    .pinwhy-global-heading h1{margin:0;font-size:18px;font-weight:600;letter-spacing:-.02em}
    .pinwhy-global-heading p{margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary,#71717a)}
    .pinwhy-session-picker{display:flex;align-items:center;gap:10px;min-width:0;font-size:12px;color:var(--dsw-alias-label-tertiary,#71717a)}
    .pinwhy-session-picker select{box-sizing:border-box;max-width:280px;min-width:0;padding:7px 10px;border:1px solid var(--dsw-alias-border-l2,#d4d4d8);border-radius:7px;background:var(--dsw-alias-bg-base,transparent);color:var(--dsw-alias-label-primary,inherit);font:inherit;text-overflow:ellipsis}
    .pinwhy-session-picker select:focus-visible,.pinwhy-viewer-retry:focus-visible{outline:2px solid var(--dsw-alias-label-primary,currentColor);outline-offset:2px}
    .pinwhy-viewer{flex:1}
    .pinwhy-viewer-bar{display:flex;align-items:center;gap:8px;flex:none;height:36px;padding:0 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);font-size:12px;color:var(--dsw-alias-label-tertiary,#71717a)}
    .pinwhy-board-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,inherit);font-weight:600}
    [data-pinwhy-read-only]{display:inline-flex;align-items:center;padding:1px 7px;border-radius:9999px;font-size:11px;font-weight:500;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-secondary,#52525b)}
    .pinwhy-viewer-refresh{display:grid;place-items:center;width:26px;height:26px;margin-left:auto;padding:0;border:0;border-radius:5px;background:transparent;color:inherit;cursor:pointer}
    .pinwhy-viewer-refresh svg{transition:transform .25s ease}
    .pinwhy-viewer-refresh:hover svg{transform:rotate(90deg)}
    .pinwhy-viewer-refresh:hover,.pinwhy-viewer-refresh:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#f4f4f5);outline:2px solid var(--dsw-alias-border-l2,#d4d4d8)}
    .pinwhy-viewer-state{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;text-align:center}
    .pinwhy-viewer-state svg{color:var(--dsw-alias-label-tertiary,#71717a)}
    .pinwhy-viewer-state h2{margin:0;font-size:16px;font-weight:500}
    .pinwhy-viewer-state p{max-width:440px;margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#71717a);overflow-wrap:anywhere}
    .pinwhy-viewer-state details{max-width:520px;font-size:12px;text-align:left;color:var(--dsw-alias-label-tertiary,#71717a)}
    .pinwhy-viewer-content{position:relative;display:flex;flex:1;min-height:0;min-width:0}
    .pinwhy-frame-loading{position:absolute;inset:0;z-index:1;background:var(--dsw-alias-bg-base,Canvas)}
    .pinwhy-spinner{box-sizing:border-box;width:24px;height:24px;border:2px solid var(--dsw-alias-border-l2,#d4d4d8);border-top-color:#10b981;border-radius:50%;animation:pinwhy-spin .8s linear infinite}
    .pinwhy-viewer-retry{padding:8px 16px;border:1px solid var(--dsw-alias-border-l2,#d4d4d8);border-radius:7px;background:transparent;color:inherit;font:inherit;cursor:pointer}
    .pinwhy-viewer-retry:hover{background:var(--dsw-alias-interactive-bg-hover,#f4f4f5)}
    @keyframes pinwhy-spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.pinwhy-spinner{animation:none}}
    @container pinwhy-panel (max-width:620px){.pinwhy-global-header{padding:14px 16px;flex-wrap:wrap;gap:12px}.pinwhy-global-heading p{display:none}.pinwhy-session-picker{width:100%}.pinwhy-session-picker>span{flex:none}.pinwhy-session-picker select{flex:1;max-width:100%}}
    @media(max-width:760px){.pinwhy-viewer-bar{padding:0 12px}}
    .pinwhy-settings-wrap{box-sizing:border-box;max-width:860px;margin:12px auto 28px;display:flex;flex-direction:column;gap:18px;font-family:inherit;color:var(--dsw-alias-label-primary,inherit)}
    .pinwhy-settings-card{box-sizing:border-box;background:var(--dsw-alias-card-fill,var(--dsw-alias-bg-base,#fff));border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:12px;padding:18px 22px;display:flex;flex-direction:column;gap:14px;box-shadow:0 1px 3px rgba(0,0,0,.03)}
    .pinwhy-settings-header{display:flex;flex-direction:column;gap:3px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);padding-bottom:12px}
    .pinwhy-settings-title{display:flex;align-items:center;gap:8px;margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--dsw-alias-label-primary,inherit)}
    .pinwhy-settings-title h3,.pinwhy-settings-title h4{margin:0;font-size:inherit;font-weight:inherit}
    .pinwhy-settings-desc{margin:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#71717a)}
    .pinwhy-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.02));border:1px solid var(--dsw-alias-border-l1,#e5e7eb);cursor:pointer;user-select:none}
    .pinwhy-toggle-row:hover{border-color:var(--dsw-alias-border-l2,#d4d4d8)}
    .pinwhy-toggle-info{display:flex;flex-direction:column;gap:2px}
    .pinwhy-toggle-title{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}
    .pinwhy-toggle-desc{font-size:12px;color:var(--dsw-alias-label-tertiary,#71717a)}
    .pinwhy-toggle-checkbox{width:18px;height:18px;cursor:pointer;accent-color:#10b981}
    .pinwhy-projects-list{display:flex;flex-direction:column;gap:10px}
    .pinwhy-projects-empty{padding:20px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary,#71717a);border:1px dashed var(--dsw-alias-border-l2,#d4d4d8);border-radius:8px}
    .pinwhy-project-card{box-sizing:border-box;padding:14px 16px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#d4d4d8);background:var(--dsw-alias-bg-base,transparent);display:flex;flex-direction:column;gap:10px}
    .pinwhy-project-card-header{display:flex;align-items:center;justify-content:space-between}
    .pinwhy-project-badge{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#52525b);display:flex;align-items:center;gap:6px}
    .pinwhy-project-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .pinwhy-project-add-bar{display:flex;gap:10px;align-items:center}
    .pinwhy-field{display:flex;flex-direction:column;gap:5px}
    .pinwhy-field-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary,inherit);display:flex;justify-content:space-between;align-items:baseline}
    .pinwhy-field-hint{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary,#71717a)}
    .pinwhy-input{box-sizing:border-box;width:100%;height:36px;padding:7px 12px;border:1px solid var(--dsw-alias-border-l2,#d4d4d8);border-radius:6px;background:var(--dsw-alias-bg-base,transparent);color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:13px;outline:none;transition:border-color .15s ease,box-shadow .15s ease}
    .pinwhy-input:focus{border-color:#10b981;box-shadow:0 0 0 2px rgba(16,185,129,.2)}
    .pinwhy-input::placeholder{color:var(--dsw-alias-label-tertiary,#a1a1aa);opacity:.8}
    .pinwhy-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .pinwhy-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 14px;border-radius:6px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;transition:all .15s ease;user-select:none;border:1px solid transparent}
    .pinwhy-btn-primary{background:#10b981;color:#fff;border-color:#059669}
    .pinwhy-btn-primary:hover:not(:disabled){background:#059669}
    .pinwhy-btn-primary:disabled{opacity:.45;cursor:not-allowed}
    .pinwhy-btn-outline{background:transparent;color:var(--dsw-alias-label-primary,inherit);border-color:var(--dsw-alias-border-l2,#d4d4d8)}
    .pinwhy-btn-outline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#f4f4f5);border-color:var(--dsw-alias-label-tertiary,#a1a1aa)}
    .pinwhy-btn-outline:disabled{opacity:.4;cursor:not-allowed}
    .pinwhy-btn-danger{background:transparent;color:var(--dsw-alias-state-error-primary,#dc2626);border-color:transparent;padding:4px 8px;height:28px;font-size:12px}
    .pinwhy-btn-danger:hover{background:rgba(220,38,38,.08)}
    .pinwhy-settings-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 0}
    .pinwhy-notice{font-size:13px;color:var(--dsw-alias-label-secondary,#52525b);display:flex;align-items:center;gap:6px}
    .pinwhy-notice-success{color:#10b981;font-weight:500}
    .pinwhy-notice-error{color:var(--dsw-alias-state-error-primary,#dc2626)}
    .pinwhy-actions-group{display:flex;align-items:center;gap:10px;margin-left:auto}
    .pinwhy-guide-callout{display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:8px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,inherit)}
    .pinwhy-guide-callout svg{flex:none;margin-top:2px;color:#10b981}
    @media(max-width:680px){.pinwhy-project-fields,.pinwhy-grid-2{grid-template-columns:1fr}.pinwhy-project-add-bar{flex-direction:column;align-items:stretch}.pinwhy-settings-footer{flex-direction:column;align-items:stretch;gap:12px}.pinwhy-actions-group{justify-content:flex-end}}
  `;

  const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
  const viewerPrefix = '/pinwhy-viewer/';

  /** The Host viewer mount, or an absolute loopback origin of it; nothing else is embeddable. */
  function viewerUrl(url) {
    if (typeof url !== 'string' || url === '' || url.length > 4096 || /[\u0000-\u0020\\]/.test(url)) return null;
    if (url.startsWith('/')) {
      if (url.startsWith('//')) return null;
      const path = url.split(/[?#]/, 1)[0];
      if (/(^|\/)\.\.?(\/|$)/.test(path)) return null;
      return path.startsWith(viewerPrefix) && path.length > viewerPrefix.length ? url : null;
    }
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!loopbackHosts.includes(parsed.hostname)) return null;
    return parsed.pathname.startsWith(viewerPrefix) && parsed.pathname.length > viewerPrefix.length ? url : null;
  }

  /** The `viewer.open` value, or null when any field cannot be trusted for embedding. */
  function viewerValue(value) {
    if (!value || typeof value !== 'object') return null;
    const url = viewerUrl(value.url);
    if (!url || !['boardRoot', 'agentId', 'viewerId'].every(key => typeof value[key] === 'string' && value[key] !== '')) return null;
    return { url, boardRoot: value.boardRoot, agentId: value.agentId, viewerId: value.viewerId };
  }

  function viewerFailure(error) {
    const code = typeof error?.code === 'string' && error.code !== '' ? error.code.slice(0, 80) : 'VIEWER_UNAVAILABLE';
    const message = typeof error?.message === 'string' ? error.message.slice(0, 500) : '';
    return { code, message };
  }

  /**
   * Read-only Pinwhy workspace embedded from the Host's viewer mount.
   * The Host owns the runtime process and its lifetime: unmount only aborts the
   * in-flight open request, and a stale response never replaces a newer session.
   */
  function ViewerPanel({ sessionId, t, openViewer, retainSession, hostPresentation, referenceNode, focus }) {
    const [attempt, setAttempt] = React.useState(0);
    const [appearance] = React.useState(() => hostPresentation?.getSnapshot() ?? { theme: 'light' });
    const frameRef = React.useRef(null);
    const [result, setResult] = React.useState({ status: 'loading', for: undefined, attempt: 0 });
    const [loadedFrame, setLoadedFrame] = React.useState(null);
    const focused = React.useRef(null);
    React.useEffect(() => {
      if (typeof sessionId !== 'string' || sessionId === '') return undefined;
      const controller = new AbortController();
      let live = true, reference;
      setLoadedFrame(null);
      setResult({ status: 'loading', for: sessionId, attempt });
      const fail = error => { if (live) setResult({ status: 'error', for: sessionId, attempt, error: viewerFailure(error) }); };
      (async () => {
        reference = retainSession?.(sessionId);
        if (reference) await reference.ready;
        if (!live) return;
        const response = await openViewer(sessionId, controller.signal);
        if (!live) return;
        if (response?.ok !== true) { fail(response?.error); return; }
        const value = viewerValue(response.value);
        if (!value) { fail({ code: 'VIEWER_INVALID', message: '' }); return; }
        if (focus?.boardRoot && focus.boardRoot !== value.boardRoot) { fail({ code: 'NOT_ENABLED', message: 'The recorded node belongs to a different board.' }); return; }
        setResult({ status: 'ready', for: sessionId, attempt, value });
      })().catch(fail);
      return () => { live = false; controller.abort(); reference?.release(); };
    }, [sessionId, attempt, focus?.boardRoot]);

    const settled = typeof sessionId !== 'string' || !sessionId
      ? { status: 'empty' } : result.for === sessionId && result.attempt === attempt ? result : { status: 'loading' };
    const ready = settled.status === 'ready' ? settled.value : null;
    const frameKey = ready ? `${ready.viewerId}:${attempt}` : null;
    const frameLoading = ready && loadedFrame !== frameKey;
    const reload = () => setAttempt(value => value + 1);
    const sendAppearance = () => {
      const frame = frameRef.current;
      if (frame?.contentWindow) frame.contentWindow.postMessage({ type: 'pinwhy:appearance', ...(hostPresentation?.getSnapshot() ?? appearance) }, new URL(frame.src).origin);
    };
    const sendFocus = () => {
      const frame = frameRef.current;
      const key = focus?.nodeId && (!focus.boardRoot || focus.boardRoot === ready?.boardRoot) ? `${frameKey}:${focus.revision}` : null;
      if (frame?.contentWindow && key && focused.current !== key) {
        frame.contentWindow.postMessage({ type: 'pinwhy:navigate', nodeId: focus.nodeId, requestId: key }, new URL(frame.src).origin);
        focused.current = key;
      }
    };
    React.useEffect(() => hostPresentation?.subscribe(sendAppearance), [hostPresentation, ready?.viewerId]);
    React.useEffect(() => { if (!frameLoading) sendFocus(); }, [focus?.revision, frameLoading, frameKey]);
    React.useEffect(() => {
      if (!ready || !referenceNode || typeof window.addEventListener !== 'function') return undefined;
      const controller = new AbortController();
      let pending = false;
      const receive = async event => {
        const frame = frameRef.current;
        if (!frame || event.source !== frame.contentWindow || event.origin !== new URL(frame.src).origin) return;
        const message = event.data;
        if (message?.type !== 'pinwhy:reference' || typeof message.nodeId !== 'string' || !message.nodeId || message.nodeId.length > 256
          || typeof message.requestId !== 'string' || !message.requestId || message.requestId.length > 128) return;
        const reply = (ok, text) => frame.contentWindow.postMessage({ type: 'pinwhy:reference-result', requestId: message.requestId, ok, message: text }, event.origin);
        if (pending) { reply(false, t('referenceFailed')); return; }
        pending = true;
        try {
          await referenceNode(sessionId, message.nodeId, ready.boardRoot, controller.signal);
          if (!controller.signal.aborted) reply(true, t('referenceAdded'));
        } catch { if (!controller.signal.aborted) reply(false, t('referenceFailed')); }
        finally { pending = false; }
      };
      window.addEventListener('message', receive);
      return () => { controller.abort(); window.removeEventListener('message', receive); };
    }, [ready?.viewerId, referenceNode, sessionId]);

    let body;
    if (ready) body = h('div', { className: 'pinwhy-viewer-content' },
      h('iframe', {
        key: frameKey, ref: frameRef, src: embeddedUrl(ready.url, appearance, Boolean(referenceNode)), title: t('boardTitle'), 'data-pinwhy-viewer': ready.viewerId,
        onLoad: () => { sendAppearance(); focused.current = null; setLoadedFrame(frameKey); sendFocus(); }, style: { display: 'block', flex: 1, width: '100%', minHeight: 0, border: 0 },
      }),
      frameLoading ? h('div', { className: 'pinwhy-viewer-state pinwhy-frame-loading', role: 'status' },
        h('span', { className: 'pinwhy-spinner', 'aria-hidden': true }), h('p', null, t('viewerLoading'))) : null);
    else {
      const code = settled.error?.code;
      const remedy = code === 'RUNTIME_INCOMPATIBLE' ? 'upgradeHint'
        : code === 'RUNTIME_MISSING' ? 'runtimeHint'
        : ['NOT_ENABLED', 'BOARD_NOT_INITIALIZED'].includes(code) ? 'setupHint' : 'retryHint';
      body = h('div', { className: 'pinwhy-viewer-state', role: settled.status === 'error' ? 'alert' : 'status', 'data-pinwhy-viewer-error': code },
        settled.status === 'loading' ? h('span', { className: 'pinwhy-spinner', 'aria-hidden': true }) : h(PinwhyIcon, { size: 32 }),
        h('h2', null, t(settled.status === 'empty' ? 'chooseSession' : settled.status === 'error' ? 'viewerFailed' : 'viewerLoading')),
        h('p', null, t(settled.status === 'empty' ? 'noSession' : settled.status === 'error' ? remedy : 'viewerLoadingHint')),
        settled.status === 'error' ? h('button', { type: 'button', className: 'pinwhy-viewer-retry', onClick: reload }, t('viewerReconnect')) : null,
        settled.status === 'error' ? h('details', null, h('summary', null, t('viewerErrorDetails')), `${code} — ${settled.error.message}`) : null);
    }
    return h('div', { className: 'pinwhy-viewer', 'aria-busy': settled.status === 'loading' || Boolean(frameLoading), 'data-pinwhy-viewer-pane': true, 'data-pinwhy-viewer-status': settled.status },
      h('div', { className: 'pinwhy-viewer-bar' },
        ready ? h('span', { className: 'pinwhy-board-name', 'data-pinwhy-board-root': true, title: ready.boardRoot }, boardName(ready.boardRoot)) : h('span', null, 'Pinwhy'),
        h('span', { 'aria-hidden': true }, '·'), h('span', { 'data-pinwhy-read-only': true }, t('readOnlyBadge')),
        sessionId ? h('button', { type: 'button', className: 'pinwhy-viewer-refresh', 'data-pinwhy-reload': true,
          title: t(settled.status === 'error' ? 'viewerReconnect' : 'viewerReload'), 'aria-label': t(settled.status === 'error' ? 'viewerReconnect' : 'viewerReload'), onClick: reload },
          h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }, h('path', { d: 'M20 7v5h-5M4 17v-5h5M6.1 6.1a8 8 0 0 1 13 2.9M4.9 15a8 8 0 0 0 13 2.9' }))) : null),
      body);
  }

  return {
    name: 'pinwhy-client',
    inject: ['slots', 'locale', 'connection', 'layout', 'uiSession', 'sessions', 'theme', 'shortcuts', 'uiWorkspace', 'conversation'],
    apply(ctx) {
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, dictionaries));
      const selection = createPanelSelection();
      const openViewer = (sessionId, signal) => ctx.connection.rpc.call('/api', 'pinwhy/viewer.open', { sessionId }, signal);
      const retainSession = sessionId => ctx.sessions.retain(sessionId, { source: 'pinwhyView' });
      const openBoard = (sessionId, nodeId = null, boardRoot = null) => {
        selection.select(sessionId, nodeId, boardRoot);
        ctx.layout.selectPanel('pinwhy');
      };
      const presentationSnapshot = () => {
        const theme = ctx.theme.getTheme(), language = ctx.locale.getSnapshot().active;
        const locale = /^(zh-hk|zh-tw|zh-hant)$/i.test(language) ? 'zh-HK' : /^zh/i.test(language) ? 'zh-CN' : /^ja/i.test(language) ? 'ja' : 'en';
        return { theme: theme.active.colorScheme, locale, fontFamily: theme.fontFamilies.text, codeFontFamily: theme.fontFamilies.code,
          fontSize: theme.fontSizes.text, codeFontSize: theme.fontSizes.code };
      };
      const hostPresentation = {
        getSnapshot: presentationSnapshot,
        subscribe: listener => { const theme = ctx.on('theme/change', listener), locale = ctx.locale.subscribe(listener); return () => { theme(); locale(); }; },
      };
      const referenceNode = async (sessionId, nodeId, boardRoot, signal) => {
        const reference = retainSession(sessionId);
        try {
          await reference.ready; signal.throwIfAborted();
          const result = await ctx.connection.rpc.call('/api', 'pinwhy/node.read', { sessionId, nodeId }, signal);
          signal.throwIfAborted();
          if (!result?.ok || result.value?.boardRoot !== boardRoot || result.value.node?.id !== nodeId) throw new Error('Reference is unavailable.');
          const scope = ctx.sessions.scope(sessionId);
          if (!scope) throw new Error('The owning Session has closed.');
          const input = ctx.conversation.input.for(scope);
          const text = `Pinwhy · ${nodeId}\n${boardRoot}\n${JSON.stringify(result.value.node, null, 2)}`;
          if (!input.insertQuote(text)) throw new Error('The draft cannot accept a reference right now.');
          ctx.uiWorkspace.openSession(sessionId);
          input.focus();
        } finally { reference.release(); }
      };
      ctx.effect(() => ctx.shortcuts.register({
        id: 'pinwhy.openBoard', label: () => t('openCommand'), aliases: ['pinwhy'], defaults: {}, regions: ['page', 'editable'], modals: [],
        resolve: () => {
          const id = ctx.uiSession.adapter.current.getSnapshot().key;
          return { status: 'handled', run: () => openBoard(id) };
        },
      }));
      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {};
        const style = document.createElement('style'); style.textContent = clientCss; document.head.appendChild(style);
        return () => style.remove();
      });
      // Settings forms
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({ name: 'plugins.row.config', key: 'dsh-pinwhy#pinwhy', locale: NS }, props => props.view === 'summary' ? props.t('summary') : h(Editor, props)));
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-pinwhy', locale: NS }, ({ t }) => h('p', null, t('rowHint'))));

      // Result-only tool cards; no live board events are synthesized from chat calls.
      for (const action of actions) {
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: `pinwhy_${action}`, locale: NS }, props => h(ToolCard, { ...props, onOpenNode: openBoard })));
      }

      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'pinwhy', locale: NS },
        props => h(GlobalPanel, { ...props, selection, openViewer, retainSession, hostPresentation, referenceNode })));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'pinwhy', order: 30, label: () => t('boardTitle'), locale: NS }, props => h(PinwhyIcon, { size: props.size })));
      ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
        name: 'sidebar.panellist.actions', id: 'pinwhy', order: 20, locale: NS,
      }, props => h(MenuEntry, { ...props, kind: 'global', open: () => openBoard(ctx.uiSession.adapter.current.getSnapshot().key) })));
      ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view', id: 'pinwhy', order: 30, label: () => t('boardTitle'), locale: NS,
      }, props => h(ViewerPanel, { ...props, openViewer, retainSession, hostPresentation, referenceNode })));
      ctx.slots.inject('conversation.session.header.views.actions', () => ctx.slots.register({
        name: 'conversation.session.header.views.actions', id: 'pinwhy', order: 20, locale: NS,
      }, props => h(MenuEntry, { ...props, kind: 'conversation', open: () => props.onOpen('pinwhy') })));
    },
    // Pure seams used by package tests; no browser or Host state is accessed.
    test: { initial, edits, cardMeta, ToolCard, Editor, MenuEntry, ViewerPanel, GlobalPanel, createPanelSelection, embeddedUrl, viewerUrl, viewerValue, viewerFailure },
  };
} });
