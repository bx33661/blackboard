import { C, panel, field, indent, displayWidth, table, formatTime, cleanText, paintType, paintSeverity } from './format.js';

const value = (input) => input == null ? 'unspecified' : cleanText(typeof input === 'object' ? JSON.stringify(input) : String(input));
const location = (node) => {
  if (node.loc == null) return 'unspecified';
  if (typeof node.loc !== 'object') return value(node.loc);
  const { path, line, ...rest } = node.loc;
  const suffix = Object.keys(rest).length ? ` ${value(rest)}` : '';
  return `${value(path)}${line == null ? '' : `:${value(line)}`}${suffix}`;
};
const summary = (total, shown) => `Total ${total} · Shown ${shown} · Omitted ${Math.max(0, total - shown)}`;

// A wide or multiline cell becomes a labelled record. Never cut a cell to fit.
function records(headers, rows) {
  if (!rows.length) return ['(empty)'];
  const lines = table(headers, rows);
  const width = process.stdout.isTTY ? (process.stdout.columns || 80) : Infinity;
  if (rows.some((row) => row.some((cell) => String(cell).includes('\n'))) ||
      lines.some((line) => displayWidth(line) + 2 > width)) {
    return rows.flatMap((row, index) => [
      ...(index ? [''] : []),
      ...headers.map((header, column) => field(header, row[column])),
    ]);
  }
  return lines;
}

const headers = ['ID', 'Type', 'Status', 'Severity', 'Confidence', 'Title', 'Location'];
const rowOf = (node) => [node.id, node.type, node.status, node.severity, node.confidence, node.title]
  .map(value).concat(location(node));

function metadata(node) {
  return [
    ...(node.source == null ? [] : [field('Source', value(node.source))]),
    field('Author', value(node.author)),
    field('Created', formatTime(node.ts)),
    ...(node.updated == null ? [] : [field('Updated', formatTime(node.updated))]),
    ...(node.updatedBy == null ? [] : [field('Updated by', value(node.updatedBy))]),
    ...(node.tags == null ? [] : [field('Tags', value(node.tags))]),
    ...(node.inputTruncation && Object.keys(node.inputTruncation).length
      ? [C.yel('Text was truncated when saved; this is not the full original.'), field('Truncation', value(node.inputTruncation))] : []),
    ...(node.detail == null ? [] : ['', C.bold('Details'), node.detail === '' ? '(empty)' : cleanText(node.detail)]),
  ];
}

function listLines(nodes) {
  if (!nodes.length) return ['(empty)'];
  const rows = nodes.map((node) => {
    const row = rowOf(node);
    row[1] = paintType(node.type, row[1]);
    row[3] = paintSeverity(node.severity, row[3]);
    return row;
  });
  const lines = table(headers, rows);
  if (process.stdout.isTTY && lines.some((line) => displayWidth(line) + 2 > (process.stdout.columns || 80))
    || rows.some((row) => row.some((cell) => String(cell).includes('\n')))) {
    return nodes.flatMap((node, index) => [
      ...(index ? [''] : []),
      `${value(node.id)}  ${paintType(node.type, value(node.type))}  ${value(node.title)}`,
      indent(field('Status', value(node.status))),
      indent(field('Severity', paintSeverity(node.severity, value(node.severity)))),
      indent(field('Confidence', value(node.confidence))),
      ...(node.loc == null ? [] : [indent(`Location ${location(node)}`)]),
    ]);
  }
  return lines;
}

export function renderNodeList(nodes, { total = nodes.length } = {}) {
  return panel('Records', [summary(total, nodes.length), '', ...listLines(nodes)]);
}

function relations(neighbors) {
  const lines = [];
  for (const direction of ['in', 'out']) {
    const entries = neighbors.filter((item) => item.direction === direction);
    lines.push('', C.bold(direction === 'in' ? 'Incoming relations' : 'Outgoing relations'));
    if (!entries.length) lines.push('  (none)');
    else lines.push(...records(['Direction', 'Relation', 'Node', 'Title', 'Label'], entries.map((item) => [
      direction === 'in' ? '← incoming' : '→ outgoing', value(item.edge?.kind), value(item.node?.id),
      value(item.node?.title), item.edge?.label == null ? '(none)' : value(item.edge.label),
    ])));
  }
  return lines;
}

function detailLines(node, neighbors) {
  if (!node) return ['Node unspecified', ...relations(neighbors)];
  return [
    field('ID', value(node.id)), field('Title', value(node.title)),
    field('Type', value(node.type)), field('Status', value(node.status)),
    field('Severity', value(node.severity)), field('Confidence', value(node.confidence)),
    field('Location', location(node)), ...metadata(node), ...relations(neighbors),
  ];
}

export function renderNodeDetail({ node, neighbors = [] }) {
  return panel('Record', detailLines(node, neighbors));
}

export function renderSearch(result) {
  const items = result.items || [];
  if (result.groups) {
    const dimensions = result.groupBy || [];
    return panel('Search groups', [
      `Total ${result.total} matches · ${result.groups.length} groups`,
      'Counts cover all matches; a record may belong to multiple tag groups.', '',
      ...records([...dimensions.map(value), 'Count'], result.groups.map((group) =>
        [...dimensions.map((dimension) => value(group.values?.[dimension])), value(group.count)])),
    ]);
  }
  const lines = [summary(result.total, items.length)];
  if (result.query) lines.push(field('Query', value(result.query)));
  lines.push('', ...listLines(items.map((item) => item.node)));
  const matches = items.filter((item) => item.matches?.length);
  if (matches.length) lines.push('', C.bold('Matched fields'), ...matches.map((item) =>
    field(value(item.id ?? item.node.id), item.matches.map((match) => value(match.field)).join(', '))));
  return panel('Search', lines);
}

export function renderHere({ agentId, cursor, node, neighbors = [], trail = [] }) {
  const lines = [field('Agent', value(agentId)), field('Cursor', value(cursor)), '',
    ...(!node ? ['Cursor not set.'] : detailLines(node, neighbors)), '', C.bold('Recent trail')];
  if (!trail.length) lines.push('  (none)');
  for (const entry of trail) {
    lines.push(`${formatTime(entry.at)}  ${value(entry.from)} → ${value(entry.to)}`);
    if (entry.reason) lines.push(indent(cleanText(entry.reason)));
  }
  return panel('Here', lines);
}
