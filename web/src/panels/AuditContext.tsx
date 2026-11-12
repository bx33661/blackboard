import { Button } from '@/components/ui/button';
import { t } from '../i18n';
import type { BoardNode } from '../types';
import { isAuditCandidate, isAuditIssue, type AuditExpansionAction, type AuditSelection } from '../workspace/audit';

type Props = {
  audit: AuditSelection;
  selected: BoardNode | null;
  onNavigate: () => void;
  onSelect: (id: string) => void;
  onOpenArgument: (node: BoardNode) => void;
  onExpand: (key: string, action: AuditExpansionAction, defaultLimit?: number) => void;
};

export function AuditContext({ audit, selected, onNavigate, onSelect, onOpenArgument, onExpand }: Props) {
  const context = selected ? audit.contexts.get(selected.id) : null;
  return <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-background px-3 py-2 text-xs">
    <div className="min-w-0 flex-1 basis-40">
      {audit.root ? <button type="button" onClick={() => onSelect(audit.root!.id)} className="block max-w-full truncate rounded text-left font-medium outline-none underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring" title={audit.root.title}>{t('audit.argument')}: {audit.root.title || audit.root.id}</button> : <p className="m-0 leading-5">{t('audit.chooseRoot')}</p>}
      <p className="m-0 text-[11px] leading-5 text-muted-foreground">{audit.root ? t('audit.boundaryHint') : t('audit.authoredOnly')}</p>
      {audit.outsideIssue && <p role="status" className="m-0 font-medium">{t('audit.outsideIssue')}</p>}
      {(audit.missingIssue || audit.missingCandidate) && <p role="status" className="m-0">{t('audit.missingRoot')}</p>}
      {selected && selected.id !== audit.root?.id && <p className="m-0 text-[11px] text-muted-foreground">{t('audit.inspect')}: {selected.title || selected.id}</p>}
    </div>
    {selected && selected.id !== audit.root?.id && (isAuditCandidate(selected) || isAuditIssue(selected)) && <Button size="sm" variant="outline" onClick={() => onOpenArgument(selected)}>{t('audit.openArgument')}</Button>}
    {context && (['contradiction', 'condition'] as const).filter((role) => context.groups[role].length > 0).map((role) => <Button key={role} size="sm" variant="outline" onClick={() => { if (!context.pages[role].open) onExpand(context.pages[role].key, 'more', 0); onNavigate(); }}>{t(role === 'contradiction' ? 'audit.hasContradictions' : 'audit.hasConditions')} · {context.groups[role].length}</Button>)}
    <Button size="sm" variant="outline" onClick={onNavigate}>{t('audit.navigation')}{audit.root ? ` · ${audit.pages.related.total}` : ''}</Button>
  </div>;
}
