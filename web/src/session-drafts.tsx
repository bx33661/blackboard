import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { WriteOperation } from './api';
import { t } from './i18n';
import { Button } from '@/components/ui/button';

type Entry = { value: unknown; dirty: boolean };
type DraftStore = {
  entries: Map<string, Entry>;
  operations: Map<string, WriteOperation>;
  changed: () => void;
  put: (key: string, value: unknown, dirty: boolean) => void;
};
const DraftContext = createContext<DraftStore | null>(null);

/** Private to this mounted workspace: drafts and original requests never enter browser storage. */
export function SessionDrafts({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<string, Entry>());
  const operations = useRef(new Map<string, WriteOperation>());
  const [, render] = useState(0);
  const changed = useCallback(() => render((previous) => previous + 1), []);
  const put = useCallback((key: string, value: unknown, dirty: boolean) => {
    entries.current.set(key, { value, dirty });
    changed();
  }, [changed]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (![...entries.current.values()].some((entry) => entry.dirty)
        && ![...operations.current.values()].some((operation) => operation.locked)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  return <DraftContext.Provider value={{ entries: entries.current, operations: operations.current, changed, put }}>{children}</DraftContext.Provider>;
}

function useDraftStore() {
  const store = useContext(DraftContext);
  if (!store) throw new Error('SessionDrafts provider missing');
  return store;
}

export function useSessionDraft<T>(key: string, initial: T) {
  const store = useDraftStore();
  const value = (store.entries.get(key)?.value as T | undefined) ?? initial;
  const set = (next: T, dirty: boolean) => store.put(key, next, dirty);
  return [value, set] as const;
}

/** Shared identity and synchronous singleflight survive panel and mode unmounts. */
export function useSessionWrite(key: string) {
  const store = useDraftStore();
  let operation = store.operations.get(key);
  if (!operation) {
    operation = new WriteOperation(store.changed);
    store.operations.set(key, operation);
  }
  return operation;
}

/** Always mounted in the workspace, including when the edited record has disappeared. */
export function WriteRecovery({ writable }: { writable: boolean }) {
  const store = useDraftStore();
  const pending = [...store.operations.entries()].filter(([, operation]) => operation.locked);
  if (!pending.length) return null;
  return <section aria-label={t('write.recovery')} className="fixed bottom-4 left-4 z-50 flex max-h-[40vh] w-[min(32rem,calc(100vw-2rem))] flex-col gap-3 overflow-auto rounded-lg border bg-card p-3 shadow-lg">
    <h2 className="m-0 text-sm font-medium">{t('write.recovery')}</h2>
    {pending.map(([key, operation]) => <div key={key} className="flex flex-col gap-2 border-t pt-2 text-xs">
      <p role="status" className="m-0">{operation.error || t('write.unknown')}</p>
      <code className="break-all text-muted-foreground">{operation.command} · {operation.requestId}</code>
      <div className="flex gap-2">
        <Button size="sm" disabled={operation.busy} onClick={() => { void operation.check().catch(() => {}); }}>{t('write.check')}</Button>
        <Button size="sm" disabled={operation.busy || !writable} onClick={() => { void operation.retry().catch(() => {}); }}>{t('write.retry')}</Button>
      </div>
    </div>)}
  </section>;
}
