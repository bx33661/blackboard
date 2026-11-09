const REPOSITORY = 'https://github.com/bx33661/pinwhy';
const SOURCE = 'https://raw.githubusercontent.com/bx33661/pinwhy/main/package.json';
const NUMBER = '(?:0|[1-9]\\d*)';
const IDENTIFIER = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
const SEMVER = new RegExp(`^(${NUMBER})\\.(${NUMBER})\\.(${NUMBER})(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);

function parseVersion(version) {
  const match = typeof version === 'string' && SEMVER.exec(version);
  if (!match) throw new Error('Invalid version; cannot compare updates');
  return { core: match.slice(1, 4).map(BigInt), pre: match[4]?.split('.') ?? [] };
}

function compareVersions(left, right) {
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] > right.core[i] ? 1 : -1;
  }
  if (!left.pre.length || !right.pre.length) return Number(!left.pre.length) - Number(!right.pre.length);
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const a = left.pre[i];
    const b = right.pre[i];
    if (a === b) continue;
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return BigInt(a) > BigInt(b) ? 1 : -1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}

/** Compare the running package with the official source-install channel; never writes local state. */
export async function checkForUpdates({ currentVersion, fetch: fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  const current = parseVersion(currentVersion);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(SOURCE, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
    const pkg = await response.json();
    if (pkg?.name !== 'pinwhy') throw new Error('Upstream package name does not match');
    const comparison = compareVersions(current, parseVersion(pkg.version));
    return {
      schema: 'pinwhy.update-check.v1',
      currentVersion,
      latestVersion: pkg.version,
      status: comparison < 0 ? 'available' : comparison > 0 ? 'ahead' : 'current',
      source: SOURCE,
      updateUrl: `${REPOSITORY}/blob/main/docs/USAGE.md#release`,
    };
  } catch (error) {
    throw new Error(controller.signal.aborted ? 'Update check timed out; try again later' : `Update check failed: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}
