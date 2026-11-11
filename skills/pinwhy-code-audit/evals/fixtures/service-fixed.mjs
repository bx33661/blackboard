// Synthetic fixture-v2 replaces service.mjs. Read-only audit input; do not execute.
export function requireSession(ctx) {
  if (!ctx.session) throw new Error('authentication required');
}

export function tenantForRequest(ctx, req) {
  return ctx.session.tenantId;
}

export async function readInvoice(ctx, req, db) {
  return db.invoices.findOne({
    id: req.params.id,
    tenantId: tenantForRequest(ctx, req),
  });
}

export async function readAttachment(ctx, req, db) {
  return db.attachments.findOne({
    id: req.params.id,
    tenantId: tenantForRequest(ctx, req),
  });
}

export async function readOwnInvoice(ctx, req, db) {
  return db.invoices.findOne({
    id: req.params.id,
    tenantId: ctx.session.tenantId,
  });
}

export function printLabel(ctx, req, runner) {
  return runner.execFile('/usr/bin/printf', ['%s', req.query.label]);
}

export function registerRoutes(app, db, runner) {
  app.get('/invoices/:id', requireSession,
    (ctx, req) => readInvoice(ctx, req, db));
  app.get('/attachments/:id', requireSession,
    (ctx, req) => readAttachment(ctx, req, db));
  app.get('/own-invoices/:id', requireSession,
    (ctx, req) => readOwnInvoice(ctx, req, db));
  app.get('/label', requireSession,
    (ctx, req) => printLabel(ctx, req, runner));
}
