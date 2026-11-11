/**
 * A non-blocking stdin pipe can return EAGAIN to a synchronous read once input exceeds the pipe buffer.
 * Reading stops just past `maxBytes`, so the caller still sees an over-limit input without buffering all of it.
 */
export async function readStdin(maxBytes = Infinity) {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > maxBytes) break;
  }
  return Buffer.concat(chunks).toString('utf8');
}