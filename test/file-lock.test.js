import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withFileLock } from '../lib/storage/file-lock.js';

const deadPid = 2147483647;
const liveToken = `${process.pid}\n1\nsynthetic-live-owner\n`;
const deadToken = `${deadPid}\n1\nsynthetic-dead-owner\n`;

function replace(t, object, method, implementation) {
  const original = object[method];
  object[method] = implementation(original);
  t.after(() => { object[method] = original; });
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-file-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  replace(t, process, 'kill', (original) => function(pid, signal) {
    if (pid === deadPid) throw Object.assign(new Error('synthetic dead process'), { code: 'ESRCH' });
    return original.call(this, pid, signal);
  });
  return { directory, file: path.join(directory, 'writer.lock') };
}

function prepareOwner(file, digit, token = liveToken) {
  const directory = fs.mkdtempSync(`${file}.fixture-`);
  const name = `owner-${digit.repeat(32)}`;
  fs.writeFileSync(path.join(directory, name), token);
  return { directory, name, token };
}

function publishOwner(file, digit, token = liveToken) {
  const owner = prepareOwner(file, digit, token);
  fs.renameSync(owner.directory, file);
  return owner;
}

function assertOwner(file, owner) {
  assert.equal(fs.lstatSync(file).isDirectory(), true);
  assert.deepEqual(fs.readdirSync(file), [owner.name]);
  assert.equal(fs.readFileSync(path.join(file, owner.name), 'utf8'), owner.token);
}

function assertNoCandidates(directory, file) {
  assert.equal(fs.readdirSync(directory).some((name) => name.startsWith(`${path.basename(file)}.`)), false);
}

test('a callback sees a fully published owner and releases its directory on return or error', (t) => {
  const { directory, file } = fixture(t);
  assert.equal(withFileLock(file, () => {
    assert.equal(fs.lstatSync(file).isDirectory(), true);
    const names = fs.readdirSync(file);
    assert.equal(names.length, 1);
    assert.match(names[0], /^owner-[a-f0-9]{32}$/);
    assert.equal(fs.readFileSync(path.join(file, names[0]), 'utf8').split('\n')[0], String(process.pid));
    assertNoCandidates(directory, file);
    return 'held';
  }, 100), 'held');
  assert.equal(fs.existsSync(file), false);
  assert.throws(() => withFileLock(file, () => { throw new Error('synthetic callback failure'); }, 100), /synthetic callback failure/);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test('failed publication closes the owner descriptor and removes its candidate', (t) => {
  const { directory, file } = fixture(t);
  let descriptor;
  replace(t, fs, 'openSync', (original) => function(target, flags, ...args) {
    const fd = original.call(this, target, flags, ...args);
    if (flags === 'wx' && path.dirname(target).startsWith(`${file}.`)) descriptor = fd;
    return fd;
  });
  replace(t, fs, 'renameSync', (original) => function(source, destination) {
    if (destination === file) throw Object.assign(new Error('synthetic publication failure'), { code: 'EIO' });
    return original.call(this, source, destination);
  });
  assert.throws(() => withFileLock(file, () => assert.fail('publication must fail'), 100), { code: 'EIO' });
  assert.notEqual(descriptor, undefined);
  assert.throws(() => fs.fstatSync(descriptor), { code: 'EBADF' });
  assert.deepEqual(fs.readdirSync(directory), []);
});

for (const legacy of [false, true]) {
  test(`an ancient live ${legacy ? 'legacy file' : 'directory'} owner retains its lock until timeout`, (t) => {
    const { directory, file } = fixture(t);
    const owner = legacy ? null : publishOwner(file, 'a');
    if (legacy) fs.writeFileSync(file, liveToken);
    fs.utimesSync(legacy ? file : path.join(file, owner.name), new Date(0), new Date(0));
    fs.utimesSync(file, new Date(0), new Date(0));
    assert.throws(() => withFileLock(file, () => assert.fail('live owner must remain'), 1), /lock timeout/);
    if (legacy) assert.equal(fs.readFileSync(file, 'utf8'), liveToken);
    else assertOwner(file, owner);
    assertNoCandidates(directory, file);
  });

  test(`a crashed ${legacy ? 'legacy file' : 'directory'} owner is reclaimed`, (t) => {
    const { directory, file } = fixture(t);
    if (legacy) fs.writeFileSync(file, deadToken);
    else publishOwner(file, 'a', deadToken);
    assert.equal(withFileLock(file, () => 'reclaimed', 100), 'reclaimed');
    assert.deepEqual(fs.readdirSync(directory), []);
  });

  for (const old of [false, true]) {
    test(`a ${old ? 'stale' : 'fresh'} invalid ${legacy ? 'legacy file' : 'directory'} token ${old ? 'can be reclaimed' : 'keeps its grace period'}`, (t) => {
      const { directory, file } = fixture(t);
      const owner = legacy ? null : publishOwner(file, 'a', 'invalid owner\n');
      if (legacy) fs.writeFileSync(file, 'invalid owner\n');
      if (old) fs.utimesSync(legacy ? file : path.join(file, owner.name), new Date(0), new Date(0));
      if (old) {
        assert.equal(withFileLock(file, () => 'reclaimed', 100), 'reclaimed');
        assert.deepEqual(fs.readdirSync(directory), []);
      } else {
        assert.throws(() => withFileLock(file, () => assert.fail('fresh invalid token must remain'), 1), /lock timeout/);
        if (legacy) assert.equal(fs.readFileSync(file, 'utf8'), 'invalid owner\n');
        else assertOwner(file, owner);
        assertNoCandidates(directory, file);
      }
    });
  }
}

for (const old of [false, true]) {
  test(`an ${old ? 'old' : 'empty fresh'} directory ${old ? 'is reclaimed' : 'keeps its 30 second grace period'}`, (t) => {
    const { directory, file } = fixture(t);
    fs.mkdirSync(file);
    if (old) fs.utimesSync(file, new Date(0), new Date(0));
    if (old) {
      assert.equal(withFileLock(file, () => 'reclaimed', 100), 'reclaimed');
      assert.deepEqual(fs.readdirSync(directory), []);
    } else {
      assert.throws(() => withFileLock(file, () => assert.fail('fresh empty directory must remain'), 1), /lock timeout/);
      assert.deepEqual(fs.readdirSync(file), []);
      assertNoCandidates(directory, file);
    }
  });
}

for (const point of ['unlink', 'rmdir']) {
  test(`stale recovery preserves a live replacement published before ${point}`, (t) => {
    const { directory, file } = fixture(t);
    const stale = publishOwner(file, 'a', deadToken);
    const replacement = prepareOwner(file, 'b');
    const stalePath = path.join(file, stale.name);
    let swapped = false;
    if (point === 'unlink') {
      replace(t, fs, 'unlinkSync', (original) => function(target) {
        if (target === stalePath && !swapped) {
          swapped = true;
          original.call(this, target);
          fs.rmdirSync(file);
          fs.renameSync(replacement.directory, file);
        }
        return original.call(this, target);
      });
    } else {
      replace(t, fs, 'rmdirSync', (original) => function(target, ...args) {
        if (target === file && !swapped) {
          swapped = true;
          original.call(this, target, ...args);
          fs.renameSync(replacement.directory, file);
        }
        return original.call(this, target, ...args);
      });
    }
    assert.throws(() => withFileLock(file, () => assert.fail('replacement owner must remain'), 1), /lock timeout/);
    assert.equal(swapped, true);
    assertOwner(file, replacement);
    assertNoCandidates(directory, file);
  });
}

test('two reapers that observe the same dead token acquire sequentially', (t) => {
  const { directory, file } = fixture(t);
  const stale = publishOwner(file, 'a', deadToken);
  const stalePath = path.join(file, stale.name);
  const order = [];
  let staleReads = 0;
  let interleaved = false;
  replace(t, fs, 'readFileSync', (original) => function(target, ...args) {
    if (target === stalePath) staleReads++;
    return original.call(this, target, ...args);
  });
  replace(t, fs, 'unlinkSync', (original) => function(target) {
    if (target === stalePath && !interleaved) {
      interleaved = true;
      withFileLock(file, () => {
        order.push('second enters');
        const [name] = fs.readdirSync(file);
        assert.notEqual(name, stale.name);
        assert.throws(() => withFileLock(file, () => assert.fail('second reaper owns the lock'), 1), /lock timeout/);
        assert.deepEqual(fs.readdirSync(file), [name]);
        order.push('second exits');
      }, 100);
    }
    return original.call(this, target);
  });
  withFileLock(file, () => { order.push('first enters'); }, 100);
  assert.equal(staleReads, 2);
  assert.deepEqual(order, ['second enters', 'second exits', 'first enters']);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test('legacy stale cleanup cannot unlink a newly published directory owner', (t) => {
  const { directory, file } = fixture(t);
  fs.writeFileSync(file, deadToken);
  const replacement = prepareOwner(file, 'b');
  let swapped = false;
  replace(t, fs, 'unlinkSync', (original) => function(target) {
    if (target === file && !swapped) {
      swapped = true;
      original.call(this, target);
      fs.renameSync(replacement.directory, file);
    }
    return original.call(this, target);
  });
  assert.throws(() => withFileLock(file, () => assert.fail('replacement owner must remain'), 1), /lock timeout/);
  assert.equal(swapped, true);
  assertOwner(file, replacement);
  assertNoCandidates(directory, file);
});

for (const point of ['unlink', 'rmdir']) {
  test(`release preserves a live replacement published before ${point}`, (t) => {
    const { directory, file } = fixture(t);
    const replacement = prepareOwner(file, 'b');
    let swapped = false;
    assert.equal(withFileLock(file, () => {
      const [name] = fs.readdirSync(file);
      const own = path.join(file, name);
      if (point === 'unlink') {
        replace(t, fs, 'unlinkSync', (original) => function(target) {
          if (target === own && !swapped) {
            swapped = true;
            original.call(this, target);
            fs.rmdirSync(file);
            fs.renameSync(replacement.directory, file);
          }
          return original.call(this, target);
        });
      } else {
        replace(t, fs, 'rmdirSync', (original) => function(target, ...args) {
          if (target === file && !swapped) {
            swapped = true;
            original.call(this, target, ...args);
            fs.renameSync(replacement.directory, file);
          }
          return original.call(this, target, ...args);
        });
      }
      return 'callback result';
    }, 100), 'callback result');
    assert.equal(swapped, true);
    assertOwner(file, replacement);
    assertNoCandidates(directory, file);
  });
}

for (const location of ['canonical', 'owner']) {
  test(`unexpected ${location} symlinks are preserved`, (t) => {
    const { directory, file } = fixture(t);
    const target = path.join(directory, 'foreign');
    const name = `owner-${'a'.repeat(32)}`;
    if (location === 'canonical') {
      fs.mkdirSync(target);
      fs.writeFileSync(path.join(target, name), deadToken);
      fs.symlinkSync(target, file);
    } else {
      fs.writeFileSync(target, deadToken);
      fs.mkdirSync(file);
      fs.symlinkSync(target, path.join(file, name));
    }
    const link = location === 'canonical' ? file : path.join(file, name);
    assert.throws(() => withFileLock(file, () => assert.fail('unexpected symlink must remain'), 1), /lock timeout/);
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(location === 'canonical' ? path.join(target, name) : target, 'utf8'), deadToken);
    assertNoCandidates(directory, file);
  });
}

test('release does not delete an unexpected symlink at its owner entry', (t) => {
  const { directory, file } = fixture(t);
  const target = path.join(directory, 'foreign');
  fs.writeFileSync(target, liveToken);
  let own;
  withFileLock(file, () => {
    own = path.join(file, fs.readdirSync(file)[0]);
    fs.unlinkSync(own);
    fs.symlinkSync(target, own);
  }, 100);
  assert.equal(fs.lstatSync(own).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(target, 'utf8'), liveToken);
  assertNoCandidates(directory, file);
});

test('unexpected entries prevent recovery without deleting even a stale owner', (t) => {
  const { directory, file } = fixture(t);
  const stale = publishOwner(file, 'a', deadToken);
  fs.writeFileSync(path.join(file, 'unexpected'), 'synthetic foreign entry');
  assert.throws(() => withFileLock(file, () => assert.fail('unknown entries must remain'), 1), /lock timeout/);
  assert.equal(fs.readFileSync(path.join(file, stale.name), 'utf8'), deadToken);
  assert.equal(fs.readFileSync(path.join(file, 'unexpected'), 'utf8'), 'synthetic foreign entry');
  assertNoCandidates(directory, file);
});

for (const code of ['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES']) {
  test(`a publication collision reported as ${code} preserves the live destination and cleans its candidate`, (t) => {
    const { directory, file } = fixture(t);
    const replacement = prepareOwner(file, 'b');
    let published = false;
    replace(t, fs, 'renameSync', (original) => function(source, destination) {
      if (destination === file && !published) {
        published = true;
        original.call(this, replacement.directory, file);
        throw Object.assign(new Error('synthetic publication collision'), { code });
      }
      return original.call(this, source, destination);
    });
    assert.throws(() => withFileLock(file, () => assert.fail('live destination must remain'), 1), /lock timeout/);
    assert.equal(published, true);
    assertOwner(file, replacement);
    assertNoCandidates(directory, file);
  });
}

for (const code of ['EPERM', 'EACCES']) {
  test(`a publication ${code} without a destination propagates and cleans its candidate`, (t) => {
    const { directory, file } = fixture(t);
    replace(t, fs, 'renameSync', (original) => function(source, destination) {
      if (destination === file) throw Object.assign(new Error('synthetic permission failure'), { code });
      return original.call(this, source, destination);
    });
    assert.throws(() => withFileLock(file, () => assert.fail('publication must fail'), 100), { code });
    assert.deepEqual(fs.readdirSync(directory), []);
  });
}

test('repeated stale recovery and publication collisions still honor the deadline', (t) => {
  const { directory, file } = fixture(t);
  let clock = 1700000000000;
  let collisions = 0;
  replace(t, Date, 'now', () => () => clock++);
  replace(t, fs, 'renameSync', (original) => function(source, destination) {
    if (destination === file) {
      if (++collisions > 10) throw new Error('deadline was not enforced');
      fs.mkdirSync(file);
      fs.writeFileSync(path.join(file, `owner-${'a'.repeat(32)}`), deadToken);
      throw Object.assign(new Error('synthetic repeated collision'), { code: 'EEXIST' });
    }
    return original.call(this, source, destination);
  });
  assert.throws(() => withFileLock(file, () => assert.fail('publication always collides'), 4), /lock timeout/);
  assert.ok(collisions > 1 && collisions <= 10);
  assert.equal(fs.readFileSync(path.join(file, `owner-${'a'.repeat(32)}`), 'utf8'), deadToken);
  assertNoCandidates(directory, file);
});

test('an empty legacy lock keeps its grace period and can then be reclaimed', (t) => {
  const { directory, file } = fixture(t);
  fs.writeFileSync(file, '');
  assert.throws(() => withFileLock(file, () => assert.fail('fresh empty legacy lock must remain'), 1), /lock timeout/);
  assert.equal(fs.readFileSync(file, 'utf8'), '');
  assertNoCandidates(directory, file);
  fs.utimesSync(file, new Date(0), new Date(0));
  assert.equal(withFileLock(file, () => 'reclaimed', 100), 'reclaimed');
  assert.deepEqual(fs.readdirSync(directory), []);
});
