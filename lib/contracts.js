// The contract's machine-readable outputs, one entry per command (aliases share
// it). A top-level object carries its schema in band; an array keeps its shape
// and is described here only. capabilities --json publishes this table.
const object = (schema) => ({ shape: 'object', schema });
const array = (items) => ({ shape: 'array', items });
const NODE = 'pinwhy.node.v2';
const EDGE = 'pinwhy.edge.v1';
const ACTIVITY = 'pinwhy.activity.v1';
export const OUTPUTS = {
  init: object('pinwhy.init.v1'),
  status: object('pinwhy.status.v2'),
  doctor: object('pinwhy.doctor.v1'),
  node: object('pinwhy.node-add.v2'),
  checkpoint: object('pinwhy.checkpoint.v1'),
  cursor: object('pinwhy.cursor.v1'),
  here: object('pinwhy.here.v2'),
  activity: array(ACTIVITY),
  'activity show': object(ACTIVITY),
  promote: object('pinwhy.node-add.v2'),
  batch: object('pinwhy.batch.v1'),
  done: object(NODE), block: object(NODE), revive: object(NODE), edit: object(NODE),
  link: object(EDGE), unlink: object(EDGE),
  remove: object('pinwhy.remove.v1'),
  ls: array(NODE),
  show: object('pinwhy.show.v2'),
  digest: object('pinwhy.digest.v1'),
  context: object('pinwhy.context.v2'),
  lint: object('pinwhy.lint.v1'),
  tail: object('pinwhy.tail.v1'),
  export: object('pinwhy.export.v1'),
  reset: object('pinwhy.reset.v1'),
  search: object('pinwhy.search.v2'),
  history: object('pinwhy.history.v2'),
  changes: object('pinwhy.changes.v2'),
  backup: object('pinwhy.backup-receipt.v1'),
  restore: object('pinwhy.restore-receipt.v1'),
  receipt: object('pinwhy.receipt.v1'),
  capabilities: object('pinwhy.capabilities.v1'),
  'release check': object('pinwhy.update-check.v1'),
};

// Every file a command writes inside the project root, so an adapter can
// authorize exactly these. export, backup and restore also write the path the
// caller names; nothing else is written.
export const WRITE_TARGETS = [
  { path: '.pinwhy/events.jsonl', role: 'log' },
  { path: '.pinwhy/lock', role: 'lock' },
  { path: '.pinwhy/state.json', role: 'cache' },
  { path: '.pinwhy/state.json.tmp', role: 'cache-temp' },
  { path: '.pinwhy/config.json', role: 'config' },
  { path: '.pinwhy/.gitignore', role: 'gitignore' },
  { path: '.pinwhy/digest.md', role: 'digest' },
];

export const GRAPH_SCHEMA = 'pinwhy.graph.v2';

// Under --json a failure prints one pinwhy.error.v1 line on stderr; stdout stays empty.
// A code is stable once listed; `error` covers everything not yet classified.
export const ERROR_SCHEMA = 'pinwhy.error.v1';
export const ERROR_CODES = [
  'unknown_command', 'unknown_option', 'missing_value', 'invalid_value', 'conflicting_options',
  'invalid_usage', 'board_missing', 'not_found', 'ambiguous_ref', 'invalid_batch', 'input_too_long',
  'request_id_conflict', 'request_recovery_conflict', 'pending_request', 'error',
];
