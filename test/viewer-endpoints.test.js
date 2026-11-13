import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// Compile the same portable Node 18+ pattern the viewer tests use, so the endpoint
// helper and the graph controller run without a browser or a bundler.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-viewer-endpoints-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--skipLibCheck', '--outDir', dir,
  path.join(root, 'web/src/endpoint.ts'), path.join(root, 'web/src/workspace/graph-stream.ts')], { cwd: dir });
function resolveModuleExtensions(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const p = path.join(directory, entry.name);
    if (entry.isDirectory()) resolveModuleExtensions(p);
    else if (entry.name.endsWith('.js')) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (_all, name) => `from '${name}.js'`));
  }
}
resolveModuleExtensions(dir);
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
const { endpoint } = await import(pathToFileURL(path.join(dir, 'endpoint.js')).href);
const { createGraphSubscription } = await import(pathToFileURL(path.join(dir, 'workspace/graph-stream.js')).href);

const PREFIX = 'http://127.0.0.1:4333/pinwhy-viewer/synthetic-token/';

/** A host serves the page under a token prefix; the document base carries it. */
function withDocument(baseURI, run) {
  Object.defineProperty(globalThis, 'document', { value: { baseURI }, configurable: true });
  try { return run(); } finally { delete globalThis.document; }
}

test('without a document every endpoint stays exactly as written for Node tests and static exports', () => {
  for (const request of ['/api/graph', '/events', '/api/status', '/api/receipt?requestId=a%2Fb']) {
    assert.equal(endpoint(request), request);
  }
});

test('with a document every endpoint resolves against its base and keeps the prefix', () => {
  withDocument(PREFIX, () => {
    assert.equal(endpoint('/api/graph'), `${PREFIX}api/graph`);
    assert.equal(endpoint('/events'), `${PREFIX}events`);
    assert.equal(endpoint('/api/status'), `${PREFIX}api/status`);
    assert.equal(endpoint('/api/receipt?requestId=a%2Fb'), `${PREFIX}api/receipt?requestId=a%2Fb`);
  });
});

test('a page served from a file or nested document directory resolves inside that directory', () => {
  withDocument('file:///tmp/pinwhy-export/index.html', () => {
    assert.equal(endpoint('/api/graph'), 'file:///tmp/pinwhy-export/api/graph');
  });
  withDocument('http://127.0.0.1:4333', () => {
    assert.equal(endpoint('/api/graph'), 'http://127.0.0.1:4333/api/graph');
  });
});

test('the graph subscription reads and streams through the prefixed document base', async () => {
  const calls = [];
  let streamUrl;
  const graph = { meta: { title: 'Synthetic' }, nodes: {}, edges: {} };
  Object.defineProperty(globalThis, 'document', { value: { baseURI: PREFIX }, configurable: true });
  const subscription = createGraphSubscription(() => {}, {
    ports: {
      async fetch(url) { calls.push(url); return { ok: true, status: 200, json: async () => graph }; },
      openStream(url) { streamUrl = url; return { addEventListener() {}, onerror: null, close() {} }; },
      now() { return 1; },
    },
  });
  try {
    await subscription.reload();
    assert.deepEqual([...new Set(calls)], [`${PREFIX}api/graph`]);
    assert.equal(streamUrl, `${PREFIX}events`);
    assert.equal(subscription.getState().snapshot.meta.title, 'Synthetic');
  } finally {
    subscription.dispose();
    delete globalThis.document;
  }
});
