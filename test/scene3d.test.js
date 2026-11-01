import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blackboard-scene3d-tests-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--skipLibCheck', '--outDir', dir, path.join(root, 'web/src/scene3d/model.ts')], { cwd: dir });
// Keep the tests portable on Node 18+ without a TS execution loader.
for (const entry of fs.readdirSync(dir, { recursive: true }).filter((name) => name.endsWith('.js'))) {
  const file = path.join(dir, entry);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (_all, name) => `from '${name}.js'`));
}
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
const { boardBounds, bootDepths, chamfer, chipHeight, homeFrame, ratedSeverity, resample, ribbonStrip, sceneTraces, shapeKey, traceArrowhead, traceCourse, tracesKey, visibleTraces } = await import(pathToFileURL(path.join(dir, 'scene3d/model.js')).href);

const W = 2.88, D = 1.28;
/** x and z are the chip's centre, as sceneLayout places it. */
const block = (id, x, z, severity) => ({
  id, x, z, w: W, d: D, height: chipHeight(severity),
  node: { position: { x: (x - W / 2) * 100, y: (z - D / 2) * 100 }, data: { item: { severity } } },
});

test('chip height ranks recorded severity and leaves an unknown level unranked', () => {
  const [unset, low, medium, high, critical] = [undefined, 'low', 'medium', 'high', 'critical'].map(chipHeight);
  assert.ok(unset < low && low < medium && medium < high && high < critical);
  const unknown = chipHeight('authored-level');
  assert.ok(unknown > low && unknown < medium);
  assert.equal(chipHeight('constructor'), unknown);
});

test('only the four ranked levels count as rated', () => {
  assert.equal(ratedSeverity('critical'), 'critical');
  for (const level of ['info', 'authored-level', '', null, undefined, 'constructor']) assert.equal(ratedSeverity(level), null, String(level));
});

test('chamfering cuts corners at 45° and keeps the ends and straight runs', () => {
  const line = chamfer([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 6, y: 3 }], 0.2);
  assert.deepEqual(line[0], { x: 0, y: 0 });
  assert.deepEqual(line.at(-1), { x: 6, y: 3 });
  assert.equal(line.length, 6);
  for (let i = 1; i < line.length; i++) {
    const dx = Math.abs(line[i].x - line[i - 1].x), dy = Math.abs(line[i].y - line[i - 1].y);
    assert.ok(dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-9, `segment ${i} is neither straight nor 45°`);
  }
  assert.equal(chamfer([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }], 0.2).length, 3, 'a collinear point is no corner');
});

test('a chamfer on a short run never passes the middle of that run', () => {
  const line = chamfer([{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 5 }], 0.2);
  assert.ok(line[1].x >= 0.05 - 1e-9);
});

test('a trace follows the ELK route to the chip edges while that route still matches, and turns square otherwise', () => {
  const a = block('a', 1.44, 0.64), b = block('b', 7.44, 0.64);
  const route = { points: [{ x: 288, y: 64 }, { x: 450, y: 64 }, { x: 450, y: 400 }, { x: 600, y: 400 }, { x: 600, y: 64 }], source: a.node.position, target: b.node.position, direction: 'RIGHT' };
  const routed = traceCourse(a, b, route);
  assert.deepEqual(routed[0], { x: 2.88, y: 0.64 });
  assert.deepEqual(routed.at(-1), { x: 6, y: 0.64 });
  assert.ok(Math.max(...routed.map((point) => point.y)) > 3.5, 'follows the bend');

  const stale = traceCourse(a, b, { ...route, source: { x: 0, y: 999 } });
  assert.ok(Math.max(...stale.map((point) => point.y)) < 0.7, 'a stale route is dropped');
  assert.deepEqual(stale[0], { x: 2.88, y: 0.64 });
  assert.deepEqual(stale.at(-1), { x: 6, y: 0.64 });
});

test('without a route a trace leaves the facing edges, in any direction', () => {
  const a = block('a', 0, 0), left = block('l', -8, 2), below = block('b', 1, 6);
  assert.deepEqual(traceCourse(a, left, undefined)[0], { x: -W / 2, y: 0 });
  assert.deepEqual(traceCourse(a, left, undefined).at(-1), { x: -8 + W / 2, y: 2 });
  assert.deepEqual(traceCourse(a, below, undefined)[0], { x: 0, y: D / 2 });
  assert.deepEqual(traceCourse(a, below, undefined).at(-1), { x: 1, y: 6 - D / 2 });
});

test('a signal path is evenly spaced and ends where the trace ends', () => {
  const line = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }];
  const samples = resample(line);
  assert.deepEqual([samples[0][0], samples[0][2]], [0, 0]);
  assert.deepEqual([samples.at(-1)[0], samples.at(-1)[2]], [3, 1]);
  const gaps = samples.slice(1).map((point, i) => Math.hypot(point[0] - samples[i][0], point[2] - samples[i][2]));
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.12);
});

test('relations to cards off the board draw no trace', () => {
  const edges = [{ id: 'in', source: 'a', target: 'b', data: {} }, { id: 'out', source: 'a', target: 'gone', data: {} }];
  assert.deepEqual(sceneTraces(edges, [block('a', 0, 0), block('b', 6, 0)]).map((trace) => trace.id), ['in']);
});

test('the home framing keeps every corner of a wide, deep or tall board inside the frame, and centred', () => {
  const fov = 38, polar = 0.92, azimuth = -0.42;
  for (const [w, d, top, aspect] of [[40, 8, 5, 1.6], [8, 30, 5, 1.6], [12, 12, 8, 0.7]]) {
    const bounds = { cx: 3, cz: -2, w, d, radius: Math.hypot(w, d) / 2 };
    const { position, target } = homeFrame(bounds, top, aspect, fov, polar, azimuth);
    const sub = (a, b) => a.map((value, i) => value - b[i]);
    const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    const forward = sub(target, position), length = Math.hypot(...forward);
    const f = forward.map((value) => value / length);
    const flat = Math.hypot(f[0], f[2]), right = [-f[2] / flat, 0, f[0] / flat];
    const up = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
    const tan = Math.tan((fov / 2) * Math.PI / 180);
    const xs = [], ys = [];
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) for (const y of [0, top]) {
      const offset = sub([3 + x, y, -2 + z], position), depth = dot(offset, f);
      xs.push(dot(offset, right) / depth / (tan * aspect));
      ys.push(dot(offset, up) / depth / tan);
    }
    for (const value of [...xs, ...ys]) assert.ok(Math.abs(value) < 1, `${w}x${d}: ${value}`);
    assert.ok(Math.abs(Math.min(...ys) + Math.max(...ys)) < 0.02, 'vertically centred');
    assert.ok(Math.max(Math.max(...xs), Math.max(...ys)) > 0.7, 'not needlessly far away');
  }
});

test('the board is rebuilt when a chip moves or its severity changes, and not for a content-only tick', () => {
  const key = shapeKey([block('a', 1, 2, 'high'), block('b', 4, 2)]);
  const retitled = block('a', 1, 2, 'high');
  retitled.node.data.item.title = 'edited';
  assert.equal(shapeKey([retitled, block('b', 4, 2)]), key);
  assert.notEqual(shapeKey([block('a', 1, 2, 'critical'), block('b', 4, 2)]), key);
  assert.notEqual(shapeKey([block('a', 1, 3, 'high'), block('b', 4, 2)]), key);
  const edge = { id: 'e', source: 'a', target: 'b', data: { group: 'support', route: { points: [] } } };
  assert.equal(tracesKey([{ ...edge, label: 'renamed' }]), tracesKey([edge]));
  assert.notEqual(tracesKey([{ ...edge, data: { group: 'oppose' } }]), tracesKey([edge]));
});

test('traces follow the flat canvas: quiet ones and the overview wait for a selection', () => {
  const strong = { id: 's', source: 'a', target: 'b', quiet: false };
  const quiet = { id: 'q', source: 'b', target: 'c', quiet: true };
  const ids = (selected, overview) => visibleTraces([strong, quiet], selected, overview).map((trace) => trace.id);
  assert.deepEqual(ids(null, false), ['s']);
  assert.deepEqual(ids('c', false), ['s', 'q']);
  assert.deepEqual(ids(null, true), []);
  assert.deepEqual(ids('a', true), ['s']);
});

test('power-on spreads from the goals along relations, and unconnected chips come on last', () => {
  const chip = (id, type) => ({ ...block(id, 0, 0), id, node: { position: { x: 0, y: 0 }, data: { item: { type } } } });
  const blocks = [chip('leaf', 'fact'), chip('goal', 'goal'), chip('mid', 'hypothesis'), chip('lone', 'note')];
  const depths = bootDepths(blocks, [{ source: 'goal', target: 'mid' }, { source: 'leaf', target: 'mid' }]);
  assert.ok(depths.get('goal') < depths.get('mid') && depths.get('mid') < depths.get('leaf'));
  assert.equal(depths.get('goal'), 0);
  assert.equal(depths.get('lone'), 1);
  assert.equal(bootDepths([chip('a', 'fact'), chip('b', 'fact')], []).get('a'), 0, 'without goals the first chip starts');
});

test('a trace strip keeps its width through a corner and measures its length', () => {
  const strip = ribbonStrip([[0, 0, 0], [2, 0, 0], [2, 0, 3]], 0.1);
  assert.equal(strip.length, 5);
  assert.deepEqual(strip.along, [0, 0, 2, 2, 5, 5]);
  assert.deepEqual(strip.side, [-1, 1, -1, 1, -1, 1]);
  const p = strip.positions;
  assert.ok(Math.abs(Math.hypot(p[3] - p[0], p[5] - p[2]) - 0.2) < 1e-9, 'a straight end is exactly the width');
  assert.ok(Math.abs(Math.hypot(p[9] - p[6], p[11] - p[8]) - 0.2 * Math.SQRT2) < 1e-9, 'a right-angle mitre reaches √2 further');
  for (const value of p) assert.ok(Number.isFinite(value));
});

test('direction arrows anchor to the recorded destination and follow its final run', () => {
  const points = [[0, 0.2, 0], [0, 0.2, 0], [3, 0.2, 0], [3, 0.2, 4], [3, 0.2, 4]];
  for (const reversed of [false, true]) {
    const arrow = traceArrowhead(points, reversed, 0.4, 0.12);
    assert.ok(arrow);
    const tip = arrow.positions.slice(0, 3), left = arrow.positions.slice(3, 6), right = arrow.positions.slice(6, 9);
    assert.deepEqual(tip, reversed ? points[0] : points.at(-1));
    const base = left.map((value, i) => (value + right[i]) / 2);
    assert.deepEqual(base, reversed ? [0.4, 0.2, 0] : [3, 0.2, 3.6]);
    assert.ok(Math.abs(Math.hypot(left[0] - right[0], left[2] - right[2]) - 0.24) < 1e-9);
    assert.deepEqual(arrow.setbacks, [0, 0.4, 0.4]);
    const up = (left[2] - tip[2]) * (right[0] - tip[0]) - (left[0] - tip[0]) * (right[2] - tip[2]);
    assert.ok(up > 0, 'both directions face the camera above the board');
    assert.deepEqual(arrow, traceArrowhead([...points].reverse(), !reversed, 0.4, 0.12));
  }
});

test('short arrowheads scale to the terminal run without spanning a corner', () => {
  const arrow = traceArrowhead([[0, 0, 0], [2, 0, 0], [2, 0, 0.02]], false, 0.4, 0.12);
  assert.ok(arrow);
  assert.deepEqual(arrow.positions.slice(0, 3), [2, 0, 0.02]);
  assert.equal(arrow.positions[5], 0);
  assert.equal(arrow.positions[8], 0);
  assert.deepEqual(arrow.setbacks, [0, 0.02, 0.02]);
  assert.ok(Math.abs(Math.abs(arrow.positions[6] - arrow.positions[3]) - 0.012) < 1e-9, 'width shrinks with length');
  assert.ok(arrow.positions.every(Number.isFinite));
});

test('arrowheads omit collapsed paths and stay finite next to degenerate boundaries', () => {
  for (const reversed of [false, true]) {
    for (const points of [[], [[1, 0, 2]], [[1, 0, 2], [1, 0, 2]], [[0, 0, 0], [1e-12, 0, 0]]]) {
      assert.equal(traceArrowhead(points, reversed, 0.4, 0.12), null);
    }
    for (const distance of [1e-5, 0.399999, 0.4, 0.400001]) {
      const points = [[0, 0, 0], [0, 0, 0], [distance, 0, 0], [distance, 0, 0]];
      const arrow = traceArrowhead(points, reversed, 0.4, 0.12);
      assert.ok(arrow);
      assert.ok(arrow.positions.every(Number.isFinite));
      assert.ok(arrow.setbacks.every((value) => Number.isFinite(value) && value >= 0 && value <= distance));
      assert.ok(arrow.positions.filter((_value, i) => i % 3 === 0).every((x) => x >= 0 && x <= distance));
    }
  }
});

test('the board extends past the chips on every side and stays centred', () => {
  const inner = { cx: 2, cz: 3, w: 10, d: 4, radius: 5 };
  const outer = boardBounds(inner);
  assert.ok(outer.w > inner.w && outer.d > inner.d);
  assert.ok(Math.abs((outer.w - inner.w) - (outer.d - inner.d)) < 1e-9);
  assert.deepEqual([outer.cx, outer.cz], [2, 3]);
});
