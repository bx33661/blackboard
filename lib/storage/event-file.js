import fs from 'node:fs';

/** Read the observed byte range completely, allowing short reads and early EOF. */
export function readEventBytes(file, fromByte) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size <= fromByte) return { bytes: null, size };
    const bytes = Buffer.alloc(size - fromByte);
    let read = 0;
    while (read < bytes.length) {
      const count = fs.readSync(fd, bytes, read, bytes.length - read, fromByte + read);
      if (count === 0) break;
      read += count;
    }
    return { bytes: read === bytes.length ? bytes : bytes.subarray(0, read), size };
  } finally {
    fs.closeSync(fd);
  }
}

/** Preserve complete records regardless of tail length; never truncate after a failed scan. */
export function repairTornTail(file) {
  if (!fs.existsSync(file)) return;
  const fd = fs.openSync(file, 'r+');
  try {
    const size = fs.fstatSync(fd).size;
    if (!size) return;
    const last = Buffer.allocUnsafe(1);
    if (fs.readSync(fd, last, 0, 1, size - 1) !== 1) {
      throw Object.assign(new Error('Unexpected EOF while repairing event log'), { code: 'EIO' });
    }
    if (last[0] === 0x0a) return;
    const tail = Buffer.allocUnsafe(Math.min(size, 64 * 1024));
    let end = size;
    while (end > 0) {
      const start = Math.max(0, end - tail.length);
      const length = end - start;
      let read = 0;
      while (read < length) {
        const count = fs.readSync(fd, tail, read, length - read, start + read);
        if (count === 0) {
          throw Object.assign(new Error('Unexpected EOF while repairing event log'), { code: 'EIO' });
        }
        read += count;
      }
      const nl = tail.lastIndexOf(0x0a, length - 1);
      if (nl !== -1) {
        fs.ftruncateSync(fd, start + nl + 1);
        return;
      }
      end = start;
    }
    fs.ftruncateSync(fd, 0);
  } finally {
    fs.closeSync(fd);
  }
}

