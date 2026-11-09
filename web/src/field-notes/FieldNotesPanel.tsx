import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Download, ImageUp, Palette, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import defaultLogo from '../../../design/pinwhy-logo/pinwhy-mark-mint.svg?inline';
import { getViewerStatus } from '../api';
import { locale, t } from '../i18n';
import type { GraphSnapshot } from '../types';
import { FieldNotesDocument } from './FieldNotesDocument';
import { downloadFieldNotes } from './export';
import type { FieldNotesCover } from './types';

const ACCENTS = ['#147453', '#315f9b', '#9b6631', '#9b4162', '#6753a1'];
const IMAGE_TYPES: Record<string, true> = { 'image/png': true, 'image/jpeg': true, 'image/webp': true };

function readCover(raw: string | null, initial: FieldNotesCover): FieldNotesCover {
  if (!raw) return initial;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') return initial;
  const stored = value as Partial<FieldNotesCover>;
  return {
    title: typeof stored.title === 'string' ? stored.title : initial.title,
    subtitle: typeof stored.subtitle === 'string' ? stored.subtitle : initial.subtitle,
    accent: typeof stored.accent === 'string' && /^#[\da-f]{6}$/i.test(stored.accent) ? stored.accent : initial.accent,
    logo: stored.logo === defaultLogo || (typeof stored.logo === 'string' && /^data:image\/(?:png|jpeg|webp);base64,[\da-z+/=]+$/i.test(stored.logo)) ? stored.logo : initial.logo,
  };
}

type Props = {
  snapshot: GraphSnapshot;
  theme: 'light' | 'dark';
  isStatic: boolean;
  onContinue: () => void;
  onNode: (id: string) => void;
  onCheckpoint?: (id: string) => void;
};

export function FieldNotesPanel({ snapshot, theme, isStatic, onContinue, onNode, onCheckpoint }: Props) {
  const initialCover = (): FieldNotesCover => ({ title: snapshot.meta.title || t('app.untitledTask'), subtitle: '', accent: ACCENTS[0], logo: defaultLogo });
  const [cover, setCover] = useState<FieldNotesCover>(initialCover);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [sessionOnly, setSessionOnly] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [exportNotice, setExportNotice] = useState<{ text: string; error: boolean } | null>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const logoReader = useRef<FileReader | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const identity = isStatic ? `file:${location.pathname}` : (await getViewerStatus()).cwd;
        if (typeof identity !== 'string' || !identity) throw new Error('Missing project identity');
        const key = `pinwhy-pref-field-notes:${identity}`;
        const saved = readCover(localStorage.getItem(key), initialCover());
        if (!cancelled) { setCover(saved); setStorageKey(key); }
      } catch { if (!cancelled) setSessionOnly(true); }
    };
    void load();
    return () => { cancelled = true; logoReader.current?.abort(); logoReader.current = null; };
  }, [isStatic]);

  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(cover)); setSessionOnly(false); }
    catch { setSessionOnly(true); }
  }, [cover, storageKey]);

  useEffect(() => {
    const scroll = scrollRef.current;
    const toolbar = toolbarRef.current;
    if (!scroll || !toolbar) return;
    const measure = () => { scroll.style.scrollPaddingBlockStart = `${toolbar.offsetHeight}px`; };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  const resetLogo = () => {
    logoReader.current?.abort(); logoReader.current = null;
    setCover((previous) => ({ ...previous, logo: defaultLogo })); setLogoError(false);
  };
  const uploadLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    logoReader.current?.abort(); logoReader.current = null;
    if (!Object.hasOwn(IMAGE_TYPES, file.type) || file.size > 1024 * 1024) { setLogoError(true); return; }
    setLogoError(false);
    const reader = new FileReader(); logoReader.current = reader;
    reader.onerror = () => { if (logoReader.current === reader) setLogoError(true); };
    reader.onload = () => {
      const data = reader.result;
      if (typeof data !== 'string') { setLogoError(true); return; }
      const image = new Image(); image.src = data;
      void image.decode().then(() => {
        if (logoReader.current === reader) setCover((previous) => ({ ...previous, logo: data }));
      }, () => { if (logoReader.current === reader) setLogoError(true); });
    };
    reader.readAsDataURL(file);
  };
  const title = cover.title || snapshot.meta.title || t('app.untitledTask');
  const exportNotes = () => {
    const article = documentRef.current?.querySelector<HTMLElement>('[data-field-notes]');
    if (!article) return;
    try {
      downloadFieldNotes(article, { title, locale });
      setExportNotice({ text: t('notes.exported'), error: false });
    } catch (error) {
      setExportNotice({ text: t('notes.exportFailed', { error: error instanceof Error ? error.message : String(error) }), error: true });
    }
  };

  return (
    <main ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-background" aria-label={t('notes.title')}>
      <div ref={toolbarRef} className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Button size="sm" onClick={onContinue}><ArrowLeft />{t('notes.back')}</Button>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!storageKey && !sessionOnly} onClick={() => setSettingsOpen(true)}><Palette />{t('notes.customize')}</Button>
            <Button size="sm" variant="outline" disabled={!storageKey && !sessionOnly} onClick={exportNotes}><Download />{t('notes.export')}</Button>
          </div>
        </div>
        {exportNotice && <p role={exportNotice.error ? 'alert' : 'status'} className={`m-0 px-4 pb-3 text-center text-xs ${exportNotice.error ? 'text-destructive' : 'text-muted-foreground'}`}>{exportNotice.text}</p>}
      </div>
      <div ref={documentRef}>
        <FieldNotesDocument snapshot={snapshot} cover={{ ...cover, title }} theme={theme} onContinue={onContinue} onNode={onNode} onCheckpoint={onCheckpoint} />
      </div>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[calc(100dvh-32px)] max-w-[440px] overflow-y-auto">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <DialogTitle className="m-0 text-[15px] font-semibold">{t('notes.customize')}</DialogTitle>
              <DialogDescription className="m-0 mt-1 text-xs leading-5 text-muted-foreground">{t('notes.coverHint')}</DialogDescription>
            </div>
            <DialogClose asChild><Button size="icon-sm" aria-label={t('common.close')}><X /></Button></DialogClose>
          </header>
          <div className="flex flex-col gap-5 p-5">
            <label className="flex flex-col gap-2 text-xs font-medium">{t('notes.coverTitle')}
              <input value={cover.title} placeholder={snapshot.meta.title} onChange={(event) => setCover((previous) => ({ ...previous, title: event.target.value }))} className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">{t('notes.coverSubtitle')}
              <textarea value={cover.subtitle} rows={3} onChange={(event) => setCover((previous) => ({ ...previous, subtitle: event.target.value }))} className="resize-y rounded-md border bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-2 text-xs font-medium">{t('notes.accent')}</legend>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((color) => <button key={color} type="button" aria-label={color} aria-pressed={cover.accent.toLowerCase() === color} onClick={() => setCover((previous) => ({ ...previous, accent: color }))} className="size-8 rounded-full border-2 border-background outline outline-1 outline-border aria-pressed:outline-2 aria-pressed:outline-foreground" style={{ backgroundColor: color }} />)}
                <input type="color" aria-label={t('notes.customAccent')} value={cover.accent} onChange={(event) => setCover((previous) => ({ ...previous, accent: event.target.value }))} className="size-8 cursor-pointer rounded border bg-background p-0.5" />
              </div>
            </fieldset>
            <div>
              <p className="m-0 mb-2 text-xs font-medium">{t('notes.logo')}</p>
              <div className="flex items-center gap-3">
                <img src={cover.logo} width={48} height={48} alt="" className="size-12 shrink-0 rounded object-contain" />
                <Button size="sm" variant="outline" onClick={() => imageInput.current?.click()}><ImageUp />{t('notes.uploadLogo')}</Button>
                <Button size="sm" onClick={resetLogo}>{t('notes.resetLogo')}</Button>
              </div>
              <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} aria-label={t('notes.uploadLogo')} className="hidden" />
              <p className="m-0 mt-2 text-[11px] leading-5 text-muted-foreground">{t('notes.logoHint')}</p>
              {logoError && <p role="alert" className="m-0 mt-1 text-xs text-destructive">{t('notes.logoError')}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <p className="m-0 max-w-60 text-[11px] leading-5 text-muted-foreground">{t(sessionOnly ? 'notes.coverSessionOnly' : 'notes.coverLocal')}</p>
              <Button size="sm" onClick={() => { resetLogo(); setCover(initialCover()); }}><RotateCcw />{t('notes.restore')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
