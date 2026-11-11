import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyNpmPackages } from '../scripts/verify-npm-packages.mjs';

test('published SDK and CLI consumers interoperate through real npm tarballs and preserve events', { timeout: 180000 }, async () => {
  const result = await verifyNpmPackages();
  assert.equal(result.result, 'PASS');
});
