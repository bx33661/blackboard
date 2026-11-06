import { statementFor } from './query.mjs';
import { readPreference } from './preferences.mjs';

const columns = new Map([['created', 'created_at'], ['number', 'invoice_no']]);

export function recent(ctx, request, db) {
  const column = columns.get(request.query.sort) || 'created_at';
  return db.exec('SELECT id FROM invoices WHERE owner = ? ORDER BY ' + column, [ctx.user.id]);
}

export async function exportMine(ctx, request, db) {
  const preference = await readPreference(ctx.user.id, db);
  return statementFor(ctx.user.id, preference.sort, db);
}

export async function runScheduled(job, db) {
  const preference = await readPreference(job.ownerId, db);
  return statementFor(job.ownerId, preference.sort, db);
}
