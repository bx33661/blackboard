import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensure, paths } from '../lib/store.js';
import { startServer } from '../lib/server.js';
import { checkForUpdates } from '../lib/release/update.js';

const upstream = (version, extra = {}) => async () => new Response(JSON.stringify({ name: 'pinwhy', version, ...extra }));

test('update detection compares numeric versions, prereleases and build metadata', async () => {
  for (const [currentVersion, latestVersion, status] of [
    ['0.9.9', '0.10.1', 'available'],
    ['0.10.1', '0.10.1', 'current'],
    ['0.11.0', '0.10.1', 'ahead'],
    ['1.0.0-rc.2', '1.0.0-rc.10', 'available'],
    ['1.0.0-rc.10', '1.0.0', 'available'],
    ['1.0.0', '1.0.0-beta', 'ahead'],
    ['1.0.0-alpha', '1.0.0-alpha.1', 'available'],
    ['1.0.0-1', '1.0.0-alpha', 'available'],
    ['1.0.0+local', '1.0.0+upstream', 'current'],
  ]) {
    const result = await checkForUpdates({ currentVersion, fetch: upstream(latestVersion) });
    assert.equal(result.status, status, `${currentVersion} → ${latestVersion}`);
    assert.equal(result.currentVersion, currentVersion);
    assert.equal(result.latestVersion, latestVersion);
  }
});

test('unusable upstream responses fail instead of claiming the installation is current', async () => {
  for (const version of ['1.02.3', '1.0', '1.0.0-01', '', null]) {
    await assert.rejects(checkForUpdates({ currentVersion: '1.0.0', fetch: upstream(version) }));
  }
  await assert.rejects(checkForUpdates({ currentVersion: '1.0.0', fetch: upstream('2.0.0', { name: 'other' }) }));
  await assert.rejects(checkForUpdates({ currentVersion: '1.0.0', fetch: async () => new Response('', { status: 503 }) }), /HTTP 503/);
  await assert.rejects(checkForUpdates({ currentVersion: '1.0.0', fetch: async () => new Response('not json') }));
  await assert.rejects(checkForUpdates({ currentVersion: '1.0.0', fetch: async () => { throw new Error('offline'); } }), /offline/);
});

test('a stalled upstream response is aborted with a timeout error', async () => {
  await assert.rejects(checkForUpdates({
    currentVersion: '1.0.0', timeoutMs: 20,
    fetch: async (_url, { signal }) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    }),
  }));
});

test('read-only HTTP checks report upstream failure and recovery without touching the board', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-update-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  ensure(cwd);
  const board = paths(cwd);
  const before = [fs.readFileSync(board.events), fs.readFileSync(board.state)];
  const localFetch = globalThis.fetch;
  const mock = t.mock.method(globalThis, 'fetch', upstream('9999.0.0'));
  const server = await startServer({ cwd, port: 0, readOnly: true });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = () => localFetch(`${base}/api/update`);
  const success = await get();
  assert.equal(success.status, 200);
  assert.equal(success.headers.get('cache-control'), 'no-store');
  const result = await success.json();
  assert.equal(result.status, 'available');
  assert.equal(result.latestVersion, '9999.0.0');
  mock.mock.mockImplementation(async () => { throw new Error('synthetic unavailable'); });
  const failure = await get();
  assert.equal(failure.status, 502);
  assert.match((await failure.json()).error, /synthetic unavailable/);
  mock.mock.mockImplementation(upstream(result.currentVersion));
  assert.equal((await (await get()).json()).status, 'current');
  assert.deepEqual([fs.readFileSync(board.events), fs.readFileSync(board.state)], before);
});
