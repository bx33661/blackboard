// The board's on-disk layout, shared by storage readers and writers.
import path from 'node:path';

export const PINWHY_DIR = '.pinwhy';

export function paths(cwd = process.cwd()) {
  const root = path.join(cwd, PINWHY_DIR);
  return {
    cwd, root,
    events: path.join(root, 'events.jsonl'),
    state: path.join(root, 'state.json'),
    config: path.join(root, 'config.json'),
    digest: path.join(root, 'digest.md'),
    lock: path.join(root, 'lock'),
  };
}
