// Synthetic extension. Host binding and authorization are not in this source set.
export function registerExtension(host, runner) {
  host.bind('legacy-maintenance', async (input) => {
    return runner.exec(input.command);
  });
}
