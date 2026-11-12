import { addNode, patchNode, addEdge, removeNode, removeEdge, parseLocation } from '../store.js';
import { projectNode } from '../model.js';
import { validateRequestId } from '../receipts.js';
import { OUTPUTS } from '../contracts.js';
import { json, readBody } from './request.js';

const STRING_PATCHABLE = ['title', 'detail', 'status', 'severity', 'confidence'];
const PATCHABLE = [...STRING_PATCHABLE, 'tags', 'at'];

/** What a person can do from the viewer. Every write is stamped with who made it. */
export async function handleWrite(req, res, url, cwd, author) {
  const p = url.pathname;
  const body = await readBody(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'body must be a JSON object' });
  if (Object.hasOwn(body, 'rejectTruncation') && typeof body.rejectTruncation !== 'boolean') {
    return json(res, 400, { error: 'rejectTruncation must be a boolean' });
  }
  // Opt-in input protection: older clients retain their original bounded-write contract.
  const inputProtection = body.rejectTruncation === true ? { rejectTruncation: true } : {};
  const headerId = req.headers['idempotency-key'];
  const bodyHasId = Object.hasOwn(body, 'requestId');
  const headerHasId = headerId !== undefined;
  let requestId;
  if (headerHasId || bodyHasId) {
    // Explicit IDs are validated, not trimmed, generated, or silently ignored.
    if ((headerHasId && !validateRequestId(headerId)) || (bodyHasId && !validateRequestId(body.requestId))) {
      return json(res, 400, { error: 'requestId must be a non-empty string' });
    }
    if (headerHasId && bodyHasId && headerId !== body.requestId) return json(res, 400, { error: 'request_id_mismatch' });
    requestId = headerHasId ? headerId : body.requestId;
  }
  const take = (value) => (typeof value === 'string' ? value : undefined);
  if (req.method === 'POST' && p === '/api/nodes') {
    const type = Object.hasOwn(body, 'type') ? body.type : 'note';
    if (typeof type !== 'string' || !type.trim()) return json(res, 400, { error: 'type must be a non-empty string' });
    if (!take(body.title)?.trim()) return json(res, 400, { error: 'title is required' });
    if (Object.hasOwn(body, 'parent') && Object.hasOwn(body, 'target')) return json(res, 400, { error: 'parent and target cannot be combined' });
    if (Object.hasOwn(body, 'target') && (typeof body.target !== 'string' || !body.target.trim())) return json(res, 400, { error: 'target must be a non-empty string' });
    for (const key of ['detail', 'parent', 'relation', 'status', 'severity', 'confidence', 'at', 'label']) {
      if (Object.hasOwn(body, key) && typeof body[key] !== 'string') return json(res, 400, { error: `${key} must be a string` });
    }
    if (Object.hasOwn(body, 'tags') && (!Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== 'string'))) {
      return json(res, 400, { error: 'tags must be an array of strings' });
    }
    if (body.at && !parseLocation(body.at)) return json(res, 400, { error: 'at must be a file location' });
    // Relation names and node types are conventions, not closed lists.
    const result = addNode({
      type, title: body.title.trim(), detail: body.detail || '', parent: body.parent || null,
      ...(Object.hasOwn(body, 'target') ? { target: body.target } : {}),
      relation: body.relation || null, status: body.status || null,
      ...Object.fromEntries(['severity', 'confidence', 'tags', 'at', 'label'].filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]])),
      author, requestId, ...inputProtection,
    }, cwd);
    return json(res, 201, { schema: OUTPUTS.node.schema, ...result, node: projectNode(result.node) });
  }
  const nodeMatch = /^\/api\/nodes\/([^/]+)$/.exec(p);
  if (nodeMatch) {
    const ref = decodeURIComponent(nodeMatch[1]);
    if (req.method === 'PATCH') {
      const set = {};
      for (const key of STRING_PATCHABLE) {
        if (!Object.hasOwn(body, key)) continue;
        if (body[key] !== null && typeof body[key] !== 'string') return json(res, 400, { error: `${key} must be a string or null` });
        set[key] = body[key] ?? '';
      }
      if (Object.hasOwn(body, 'tags')) {
        if (body.tags !== null && (!Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== 'string'))) {
          return json(res, 400, { error: 'tags must be an array of strings or null' });
        }
        set.tags = body.tags === null ? [] : body.tags;
      }
      if (Object.hasOwn(body, 'at')) {
        if (body.at !== null && typeof body.at !== 'string') return json(res, 400, { error: 'at must be a string or null' });
        const loc = parseLocation(body.at);
        if (body.at && !loc) return json(res, 400, { error: 'at must be a file location' });
        set.loc = loc;
      }
      if (!Object.keys(set).length) return json(res, 400, { error: `nothing to change; allowed: ${PATCHABLE.join(', ')}` });
      // Empty enum values clear the field, matching the store's null clear contract.
      for (const key of ['status', 'severity', 'confidence']) if (set[key] === '') set[key] = null;
      let expected;
      if (Object.hasOwn(body, 'expected')) {
        if (!body.expected || typeof body.expected !== 'object' || Array.isArray(body.expected)) {
          return json(res, 400, { error: 'expected must be an object of original values for patched fields' });
        }
        expected = {};
        for (const [key, value] of Object.entries(body.expected)) {
          if (key === 'tags' && Object.hasOwn(set, 'tags')) {
            if (value !== null && (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string'))) {
              return json(res, 400, { error: 'expected.tags must be an array of strings or null' });
            }
            expected.tags = value;
          } else if (key === 'at' && Object.hasOwn(set, 'loc')) {
            if (value !== null && typeof value !== 'string') return json(res, 400, { error: 'expected.at must be a string or null' });
            const loc = parseLocation(value);
            if (value && !loc) return json(res, 400, { error: 'expected.at must be a file location' });
            expected.loc = loc;
          } else if (STRING_PATCHABLE.includes(key) && Object.hasOwn(set, key) && typeof value === 'string') {
            expected[key] = value;
          } else {
            return json(res, 400, { error: 'expected must contain original values for patched fields' });
          }
        }
      }
      const result = patchNode(ref, set, cwd, { by: author, expected, requestId, ...inputProtection });
      return json(res, 200, { ...projectNode(result), schema: OUTPUTS.edit.schema });
    }
    if (req.method === 'DELETE') return json(res, 200, removeNode(ref, { by: author, requestId }, cwd));
  }
  if (req.method === 'POST' && p === '/api/edges') {
    // Same rule as /api/nodes and the CLI: any non-empty relation name; empty falls back to related-to.
    for (const key of ['kind', 'label']) {
      if (Object.hasOwn(body, key) && typeof body[key] !== 'string') return json(res, 400, { error: `${key} must be a string` });
    }
    const kind = body.kind || 'related-to';
    if (!take(body.from)?.trim() || !take(body.to)?.trim()) return json(res, 400, { error: 'from and to are required strings' });
    return json(res, 201, addEdge({ from: body.from, to: body.to, kind, ...(Object.hasOwn(body, 'label') ? { label: body.label } : {}), author, requestId, ...inputProtection }, cwd));
  }
  if (req.method === 'DELETE' && p === '/api/edges') {
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id is required' });
    return json(res, 200, removeEdge({ id }, { by: author, requestId }, cwd));
  }
  return json(res, 404, { error: 'not_found' });
}
