# pinwhy-core

Pinwhy's Node.js SDK for event-sourced Agent memory. Node.js 18 or later; no runtime dependencies.

```sh
npm install pinwhy-core
```

```js
import { ensure, addNode, addEdge, replay, buildAgentContext } from 'pinwhy-core';

const cwd = '/absolute/path/to/your/project';
ensure(cwd); // Explicitly initializes .pinwhy/ when absent.
const goal = addNode({ type: 'goal', title: 'Verify the authorization boundary' }, cwd).node;
const evidence = addNode({ type: 'observation', title: 'Anonymous access returned 403' }, cwd).node;
addEdge({ from: evidence.id, to: goal.id, kind: 'related-to' }, cwd);
const context = buildAgentContext(replay(cwd), { budgetTokens: 4000 });
console.log(context);
```

Creating a node does not implicitly add relations or move the cursor. `.pinwhy/events.jsonl` remains the only source of truth. Context is a read-only, non-prescriptive projection; import alone neither initializes a project nor installs host integrations or services. Store operations use the same file locking, event semantics and request receipts as the CLI. Pass the intended project path explicitly to filesystem operations.

The root entry exports selected model, store, context, search, history and backup operations. Explicit module entries are `pinwhy-core/model`, `/store`, `/context`, `/search`, `/history`, `/backup` and `/contracts`. Only `/model` is browser-safe; the other entries require Node.js. Exports are ESM. The CLI declares its supported schemas and capabilities through `pinwhy capabilities --json`.

Package artifacts are generated from the repository's canonical `lib/` sources by `npm run pack:packages`; no separate kernel copy is maintained here. `pinwhy` is the complete CLI/workspace product; `pinwhy-cli` is its alternate npm executable installation entry; `dsh-pinwhy` is the optional DeepSeek Harness adapter.

The source package manifest is private to prevent publishing an incomplete source directory. Publish the complete tarball produced by `npm run pack:packages`; the generated artifact has its own public manifest and includes the actual SDK modules and license.
