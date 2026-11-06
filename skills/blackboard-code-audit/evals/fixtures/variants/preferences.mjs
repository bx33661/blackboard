export async function savePreference(ctx, request, db) {
  await db.prefs.write(ctx.user.id, { sort: request.body.sort });
  return { saved: true };
}

export function readPreference(ownerId, db) {
  return db.prefs.read(ownerId);
}
