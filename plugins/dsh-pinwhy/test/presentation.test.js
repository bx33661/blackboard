import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { presentationMeta, presenters } from '../src/presentation.js';

const element = (type, props, ...children) => ({ type, props: props ?? {}, children });
const settle = async () => { for (let index = 0; index < 4; index += 1) await Promise.resolve(); };

function find(tree, match) {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = find(child, match);
      if (found) return found;
    }
    return null;
  }
  if (tree === null || typeof tree !== 'object') return null;
  if (match(tree)) return tree;
  return find(tree.children, match);
}

/** Minimal hook runtime: one component instance, explicit renders, no reconciler. */
function hooks() {
  const slots = [];
  let cursor = 0;
  const same = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = {
    Fragment: 'fragment',
    createElement: element,
    useState(initial) {
      const index = cursor++;
      if (slots[index] === undefined) slots[index] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
      const slot = slots[index];
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useEffect(run, deps) {
      const index = cursor++;
      const previous = slots[index];
      slots[index] = { kind: 'effect', run, deps, cleanup: previous?.cleanup, stale: previous === undefined || !same(previous.deps, deps) };
    },
  };
  react.mount = (Component, initial) => {
    let props = initial, tree;
    const settleEffects = () => {
      for (const slot of slots) {
        if (slot?.kind !== 'effect' || !slot.stale) continue;
        slot.stale = false;
        if (typeof slot.cleanup === 'function') slot.cleanup();
        slot.cleanup = slot.run();
      }
    };
    return {
      update(next) { props = next; },
      render() { cursor = 0; tree = Component(props); settleEffects(); return tree; },
    };
  };
  return react;
}

function client(react = { createElement: element, Fragment: 'fragment' }) {
  let registration; let materialized = false;
  const code = fs.readFile(new URL('../client/index.js', import.meta.url), 'utf8');
  return code.then(source => {
    vm.runInNewContext(source, { window: { __ModuleLoader__: { load: entry => { registration = entry; } } }, URL, AbortController, console });
    assert.equal(materialized, false);
    assert.equal(registration.id, 'dsh-pinwhy');
    return registration.factory(name => { assert.equal(name, 'react'); materialized = true; return react; });
  });
}

function installClient(plugin, overrides = {}) {
  const registered = [], effects = [], commands = [], opened = [];
  const context = {
    effect: factory => effects.push(factory()),
    on: () => () => {},
    locale: { register: () => () => {}, bind: () => key => key, getSnapshot: () => ({ active: 'en' }), subscribe: () => () => {} },
    theme: { getTheme: () => ({ active: { colorScheme: 'light' }, fontSizes: { text: 14, code: 11 }, fontFamilies: { text: '', code: '' } }) },
    shortcuts: { register: command => { commands.push(command); return () => {}; } },
    slots: { inject: (_name, factory) => factory(), register: (options, component) => { registered.push({ options, component }); return () => {}; } },
    connection: { rpc: { call: () => { throw new Error('unexpected transport'); } } },
    layout: { selectPanel: id => opened.push(id) },
    uiSession: { adapter: { current: { getSnapshot: () => ({ key: 'one' }) } } },
    sessions: { retain: () => { throw new Error('unexpected Session acquisition'); } },
    uiWorkspace: { openSession: id => opened.push(id) },
    ...overrides,
  };
  plugin.apply(context);
  const main = registered.find(entry => entry.options.name === 'main').component({});
  return { context, main, registered, commands, opened };
}
test('UI metadata is bounded, replayable and does not mutate canonical output', () => {
  const args = { type: 'finding', title: 'a'.repeat(1000) };
  const value = { boardRoot: '/project', agentId: 'dsh:a', data: { node: { id: 'f1', title: 'a'.repeat(1000) } }, diagnostics: '' };
  const original = JSON.stringify(value);
  const first = presentationMeta('pinwhy_node_add', args, value);
  assert.equal(first.pinwhy.summary.length, 320);
  assert.deepEqual(first, presentationMeta('pinwhy_node_add', args, value));
  assert.equal(JSON.stringify(value), original);
  const content = [{ type: 'text', text: 'Original failure' }];
  assert.deepEqual(presenters('pinwhy_node_add').presentResult({}, { content, isError: true }).content, content);
});
test('both native menus open the board while preserving the invoking Session', async () => {
  const plugin = await client(), registered = [], effects = [], opened = [], dismissed = [];
  plugin.apply({
    effect: factory => effects.push(factory()),
    locale: { register: () => () => {}, bind: () => key => key },
    slots: { inject: (_slot, factory) => factory(), register: (options, component) => registered.push({ options, component }) },
    connection: { rpc: { call: () => { throw new Error('no transport'); } } },
    layout: { selectPanel: id => opened.push(['panel', id]) },
    uiSession: { adapter: { current: { getSnapshot: () => ({ key: 'session-one' }) } } },
    sessions: { retain: () => { throw new Error('no read until mounted'); } },
    shortcuts: { register: () => () => {} },
  });
  assert.equal(registered.filter(r => r.options.name === 'tool.call.toolview').length, 11);
  assert.equal(registered.some(r => r.options.name === 'conversation.input.left'), false);
  const main = registered.find(r => r.options.name === 'main').component({});
  const global = registered.find(r => r.options.name === 'sidebar.panellist.actions').component({ t: key => key, onDismiss: () => dismissed.push('global') });
  find(plugin.test.MenuEntry(global.props), node => node?.props?.['data-pinwhy-global-entry']).props.onClick();
  assert.equal(main.props.selection.getSnapshot(), 'session-one');
  assert.deepEqual(opened, [['panel', 'pinwhy']]);
  const local = registered.find(r => r.options.name === 'conversation.session.header.views.actions').component({
    t: key => key, onDismiss: () => dismissed.push('conversation'), onOpen: id => opened.push(['view', id]),
  });
  find(plugin.test.MenuEntry(local.props), node => node?.props?.['data-pinwhy-conversation-entry']).props.onClick();
  assert.deepEqual(opened, [['panel', 'pinwhy'], ['view', 'pinwhy']]);
  assert.deepEqual(dismissed, ['global', 'conversation']);
  for (const dispose of effects.reverse()) await dispose?.();
});
test('configuration submits only changed fields and clears optional runtime overrides via unset', async () => {
  const { initial, edits } = (await client()).test;
  const base = initial({ runtimeCli: '/release/current/bin/pinwhy.js' });
  assert.equal(edits(base, base).length, 0);
  const result = edits({ ...base, runtimeCli: '', projects: [{ workspace: '/p', boardRoot: '' }] }, base);
  assert.equal(JSON.stringify(result), JSON.stringify([
    { op: 'set', path: ['projects'], value: [{ workspace: '/p' }] },
    { op: 'unset', path: ['runtimeCli'] },
  ]));
});
test('card parser rejects foreign, oversized, incomplete and malformed diagnosis metadata', async () => {
  const { cardMeta } = (await client()).test;
  const good = presentationMeta('pinwhy_node_add', { title: '<script>not HTML</script>' }, { data: { node: { id: 'n1' } } });
  assert.equal(cardMeta({ meta: good }, 'pinwhy_node_add').nodeId, 'n1');
  assert.equal(cardMeta({ meta: good }, 'pinwhy_cursor'), null);
  assert.equal(cardMeta({ meta: { pinwhy: { ...good.pinwhy, summary: 2 } } }, 'pinwhy_node_add'), null);
  const diagnosis = presentationMeta('pinwhy_diagnose', {}, { readyToRead: false, readyToWrite: false, checks: [] });
  assert.ok(cardMeta({ meta: diagnosis }, 'pinwhy_diagnose'));
  diagnosis.pinwhy.checks = [null];
  assert.equal(cardMeta({ meta: diagnosis }, 'pinwhy_diagnose'), null);
});
test('failed and old recorded calls retain raw content instead of showing success facts', async () => {
  const { ToolCard } = (await client()).test;
  const props = { toolName: 'pinwhy_node_add', phase: 'result', t: key => key, block: { isError: true, content: [{ type: 'text', text: 'WRITE_POLICY denied' }] } };
  const tree = JSON.stringify(ToolCard(props));
  assert.match(tree, /WRITE_POLICY denied/); assert.match(tree, /failed/); assert.doesNotMatch(tree, /done/);
  assert.match(JSON.stringify(ToolCard({ ...props, block: { isError: false, content: [{ type: 'text', text: 'old result' }] } })), /old result/);
});
test('viewer addresses stay inside the Host viewer mount or an absolute loopback origin', async () => {
  const { viewerUrl, viewerValue, viewerFailure } = (await client()).test;
  for (const url of ['/pinwhy-viewer/abc123/', 'http://127.0.0.1:4310/pinwhy-viewer/abc123/', 'https://localhost:4310/pinwhy-viewer/abc123/', 'http://[::1]:4310/pinwhy-viewer/abc123/']) {
    assert.equal(viewerUrl(url), url);
  }
  for (const url of ['', '/pinwhy-viewer/', '/pinwhy-viewer/../secret/', '//evil.example/pinwhy-viewer/x/', 'https://evil.example/pinwhy-viewer/x/', 'javascript:alert(1)', 'data:text/html,x', '/other/token/', 42, null]) {
    assert.equal(viewerUrl(url), null);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(viewerValue({ url: '/pinwhy-viewer/abc123/', boardRoot: '/project', agentId: 'dsh:one', viewerId: 'viewer-1' }))),
    { url: '/pinwhy-viewer/abc123/', boardRoot: '/project', agentId: 'dsh:one', viewerId: 'viewer-1' });
  assert.equal(viewerValue({ url: '/pinwhy-viewer/abc123/', boardRoot: '/project', agentId: 'dsh:one' }), null);
  assert.equal(viewerValue({ url: 'https://evil.example/pinwhy-viewer/x/', boardRoot: '/p', agentId: 'a', viewerId: 'v' }), null);
  assert.equal(viewerValue(null), null);
  assert.deepEqual(JSON.parse(JSON.stringify(viewerFailure({ code: 'VIEWER_FORBIDDEN', message: 'not the owner' }))), { code: 'VIEWER_FORBIDDEN', message: 'not the owner' });
  assert.equal(viewerFailure(new Error('socket closed')).code, 'VIEWER_UNAVAILABLE');
});
test('viewer tab opens per session, ignores stale results and never renders the previous session frame', async () => {
  const runtime = hooks();
  const plugin = await client(runtime);
  const calls = [];
  const openViewer = (sessionId, signal) => new Promise((resolve, reject) => { calls.push({ sessionId, signal, resolve, reject }); });
  const view = runtime.mount(plugin.test.ViewerPanel, { sessionId: 'one', t: key => key, openViewer });

  let tree = view.render();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sessionId, 'one');
  assert.equal(typeof calls[0].signal.aborted, 'boolean');
  assert.match(JSON.stringify(tree), /viewerLoading/);
  assert.doesNotMatch(JSON.stringify(tree), /iframe/);

  calls[0].resolve({ ok: true, value: { url: '/pinwhy-viewer/token-one/', boardRoot: '/project/one', agentId: 'dsh:one', viewerId: 'viewer-one' } });
  await settle();
  tree = view.render();
  assert.match(JSON.stringify(tree), /pinwhy-viewer\/token-one\//);
  assert.match(JSON.stringify(tree), /\/project\/one/);
  assert.match(JSON.stringify(tree), /readOnlyBadge/);
  assert.match(JSON.stringify(tree), /"iframe"/);

  view.update({ sessionId: 'two', t: key => key, openViewer });
  tree = view.render();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].sessionId, 'two');
  assert.equal(calls[0].signal.aborted, true);
  assert.doesNotMatch(JSON.stringify(tree), /token-one/);
  assert.ok(find(tree, node => node?.props?.['data-pinwhy-viewer-status'] === 'loading'));

  calls[0].resolve({ ok: true, value: { url: '/pinwhy-viewer/token-stale/', boardRoot: '/project/one', agentId: 'dsh:one', viewerId: 'viewer-stale' } });
  await settle();
  assert.doesNotMatch(JSON.stringify(view.render()), /token-stale/);

  calls[1].resolve({ ok: false, error: { code: 'VIEWER_FORBIDDEN', message: 'session is not the owner', details: {} } });
  await settle();
  tree = view.render();
  assert.match(JSON.stringify(tree), /VIEWER_FORBIDDEN/);
  assert.match(JSON.stringify(tree), /session is not the owner/);
  assert.match(JSON.stringify(tree), /viewerReconnect/);
  assert.doesNotMatch(JSON.stringify(tree), /"iframe"/);

  find(tree, node => node?.props?.className === 'pinwhy-viewer-retry').props.onClick();
  tree = view.render();
  assert.equal(calls.length, 3);
  assert.equal(calls[2].sessionId, 'two');
  assert.doesNotMatch(JSON.stringify(tree), /VIEWER_FORBIDDEN/);
  assert.match(JSON.stringify(tree), /viewerLoading/);

  calls[2].resolve({ ok: true, value: { url: 'http://127.0.0.1:4590/pinwhy-viewer/token-two/', boardRoot: '/project/two', agentId: 'dsh:two', viewerId: 'viewer-two' } });
  await settle();
  tree = view.render();
  assert.match(JSON.stringify(tree), /127\.0\.0\.1:4590\/pinwhy-viewer\/token-two\//);
  assert.match(JSON.stringify(tree), /\/project\/two/);
});

test('a global board waits for its exact Session reference and releases an abandoned selection', async () => {
  const runtime = hooks(), plugin = await client(runtime), references = [], calls = [];
  const retainSession = id => {
    let resolve;
    const reference = { id, ready: new Promise(done => { resolve = done; }), release: () => { reference.released = true; }, resolve: () => resolve() };
    references.push(reference);
    return reference;
  };
  const openViewer = async id => { calls.push(id); return { ok: true, value: { url: `/pinwhy-viewer/${id}/`, boardRoot: `/project/${id}`, agentId: `dsh:${id}`, viewerId: id } }; };
  const view = runtime.mount(plugin.test.ViewerPanel, { sessionId: 'one', t: key => key, openViewer, retainSession });
  view.render();
  assert.deepEqual(calls, []);
  view.update({ sessionId: 'two', t: key => key, openViewer, retainSession }); view.render();
  assert.equal(references[0].released, true);
  references[0].resolve(); await settle();
  assert.deepEqual(calls, []);
  references[1].resolve(); await settle();
  assert.deepEqual(calls, ['two']);
  const frame = find(view.render(), node => node?.type === 'iframe');
  const url = new URL(frame.props.src, 'http://host.invalid');
  assert.equal(url.pathname, '/pinwhy-viewer/two/');
  assert.equal(url.searchParams.get('embed'), '1');
  assert.equal(url.searchParams.get('theme'), 'light');
});

test('reloading a reused viewer replaces its document and stays busy until that document loads', async () => {
  const runtime = hooks(), plugin = await client(runtime);
  const value = { url: '/pinwhy-viewer/reused/', boardRoot: '/project', agentId: 'dsh:one', viewerId: 'reused' };
  const view = runtime.mount(plugin.test.ViewerPanel, { sessionId: 'one', t: key => key, openViewer: async () => ({ ok: true, value }) });
  view.render(); await settle();
  let tree = view.render();
  const first = find(tree, node => node?.type === 'iframe');
  assert.equal(tree.props['aria-busy'], true);
  first.props.onLoad();
  tree = view.render();
  assert.equal(tree.props['aria-busy'], false);
  find(tree, node => node?.props?.['data-pinwhy-reload']).props.onClick();
  view.render(); await settle();
  tree = view.render();
  const second = find(tree, node => node?.type === 'iframe');
  assert.equal(second.props.src, first.props.src);
  assert.notEqual(second.props.key, first.props.key);
  assert.equal(tree.props['aria-busy'], true);
  second.props.onLoad();
  assert.equal(view.render().props['aria-busy'], false);
});

test('project groups preserve Host order and keep a retained selection outside the catalog', async () => {
  const plugin = await client({ createElement: element, useSyncExternalStore: (_subscribe, get) => get() });
  const selection = plugin.test.createPanelSelection();
  selection.select('retained');
  const catalog = { ids: ['newer', 'older'], byId: {
    older: { id: 'older', displayTitle: 'Same title', cwd: '/repos/alpha' },
    newer: { id: 'newer', displayTitle: 'Same title', cwd: '/repos/alpha' },
    retained: { id: 'retained', displayTitle: 'Same title', cwd: '/repos/beta' },
    unrelated: { id: 'unrelated', displayTitle: 'Unlisted reference', cwd: '/repos/other' },
  } };
  const tree = plugin.test.GlobalPanel({ useSessions: select => select(catalog), t: key => key, selection });
  const picker = find(tree, node => node?.type === 'select');
  const groups = picker.children.slice(1);
  assert.deepEqual(Array.from(groups, group => group.props.label), ['alpha', 'beta']);
  assert.deepEqual(Array.from(groups[0].children, option => option.props.value), ['newer', 'older']);
  assert.equal(find(tree, node => node?.type === 'option' && node.props.value === 'retained').children[0], 'Same title');
  assert.equal(find(tree, node => node?.type === 'option' && node.props.value === 'unrelated'), null);
  assert.equal(picker.props.title, '/repos/beta');
});

test('recorded tool cards navigate with their own Session and complete board identity', async () => {
  const plugin = await client();
  const state = installClient(plugin, { uiSession: { adapter: { current: { getSnapshot: () => ({ key: 'other' }) } } } });
  const boardRoot = `/project/${'long-directory/'.repeat(30)}`;
  const meta = presentationMeta('pinwhy_node_get', { id: 'n1' }, { boardRoot, agentId: 'dsh:one', data: { node: { id: 'n1', title: 'Recorded node' } } });
  const entry = state.registered.find(entry => entry.options.key === 'pinwhy_node_get');
  const wrapped = entry.component({ toolName: 'pinwhy_node_get', sessionId: 'one', phase: 'result', t: key => key, block: { isError: false, meta } });
  const card = plugin.test.ToolCard(wrapped.props);
  find(card, node => node?.props?.['data-pinwhy-node-link'] === 'n1').props.onClick();
  assert.equal(state.main.props.selection.getSnapshot(), 'one');
  assert.equal(state.main.props.selection.getFocusSnapshot().nodeId, 'n1');
  assert.equal(state.main.props.selection.getFocusSnapshot().boardRoot, boardRoot);
  assert.deepEqual(state.opened, ['pinwhy']);
});

test('pin actions delegate to Host navigation state without opening the board', async () => {
  const plugin = await client(), changes = [];
  const base = { t: key => key, onDismiss: () => {}, open: () => { throw new Error('pinning must not open'); },
    onPinnedChange: (id, pinned) => changes.push([id, pinned]) };
  const visible = plugin.test.MenuEntry({ ...base, kind: 'conversation', entries: [] });
  find(visible, node => node?.props?.['data-pinwhy-pin']).props.onClick();
  const hidden = plugin.test.MenuEntry({ ...base, kind: 'conversation', entries: [{ id: 'pinwhy', pinned: false }] });
  find(hidden, node => node?.props?.['data-pinwhy-pin']).props.onClick();
  assert.deepEqual(changes, [['pinwhy', false], ['pinwhy', true]]);
  assert.equal(find(hidden, node => node?.props?.['data-pinwhy-conversation-entry']), null);
  assert.equal(plugin.test.MenuEntry({ ...base, kind: 'global', entries: [{ id: 'pinwhy', pinned: false }] }), null);
});

test('the native shortcut captures its Session when the Host resolves the gesture', async () => {
  const plugin = await client(); let current = 'one';
  const state = installClient(plugin, { uiSession: { adapter: { current: { getSnapshot: () => ({ key: current }) } } } });
  const command = state.commands.find(command => command.id === 'pinwhy.openBoard');
  const resolution = command.resolve({ region: 'page', modal: null });
  current = 'two'; resolution.run();
  assert.equal(state.main.props.selection.getSnapshot(), 'one');
  assert.equal(Object.keys(command.defaults).length, 0);
});

test('references reread the canonical node and edit only the owning draft after cancellation checks', async () => {
  const plugin = await client(), quotes = [], scopes = [], released = [], requests = [];
  let answer;
  const node = { id: 'n1', title: 'Literal recorded claim', detail: 'Evidence stays exact: $() <data>', status: null };
  const state = installClient(plugin, {
    sessions: { retain: id => ({ ready: Promise.resolve(), release: () => released.push(id) }), scope: id => { scopes.push(id); return { id }; } },
    connection: { rpc: { call: (_path, method, payload) => { requests.push({ method, payload }); return new Promise(resolve => { answer = resolve; }); } } },
    conversation: { input: { for: scope => ({ insertQuote: text => { quotes.push({ id: scope.id, text }); return true; }, focus: () => {} }) }, send: () => { throw new Error('references must not send'); } },
  });
  const controller = new AbortController();
  const pending = state.main.props.referenceNode('one', 'n1', '/project/one', controller.signal);
  await settle();
  answer({ ok: true, value: { boardRoot: '/project/one', node } }); await pending;
  assert.equal(requests[0].method, 'pinwhy/node.read');
  assert.equal(requests[0].payload.sessionId, 'one');
  assert.deepEqual(scopes, ['one']);
  assert.equal(quotes[0].id, 'one');
  assert.ok(quotes[0].text.endsWith(JSON.stringify(node, null, 2)));
  assert.deepEqual(released, ['one']);
  const cancelled = new AbortController();
  const abandoned = state.main.props.referenceNode('two', 'n1', '/project/two', cancelled.signal);
  await settle(); cancelled.abort();
  answer({ ok: true, value: { boardRoot: '/project/two', node } });
  await assert.rejects(abandoned, { name: 'AbortError' });
  assert.equal(quotes.length, 1);
  assert.deepEqual(released, ['one', 'two']);
  const foreign = state.main.props.referenceNode('one', 'n1', '/project/one', new AbortController().signal);
  await settle(); answer({ ok: true, value: { boardRoot: '/project/other', node } });
  await assert.rejects(foreign, /unavailable/);
  assert.equal(quotes.length, 1);
});
