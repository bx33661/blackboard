import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import type { ViewMode } from '../types';
import type { Block, HomeFrame } from './model';
import { FOV, type Command, type SceneOcclusion } from './shared';

export const HOME_POLAR = 1.0;
export const HOME_AZIMUTH = -0.42;
const FOCUS_POLAR = 0.95;

type RigProps = {
  frame: HomeFrame;
  byId: ReadonlyMap<string, Block>;
  mode: ViewMode;
  layoutMode: ViewMode | null;
  selectedId: string | null;
  currentId: string | null;
  follow: boolean;
  motion: boolean;
  orbit: boolean;
  command: Command;
  occlusion: SceneOcclusion;
};

/**
 * The camera opens with a dive from overhead onto the whole board, flies to whatever gets selected,
 * returns when the selection clears, follows the Agent's cursor when asked, and drifts slowly around
 * the board while nobody touches it.
 */
export function CameraRig({ frame, byId, mode, layoutMode, selectedId, currentId, follow, motion, orbit, command, occlusion }: RigProps) {
  const controls = useRef<CameraControls>(null);
  const { size, invalidate } = useThree();
  const lastTouch = useRef(performance.now());
  const introduced = useRef(false);
  const framedMode = useRef<ViewMode | null>(null);
  // True while the camera sits where a selection flew it; dragging or zooming claims the view.
  const flown = useRef(false);
  const focalDistance = useRef<number | null>(null);
  const live = useRef({ frame, byId, size, selectedId, occlusion });
  live.current = { frame, byId, size, selectedId, occlusion };
  const focusId = selectedId ?? (follow && mode !== 'all' ? currentId : null);
  const focused = focusId ? byId.get(focusId) : undefined;
  const populated = byId.size > 0;

  const inset = (distance: number, animate: boolean) => {
    const c = controls.current;
    if (!c) return;
    const { size: area, occlusion: covered } = live.current;
    const height = 2 * distance * Math.tan((FOV / 2) * (Math.PI / 180));
    c.setFocalOffset(covered.right / (2 * Math.max(1, area.height)) * height, covered.bottom / (2 * Math.max(1, area.height)) * height, 0, animate);
    invalidate();
  };

  const home = (animate: boolean) => {
    const c = controls.current;
    if (!c) return;
    const { position, target } = live.current.frame;
    focalDistance.current = live.current.frame.distance;
    c.setLookAt(...position, ...target, animate);
    inset(live.current.frame.distance, animate);
  };

  const focus = (id: string, animate: boolean) => {
    const c = controls.current;
    const block = live.current.byId.get(id);
    if (!c || !block) return false;
    const distance = 7.5 + Math.max(block.w, block.d);
    focalDistance.current = distance;
    const azimuth = c.azimuthAngle;
    const y = block.height;
    c.setLookAt(
      block.x + distance * Math.sin(FOCUS_POLAR) * Math.sin(azimuth), y + distance * Math.cos(FOCUS_POLAR), block.z + distance * Math.sin(FOCUS_POLAR) * Math.cos(azimuth),
      block.x, y, block.z, animate,
    );
    inset(distance, animate);
    return true;
  };

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.smoothTime = motion ? 0.55 : 0;
    c.draggingSmoothTime = motion ? 0.12 : 0;
    const claim = () => { lastTouch.current = performance.now(); flown.current = false; focalDistance.current = null; };
    c.addEventListener('controlstart', claim);
    c.addEventListener('control', claim);
    return () => { c.removeEventListener('controlstart', claim); c.removeEventListener('control', claim); };
  }, [motion]);

  // A mode changes before its asynchronous layout. Frame only the completed layout, and retry
  // a requested chip when its coordinates arrive without re-focusing on content-only stream ticks.
  useEffect(() => {
    const c = controls.current;
    if (layoutMode !== mode || !populated || !c) return;
    const opening = !introduced.current;
    const modeChanged = framedMode.current !== mode;
    if (opening) {
      introduced.current = true;
      const [x, , z] = live.current.frame.target;
      c.setLookAt(x, live.current.frame.distance * 2.4, z + 0.01, x, 0, z, false);
    }
    framedMode.current = mode;
    lastTouch.current = performance.now();
    if (focusId) {
      if (focus(focusId, motion)) flown.current = Boolean(selectedId);
      else if (opening || modeChanged) home(motion);
    } else if (opening || modeChanged || flown.current) {
      home(motion);
      flown.current = false;
    } else {
      // The Inspector closed: its offset goes, but a view the reader framed stays.
      inset(c.distance, motion);
    }
  }, [mode, layoutMode, populated, focusId, selectedId, focused?.x, focused?.z, focused?.w, focused?.d, focused?.height]);

  useEffect(() => {
    const c = controls.current;
    if (!introduced.current || !c) return;
    if (!focusId && focalDistance.current !== null) home(motion);
    else inset(focalDistance.current ?? c.distance, motion);
  }, [occlusion.right, occlusion.bottom, size.width, size.height, motion]);

  useEffect(() => {
    if (!command.serial) return;
    if (command.kind === 'home') home(motion); else if (command.id) focus(command.id, motion);
    lastTouch.current = performance.now();
  }, [command]);


  useFrame((_, delta) => {
    const c = controls.current;
    if (!c || !orbit || live.current.selectedId || performance.now() - lastTouch.current < 5000) return;
    c.rotate(delta * 0.035, 0, false);
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={2.5}
      maxDistance={frame.distance * 2.6}
      minPolarAngle={0.12}
      maxPolarAngle={1.32}
      dollySpeed={0.6}
    />
  );
}
