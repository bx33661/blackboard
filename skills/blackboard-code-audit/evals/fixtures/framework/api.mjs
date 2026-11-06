export function readOne(ctx, request, store, doc) {
  return doc;
}

export async function removeOne(ctx, request, store, doc) {
  await store.remove(doc.id);
  return { removed: true };
}

export async function exportMany(ctx, request, store) {
  const docs = await store.findByIds(request.body.ids);
  return docs.filter(doc => doc.teamId === ctx.user.teamId);
}
