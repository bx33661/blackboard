import { BookOpen, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import appIcon from '../../../design/blackboard-logo/blackboard-mark-mint.svg?inline';
import { BrandMark } from '../BrandMark';
import { t } from '../i18n';
import type { BuildInfo } from '../types';

const REPOSITORY = 'https://github.com/Fruit-Guardians/blackboard';

export function AboutDialog({ build }: { build?: BuildInfo }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" aria-label={t('about.open')} className="-mx-1 inline-flex h-7 shrink-0 items-center gap-2 rounded-md px-1 text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark size={18} />
          <span className="text-sm font-semibold tracking-[-0.01em] max-md:hidden">blackboard</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-32px)] max-w-[400px] overflow-y-auto rounded-2xl">
        <DialogClose asChild>
          <Button size="icon-sm" className="absolute top-3 right-3" aria-label={t('common.close')}><X /></Button>
        </DialogClose>
        <div className="flex flex-col items-center px-7 pt-10 pb-7 text-center sm:px-9 sm:pt-12">
          <img src={appIcon} width={112} height={112} alt="" className="size-24 sm:size-28" />
          <DialogTitle className="m-0 mt-5 text-[32px] font-semibold tracking-[-0.04em]">blackboard</DialogTitle>
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
