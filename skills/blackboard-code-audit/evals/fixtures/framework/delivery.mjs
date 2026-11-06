import { config } from './config.mjs';

export function deliver(file, response, storage = config.storage) {
  response.set('Content-Type', 'application/octet-stream');
  response.set('X-Content-Type-Options', 'nosniff');
  if (storage === 'cloud') response.set('Content-Security-Policy', 'sandbox');
  response.attachment(file.originalName);
  return response.send(file.bytes);
}
