import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensure, addNode, moveCursor, paths } from '../lib/store.js';
import { startServer } from '../lib/server.js';
import { renderExport } from '../lib/export.js';
import { buildInfo } from '../lib/build-info.js';
import { probeViewer } from '../lib/service.js';

// Exercise both public consumers so changing one projection cannot silently fork them.
test('live and offline snapshots agree on surviving focus and graph while offline tool material stays private', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'blackboard-snapshot-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  ensure(cwd);
  const node = addNode({ type: 'note', title: 'Synthetic surviving note' }, cwd).node;
  moveCursor(node.id, { agentId: 'agent:reviewer' }, cwd);
  const board = paths(cwd);
  const activity = {
    id: 'fixture-activity', tool: 'Read', status: 'done', at: 1, linkedNodeIds: [node.id],
    input: 'SYNTHETIC_PRIVATE_INPUT', output: 'SYNTHETIC_PRIVATE_OUTPUT', summary: 'SYNTHETIC_PRIVATE_SUMMARY',
  };
  fs.appendFileSync(board.events, `${JSON.stringify({ eventVersion: 1, op: 'activity', activity })}\n`);
  const state = JSON.parse(fs.readFileSync(board.state, 'utf8'));
  fs.writeFileSync(board.state, JSON.stringify({ ...state, focus: 'missing-node' }));
  const beforeEvents = fs.readFileSync(board.events);
  const beforeState = fs.readFileSync(board.state);
  const server = await startServer({ cwd, port: 0 });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/graph`);
    assert.equal(response.status, 200);
    const live = await response.json();
    const html = renderExport({ cwd });
    const offline = JSON.parse(html.match(/window\.__BLACKBOARD_DATA__ = (.*);/)[1]);
    const status = await (await fetch(`http://127.0.0.1:${server.address().port}/api/status`)).json();
    const probe = await probeViewer({ cwd, port: server.address().port });
    assert.deepEqual(status.build, buildInfo());
    assert.deepEqual(live.meta.build, status.build);
    const { root: _root, ...sharedOrigin } = status.build.origin;
    assert.deepEqual(offline.meta.build, { ...status.build, origin: sharedOrigin });
    assert.equal(Object.hasOwn(offline.meta.build.origin, 'root'), false);
    assert.deepEqual(probe.build, status.build);
    const stream = await fetch(`http://127.0.0.1:${server.address().port}/events`);
    const reader = stream.body.getReader();
    try {
      const decoder = new TextDecoder();
      let frame = '';
      while (!frame.includes('\n\n')) {
        const chunk = await reader.read();
        assert.equal(chunk.done, false);
        frame += decoder.decode(chunk.value, { stream: true });
      }
      assert.deepEqual(JSON.parse(frame.match(/^data: (.*)$/m)[1]).meta.build, status.build);
    } finally { await reader.cancel(); }
    assert.equal(live.meta.focus, null);
    assert.equal(offline.meta.focus, null, 'a missing cached focus must not survive in the offline projection');
    assert.equal(live.meta.writable, true);
    assert.equal(Object.hasOwn(offline.meta, 'writable'), false);
    assert.equal(live.schema, 'blackboard.graph.v2');
    assert.equal(offline.schema, live.schema);
    for (const field of ['nodes', 'edges', 'cursors', 'cursorTrail', 'checkpoints', 'stats', 'digest', 'digests']) {
      assert.deepEqual(offline[field], live[field], field);
    }
    assert.deepEqual(live.activities[activity.id], activity);
    assert.deepEqual(offline.activities[activity.id], {
      id: activity.id, tool: 'Read', status: 'done', at: 1, linkedNodeIds: [node.id],
    });
    assert.doesNotMatch(html, /SYNTHETIC_PRIVATE_(?:INPUT|OUTPUT|SUMMARY)/);
    assert.deepEqual(fs.readFileSync(board.events), beforeEvents);
    assert.deepEqual(fs.readFileSync(board.state), beforeState);
  } finally {
    await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
  }
});
