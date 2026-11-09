import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';
import { exportCanvasPng } from '../export-image';
import type { CanvasNode } from '../graph';
import { t } from '../i18n';
import type { Scene3DHandle } from '../scene3d/shared';
import { useSceneOcclusion } from '../scene3d/use-scene-occlusion';
import type { ViewMode } from '../types';
import { usePref } from '../use-pref';

type Options = {
  viewportRef: RefObject<HTMLDivElement | null>;
  flatRef: RefObject<HTMLDivElement | null>;
  inspectorRef: RefObject<HTMLElement | null>;
  selectedId: string | null;
  mode: ViewMode;
  flash: (message: string) => void;
};

/** The sandbox shares layout and selection; only its presentation, focus and export differ. */
export function useWorkspaceScene({ viewportRef, flatRef, inspectorRef, selectedId, mode, flash }: Options) {
  const [scene3d, setScene3d] = usePref('scene3d', false);
  const [exporting, setExporting] = useState(false);
  const sceneRef = useRef<Scene3DHandle>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(scene3d);
  const exportPending = useRef(false);
  const { getNodes, getNodesBounds } = useReactFlow<CanvasNode>();
  const occlusion = useSceneOcclusion(viewportRef, inspectorRef, scene3d && Boolean(selectedId));

  useEffect(() => {
    const previous = wasOpen.current;
    wasOpen.current = scene3d;
    if (scene3d || !previous) return;
    const target = returnFocus.current?.isConnected ? returnFocus.current : flatRef.current?.querySelector<HTMLButtonElement>('[data-scene3d-trigger]');
    target?.focus({ preventScroll: true });
  }, [scene3d, flatRef]);

  const openScene = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setScene3d(true);
  }, [setScene3d]);
  const closeScene = useCallback(() => { setScene3d(false); }, [setScene3d]);

  const exportImage = useCallback(async () => {
    if (exportPending.current) return;
    exportPending.current = true;
    setExporting(true);
    try {
      if (scene3d) {
        if (!sceneRef.current) { flash(t('scene3d.loading')); return; }
        await sceneRef.current.exportImage();
      } else {
        await exportCanvasPng(getNodesBounds(getNodes()), `pinwhy-${mode}-${new Date().toISOString().slice(0, 10)}.png`);
      }
      flash(t('app.exported'));
    } catch { flash(t('app.exportFailed')); }
    finally { exportPending.current = false; setExporting(false); }
  }, [scene3d, getNodes, getNodesBounds, mode, flash]);

  return { scene3d, sceneRef, openScene, closeScene, occlusion, exporting, exportImage };
}
