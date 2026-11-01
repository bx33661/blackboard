import type { Ref } from 'react';
import type { Edge } from '@xyflow/react';
import type { CanvasNode } from '../graph';
import type { ViewMode } from '../types';

export type Scene3DHandle = { exportImage: () => Promise<void> };
/** Pixels covered by the Inspector at the right or bottom edge of the canvas. */
export type SceneOcclusion = { right: number; bottom: number };

export type Scene3DProps = {
  nodes: CanvasNode[];
  edges: Edge[];
  mode: ViewMode;
  /** The view that produced nodes; updated only after its asynchronous layout completes. */
  layoutMode: ViewMode | null;
  theme: 'light' | 'dark';
  selectedId: string | null;
  /** The selection and its explicitly recorded one-hop neighbours; everything else is muted. */
  highlighted: ReadonlySet<string>;
  currentId: string | null;
  follow: boolean;
  fresh: ReadonlySet<string>;
  /** False under prefers-reduced-motion: no orbit, flights, pulses or breathing. */
  motion: boolean;
  occlusion: SceneOcclusion;
  ref: Ref<Scene3DHandle>;
  exporting: boolean;
  onExport: () => void;
  onSelect: (id: string | null) => void;
  onExit: () => void;
  onNotice: (message: string) => void;
};

/** Quality steps PerformanceMonitor walks down: 2 full, 1 lower resolution, 0 no shadows or tilt-shift. */
export type Quality = 0 | 1 | 2;

export type Command = { kind: 'home' | 'focus'; id?: string; serial: number };

/** The card under the pointer; written every hover, read every frame, so it never re-renders the scene. */
export type HoverRef = { current: string | null };

export const FOV = 38;
