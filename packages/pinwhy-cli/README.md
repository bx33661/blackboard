# pinwhy-cli

Official npm executable installation entry for [Pinwhy](https://github.com/bx33661/pinwhy). Node.js 18 or later.

```sh
npm install --global pinwhy-cli
pinwhy --help
```

`pinwhy-cli` depends on the exact matching `pinwhy` version and executes its real CLI. Commands, JSON contracts, built workspace, Skill resources and release/current installation are the same implementation. It adds no second event store or kernel. Choose either `npm install --global pinwhy` or `npm install --global pinwhy-cli`; both provide the `pinwhy` command.

```sh
cd /path/to/your/project
pinwhy init --title 'My project'
pinwhy node add goal 'Verify the authorization boundary' --enter
pinwhy context
pinwhy serve --open
```

Installing the npm package does not initialize projects, install Skills or Hooks, start services or migrate old data. Those actions require the explicit existing commands. `pinwhy capabilities --json` reports the actual runtime CLI and complete Skill resource paths under `resources`, so integrations can locate them even when the installed executable is this wrapper.

For an importable SDK use `pinwhy-core`. DeepSeek Harness users can separately install `dsh-pinwhy`; the adapter's declared host-version constraints still apply.

The source manifest is private; release the complete tarball from `npm run pack:packages`, which includes the public manifest, executable, README and license.
