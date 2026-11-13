import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-embedded-test-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--skipLibCheck', '--outDir', dir,
  path.join(root, 'web/src/embedded.ts')], { cwd: dir });
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
const {
  readPresentation, hostAppearance, hostNavigate, hostReferenceResult, onParentMessage,
  applyEmbedFonts, parentOrigin, referenceRequest, NO_FONTS,
} = await import(pathToFileURL(path.join(dir, 'embedded.js')).href);

test('only an embedded page takes appearance, language, type and reference from the host URL', () => {
  const standalone = { embedded: false, appearance: null, locale: null, fonts: NO_FONTS, reference: false };
  assert.deepEqual(readPresentation('?theme=dark&lang=ja&fontFamily=Inter&fontSize=18&reference=1'), standalone);
  assert.deepEqual(readPresentation('?embed=0&theme=dark&lang=ja&fontSize=18&reference=1'), standalone);
  assert.deepEqual(readPresentation('?embed=false&theme=light&reference=1'), standalone);
  assert.deepEqual(readPresentation('?embed=1&theme=dark&lang=ja&fontFamily=Inter&codeFontFamily=JetBrains+Mono&fontSize=18&codeFontSize=12&reference=1'), {
    embedded: true,
    appearance: 'dark',
    locale: 'ja',
    fonts: { fontFamily: 'Inter', codeFontFamily: 'JetBrains Mono', fontSize: 18, codeFontSize: 12 },
    reference: true,
  });
  assert.deepEqual(readPresentation('?embed=1&theme=unknown&lang=fr&fontSize=99&codeFontSize=9&reference=yes'), {
    embedded: true, appearance: null, locale: null, fonts: NO_FONTS, reference: false,
  });
});

test('the embedded language vocabulary is exactly the four shipped interfaces', () => {
  for (const language of ['zh-CN', 'zh-HK', 'en', 'ja']) assert.equal(readPresentation(`?embed=1&lang=${language}`).locale, language);
  for (const language of ['zh-cn', 'zh', 'zh-TW', 'ja-JP', 'EN', 'fr', '']) assert.equal(readPresentation(`?embed=1&lang=${language}`).locale, null);
});

test('type sizes accept only whole numbers inside the host ranges', () => {
  assert.equal(readPresentation('?embed=1&fontSize=10&codeFontSize=10').fonts.fontSize, 10);
  assert.equal(readPresentation('?embed=1&fontSize=22&codeFontSize=16').fonts.fontSize, 22);
  assert.equal(readPresentation('?embed=1&fontSize=23&codeFontSize=17').fonts.fontSize, null);
  assert.equal(readPresentation('?embed=1&fontSize=9&codeFontSize=9').fonts.codeFontSize, null);
  assert.equal(readPresentation('?embed=1&fontSize=12.5').fonts.fontSize, null);
  assert.equal(readPresentation('?embed=1&fontSize=12px').fonts.fontSize, null);
});

test('font families must be a plain family list, never a stylesheet', () => {
  assert.equal(readPresentation('?embed=1&fontFamily=%20Inter%2C%20sans-serif%20').fonts.fontFamily, 'Inter, sans-serif');
  assert.equal(readPresentation('?embed=1&fontFamily=Inter;color:red').fonts.fontFamily, null);
  assert.equal(readPresentation(`?embed=1&fontFamily=${'x'.repeat(161)}`).fonts.fontFamily, null);
});

test('appearance messages apply only known fields from the framing parent', () => {
  assert.deepEqual(hostAppearance({ type: 'pinwhy:appearance', theme: 'dark' }), {
    theme: 'dark', locale: null, fonts: NO_FONTS,
  });
  assert.deepEqual(hostAppearance({ type: 'pinwhy:appearance', locale: 'zh-HK', theme: 'invalid' }), {
    theme: null, locale: 'zh-HK', fonts: NO_FONTS,
  });
  assert.deepEqual(hostAppearance({ type: 'pinwhy:appearance', fontFamily: 'Inter', codeFontFamily: 'Mono', fontSize: 15, codeFontSize: 11 }), {
    theme: null,
    locale: null,
    fonts: { fontFamily: 'Inter', codeFontFamily: 'Mono', fontSize: 15, codeFontSize: 11 },
  });
  assert.deepEqual(hostAppearance({ type: 'pinwhy:appearance', theme: 'light', locale: 'fr', fontSize: 40 }), {
    theme: 'light', locale: null, fonts: NO_FONTS,
  });
  assert.equal(hostAppearance({ type: 'pinwhy:appearance' }), null, 'a message that changes nothing is ignored');
  assert.equal(hostAppearance({ type: 'different', theme: 'dark' }), null);
  assert.equal(hostAppearance(null), null);
  assert.equal(hostAppearance('pinwhy:appearance'), null);
});

test('navigate and reference-result messages are validated before use', () => {
  assert.equal(hostNavigate({ type: 'pinwhy:navigate', nodeId: 'n7' }), 'n7');
  assert.equal(hostNavigate({ type: 'pinwhy:navigate', nodeId: '  n7  ' }), 'n7');
  assert.equal(hostNavigate({ type: 'pinwhy:navigate', nodeId: '' }), null);
  assert.equal(hostNavigate({ type: 'pinwhy:navigate' }), null);
  assert.equal(hostNavigate({ type: 'pinwhy:appearance', nodeId: 'n7' }), null);

  assert.deepEqual(hostReferenceResult({ type: 'pinwhy:reference-result', requestId: 'r1', ok: false, message: ' not writable ' }), {
    requestId: 'r1', ok: false, message: 'not writable',
  });
  assert.deepEqual(hostReferenceResult({ type: 'pinwhy:reference-result', requestId: 'r1', ok: true }), {
    requestId: 'r1', ok: true, message: null,
  });
  assert.equal(hostReferenceResult({ type: 'pinwhy:reference-result', requestId: '', ok: true }), null);
  assert.equal(hostReferenceResult({ type: 'pinwhy:reference-result', requestId: 'r1', ok: 'yes' }), null);
  assert.equal(hostReferenceResult({ type: 'pinwhy:reference', requestId: 'r1', ok: true }), null);

  assert.deepEqual(referenceRequest('n7', 'r1'), { type: 'pinwhy:reference', nodeId: 'n7', requestId: 'r1' });
});

test('only the exact framing window is accepted, and an unmounted embed stops listening', () => {
  const listeners = new Set(), parent = {}, other = {}, seen = [];
  const previous = globalThis.window;
  globalThis.window = {
    parent,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  const emit = (source) => { for (const fn of listeners) fn({ source, data: { type: 'pinwhy:navigate', nodeId: 'n1' } }); };
  try {
    const dispose = onParentMessage((data) => seen.push(hostNavigate(data)));
    emit(other); assert.deepEqual(seen, [], 'a sibling or child frame is never the host');
    emit(undefined); assert.deepEqual(seen, [], 'an anonymous sender is never the host');
    emit(parent); assert.deepEqual(seen, ['n1']);
    dispose(); emit(parent); assert.deepEqual(seen, ['n1']);
  } finally {
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  }
});

test('a page that is its own top window never subscribes', () => {
  const previous = globalThis.window;
  globalThis.window = { parent: null, addEventListener: () => { throw new Error('must not listen'); } };
  try {
    globalThis.window.parent = globalThis.window;
    const dispose = onParentMessage(() => {});
    dispose();
  } finally {
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  }
});

test('the postMessage target is the host origin, never a guessed subdomain', () => {
  assert.equal(parentOrigin('https://host.example/app/view?x=1'), 'https://host.example');
  assert.equal(parentOrigin('http://127.0.0.1:4333/'), 'http://127.0.0.1:4333');
  assert.equal(parentOrigin(''), '*');
  assert.equal(parentOrigin(undefined), '*');
  assert.equal(parentOrigin('null'), '*');
  assert.equal(parentOrigin('not a url'), '*');
});

test('host fonts are applied as removable custom properties', () => {
  const values = new Map();
  const target = {
    style: {
      fontSize: '',
      setProperty: (name, value) => values.set(name, value),
      removeProperty: (name) => values.delete(name),
    },
    dataset: {},
  };
  applyEmbedFonts({ fontFamily: 'Inter, sans-serif', codeFontFamily: 'JetBrains Mono', fontSize: 16, codeFontSize: 12 }, target);
  assert.equal(values.get('--pinwhy-font-sans'), 'Inter, sans-serif');
  assert.equal(values.get('--pinwhy-font-size'), '16px');
  assert.equal(values.get('--pinwhy-code-font'), 'JetBrains Mono');
  assert.equal(values.get('--pinwhy-code-size'), '12px');
  assert.equal(target.style.fontSize, '16px');
  assert.equal(target.dataset.embedCodeFont, '');
  assert.equal(target.dataset.embedCodeSize, '');

  applyEmbedFonts({ ...NO_FONTS, fontFamily: 'Inter' }, target);
  assert.equal(values.has('--pinwhy-font-size'), false, 'unmentioned fields return to the board default');
  assert.equal(values.has('--pinwhy-code-font'), false);
  assert.equal(values.has('--pinwhy-code-size'), false);
  assert.equal(target.style.fontSize, '');
  assert.equal('embedCodeFont' in target.dataset, false);
  assert.equal('embedCodeSize' in target.dataset, false);

  applyEmbedFonts(NO_FONTS, target);
  assert.equal(values.has('--pinwhy-font-sans'), false);
});
