import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Bloom, EffectComposer, Noise, TiltShift2, Vignette } from '@react-three/postprocessing';
import { BoardMesh } from './BoardMesh';
import { CameraRig, HOME_AZIMUTH, HOME_POLAR } from './CameraRig';
import { Explorer } from './Explorer';
import { ContactShadows, Heat, Pins } from './Hardware';
import { Labels } from './Labels';
import { boardBounds, bootDepths, homeFrame, sceneBounds, sceneLayout, sceneTraces, shapeKey, tracesKey, visibleTraces } from './model';
import { NodeBlock } from './NodeBlock';
import { createPalette } from './palette';
import { FOV, type Command, type HoverRef, type Quality, type Scene3DProps } from './shared';
import { Traces, ZoneOutline } from './Traces';

/** Seconds the power-on takes to run through the whole board when a view opens. */
const BOOT_SECONDS = 3;
/** Past this many drawn relations each trace gets quieter, so a large board stays a circuit rather than a tangle. */
const DENSE_TRACES = 40;
/** Room above the tallest chip for the gem marking the current position. */
const GEM_CLEARANCE = 1.8;

type WorldProps = Scene3DProps & { quality: Quality; orbit: boolean; command: Command };

export function World({ nodes, edges, mode, layoutMode, theme, selectedId, highlighted, currentId, follow, fresh, motion, inspectorWidth, onSelect, quality, orbit, command }: WorldProps) {
  const dark = theme === 'dark';
  // Tokens are re-read whenever the theme flips; the palette caches per theme.
  const palette = useMemo(() => createPalette(), [theme]);
  const { blocks, zones } = useMemo(() => sceneLayout(nodes), [nodes]);
  // Stream ticks replace every node object; traces and hardware only change when a chip moves or its severity does.
  const shape = shapeKey(blocks);
  const stable = useMemo(() => blocks, [shape]);
  const bounds = useMemo(() => sceneBounds(stable), [stable]);
  const board = useMemo(() => boardBounds(bounds), [bounds]);
  const traces = useMemo(() => sceneTraces(edges, stable), [stable, tracesKey(edges)]);
  const depths = useMemo(() => bootDepths(stable, traces), [stable, traces]);
  const links = useMemo(() => visibleTraces(traces, selectedId, mode === 'all'), [traces, selectedId, mode]);
  const dense = links.length > DENSE_TRACES;
  const byId = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const font = useMemo(() => getComputedStyle(document.body).fontFamily, []);
  const background = palette.css(dark ? 'color-mix(in srgb, var(--bg) 55%, black)' : 'color-mix(in srgb, var(--ink-3) 32%, var(--surface-3))');
  const current = currentId ? byId.get(currentId) : undefined;
  const r = Math.hypot(board.w, board.d) / 2;
  const size = useThree((state) => state.size);
  const frame = useMemo(
    () => homeFrame(board, Math.max(0, ...stable.map((block) => block.height)) + GEM_CLEARANCE, Math.max(0.5, size.width / Math.max(1, size.height)), FOV, HOME_POLAR, HOME_AZIMUTH),
    [board, stable, size],
  );
  const boot = useRef(motion ? 0 : 1);
  const hover = useRef<string | null>(null) satisfies HoverRef;
  useEffect(() => { boot.current = motion ? 0 : 1; }, [layoutMode, motion]);
  useFrame((_, delta) => {
    if (boot.current < 1 && blocks.length) boot.current = Math.min(1, boot.current + Math.min(delta, 0.05) / BOOT_SECONDS);
  });

  return (
    <>
      <color attach="background" args={[background]} />
      {/* Fog follows the framing distance, so the stage dissolves behind the board at any board size. */}
      <fog attach="fog" args={[background, frame.distance * 1.4, frame.distance * 3]} />
      {/* Studio softboxes painted into a small environment: no image to fetch, and the lacquer and gold get something to reflect. */}
      <Environment resolution={256} frames={1} environmentIntensity={dark ? 0.55 : 0.35}>
        <Lightformer form="rect" intensity={dark ? 3 : 4} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 7, 1]} />
        <Lightformer form="rect" intensity={dark ? 2 : 2} color={palette.css('--node-goal')} position={[-9, 3, 4]} rotation-y={Math.PI / 2} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={dark ? 1.6 : 2} color={palette.css('--rel-produce')} position={[9, 2, -5]} rotation-y={-Math.PI / 2} scale={[10, 2, 1]} />
      </Environment>
      <ambientLight intensity={dark ? 0.1 : 0.2} />
      <hemisphereLight args={[dark ? '#8aa0ff' : '#ffffff', dark ? '#0a0a12' : '#d8d4ca', dark ? 0.2 : 0.3]} />
      {/* One high key light throws short shadows; a low cool rim from the far side catches the chip edges. */}
      <directionalLight
        castShadow={quality > 0}
        position={[board.cx + r * 0.5, r * 1.4, board.cz + r * 0.3]}
        intensity={dark ? 1.5 : 1.6}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-radius={6}
        shadow-camera-left={-r * 1.5}
        shadow-camera-right={r * 1.5}
        shadow-camera-top={r * 1.5}
        shadow-camera-bottom={-r * 1.5}
        shadow-camera-far={r * 5}
      >
        <object3D attach="target" position={[board.cx, 0, board.cz]} />
      </directionalLight>
      <directionalLight position={[board.cx - r, r * 0.3, board.cz - r]} intensity={dark ? 0.7 : 0.3} color={dark ? '#7f9cff' : '#ffffff'} />

      <BoardMesh board={board} palette={palette} dark={dark} current={current} motion={motion} />
      <ContactShadows blocks={stable} boot={boot} />
      <Heat blocks={stable} palette={palette} dark={dark} faded={Boolean(selectedId)} boot={boot} />
      {zones.map((zone) => <ZoneOutline key={zone.id} zone={zone} palette={palette} />)}
      <Traces links={links} palette={palette} dark={dark} dense={dense} selectedId={selectedId} depths={depths} boot={boot} motion={motion} />
      <Pins blocks={stable} palette={palette} faded={Boolean(selectedId)} />
      {blocks.map((block) => (
        <NodeBlock
          key={block.id}
          block={block}
          palette={palette}
          dark={dark}
          font={font}
          textureScale={blocks.length > 80 ? 1.5 : 2.25}
          selected={block.id === selectedId}
          muted={(Boolean(selectedId) && !highlighted.has(block.id)) || block.node.data.dimmed}
          current={block.id === currentId}
          fresh={fresh.has(block.id)}
          motion={motion}
          depth={depths.get(block.id) ?? 1}
          boot={boot}
          hover={hover}
          onSelect={onSelect}
        />
      ))}
      {current && <Explorer block={current} palette={palette} dark={dark} motion={motion} />}
      <Labels blocks={blocks} zones={zones} palette={palette} font={font} selectedId={selectedId} highlighted={highlighted} currentId={currentId} motion={motion} rise={boot} hover={hover} />

      <CameraRig frame={frame} byId={byId} mode={mode} layoutMode={layoutMode} selectedId={selectedId} currentId={currentId} follow={follow} motion={motion} orbit={orbit} command={command} inspectorWidth={inspectorWidth} />

      {/* Tilt-shift only touches the frame's far edges: a chip the reader is looking at must stay sharp. */}
      {dark ? (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.8} luminanceThreshold={1} luminanceSmoothing={0.2} radius={0.65} />
          <TiltShift2 blur={quality > 0 ? 0.05 : 0} taper={0.75} start={[0.5, 0]} end={[0.5, 1]} samples={quality > 0 ? 6 : 1} />
          <Noise premultiply opacity={0.35} />
          <Vignette darkness={0.6} offset={0.28} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={4}>
          <TiltShift2 blur={quality > 0 ? 0.04 : 0} taper={0.75} start={[0.5, 0]} end={[0.5, 1]} samples={quality > 0 ? 6 : 1} />
          <Vignette darkness={0.28} offset={0.3} />
        </EffectComposer>
      )}
    </>
  );
}
