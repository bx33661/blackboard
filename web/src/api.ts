import { t } from './i18n';
import { endpoint } from './endpoint';
import type { CheckpointChanges, GraphSnapshot, NodeHistory, UpdateCheck } from './types';
import { isGraphSnapshot } from './workspace/graph-stream';

/** Writes a person makes from the viewer. The server stamps them as human and checks where they came from. */
export type NodeInput = { type: string; title: string; detail?: string; parent?: string; target?: string; relation?: string; label?: string; tags?: string[]; at?: string; status?: string; severity?: string; confidence?: string };
type PatchFields = Partial<Record<'title' | 'detail', string>> & Partial<Record<'status' | 'severity' | 'confidence' | 'at', string | null>> & { tags?: string[] | null };
export type NodePatch = PatchFields & { expected?: PatchFields };

export class NodeConflict extends Error {
  public fields: string[];
  constructor(fields: string[]) {
    super(t('edit.conflict'));
    this.fields = fields.map((field) => field === 'loc' ? 'at' : field);
  }
}

async function send<T>(method: string, url: string, body?: unknown, requestId?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint(url), { method, headers: { 'Content-Type': 'application/json', ...(requestId ? { 'Idempotency-Key': requestId } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw Object.assign(new Error(t('api.noResponse')), { code: 'no_response' });
  }
  let data: unknown;
  try { data = await response.json(); }
  catch { /* An unreadable error body still has a useful HTTP status. */ }
  const envelope = data !== null && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
  if (!response.ok) {
    if (response.status === 409 && envelope?.error === 'node_conflict') {
      throw new NodeConflict(Array.isArray(envelope.fields) ? envelope.fields.filter((field): field is string => typeof field === 'string') : []);
    }
    if (envelope?.code === 'input_too_long' || envelope?.error === 'input_too_long') {
      const labels: Record<string, string> = { title: t('edit.title'), detail: t('edit.detail') };
      const fields = Array.isArray(envelope.fields) ? envelope.fields.filter((field): field is string => typeof field === 'string').map((field) => Object.hasOwn(labels, field) ? labels[field] : field).join(', ') : '';
      throw Object.assign(new Error(t('api.inputTooLong', { fields })), { status: response.status, definitive: true });
    }
    const ref = typeof envelope?.asOf === 'string' ? envelope.asOf : typeof envelope?.since === 'string' ? envelope.since : '';
    const message = envelope?.error === 'read_only' ? t('api.readOnly')
      : envelope?.error === 'checkpoint_not_found' ? t('api.checkpointNotFound', { id: ref })
      : envelope?.code === 'ambiguous_ref' ? t('api.ambiguousRef', { id: ref, candidates: Array.isArray(envelope.candidates) ? envelope.candidates.filter((item): item is string => typeof item === 'string').join(', ') : '' })
      : typeof envelope?.error === 'string' && envelope.error ? envelope.error : t('api.failed', { status: response.status });
    const reason = typeof envelope?.error === 'string' ? envelope.error : '';
    const definitive = [403, 413, 415].includes(response.status) || envelope?.code === 'ambiguous_ref'
      || /^(?:body must be a JSON object|parent and target cannot be combined|nothing to change;|title is required|from and to are required strings|id is required|invalid (?:node state|severity|confidence):|no such (?:node|source node|target node|relation):)/.test(reason)
      || /^(?:type|detail|parent|target|relation|status|severity|confidence|at|label|tags|kind|rejectTruncation|expected(?:\.[a-z]+)?) must (?:be|contain)/.test(reason);
    throw Object.assign(new Error(message), { status: response.status, definitive });
  }
  if (!envelope) {
    throw Object.assign(new Error(t('api.invalidResponse', { status: response.status })), { code: 'invalid_response', status: response.status });
  }
  return data as T;
}

type Command = 'addNode' | 'patchNode' | 'addEdge' | 'removeNode' | 'removeEdge';
type WriteSpec = { command: Command; method: string; url: string; body?: unknown; id?: string };
type OriginalRequest = WriteSpec & { requestId: string; serialized?: string };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasId = (value: unknown): value is Record<string, unknown> & { id: string } => record(value) && typeof value.id === 'string' && value.id.length > 0;

function validResult(request: OriginalRequest, result: unknown): boolean {
  if (!record(result)) return false;
  const body = request.body as Record<string, unknown> | undefined;
  if (request.command === 'addNode') {
    if (!hasId(result.node) || typeof result.node.title !== 'string' || typeof result.node.type !== 'string'
      || !Array.isArray(result.edges) || !result.edges.every(hasId)) return false;
    const nodeId = result.node.id;
    if (body?.target || body?.parent) return result.edges.length === 1 && result.edges.some((edge) =>
      record(edge) && edge.from === (body.target ? nodeId : body.parent)
      && edge.to === (body.target || nodeId) && edge.kind === (body.relation || 'related-to'));
    return result.edges.length === 0;
  }
  if (!hasId(result) || (request.id && result.id !== request.id)) return false;
  if (request.command === 'removeNode') return Array.isArray(result.edges) && result.edges.every((id) => typeof id === 'string');
  if (request.command === 'addEdge') return result.from === body?.from && result.to === body?.to && result.kind === body?.kind;
  if (request.command === 'removeEdge') return typeof result.from === 'string' && typeof result.to === 'string' && typeof result.kind === 'string';
  return typeof result.type === 'string' && typeof result.title === 'string';
}

/** One immutable request survives transport ambiguity; checks never write and retries are explicit. */
export class WriteOperation {
  private request: OriginalRequest | null = null;
  private flight: Promise<unknown> | null = null;
  private uncertain = false;
  busy = false;
  error: string | null = null;
  onSuccess?: () => void;
  onReject?: (error: unknown) => void;
  constructor(private changed: () => void = () => {}) {}
  get locked() { return this.request !== null; }
  get requestId() { return this.request?.requestId; }
  get command() { return this.request?.command; }
  clearError() { this.error = null; this.changed(); }
  private complete(result: unknown) {
    this.request = null;
    this.uncertain = false;
    this.error = null;
    const callback = this.onSuccess;
    this.onSuccess = undefined;
    this.onReject = undefined;
    callback?.();
    return result;
  }
  private singleflight(action: () => Promise<unknown>) {
    if (this.flight) return this.flight;
    this.busy = true;
    // Publish the flight before invoking fetch or a subscriber can re-enter submission.
    this.flight = Promise.resolve().then(action).finally(() => {
      this.flight = null; this.busy = false; this.changed();
    });
    this.changed();
    return this.flight;
  }
  submit<T>(spec: WriteSpec): Promise<T> {
    const serialized = spec.body === undefined ? undefined : JSON.stringify(spec.body);
    if (this.request) {
      if (this.request.command !== spec.command || this.request.url !== spec.url || this.request.serialized !== serialized) {
        return Promise.reject(new Error(t('write.payloadLocked')));
      }
      return (this.flight || Promise.reject(new Error(t('write.payloadLocked')))) as Promise<T>;
    }
    this.request = { ...spec, body: serialized === undefined ? undefined : JSON.parse(serialized), serialized, requestId: crypto.randomUUID() };
    return this.singleflight(() => this.transmit()) as Promise<T>;
  }
  private async inspect() {
    const request = this.request!;
    const data = await send<unknown>('GET', `/api/receipt?requestId=${encodeURIComponent(request.requestId)}`);
    if (!record(data) || data.schema !== 'pinwhy.receipt-response.v1' || data.readOnly !== true || !record(data.receipt)) throw new Error(t('write.unknown'));
    const receipt = data.receipt;
    if (receipt.requestId !== request.requestId || receipt.command !== request.command
      || !['committed', 'pending'].includes(String(receipt.status)) || !validResult(request, receipt.result)) throw new Error(t('write.unknown'));
    if (receipt.status === 'committed') return this.complete(receipt.result);
    this.error = t(receipt.recoverable === false ? 'write.blocked' : 'write.pending');
    throw new Error(this.error);
  }
  private async reconcile(): Promise<unknown> {
    this.uncertain = true;
    this.error = t('write.unknown');
    try { return await this.inspect(); }
    catch { throw Object.assign(new Error(this.error || t('write.unknown')), { code: 'write_unconfirmed' }); }
  }
  private async transmit() {
    const request = this.request!;
    let result: unknown;
    try {
      result = await send(request.method, request.url, request.body, request.requestId);
    } catch (error) {
      const failure = error as { definitive?: boolean; status?: number };
      if (error instanceof NodeConflict || (failure.definitive === true && (!this.uncertain || failure.status !== 403))) {
        this.request = null;
        this.uncertain = false;
        this.error = error instanceof Error ? error.message : String(error);
        this.onReject?.(error);
        this.onSuccess = undefined; this.onReject = undefined;
        throw error;
      }
      return this.reconcile();
    }
    if (!validResult(request, result)) return this.reconcile();
    return this.complete(result);
  }
  check() { return this.flight || (!this.request ? Promise.resolve() : this.singleflight(() => this.reconcile())); }
  retry() { return this.flight || (!this.request ? Promise.resolve() : this.singleflight(() => this.transmit())); }
}

export const addNode = (input: NodeInput, operation = new WriteOperation()) => operation.submit<{ node: { id: string } }>({ command: 'addNode', method: 'POST', url: '/api/nodes', body: { ...input, rejectTruncation: true } });
export const patchNode = (id: string, set: NodePatch, operation = new WriteOperation()) => operation.submit({ command: 'patchNode', method: 'PATCH', url: `/api/nodes/${encodeURIComponent(id)}`, id, body: { ...set, rejectTruncation: true } });
export const removeNode = (id: string, operation = new WriteOperation()) => operation.submit({ command: 'removeNode', method: 'DELETE', url: `/api/nodes/${encodeURIComponent(id)}`, id });
export const addEdge = (from: string, to: string, kind: string, label?: string, operation = new WriteOperation()) => operation.submit({ command: 'addEdge', method: 'POST', url: '/api/edges', body: { from, to, kind, ...(label ? { label } : {}), rejectTruncation: true } });
export const removeEdge = (id: string, operation = new WriteOperation()) => operation.submit({ command: 'removeEdge', method: 'DELETE', url: `/api/edges?id=${encodeURIComponent(id)}`, id });

/** How a new card relates to the selected one. Each reads "new <relation> current" except the last. */
export const LINKS = [
  { id: 'supports', label: t('link.supports') },
  { id: 'contradicts', label: t('link.contradicts') },
  { id: 'derived-from', label: t('link.derived-from') },
  { id: 'related-to', label: t('link.related-to') },
] as const;

export const CREATABLE_TYPES = ['fact', 'observation', 'hypothesis', 'question', 'action', 'result', 'finding', 'vuln', 'note', 'goal', 'condition', 'coverage'] as const;
export const SETTABLE_STATUSES = ['open', 'active', 'done', 'blocked', 'dead', 'confirmed', 'refuted', 'deferred', 'superseded'] as const;

/** Read projections from this server only; static exports never call these. */
export const getNodeHistory = (id: string) => send<NodeHistory>('GET', `/api/history?node=${encodeURIComponent(id)}`);
export const getCheckpointChanges = (id: string) => send<CheckpointChanges>('GET', `/api/changes?since=${encodeURIComponent(id)}`);
export const getViewerStatus = () => send<{ cwd: string }>('GET', '/api/status');
/** The board as it stood right after checkpoint `ref`; never writable. */
export async function getGraphAsOf(ref: string): Promise<GraphSnapshot> {
  const data = await send<unknown>('GET', `/api/graph?asOf=${encodeURIComponent(ref)}`);
  if (!isGraphSnapshot(data)) throw new Error(t('api.invalidSnapshot'));
  return data;
}
/** What changed after `since`, counting only the log up to checkpoint `asOf`. */
export const getChangesBetween = (since: string, asOf: string) => send<CheckpointChanges>('GET', `/api/changes?since=${encodeURIComponent(since)}&asOf=${encodeURIComponent(asOf)}`);
export const SETTABLE_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export const SETTABLE_CONFIDENCES = ['suspected', 'static-confirmed', 'reproduced', 'confirmed'] as const;

export async function getUpdateCheck(): Promise<UpdateCheck> {
  const result = await send<UpdateCheck>('GET', '/api/update');
  if (result.schema !== 'pinwhy.update-check.v1'
    || !['available', 'current', 'ahead'].includes(result.status)
    || typeof result.currentVersion !== 'string' || typeof result.latestVersion !== 'string') {
    throw new Error(t('api.invalidResponse', { status: 200 }));
  }
  return result;
}
