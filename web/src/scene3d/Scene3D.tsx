import { Component, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { Box, Crosshair, ImageDown, Maximize2, Orbit } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import { t } from '../i18n';
import { severityLabel } from '../presentation';
import { usePref } from '../use-pref';
import { FOV, type Command, type Quality, type Scene3DProps } from './shared';
import { World } from './World';

const DPR_SCALE: Record<Quality, number> = { 2: 1, 1: 0.8, 0: 0.6 };

export default function Scene3D(props: Scene3DProps) {
  const { nodes, mode, theme, currentId, motion, onExit, onNotice, onExport, exporting, occlusion, ref: handleRef } = props;
  const [quality, setQuality] = useState<Quality>(2);
  const [orbit, setOrbit] = usePref('scene3d-orbit', false);
  const [command, setCommand] = useState<Command>({ kind: 'home', serial: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  const failed = useRef(false);
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1)) * DPR_SCALE[quality];
  const run = (kind: Command['kind'], id?: string) => setCommand((previous) => ({ kind, id, serial: previous.serial + 1 }));

  const exportImage = useCallback(() => {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const canvas = canvasRef.current;
    if (!canvas) { reject(new Error(t('app.exportFailed'))); return promise; }
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error(t('app.exportFailed'))); return; }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `blackboard-3d-${mode}-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      resolve();
    }, 'image/png');
    return promise;
  }, [mode]);
  useImperativeHandle(handleRef, () => ({ exportImage }), [exportImage]);
  useEffect(() => { exitRef.current?.focus({ preventScroll: true }); }, []);
  const fail = useCallback(() => {
    if (failed.current) return;
    failed.current = true;
    onNotice(t('scene3d.failed'));
    onExit();
  }, [onNotice, onExit]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lost = (event: Event) => { event.preventDefault(); fail(); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => { canvas.removeEventListener('webglcontextlost', lost); };
  }, [fail]);

  return (
    <div className="absolute inset-0 z-[5]" data-scene3d={theme}>
      <Scene3DBoundary onError={fail}>
        <Canvas
          ref={canvasRef}
          aria-label={t('scene3d.label')}
          shadows={quality > 0 ? 'percentage' : false}
          flat
          dpr={dpr}
          frameloop={motion ? 'always' : 'demand'}
          gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
          camera={{ fov: FOV, near: 0.1, far: 2000, position: [0, 60, 0.01] }}
          onPointerMissed={(event) => { if (event.button === 0) props.onSelect(null); }}
        >
          {motion && quality > 0 && <PerformanceMonitor onDecline={() => setQuality((q) => Math.max(0, q - 1) as Quality)} />}
          <Suspense fallback={null}>
            <World {...props} quality={quality} orbit={orbit && motion} command={command} />
          </Suspense>
        </Canvas>
      </Scene3DBoundary>
      <div className="absolute left-3 flex flex-wrap items-center gap-0.5 rounded-xl border bg-card p-1 shadow-float" style={{ bottom: occlusion.bottom + 12 }}>
        <IconButton ref={exitRef} label={t('scene3d.exit')} aria-pressed onClick={onExit}><Box /></IconButton>
        <span className="mx-1 h-4 w-px bg-border" />
        <IconButton label={t('toolbar.fit')} onClick={() => run('home')}><Maximize2 /></IconButton>
        {currentId && <IconButton label={t('toolbar.locate')} onClick={() => { run('focus', currentId); props.onSelect(currentId); }}><Crosshair /></IconButton>}
        {motion && <IconButton label={orbit ? t('scene3d.stopOrbit') : t('scene3d.orbit')} aria-pressed={orbit} onClick={() => setOrbit((value) => !value)}><Orbit /></IconButton>}
        {nodes.length > 0 && <IconButton label={t('toolbar.export')} disabled={exporting} aria-busy={exporting} onClick={onExport}><ImageDown /></IconButton>}
        <span className="px-2 text-xs text-muted-foreground max-sm:hidden">{t('scene3d.hint')}</span>
      </div>
      {nodes.length > 0 && !props.selectedId && (
        <aside aria-label={t('scene3d.heightKey')} className="pointer-events-none absolute bottom-3 right-3 rounded-xl border bg-card/90 px-3 py-2 shadow-float backdrop-blur max-sm:hidden">
          <p className="m-0 mb-1.5 text-[11px] font-medium text-muted-foreground">{t('scene3d.heightKey')}</p>
          <div className="h-1.5 w-44 rounded-full" style={{ background: 'linear-gradient(90deg, var(--severity-low), var(--severity-medium), var(--severity-high), var(--severity-critical))' }} />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{severityLabel('low')}</span><span>{severityLabel('critical')}</span></div>
        </aside>
      )}
    </div>
  );
}

/** Rendering and WebGL startup failures use the same notice and exit path as context loss. */
class Scene3DBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
