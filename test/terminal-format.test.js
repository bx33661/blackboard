import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, displayWidth, table } from '../lib/cli/format.js';

test('terminal widths account for wide glyphs, combining marks, emoji and ANSI', () => {
  assert.equal(displayWidth('审计 ab'), 7);
  assert.equal(displayWidth('e\u0301'), 1);
  assert.equal(displayWidth('👩‍💻'), 2);
  assert.equal(displayWidth('🇨🇳'), 2);
  assert.equal(displayWidth('\x1b[31m中文\x1b[0m'), 4);
});

test('table columns align after mixed-width labels without cutting values', () => {
  const rows = [['中', 'first'], ['ab', 'second'], ['e\u0301', 'third'], ['👩‍💻', 'fourth']];
  const lines = table(['ID', 'Value'], rows);
  for (let index = 0; index < rows.length; index++) {
    const line = cleanText(lines[index + 1]);
    assert.equal(displayWidth(line.slice(0, line.indexOf(rows[index][1]))), 4);
    assert.ok(line.endsWith(rows[index][1]));
  }
  const full = '/synthetic/' + '中文路径/'.repeat(40) + 'report.md';
  assert.ok(table(['Path'], [[full]])[1].includes(full));
});

test('authored terminal escapes are inert while multiline text survives', () => {
  const authored = 'Before\r\n\x1b]8;;https://example.test\x1b\\Evidence\x1b]8;;\x1b\\\x1b[2J\x00 after';
  assert.equal(cleanText(authored), 'Before\nEvidence after');
});
