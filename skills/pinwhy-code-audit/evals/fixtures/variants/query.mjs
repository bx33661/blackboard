function orderFragment(sort) {
  return ' ORDER BY ' + sort;
}

export function statementFor(ownerId, sort, db) {
  return db.adapter.execute({
    text: 'SELECT id FROM invoices WHERE owner = ?' + orderFragment(sort),
    bindings: [ownerId],
  });
}
