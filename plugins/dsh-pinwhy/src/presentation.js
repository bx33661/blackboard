const titles = {
  pinwhy_status: '黑板状态', pinwhy_context: '恢复研究现场', pinwhy_node_get: '查看节点',
  pinwhy_node_add: '记录判断', pinwhy_node_patch: '更新节点', pinwhy_link: '关联证据',
  pinwhy_cursor: '切换关注位置', pinwhy_checkpoint: '保存交接', pinwhy_diagnose: '接入诊断',
  pinwhy_batch: '批量记录', pinwhy_search: '搜索记忆',
};
const text = value => typeof value === 'string' ? value.slice(0, 320) : '';

/** Bounded, replayable facts for UI only; canonical tool output stays unchanged. */
export function presentationMeta(name, args, value) {
  const data = name === 'pinwhy_diagnose' ? value : value.data;
  const node = data?.node;
  let summary = text(node?.title) || text(args.title) || text(args.summary) || text(args.id);
  if (name === 'pinwhy_link') summary = `${text(args.from)} → ${text(args.relation)} → ${text(args.to)}`;
  if (name === 'pinwhy_context') summary = text(data?.currentFocus?.title) || text(data?.currentFocus?.id);
  if (name === 'pinwhy_status' && Number.isSafeInteger(data?.stats?.total)) summary = `${data.stats.total} nodes`;
  if (name === 'pinwhy_search') summary = data?.total !== undefined ? `${data.total} matches` : text(args.query);
  if (name === 'pinwhy_batch') summary = data?.counts ? `${data.counts.nodes ?? 0} nodes, ${data.counts.edges ?? 0} links` : `${args.operations?.length ?? 0} operations`;
  return { pinwhy: {
    schema: 'pinwhy.card.v1', action: name, summary,
    boardRoot: typeof value.boardRoot === 'string' ? value.boardRoot : '', agentId: text(value.agentId),
    nodeId: text(node?.id) || text(data?.currentFocus?.id) || text(args.id),
    diagnostics: text(value.diagnostics),
    ...(name !== 'pinwhy_diagnose' ? {} : {
      readyToRead: data.readyToRead, readyToWrite: data.readyToWrite,
      checks: data.checks.map(check => Object.fromEntries(Object.entries(check).map(([key, value]) => [key, text(value)]))),
    }),
  } };
}

export function presenters(name) {
  return {
    presentCall: () => ({ card: 'generic', title: titles[name], kind: ['pinwhy_status', 'pinwhy_context', 'pinwhy_node_get', 'pinwhy_diagnose', 'pinwhy_search'].includes(name) ? 'read' : 'edit' }),
    presentResult: (_args, result) => ({ card: 'generic', title: titles[name], content: result.content }),
  };
}
