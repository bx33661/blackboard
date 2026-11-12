import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { confidenceLabel, typeLabel } from '../presentation';
import { relationLabel } from '../graph';
import { t } from '../i18n';
import type { BoardEdge, BoardNode } from '../types';
import { AUDIT_BATCH, isAuditCandidate, isAuditIssue, type ArgumentRole, type AuditExpansionAction, type AuditPage, type AuditSelection } from '../workspace/audit';

type Props = {
  audit: AuditSelection;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onIssue: (id: string | null) => void;
  onCandidate: (id: string | null) => void;
  onOpenArgument: (node: BoardNode) => void;
  onCandidateIssue: (id: string) => void;
  onSearch: () => void;
  onExpand: (key: string, action: AuditExpansionAction, defaultLimit?: number) => void;
};
const control = 'w-full min-w-0 rounded-md border bg-card px-2 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function AuditNavigation({ audit, selectedId, onSelect, onIssue, onCandidate, onCandidateIssue, onOpenArgument, onSearch, onExpand }: Props) {
  const byId = audit.index.byId;
  const record = (node: BoardNode) => <div key={node.id} className="my-1 rounded-md border p-1">
    <button type="button" aria-pressed={selectedId === node.id} onClick={() => onSelect(node.id)} className={cn('w-full rounded px-2 py-2 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring', selectedId === node.id && 'bg-accent')}>
      <span className="block break-words leading-5">{node.title || node.id}</span>
      <span className="block break-words text-[11px] text-muted-foreground">{typeLabel(node.type)} · {node.id}{node.confidence ? ` · ${confidenceLabel(node.confidence)}` : ''}</span>
    </button>
    {(isAuditIssue(node) || isAuditCandidate(node)) && <Button variant="ghost" size="sm" className="h-auto max-w-full whitespace-normal text-[11px]" onClick={() => onOpenArgument(node)}>{t('audit.openArgument')}</Button>}
  </div>;
  const relation = (edge: BoardEdge) => <div key={edge.id} className="my-1 rounded-md border p-2 text-[11px] leading-5">
    <button type="button" className="block w-full break-words text-left underline decoration-muted-foreground underline-offset-2" onClick={() => onSelect(edge.from)}>{byId.get(edge.from)?.title || edge.from} · {edge.from}</button>
    <p className="m-0 break-words text-muted-foreground">{relationLabel(edge.kind)} ({edge.kind}) →{edge.label ? ` ${edge.label}` : ''} · {edge.id}</p>
    <button type="button" className="block w-full break-words text-left underline decoration-muted-foreground underline-offset-2" onClick={() => onSelect(edge.to)}>{byId.get(edge.to)?.title || edge.to} · {edge.to}</button>
    {[edge.from, edge.to].filter((id, index, ids) => ids.indexOf(id) === index && id !== audit.root?.id).map((id) => byId.get(id)).filter((node): node is BoardNode => Boolean(node) && (isAuditCandidate(node!) || isAuditIssue(node!))).map((node) => <Button key={node.id} variant="ghost" size="sm" className="h-auto max-w-full whitespace-normal text-left text-[11px]" onClick={() => onOpenArgument(node)}>{t('audit.openArgument')}: {node.title || node.id}</Button>)}
  </div>;
  const controls = (page: AuditPage<unknown>, label: string, defaultLimit = AUDIT_BATCH) => <div className="flex flex-wrap items-center gap-1 py-1">
    <p className="m-0 w-full text-[11px] leading-5 text-muted-foreground">{t('audit.pageCount', { total: page.total, shown: page.shown, hidden: page.hidden })}</p>
    {page.hidden > 0 && <Button size="sm" variant="outline" aria-label={`${label} · ${t('audit.showMore')}`} onClick={() => onExpand(page.key, 'more', defaultLimit)}>{t('audit.showMore')}</Button>}
    {page.limit > defaultLimit && <Button size="sm" variant="ghost" aria-label={`${label} · ${t('audit.collapse')}`} onClick={() => onExpand(page.key, 'collapse', defaultLimit)}>{t('audit.collapse')}</Button>}
  </div>;
  const section = (page: AuditPage<unknown>, label: string, content: () => ReactNode, defaultLimit = AUDIT_BATCH) => <section key={page.key} aria-label={label} className="border-t py-2">
    <button type="button" aria-expanded={page.open} onClick={() => onExpand(page.key, 'toggle', defaultLimit)} className="w-full rounded text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">{label} · {page.total}</button>
    {page.open ? <>{controls(page, label, defaultLimit)}{content()}</> : <p className="m-0 text-[11px] leading-5 text-muted-foreground">{t('audit.pageCount', { total: page.total, shown: 0, hidden: page.total })}</p>}
  </section>;
  return <nav aria-label={t('audit.navigation')} className="flex h-full flex-col gap-3 overflow-y-auto p-3">
    <Button size="sm" onClick={onSearch}><Search className="size-3.5" />{t('topbar.search')}</Button>
    <label className="flex flex-col gap-1 text-xs font-medium">{t('audit.issues')}
      <select className={control} value={audit.issue?.id ?? ''} onChange={(event) => onIssue(event.target.value || null)}>
        <option value="">{t('audit.allIssues')}</option>
        {audit.catalog.issues.items.map((node) => <option key={node.id} value={node.id}>{node.title || node.id}</option>)}
      </select>
    </label>
    {controls(audit.catalog.issues, t('audit.issues'))}
    <label className="flex flex-col gap-1 text-xs font-medium">{t('audit.candidates')}
      <select className={control} value={audit.candidate?.id ?? ''} onChange={(event) => onCandidate(event.target.value || null)}>
        <option value="">{t('audit.issueOverview')}</option>
        {audit.outsideIssue && audit.candidate && <option value={audit.candidate.id}>{audit.candidate.title || audit.candidate.id} · {t('audit.outsideIssue')}</option>}
        {audit.catalog.members.items.map((node) => <option key={node.id} value={node.id}>{node.title || node.id}</option>)}
      </select>
    </label>
    {controls(audit.catalog.members, t('audit.candidates'))}
    {audit.outsideIssue && <div role="status" className="rounded-md border p-2 text-xs">
      <p className="m-0 mb-1 font-medium">{t('audit.outsideIssue')}</p>
      {controls(audit.catalog.candidateIssues, t('audit.openIssue'))}
      {audit.catalog.candidateIssues.items.map((issue) => <Button key={issue.id} variant="ghost" size="sm" className="h-auto w-full justify-start whitespace-normal text-left text-xs" onClick={() => onCandidateIssue(issue.id)}>{t('audit.openIssue')}: {issue.title || issue.id}</Button>)}
    </div>}
    {(audit.missingIssue || audit.missingCandidate) && <p role="status" className="m-0 text-xs text-muted-foreground">{t('audit.missingRoot')}</p>}
    <p className="m-0 text-[11px] leading-5 text-muted-foreground">{t('audit.membershipHint')}</p>
    {audit.root ? <section aria-label={t('audit.argument')}>
      <h2 className="m-0 mb-1 text-xs font-semibold">{t('audit.argument')}</h2>
      {record(audit.root)}
      <p className="m-0 mb-2 text-[11px] leading-5 text-muted-foreground">{t('audit.boundaryHint')}</p>
      {(['support', 'contradiction', 'condition', 'related'] as ArgumentRole[]).map((role) => section(audit.pages[role], t(`audit.${role}`), () => audit.pages[role].items.map(relation), role === 'related' ? 0 : AUDIT_BATCH))}
      {section(audit.premises, t('audit.premise'), () => audit.premises.items.map(relation))}
    </section> : <p className="m-0 text-xs leading-5 text-muted-foreground">{t('audit.chooseRoot')}</p>}
    {audit.contexts.size > 0 && <section aria-label={t('audit.localDetails')}>
      <h2 className="m-0 text-xs font-semibold">{t('audit.localDetails')}</h2>
      <p className="m-0 text-[11px] leading-5 text-muted-foreground">{t('audit.localHint')}</p>
      {[...audit.contexts.values()].map((item) => <section key={item.node.id} aria-label={`${t('audit.localDetails')}: ${item.node.id}`} className="my-2 rounded-md border p-2">
        {record(item.node)}
        {(['contradiction', 'condition', 'support', 'related'] as ArgumentRole[]).filter((role) => item.groups[role].length > 0).map((role) => {
          const label = `${item.node.title || item.node.id} · ${t(role === 'contradiction' ? 'audit.hasContradictions' : role === 'condition' ? 'audit.hasConditions' : `audit.${role}`)}`;
          return section(item.pages[role], label, () => item.pages[role].items.map(relation), 0);
        })}
      </section>)}
    </section>}
    {section(audit.catalog.unassigned, t('audit.unassigned'), () => audit.catalog.unassigned.items.map(record), 0)}
    {section(audit.catalog.records, t('audit.records'), () => audit.catalog.records.items.map(record), audit.root ? 0 : AUDIT_BATCH)}
    {!audit.records.length && <p role="status" className="text-xs text-muted-foreground">{t('audit.empty')}</p>}
  </nav>;
}
