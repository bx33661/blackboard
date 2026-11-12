import { useState } from 'react';
import { Link2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import * as api from '../api';
import { confidenceLabel, matchesNode, severityLabel, statusLabel, typeLabel } from '../presentation';
import { relationLabel } from '../graph';
import type { BoardNode } from '../types';
import { t } from '../i18n';
import { useNodeConnect, useNodeCreate, useNodeEdit } from './use-node-forms';
import { parseTags, sourceLocation } from '../research-state';

const field = 'w-full rounded-md border border-strong bg-card px-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';


const Error_ = ({ message }: { message: string | null }) => message ? <p role="alert" className="m-0 text-xs text-destructive">{message}</p> : null;

/** Each tag remains one string, including commas, whitespace, and line breaks. */
function TagFields({ value, onChange, disabled, invalid }: { value: string; onChange: (value: string) => void; disabled: boolean; invalid?: boolean }) {
  let tags: string[];
  try { tags = parseTags(value); }
  catch {
    return <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t('edit.tagsRaw')}
      <textarea className={cn(field, 'min-h-16 py-1.5')} value={value} disabled={disabled} aria-invalid onChange={(event) => onChange(event.target.value)} />
    </label>;
  }
  return <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" disabled={disabled}>
    <legend className="mb-1 text-xs text-muted-foreground">{t('edit.tags')}</legend>
    {tags.map((tag, index) => <div key={index} className="flex items-start gap-1">
      <textarea rows={1} aria-label={`${t('edit.tags')} ${index + 1}`} aria-invalid={invalid || undefined} className={cn(field, 'min-h-8 py-1.5')} value={tag} onChange={(event) => onChange(JSON.stringify(tags.map((item, i) => i === index ? event.target.value : item)))} />
      <Button type="button" size="icon-sm" aria-label={`${t('edit.removeTag')} ${index + 1}`} onClick={() => onChange(JSON.stringify(tags.filter((_, i) => i !== index)))}><X className="size-3.5" /></Button>
    </div>)}
    <Button type="button" size="sm" className="self-start" onClick={() => onChange(JSON.stringify([...tags, '']))}><Plus className="size-3.5" />{t('edit.addTag')}</Button>
  </fieldset>;
}


/** Only a person's changed fields are drafts; untouched fields always follow the live snapshot. */
export function EditSection({ node, onReload }: { node: BoardNode; onReload: () => Promise<void> }) {
  const { draft, busy: pending, locked, error, change, discard, save, reloadDraft, reload, remove, startEditing } = useNodeEdit(node, onReload);
  const busy = pending || locked;
  const [confirming, setConfirming] = useState(false);
  const title = draft.fields.title ?? node.title;
  const detail = draft.fields.detail ?? node.detail ?? '';

  return (
    <section className="mt-6 flex flex-col gap-3 border-t pt-4" aria-label={t('edit.label')}>
      <h3 className="m-0 text-xs font-medium text-muted-foreground">{t('edit.heading')}</h3>
      {draft.editing ? (
        <form className="flex flex-col gap-2" onSubmit={save}>
          <input aria-label={t('edit.title')} aria-invalid={draft.conflictFields?.includes('title') || undefined} className={cn(field, 'h-8')} value={title} onChange={(e) => change('title', e.target.value)} disabled={busy} autoFocus />
          <textarea aria-label={t('edit.detail')} aria-invalid={draft.conflictFields?.includes('detail') || undefined} className={cn(field, 'min-h-24 py-1.5 leading-5')} value={detail} onChange={(e) => change('detail', e.target.value)} disabled={busy} placeholder={t('edit.detailPlaceholder')} />
          <TagFields value={draft.fields.tags ?? JSON.stringify(Array.isArray(node.tags) ? node.tags : [])} onChange={(value) => change('tags', value)} disabled={busy} invalid={draft.conflictFields?.includes('tags')} />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t('edit.at')}
            <input aria-invalid={draft.conflictFields?.includes('at') || undefined} className={cn(field, 'h-8')} value={draft.fields.at ?? sourceLocation(node)} onChange={(event) => change('at', event.target.value)} disabled={busy} />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {([
              { key: 'status', label: t('inspector.status'), values: api.SETTABLE_STATUSES, format: statusLabel },
              { key: 'severity', label: t('inspector.risk'), values: api.SETTABLE_SEVERITIES, format: severityLabel },
              { key: 'confidence', label: t('inspector.confidence'), values: api.SETTABLE_CONFIDENCES, format: confidenceLabel },
            ] as const).map(({ key, label, values, format }) => {
              const value = draft.fields[key] ?? node[key] ?? '';
              return <label key={key} className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                {label}
                <select aria-label={label} aria-invalid={draft.conflictFields?.includes(key) || undefined} className={cn(field, 'h-8')} value={value} disabled={busy} onChange={(e) => change(key, e.target.value)}>
                  <option value="">{format()}</option>
                  {value && !(values as readonly string[]).includes(value) && <option value={value}>{format(value)}</option>}
                  {values.map((item) => <option key={item} value={item}>{format(item)}</option>)}
                </select>
              </label>;
            })}
          </div>
          <p className="m-0 text-[11px] text-muted-foreground">{t('edit.draftHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="default" size="sm" disabled={busy || !title.trim() || draft.conflict}>{t('edit.save')}</Button>
            <Button type="button" size="sm" disabled={busy} onClick={discard}>{t('edit.discard')}</Button>
          </div>
          {draft.conflict && (
            <div role="alert" className="flex flex-col gap-2 text-xs text-destructive">
              <p className="m-0">{t('edit.conflict')}</p>
              <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy} onClick={reloadDraft}>{t('edit.reload')}</Button>
            </div>
          )}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={startEditing}><Pencil className="size-3.5" />{t('edit.editText')}</Button>

        </div>
      )}
      {!draft.conflict && <Error_ message={error} />}
      {!draft.conflict && error === t('edit.conflict') && <Button size="sm" className="self-start" disabled={busy} onClick={reload}>{t('edit.reload')}</Button>}
      {draft.conflict && error && error !== t('edit.conflict') && <Error_ message={error} />}
      {confirming ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t('edit.confirmRemove')}</span>
          <Button variant="outline" size="sm" className="text-destructive" disabled={busy} onClick={remove}>{t('edit.remove')}</Button>
          <Button size="sm" disabled={busy} onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
        </div>
      ) : (
        <Button size="sm" disabled={busy} className="self-start text-muted-foreground" onClick={() => setConfirming(true)}><Trash2 className="size-3.5" />{t('edit.removeNode')}</Button>
      )}
    </section>
  );
}

/** A new card, optionally tied to the selected one. */
function NodeForm({ current, onDone, autoFocus }: { current?: BoardNode; onDone?: () => void; autoFocus?: boolean }) {
  const { draft, busy: pending, locked, operation, error, change, discard, submit } = useNodeCreate(current, onDone);
  const busy = pending || locked;
  const { type, title, link } = draft;

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <div className="flex gap-2">
        <input aria-label={t('edit.type')} list={`node-types-${current?.id ?? 'standalone'}`} className={cn(field, 'h-8 w-28 shrink-0')} value={type} disabled={busy} onChange={(event) => change('type', event.target.value)} />
        <datalist id={`node-types-${current?.id ?? 'standalone'}`}>{api.CREATABLE_TYPES.map((item) => <option key={item} value={item}>{typeLabel(item)}</option>)}</datalist>
        <input aria-label={t('edit.newTitle')} className={cn(field, 'h-8')} value={title} disabled={busy} onChange={(e) => change('title', e.target.value)} placeholder={t('edit.newPlaceholder')} autoFocus={autoFocus} />
      </div>
      <textarea aria-label={t('edit.detail')} className={cn(field, 'min-h-16 py-1.5')} value={draft.detail} disabled={busy} onChange={(event) => change('detail', event.target.value)} placeholder={t('edit.detailPlaceholder')} />
      <TagFields value={draft.tags} onChange={(value) => change('tags', value)} disabled={busy} />
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t('edit.at')}<input className={cn(field, 'h-8')} value={draft.at} disabled={busy} onChange={(event) => change('at', event.target.value)} /></label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{([
        { key: 'status', label: t('inspector.status'), options: api.SETTABLE_STATUSES, format: statusLabel },
        { key: 'severity', label: t('inspector.risk'), options: api.SETTABLE_SEVERITIES, format: severityLabel },
        { key: 'confidence', label: t('inspector.confidence'), options: api.SETTABLE_CONFIDENCES, format: confidenceLabel },
      ] as const).map(({ key, label, options, format }) => <label key={key} className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">{label}<select className={cn(field, 'h-8')} value={draft[key]} disabled={busy} onChange={(event) => change(key, event.target.value)}><option value="">{format()}</option>{options.map((value) => <option key={value} value={value}>{format(value)}</option>)}</select></label>)}</div>
      {current && (
        <select aria-label={t('edit.relation')} className={cn(field, 'h-8')} value={link} disabled={busy} onChange={(e) => change('link', e.target.value)}>
          {api.LINKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      )}
      {current && <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t('inspector.relationLabel')}<input className={cn(field, 'h-8')} value={draft.label} disabled={busy} onChange={(event) => change('label', event.target.value)} /></label>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="default" size="sm" disabled={busy || !title.trim() || !type.trim()}><Plus className="size-3.5" />{t('edit.add')}</Button>
        <Button type="button" size="sm" disabled={busy} onClick={discard}>{t('edit.discard')}</Button>
        <span className="text-[11px] text-muted-foreground">{t('edit.humanNote')}</span>
      </div>
      {!current && locked && <section aria-label={t('write.recovery')} className="flex flex-col gap-2 rounded-md border p-2 text-xs">
        <p className="m-0">{operation.error || t('write.unknown')}</p>
        <code className="break-all text-muted-foreground">{operation.requestId}</code>
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={() => { void operation.check().catch(() => {}); }}>{t('write.check')}</Button>
          <Button type="button" size="sm" disabled={pending} onClick={() => { void operation.retry().catch(() => {}); }}>{t('write.retry')}</Button>
        </div>
      </section>}
      <p className="m-0 text-[11px] text-muted-foreground">{t('edit.draftHint')}</p>
      <Error_ message={error} />
    </form>
  );
}

export function AddSection({ node }: { node: BoardNode }) {
  return (
    <section className="mt-5 flex flex-col gap-2" aria-label={t('edit.related')}>
      <h3 className="m-0 text-xs font-medium text-muted-foreground">{t('edit.related')}</h3>
      <NodeForm current={node} />
    </section>
  );
}

export function NewNodeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <DialogTitle className="m-0 text-[15px] font-semibold">{t('edit.newDialog')}</DialogTitle>
            <DialogDescription className="m-0 mt-0.5 text-xs text-muted-foreground">{t('edit.newDescription')}</DialogDescription>
          </div>
          <DialogClose asChild><Button size="icon-sm" aria-label={t('common.close')}><X /></Button></DialogClose>
        </header>
        <div className="px-5 py-4"><NodeForm autoFocus onDone={() => onOpenChange(false)} /></div>
      </DialogContent>
    </Dialog>
  );
}

/** Connect existing records explicitly. Selection is UI state, never a cursor move. */
export function ConnectSection({ node, byId, onReload }: { node: BoardNode; byId: Map<string, BoardNode>; onReload: () => Promise<void> }) {
  const { draft, link, done, busy: pending, locked, error, change, submit } = useNodeConnect(node, byId, onReload);
  const busy = pending || locked;
  const peers = [...byId.values()].filter((peer) => peer.id !== node.id && (peer.id === draft.peerId || matchesNode(peer, draft.query)));
  return <section className="mt-5 flex flex-col gap-2 border-t pt-4" aria-label={t('connect.heading')}>
    <h3 className="m-0 text-xs font-medium text-muted-foreground">{t('connect.heading')}</h3>
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <input aria-label={t('connect.search')} placeholder={t('connect.search')} className={cn(field, 'h-8')} value={draft.query} disabled={busy} onChange={(e) => change('query', e.target.value)} />
      <select aria-label={t('connect.peer')} className={cn(field, 'h-8')} value={draft.peerId} disabled={busy} onChange={(e) => change('peerId', e.target.value)}>
        <option value="">{t('connect.peer')}</option>
        {peers.map((peer) => <option key={peer.id} value={peer.id}>{peer.id} · {peer.title}</option>)}
      </select>
      <select aria-label={t('connect.kind')} className={cn(field, 'h-8')} value={draft.kind} disabled={busy} onChange={(event) => change('kind', event.target.value)}>
        {['related-to', 'answers', 'derived-from', 'supports', 'contradicts', 'depends-on', 'proves', 'caused-by', 'refines', 'duplicates', 'supersedes', 'resolves'].map((kind) => <option key={kind} value={kind}>{relationLabel(kind)}</option>)}
      </select>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t('inspector.relationLabel')}<input className={cn(field, 'h-8')} value={draft.label} disabled={busy} onChange={(event) => change('label', event.target.value)} /></label>
      <select aria-label={t('connect.direction')} className={cn(field, 'h-8')} value={draft.direction} disabled={busy} onChange={(e) => change('direction', e.target.value as 'outgoing' | 'incoming')}>
        <option value="outgoing">{t('connect.outgoing')}</option><option value="incoming">{t('connect.incoming')}</option>
      </select>
      {link && <p aria-label={t('connect.preview')} className="m-0 break-words rounded-md border bg-secondary p-2 font-mono text-xs">{link.from} — {relationLabel(link.kind)} → {link.to}</p>}
      <p className="m-0 text-[11px] text-muted-foreground">{t('connect.hint')}</p>
      <Button type="submit" variant="outline" size="sm" className="self-start" disabled={busy || !link || !byId.has(draft.peerId)}><Link2 className="size-3.5" />{t('connect.submit')}</Button>
      {done && <p role="status" className="m-0 text-xs text-muted-foreground">{t('connect.done')}</p>}
      <Error_ message={error} />
    </form>
  </section>;
}
