// Synthetic source; do not execute.
export function allowed(user, doc, action) {
  if (user.teamId !== doc.teamId) return false;
  if (action === 'read') return doc.ownerId === user.id || user.groups.includes(doc.groupId);
  if (action === 'remove') return doc.ownerId === user.id || user.role === 'admin';
  return false;
}

export async function resolveFor(user, id, action, store) {
  const doc = await store.get(id);
  if (!doc || !allowed(user, doc, action)) throw new Error('not allowed');
  return doc;
}
