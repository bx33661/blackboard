// Historical snapshot: this exact defect has already been fixed in current.mjs.
export function recent(ctx, request, db) {
  return db.exec('SELECT id FROM invoices WHERE owner = ? ORDER BY ' + request.query.sort, [ctx.user.id]);
}
