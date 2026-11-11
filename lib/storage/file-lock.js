import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const sleepBuf = new Int32Array(new SharedArrayBuffer(4));

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function ownerIsStale(raw, stat) {
  const pid = Number(raw.split('\n')[0]);
  // A slow, live writer keeps its lock regardless of its age.
  if (Number.isInteger(pid) && pid > 0) return !pidAlive(pid);
  return Date.now() - stat.mtimeMs > 30000;
}

function removeOwner(directory, name) {
  // Names are unique and immutable. A replacement directory has a different
  // owner entry, so neither this unlink nor rmdir can remove its live lock.
  const owner = path.join(directory, name);
  try {
    if (fs.lstatSync(owner).isFile()) fs.unlinkSync(owner);
  } catch {}
  try { fs.rmdirSync(directory); } catch {}
}

function reclaimStaleLock(file) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
  if (stat.isFile()) {
    // Legacy locks remain readable. If a new owner publishes a directory
    // after this read, unlink cannot remove that replacement directory.
    try {
      if (ownerIsStale(fs.readFileSync(file, 'utf8'), stat)) {
        fs.unlinkSync(file);
        return true;
      }
    } catch {}
    return false;
  }
  if (!stat.isDirectory()) return false;
  try {
    const entries = fs.readdirSync(file, { withFileTypes: true });
    if (entries.length === 0) {
      if (Date.now() - stat.mtimeMs <= 30000) return false;
    } else {
      if (entries.length !== 1) return false;
      const [entry] = entries;
      if (!entry.isFile() || !/^owner-[a-f0-9]{32}$/.test(entry.name)) return false;
      const owner = path.join(file, entry.name);
      const ownerStat = fs.lstatSync(owner);
      if (!ownerStat.isFile() || !ownerIsStale(fs.readFileSync(owner, 'utf8'), ownerStat)) return false;
      // Reclaim exactly the entry observed above, never the canonical path.
      // Another reaper may already have replaced it with a live directory.
      try { fs.unlinkSync(owner); } catch {}
    }
    fs.rmdirSync(file);
    return true;
  } catch (error) {
    return error.code === 'ENOENT';
  }
}

/** Publish a complete, nonempty directory so live owners cannot be replaced. */
export function withFileLock(file, fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const nonce = crypto.randomBytes(16).toString('hex');
  const name = `owner-${nonce}`;
  const token = `${process.pid}\n${Date.now()}\n${nonce}\n`;
  const candidate = fs.mkdtempSync(`${file}.`);
  let published = false;
  try {
    let fd;
    try {
      fd = fs.openSync(path.join(candidate, name), 'wx');
      fs.writeFileSync(fd, token);
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch {}
      }
    }
    for (;;) {
      if (reclaimStaleLock(file)) {
        try {
          // A live destination always contains its immutable owner entry,
          // making replacement fail atomically instead of moving that owner.
          fs.renameSync(candidate, file);
          published = true;
          break;
        } catch (error) {
          if (!['EEXIST', 'ENOTEMPTY', 'ENOTDIR', 'EISDIR'].includes(error.code)) {
            if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
            // Windows can report permission errors for an occupied destination.
            // A failure without that destination is a real publication error.
            try { fs.lstatSync(file); } catch { throw error; }
          }
        }
      }
      if (Date.now() > deadline) throw new Error('pinwhy lock timeout: another writer is still active');
      Atomics.wait(sleepBuf, 0, 0, 8);
    }
    return fn();
  } finally {
    removeOwner(published ? file : candidate, name);
  }
}
