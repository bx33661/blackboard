import type { Edge } from '@xyflow/react';
import type { EdgeRoute, Pt } from '../edge-route';
import { routeValid } from '../edge-route';
import { NODE_H, NODE_W, type CanvasNode, type RelationGroup } from '../graph';

/** Canvas pixels per world unit: a 288px card becomes a 2.88-unit chip. */
export const UNIT = 100;
/** The colour token behind plated metal: pins, mounting holes. */
export const GOLD = '--rel-produce';

/** Chip height by recorded severity. Unset stays a thin die; an unknown authored level is not ranked. */
const CHIP_HEIGHT: Record<'low' | 'medium' | 'high' | 'critical', number> = { low: 0.3, medium: 0.5, high: 0.8, critical: 1.2 };
const UNSET_HEIGHT = 0.14;
const UNKNOWN_HEIGHT = 0.4;
/** The level when it is one of the four ranked ones; anything else is shown as authored, without a rank. */
export const ratedSeverity = (severity?: string | null) => severity && Object.hasOwn(CHIP_HEIGHT, severity) ? severity as keyof typeof CHIP_HEIGHT : null;
export function chipHeight(severity?: string | null) {
  const rated = ratedSeverity(severity);
  return rated ? CHIP_HEIGHT[rated] : severity ? UNKNOWN_HEIGHT : UNSET_HEIGHT;
}

export type Block = {
  id: string;
  node: CanvasNode;
  /** Centre on the board, world units: canvas x → world x, canvas y → world z. */
  x: number;
  z: number;
  w: number;
  d: number;
  height: number;
};

export type Zone = { id: string; label: string; color?: string; x: number; z: number; w: number; d: number };

export type Link = {
  id: string;
  source: string;
  target: string;
  group: RelationGroup;
  /** The relation's own direction runs target → source (premise-first layout); signals travel that way. */
  reversed: boolean;
  /** A weak relation that waits for a selection before it is drawn. */
  quiet: boolean;
  /** The trace as drawn: straight runs and chamfered corners. */
  points: [number, number, number][];
  /** The same course sampled evenly, so a signal keeps its speed through long and short runs. */
  path: [number, number, number][];
};

/** Turns the 2D layout (React Flow positions, parent-relative in the overview) into board coordinates. */
export function sceneLayout(nodes: CanvasNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const blocks: Block[] = [];
  const zones: Zone[] = [];
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const left = node.position.x + (parent?.position.x || 0);
    const top = node.position.y + (parent?.position.y || 0);
    const w = Number(node.style?.width || NODE_W) / UNIT;
    const d = Number(node.style?.height || NODE_H) / UNIT;
    const x = left / UNIT + w / 2;
    const z = top / UNIT + d / 2;
    if (node.data.group) zones.push({ id: node.id, label: String(node.data.item?.title || ''), color: node.data.groupColor, x, z, w, d });
    else blocks.push({ id: node.id, node, x, z, w, d, height: chipHeight(node.data.item.severity) });
  }
  return { blocks, zones };
}

/** The board's footprint and the radius that frames all of it. */
export type SceneBounds = { cx: number; cz: number; w: number; d: number; radius: number };

export function sceneBounds(blocks: Block[]): SceneBounds {
  if (!blocks.length) return { cx: 0, cz: 0, w: 10, d: 10, radius: 8 };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const block of blocks) {
    minX = Math.min(minX, block.x - block.w / 2); maxX = Math.max(maxX, block.x + block.w / 2);
    minZ = Math.min(minZ, block.z - block.d / 2); maxZ = Math.max(maxZ, block.z + block.d / 2);
  }
  const w = maxX - minX, d = maxZ - minZ;
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w, d, radius: Math.max(4, Math.hypot(w, d) / 2) };
}

/** Everything the board's shape depends on: equal keys mean the last stream tick's traces still hold. */
export const shapeKey = (blocks: Block[]) => blocks.map((block) => `${block.id}:${block.x}:${block.z}:${block.w}:${block.d}:${block.height}`).join('|');
/** Everything about the relations that shapes a trace, beyond where the chips stand. */
export const tracesKey = (edges: Edge[]) => edges.map((edge) => {
  const data = edge.data as { group?: string; quiet?: boolean; reversed?: boolean } | undefined;
  return `${edge.id}:${edge.source}:${edge.target}:${data?.group}:${data?.quiet}:${data?.reversed}`;
}).join('|');

export type HomeFrame = { position: [number, number, number]; target: [number, number, number]; distance: number };

/** Share of the frame the board may fill, leaving room for the idle orbit and the floating toolbar. */
const FRAME_FILL = 0.92;

/**
 * Where the camera stands to see the whole board from the given angle: the closest distance at which
 * every corner of the board's box, up to `top`, projects inside the frame, with that projection centred.
 */
export function homeFrame(bounds: SceneBounds, top: number, aspect: number, fov: number, polar: number, azimuth: number): HomeFrame {
  const back = [Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)];
  const forward = back.map((value) => -value);
  const flat = Math.hypot(forward[0], forward[2]);
  const right = [-forward[2] / flat, 0, forward[0] / flat];
  const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const tanV = Math.tan((fov / 2) * (Math.PI / 180)) * FRAME_FILL, tanH = tanV * aspect;
  const corners: number[][] = [];
  for (const x of [-bounds.w / 2, bounds.w / 2]) for (const z of [-bounds.d / 2, bounds.d / 2]) for (const y of [0, top]) corners.push([bounds.cx + x, y, bounds.cz + z]);
  const target = [bounds.cx, top / 2, bounds.cz];
  let distance = 6;
  // Centring changes the distance needed and the other way round; a few rounds settle both.
  for (let round = 0; round < 6; round++) {
    const points = corners.map((corner) => {
      const offset = [corner[0] - target[0], corner[1] - target[1], corner[2] - target[2]];
      return { r: dot(offset, right), u: dot(offset, up), f: dot(offset, forward) };
    });
    distance = Math.max(6, ...points.map(({ r, u, f }) => Math.max(Math.abs(r) / tanH, Math.abs(u) / tanV) - f));
    const sx = points.map(({ r, f }) => r / ((distance + f) * tanH)), sy = points.map(({ u, f }) => u / ((distance + f) * tanV));
    const midX = ((Math.min(...sx) + Math.max(...sx)) / 2) * distance * tanH, midY = ((Math.min(...sy) + Math.max(...sy)) / 2) * distance * tanV;
    for (let axis = 0; axis < 3; axis++) target[axis] += right[axis] * midX + up[axis] * midY;
  }
  return {
    position: [target[0] + back[0] * distance, target[1] + back[1] * distance, target[2] + back[2] * distance],
    target: [target[0], target[1], target[2]],
    distance,
  };
}

/** Board distance between a signal's path samples. */
const STEP = 0.15;
const TRACE_Y = 0.03;
const CHAMFER = 0.16;

/** Cuts each corner at 45°, the way copper turns on a circuit board; a cut never takes over half a run. */
export function chamfer(points: Pt[], size = CHAMFER): Pt[] {
  const out = points.length ? [points[0]] : [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], corner = points[i], next = points[i + 1];
    const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y), outLen = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(size, inLen / 2, outLen / 2);
    const turn = (corner.x - prev.x) * (next.y - corner.y) - (corner.y - prev.y) * (next.x - corner.x);
    if (r < 0.01 || Math.abs(turn) < 1e-6) { out.push(corner); continue; }
    out.push({ x: corner.x - ((corner.x - prev.x) / inLen) * r, y: corner.y - ((corner.y - prev.y) / inLen) * r });
    out.push({ x: corner.x + ((next.x - corner.x) / outLen) * r, y: corner.y + ((next.y - corner.y) / outLen) * r });
  }
  if (points.length > 1) out.push(points[points.length - 1]);
  return out;
}

/** Samples a polyline every STEP. */
export function resample(line: Pt[]): [number, number, number][] {
  const lengths = [0];
  for (let i = 1; i < line.length; i++) lengths.push(lengths[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const total = lengths[lengths.length - 1];
  const samples = Math.min(240, Math.max(2, Math.ceil(total / STEP)));
  const out: [number, number, number][] = [];
  let segment = 1;
  for (let s = 0; s <= samples; s++) {
    const at = (s / samples) * total;
    while (segment < line.length - 1 && lengths[segment] < at) segment++;
    const a = line[segment - 1], b = line[segment];
    const span = lengths[segment] - lengths[segment - 1] || 1;
    const k = Math.min(1, Math.max(0, (at - lengths[segment - 1]) / span));
    out.push([a.x + (b.x - a.x) * k, TRACE_Y, a.y + (b.y - a.y) * k]);
  }
  return out;
}

/** A plain right-angled run between the facing edges of two chips, for relations without a usable route. */
function rightAngled(source: Block, target: Block): Pt[] {
  const dx = target.x - source.x, dz = target.z - source.z;
  if (Math.abs(dx) >= Math.abs(dz)) {
    const sign = Math.sign(dx) || 1;
    const a = { x: source.x + sign * source.w / 2, y: source.z }, b = { x: target.x - sign * target.w / 2, y: target.z };
    const mid = (a.x + b.x) / 2;
    return [a, { x: mid, y: a.y }, { x: mid, y: b.y }, b];
  }
  const sign = Math.sign(dz);
  const a = { x: source.x, y: source.z + sign * source.d / 2 }, b = { x: target.x, y: target.z - sign * target.d / 2 };
  const mid = (a.y + b.y) / 2;
  return [a, { x: a.x, y: mid }, { x: b.x, y: mid }, b];
}

/**
 * A relation's course from chip edge to chip edge. It follows ELK's route while that route still
 * matches the chips, so long traces keep going around the chips between their ends.
 */
export function traceCourse(source: Block, target: Block, route: EdgeRoute | undefined): Pt[] {
  const flat = !source.node.parentId && !target.node.parentId && routeValid(route, source.node.position, target.node.position);
  return chamfer(flat ? route!.points.map((point) => ({ x: point.x / UNIT, y: point.y / UNIT })) : rightAngled(source, target));
}

export const touches = (link: Link, id: string | null) => Boolean(id) && (link.source === id || link.target === id);

/** Every relation between two chips on the board. */
export function sceneTraces(edges: Edge[], blocks: Block[]): Link[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const links: Link[] = [];
  for (const edge of edges) {
    const data = edge.data as { group?: RelationGroup; quiet?: boolean; reversed?: boolean; route?: EdgeRoute } | undefined;
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target) continue;
    const course = traceCourse(source, target, data?.route);
    links.push({
      id: edge.id, source: edge.source, target: edge.target, group: data?.group || 'link', reversed: Boolean(data?.reversed), quiet: Boolean(data?.quiet),
      points: course.map((point): [number, number, number] => [point.x, TRACE_Y, point.y]), path: resample(course),
    });
  }
  return links;
}

/** Which relations are drawn follows the 2D canvas: the overview and quiet links wait for a selection. */
export const visibleTraces = (traces: Link[], selectedId: string | null, overview: boolean) =>
  traces.filter((trace) => touches(trace, selectedId) || !(overview || (!selectedId && trace.quiet)));

/** How far the physical board reaches past the outermost chips. */
const BOARD_MARGIN = 1.6;
export const boardBounds = (bounds: SceneBounds): SceneBounds => ({ ...bounds, w: bounds.w + BOARD_MARGIN * 2, d: bounds.d + BOARD_MARGIN * 2 });

/**
 * When each chip powers on, 0–1: hops along recorded relations from the goals (or the first chip).
 * Chips no relation reaches come on last.
 */
export function bootDepths(blocks: Block[], links: Link[]): ReadonlyMap<string, number> {
  const neighbours = new Map<string, string[]>(blocks.map((block) => [block.id, []]));
  for (const link of links) {
    neighbours.get(link.source)?.push(link.target);
    neighbours.get(link.target)?.push(link.source);
  }
  const goals = blocks.filter((block) => block.node.data.item.type === 'goal').map((block) => block.id);
  const hops = new Map<string, number>();
  let wave = goals.length ? goals : blocks.slice(0, 1).map((block) => block.id);
  for (let hop = 0; wave.length; hop++) {
    const next: string[] = [];
    for (const id of wave) if (!hops.has(id)) { hops.set(id, hop); next.push(...(neighbours.get(id) || [])); }
    wave = next;
  }
  const deepest = Math.max(1, ...hops.values());
  return new Map(blocks.map((block) => [block.id, hops.has(block.id) ? hops.get(block.id)! / deepest : 1]));
}

/** A flat strip along a polyline: two vertices per point, mitred at corners, with the distance run so far. */
export function ribbonStrip(points: [number, number, number][], half: number) {
  const positions: number[] = [], along: number[] = [], side: number[] = [];
  let run = 0;
  points.forEach(([x, y, z], i) => {
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    if (i) run += Math.hypot(x - prev[0], z - prev[2]);
    const inLen = Math.hypot(x - prev[0], z - prev[2]) || 1, outLen = Math.hypot(next[0] - x, next[2] - z) || 1;
    const ax = (x - prev[0]) / inLen, az = (z - prev[2]) / inLen, bx = (next[0] - x) / outLen, bz = (next[2] - z) / outLen;
    const tx = ax + bx, tz = az + bz, length = Math.hypot(tx, tz) || 1;
    const nx = -tz / length, nz = tx / length;
    const reach = half / Math.max(0.5, nx * -(i ? az : bz) + nz * (i ? ax : bx));
    for (const s of [-1, 1]) {
      positions.push(x + nx * reach * s, y, z + nz * reach * s);
      along.push(run);
      side.push(s);
    }
  });
  return { positions, along, side, length: run };
}

export type TraceArrowhead = {
  /** Tip, then the two base corners, wound toward the top of the board. */
  positions: number[];
  /** Distance back from the recorded relation's destination for each vertex. */
  setbacks: [number, number, number];
};

/** A solid arrow anchored to the recorded destination, contained within its last nonzero run. */
export function traceArrowhead(points: [number, number, number][], reversed: boolean, length: number, halfWidth: number): TraceArrowhead | null {
  if (points.length < 2 || !Number.isFinite(length) || !Number.isFinite(halfWidth) || length <= 0 || halfWidth <= 0) return null;
  const end = reversed ? 0 : points.length - 1;
  const step = reversed ? 1 : -1;
  const tip = points[end];
  for (let i = end + step; i >= 0 && i < points.length; i += step) {
    const previous = points[i];
    const dx = tip[0] - previous[0], dz = tip[2] - previous[2];
    const run = Math.hypot(dx, dz);
    if (run <= 1e-6) continue;
    if (!Number.isFinite(run)) return null;
    const reach = Math.min(length, run);
    const width = halfWidth * (reach / length);
    const tx = dx / run, tz = dz / run;
    const bx = tip[0] - tx * reach, bz = tip[2] - tz * reach;
    return {
      positions: [tip[0], tip[1], tip[2], bx + tz * width, tip[1], bz - tx * width, bx - tz * width, tip[1], bz + tx * width],
      setbacks: [0, reach, reach],
    };
  }
  return null;
}
