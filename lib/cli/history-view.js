import { C, cleanText, field, formatTime, indent, panel } from './format.js';

// Quote strings so empty strings, nulls, numbers, and embedded newlines remain distinct.
// JSON here describes individual recorded values, never the result envelope.
function value(input) {
  if (input === undefined) return '<absent>';
  if (typeof input === 'string' && input.includes('\n')) return `"\n${cleanText(input)}\n"`;
  const encoded = JSON.stringify(input, null, 2);
  return cleanText(encoded === undefined ? String(input) : encoded);
}

function timestamp(at) {
  if (at === null || at === undefined) return 'unspecified';
  return cleanText(formatTime(at));
}

function transition(name, before, after) {
  const left = value(before);
  const right = value(after);
  if (!left.includes('\n') && !right.includes('\n')) {
    return [`${cleanText(name)}: ${C.red(left)} → ${C.grn(right)}`];
  }
  return [cleanText(name), '  before:', indent(C.red(left), 4), '  → after:', indent(C.grn(right), 4)];
}

function record(node, operation) {
  const paint = operation.startsWith('-') ? C.red : C.grn;
  const lines = [paint(`${operation} node ${value(node.id)}`)];
  for (const [key, item] of Object.entries(node)) {
    lines.push(indent(`${value(key)}: ${value(item)}`));
  }
  return lines;
}

function relationship(edge, operation) {
  const lines = [
    (operation.startsWith('-') ? C.red : C.grn)(`${operation} relation ${value(edge.id)}: ${value(edge.from)} → ${value(edge.to)}`),
  ];
  // Include every recorded property, including kind, label, provenance and extensions.
  for (const [key, item] of Object.entries(edge)) {
    lines.push(indent(`${value(key)}: ${value(item)}`));
  }
  return lines;
}

function relations(edges) {
  return [
    ...edges.removed.flatMap((edge) => relationship(edge, '- removed')),
    ...edges.added.flatMap((edge) => relationship(edge, '+ added')),
  ];
}

function nodes(delta) {
  return [
    ...delta.added.flatMap((node) => record(node, '+ created')),
    ...delta.updated.flatMap((item) => [
      `~ modified node ${value(item.id)}`,
      ...item.fields.flatMap((key) => transition(key, item.before[key], item.after[key]).map((line) => indent(line))),
    ]),
    ...delta.removed.flatMap((node) => record(node, '- deleted')),
  ];
}

function metadata(entry) {
  const lines = [
    `${timestamp(entry.at)} · ${entry.by == null ? 'unspecified author' : cleanText(entry.by)} · ${cleanText(entry.op)}`,
    C.dim(`Event ${value(entry.eventId)} · index ${value(entry.index)}`),
  ];
  if (entry.reason !== null && entry.reason !== undefined) lines.push(field('Reason', value(entry.reason)));
  return lines;
}

function integrityLines(result) {
  const lines = [];
  for (const [key, count] of Object.entries(result.integrity || {})) {
    if (count !== 0 && count !== null && count !== undefined && count !== false) {
      lines.push(field(cleanText(key), value(count)));
    }
  }
  if (result.warnings !== undefined) lines.push(field('Warnings', value(result.warnings)));
  return lines.length ? ['', 'Integrity warnings', ...lines.map((line) => indent(line))] : [];
}

export function renderHistory(result) {
  const lines = [field('Node', value(result.nodeId)), field('Entries', String(result.entries.length))];
  for (const entry of result.entries) {
    lines.push('', ...metadata(entry));
    for (const [key, change] of Object.entries(entry.changes)) {
      if (key === '$node') {
        if (change.before !== null) lines.push(...record(change.before, '- deleted'));
        if (change.after !== null) lines.push(...record(change.after, '+ created'));
      } else {
        lines.push(...transition(key, change.before, change.after));
      }
    }
    lines.push(...relations(entry.edges));
  }
  if (!result.entries.length) lines.push('', 'No recorded history entries.');
  lines.push(...integrityLines(result));
  return panel('History', lines, 'read-only');
}

export function renderChanges(result) {
  const lines = [
    field('Checkpoint', value(result.since.id)),
    field('Time', timestamp(result.since.at)),
    field('Event index', value(result.since.index)),
    field('Summary', value(result.since.summary)),
    '',
    `Nodes: +${result.nodes.added.length} added · ~${result.nodes.updated.length} modified · -${result.nodes.removed.length} deleted`,
    `Relations: +${result.edges.added.length} added · -${result.edges.removed.length} removed`,
    `Recorded change events: ${result.events.length}`,
    '',
  ];
  if (!result.nodes.added.length && !result.nodes.updated.length && !result.nodes.removed.length &&
      !result.edges.added.length && !result.edges.removed.length) {
    lines.push('No net node or relation changes.');
  }
  lines.push('', 'Event timeline');
  for (const entry of result.events) {
    lines.push('', ...metadata(entry), ...nodes(entry.nodes), ...relations(entry.edges));
  }
  if (!result.events.length) lines.push('No recorded change events.');
  lines.push(...integrityLines(result));
  return panel('Changes', lines, 'read-only');
}
