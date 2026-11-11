import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { buildInfo } from '../lib/build-info.js';
import { installRelease, useRelease } from '../lib/release.js';
import { probeViewer } from '../lib/service.js';

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-identity-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'source');
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.2.3', files: ['bin', 'public'] }));
  fs.writeFileSync(path.join(root, 'bin', 'pinwhy.js'), 'console.log("synthetic original");\n');
  fs.writeFileSync(path.join(root, 'public', 'index.html'), '<html>Synthetic viewer</html>');
  return { root, home: path.join(base, 'releases'), base };
}

test('content identity survives relocation and installation but distinguishes same-version code and assets', (t) => {
  const { root, home, base } = fixture(t);
  const original = buildInfo({ root, home });
  assert.equal(original.version, '1.2.3');
  assert.equal(original.commit, null);
  assert.equal(original.dirty, null);
  assert.equal(original.origin.kind, 'other');
  const moved = path.join(base, 'moved');
  fs.cpSync(root, moved, { recursive: true });
  assert.equal(buildInfo({ root: moved, home }).buildId, original.buildId);
  const installed = installRelease({ source: root, home });
  const activated = useRelease('1.2.3', home);
  fs.writeFileSync(path.join(installed.dir, '.release.json'), JSON.stringify({
    version: '1.2.3', installedAt: '2099-01-01T00:00:00Z', source: '/synthetic/unavailable/source',
    git: { commit: 'abc1234', dirty: true },
  }));
  const release = buildInfo({ root: installed.dir, cli: activated.cli, home });
  assert.equal(release.buildId, original.buildId);
  assert.equal(release.commit, 'abc1234');
  assert.equal(release.dirty, true);
  assert.deepEqual(release.origin, { kind: 'release', version: '1.2.3', active: true });
  fs.appendFileSync(path.join(moved, 'bin', 'pinwhy.js'), '// changed code\n');
  const changedCode = buildInfo({ root: moved, home });
  assert.notEqual(changedCode.buildId, original.buildId);
  fs.appendFileSync(path.join(moved, 'public', 'index.html'), '<!-- changed asset -->');
  assert.notEqual(buildInfo({ root: moved, home }).buildId, changedCode.buildId);
});


test('viewer probes still accept older status responses without build metadata', async (t) => {
  const { root } = fixture(t);
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ cwd: fs.realpathSync(root), readOnly: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await probeViewer({ cwd: root, port: server.address().port });
    assert.equal(result.state, 'online');
    assert.equal(Object.hasOwn(result, 'build'), false);
  } finally {
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  }
});
