import { useState } from 'react';
import { BookOpen, ExternalLink, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import appIcon from '../../../design/pinwhy-logo/pinwhy-mark-mint.svg?inline';
import { BrandMark } from '../BrandMark';
import { t } from '../i18n';
import type { BuildInfo, UpdateCheck } from '../types';
import { getUpdateCheck } from '../api';

const REPOSITORY = 'https://github.com/bx33661/pinwhy';

export function AboutDialog({ build, isStatic }: { build?: BuildInfo; isStatic: boolean }) {
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  async function checkUpdate() {
    if (checking) return;
    setChecking(true);
    setFailed(false);
    setUpdate(null);
    try { setUpdate(await getUpdateCheck()); }
    catch { setFailed(true); }
    finally { setChecking(false); }
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" aria-label={t('about.open')} className="-mx-1 inline-flex h-7 shrink-0 items-center gap-2 rounded-md px-1 text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark size={18} />
          <span className="text-sm font-semibold tracking-[-0.01em] max-md:hidden">Pinwhy</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-32px)] max-w-[400px] overflow-y-auto rounded-2xl">
        <DialogClose asChild>
          <Button size="icon-sm" className="absolute top-3 right-3" aria-label={t('common.close')}><X /></Button>
        </DialogClose>
        <div className="flex flex-col items-center px-7 pt-10 pb-7 text-center sm:px-9 sm:pt-12">
          <img src={appIcon} width={112} height={112} alt="" className="size-24 sm:size-28" />
          <DialogTitle className="m-0 mt-5 text-[32px] font-semibold tracking-[-0.04em]">Pinwhy</DialogTitle>
          <p className="m-0 mt-2 text-sm font-medium text-subtle">{t('about.tagline')}</p>
          <DialogDescription className="m-0 mt-2 text-[13px] leading-6 text-muted-foreground">{t('about.description')}</DialogDescription>
          {build && (
            <dl className="m-0 mt-6 grid grid-cols-[auto_auto] items-baseline gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-right text-muted-foreground">{t('about.version')}</dt>
              <dd className="m-0 text-left font-mono">{build.version}</dd>
              <dt className="text-right text-muted-foreground">{t('topbar.build')}</dt>
              <dd className="m-0 text-left font-mono" title={build.buildId}>{build.buildId.replace(/^sha256:/, '').slice(0, 12)}</dd>
              {build.commit && <>
                <dt className="text-right text-muted-foreground">{t('topbar.commit')}</dt>
                <dd className="m-0 text-left font-mono">{build.commit}</dd>
              </>}
            </dl>
          )}
          {build && (
            <div className="mt-5 w-full space-y-2 text-xs">
              {isStatic ? <p className="m-0 text-muted-foreground">{t('update.static')}</p> : <>
                <Button variant="outline" size="sm" disabled={checking} onClick={checkUpdate}>
                  <RefreshCw className={checking ? 'animate-spin' : ''} />
                  {t(checking ? 'update.checking' : 'update.check')}
                </Button>
                <div role="status" aria-live="polite" className="space-y-2">
                  {failed && <p className="m-0 text-destructive">{t('update.failed')}</p>}
                  {update && <>
                    <p className="m-0 font-medium">{t(`update.${update.status}`, { version: update.latestVersion })}</p>
                    {update.status === 'available' && <a className="inline-flex items-center gap-1 text-primary underline underline-offset-4" href={`${REPOSITORY}/blob/main/docs/USAGE.md#release`} target="_blank" rel="noopener noreferrer">{t('update.instructions')}<ExternalLink className="size-3" /></a>}
                  </>}
                </div>
                <p className="m-0 text-[11px] leading-5 text-muted-foreground">{t('update.source')}</p>
              </>}
            </div>
          )}
          <div className="mt-7 flex items-center gap-3">
            <Button asChild variant="outline" className="h-9 min-w-24"><a href={`${REPOSITORY}/blob/main/docs/USAGE.md`} target="_blank" rel="noopener noreferrer"><BookOpen />{t('about.docs')}</a></Button>
            <Button asChild variant="outline" className="h-9 min-w-24"><a href={REPOSITORY} target="_blank" rel="noopener noreferrer">GitHub<ExternalLink className="size-3.5" /></a></Button>
          </div>
          <p className="m-0 mt-5 text-[11px] text-muted-foreground">{t('about.license')}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
