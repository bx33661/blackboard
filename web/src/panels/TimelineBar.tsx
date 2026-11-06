import type { KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Radio, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/icon-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTime } from '../graph';
import { t } from '../i18n';
import type { CheckpointChanges } from '../types';
import type { TimelinePoint } from '../workspace/use-workspace-timeline';

type Props = {
  points: TimelinePoint[];
  /** Index into `points`; `points.length` is the live board. */
  position: number;
  active: boolean;
  loading: boolean;
  error: string | null;
  previousId: string | null;
  changes: { data: CheckpointChanges | null; error: string | null } | null;
  showChanges: boolean;
  onShowChanges: (show: boolean) => void;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onGoTo: (index: number) => void;
  onClose: () => void;
};

/** Checkpoints in log order. Choosing one only reads the log; nothing is written and no cursor moves. */
export function TimelineBar({ points, position, active, loading, error, previousId, changes, showChanges, onShowChanges, playing, onPlay, onPause, onGoTo, onClose }: Props) {
  const now = points.length;
  const current = active && position < now ? points[position] : null;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest('input')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      onPause();
      onGoTo(position + (event.key === 'ArrowLeft' ? -1 : 1));
    } else if (event.key === ' ') {
      if (playing) onPause(); else onPlay();
    } else if (event.key === 'Escape') {
      onPause();
      onGoTo(now);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const delta = changes?.data;
  return (
    <section data-timeline aria-label={t('timeline.heading')} onKeyDown={onKeyDown} className="shrink-0 border-t bg-background px-3 py-2">
      <div className="flex min-w-0 items-center gap-1">
        <IconButton label={t('timeline.prev')} disabled={!points.length || position === 0} onClick={() => { onPause(); onGoTo(position - 1); }}><ChevronLeft /></IconButton>
        <IconButton label={playing ? t('timeline.pause') : t('timeline.play')} aria-pressed={playing} disabled={!points.length} onClick={playing ? onPause : onPlay}>{playing ? <Pause /> : <Play />}</IconButton>
        <IconButton label={t('timeline.next')} disabled={!active} onClick={() => { onPause(); onGoTo(position + 1); }}><ChevronRight /></IconButton>
        <span className="mx-1 h-4 w-px shrink-0 bg-border" />
        {points.length === 0 ? (
          <p className="m-0 min-w-0 flex-1 truncate text-xs text-muted-foreground">{t('timeline.empty')}</p>
        ) : (
          <ol className="m-0 flex min-w-0 flex-1 list-none items-center gap-1 overflow-x-auto p-0 py-0.5" aria-label={t('timeline.heading')}>
            {points.map((point, index) => {
              const selected = active && index === position;
              return (
                <li key={point.id} className="flex shrink-0 items-center gap-1">
                  {index > 0 && <i aria-hidden className={cn('h-px w-3', index <= position && active ? 'bg-foreground' : 'bg-strong')} />}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-current={selected ? 'step' : undefined}
                        onClick={() => { onPause(); onGoTo(index); }}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                          selected ? 'border-foreground bg-foreground text-background' : 'bg-card text-subtle hover:border-strong hover:text-foreground',
                        )}
                      >
                        <span className="font-mono font-medium">{point.id}</span>
                        <span className={cn('tabular-nums', selected ? 'opacity-80' : 'text-muted-foreground')}>{formatTime(point.at ?? undefined)}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="block max-w-[min(28rem,calc(100vw-24px))] whitespace-pre-wrap break-words p-3 font-normal">
                      <p className="m-0 mb-1 font-semibold">{point.id}{point.agentId ? ` · ${point.agentId}` : ''} · {formatTime(point.at ?? undefined)}</p>
                      {point.summary && <p className="m-0">{point.summary}</p>}
                    </TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
            <li className="flex shrink-0 items-center gap-1">
              <i aria-hidden className={cn('h-px w-3', active ? 'bg-strong' : 'bg-foreground')} />
              <button
                type="button"
                aria-current={!active ? 'step' : undefined}
                onClick={() => { onPause(); onGoTo(now); }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  !active ? 'border-foreground bg-foreground text-background' : 'bg-card text-subtle hover:border-strong hover:text-foreground',
                )}
              >
                <Radio className="size-3" />{t('timeline.now')}
              </button>
            </li>
          </ol>
        )}
        <label className="ml-1 flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground max-md:hidden">
          <input type="checkbox" checked={showChanges} onChange={(event) => onShowChanges(event.target.checked)} className="accent-current" />
          {t('timeline.showChanges')}
        </label>
        <IconButton label={t('timeline.close')} onClick={onClose}><X /></IconButton>
      </div>

      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-live="polite">
        {loading && <span role="status">{t('timeline.loading')}</span>}
        {error && <span role="alert" className="text-destructive">{error}</span>}
        {current && !loading && !error && !previousId && <span>{t('timeline.origin', { id: current.id })}</span>}
        {current && previousId && changes?.error && <span role="alert" className="text-destructive">{t('timeline.changesFailed', { error: changes.error })}</span>}
        {current && previousId && delta && (
          <span>{t('timeline.delta', { prev: previousId, id: current.id, added: delta.nodes.added.length, updated: delta.nodes.updated.length, removed: delta.nodes.removed.length })}</span>
        )}
        {current && delta && delta.nodes.removed.length > 0 && (
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {t('timeline.removed')}:
            {delta.nodes.removed.map((node) => (
              <span key={node.id} className="max-w-56 truncate rounded border px-1.5 py-px text-subtle" title={node.title}><span className="font-mono">{node.id}</span> {node.title}</span>
            ))}
          </span>
        )}
        {!loading && !error && <span className="ml-auto max-lg:hidden">{t('timeline.keys')} · {t('timeline.readOnly')}</span>}
      </div>
    </section>
  );
}
