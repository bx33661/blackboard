import { useLayoutEffect, useState, type RefObject } from 'react';
import type { SceneOcclusion } from './shared';

const CLEAR: SceneOcclusion = { right: 0, bottom: 0 };

/** Measure the actual Inspector, including content changes and its switch to a bottom drawer. */
export function useSceneOcclusion(viewport: RefObject<HTMLElement | null>, inspector: RefObject<HTMLElement | null>, active: boolean) {
  const [occlusion, setOcclusion] = useState<SceneOcclusion>(CLEAR);
  useLayoutEffect(() => {
    const surface = viewport.current, panel = inspector.current;
    if (!active || !surface || !panel) {
      setOcclusion((previous) => previous.right || previous.bottom ? CLEAR : previous);
      return;
    }
    const measure = () => {
      const area = surface.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
      const side = window.matchMedia('(min-width: 640px)').matches;
      const next = {
        right: side ? Math.max(0, Math.min(area.width, area.right - bounds.left)) : 0,
        bottom: side ? 0 : Math.max(0, Math.min(area.height, area.bottom - bounds.top)),
      };
      setOcclusion((previous) => previous.right === next.right && previous.bottom === next.bottom ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    observer.observe(panel);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [viewport, inspector, active]);
  return occlusion;
}
