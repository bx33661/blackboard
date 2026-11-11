// Development subprocesses must not inherit another project's pinwhy selection.
export function isolatedPinwhyEnv(overrides = {}, source = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith('PINWHY_')) env[key] = value;
  }
  return { ...env, ...overrides };
}
