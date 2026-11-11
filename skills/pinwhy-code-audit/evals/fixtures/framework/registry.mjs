import { resolveFor } from './access.mjs';
import { readOne, removeOne, exportMany } from './api.mjs';

export const routes = [
  { method: 'GET', path: '/documents/:id', policy: 'read', handler: readOne },
  { method: 'DELETE', path: '/documents/:id', policy: 'remove', handler: removeOne },
  { method: 'POST', path: '/documents/export', policy: null, handler: exportMany },
];

export async function dispatch(ctx, request, route, store) {
  if (!ctx.user) throw new Error('login required');
  const doc = route.policy
    ? await resolveFor(ctx.user, request.params.id, route.policy, store)
    : null;
  return route.handler(ctx, request, store, doc);
}
