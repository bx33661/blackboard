import { useEffect, useMemo, useRef } from 'react';
import type { Edge } from '@xyflow/react';
import { useFrame, useThree } from '@react-three/fiber';
import { Scene, Sprite, SpriteMaterial, Vector3, type Texture } from 'three';
import { detailLevel } from '../canvas-state';
import { LABEL_PX, cardKey, labelTexture, zoneTexture } from './card-texture';
import { UNIT, ratedSeverity, touches, type Block, type Link, type Zone } from './model';
import { relationToken, type Palette } from './palette';
import { FOV, type HoverRef } from './shared';

const projected = new Vector3();
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
/** Below this zoom ordinary cards drop their floating names. */
const QUIET_ZOOM = 0.5;

type LabelsProps = {
  blocks: Block[]; zones: Zone[]; palette: Palette; font: string;
  links: Link[]; edges: Edge[];
  selectedId: string | null; highlighted: ReadonlySet<string>; currentId: string | null; motion: boolean;
  /** How far the chips have risen, 0–1: labels wait until they stand. */
  rise: { current: number };
  hover: HoverRef;
};

type LabelEntry = { id: string; zone: Zone | null; linkId: string | null; sprite: Sprite; material: SpriteMaterial; aspect: number };
type BuiltLabel = { key: string; entry: LabelEntry };
type LabelPool = { palette: Palette; font: string; items: ReadonlyMap<string, BuiltLabel> };

const zoneKey = (zone: Zone) => [zone.id, zone.label, zone.color, zone.x, zone.z, zone.w, zone.d].join('\0');
function release({ material }: LabelEntry) {
  material.map?.dispose();
  material.dispose();
}

/**
 * Seen from afar a card's face is unreadable, so a floating headline stands in for it at a constant
 * screen size. Once the card is as large on screen as a readable card on the flat canvas the label
 * steps aside. Labels never overlap: the hovered card, group names, the selection, the current
 * position, then higher severity, goals and better-connected cards claim their space first.
 */
export function Labels({ blocks, zones, links, edges, palette, font, selectedId, highlighted, currentId, motion, rise, hover }: LabelsProps) {
  const { camera, gl, size, invalidate } = useThree();
  // Survives rebuilds of the entries, so labels already on screen do not blink.
  const shown = useRef(new Map<string, number>());
  const byId = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const linkById = useMemo(() => new Map(links.map((link) => [link.id, link])), [links]);
  const captions = useMemo(() => new Map(edges.flatMap((edge) => typeof edge.label === 'string' && edge.label ? [[edge.id, edge.label] as const] : [])), [edges]);
  const namedLinks = useMemo(() => selectedId ? links.filter((link) => touches(link, selectedId) && captions.has(link.id)) : [], [links, selectedId, captions]);
  const content = [...zones.map(zoneKey), ...blocks.map((block) => `${block.id}\0${cardKey(block.node.data.item)}`), ...namedLinks.map((link) => `relation:${link.id}\0${captions.get(link.id)}\0${link.group}`)].join('\n');
  // What the last committed pool holds; retired only in the effect below, once the new pool is on screen.
  const built = useRef<LabelPool>({ palette, font, items: new Map() });
  const pool = useMemo<LabelPool>(() => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const reusable = built.current.palette === palette && built.current.font === font ? built.current.items : new Map<string, BuiltLabel>();
    const items = new Map<string, BuiltLabel>();
    // A stream tick that edits one card redraws one label, not the whole board's.
    const add = (id: string, key: string, zone: Zone | null, draw: () => { texture: Texture; aspect: number }, linkId: string | null = null) => {
      const hit = reusable.get(id);
      if (hit?.key === key) { items.set(id, hit); return; }
      const { texture, aspect } = draw();
      const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, opacity: shown.current.get(id) || 0, toneMapped: false, sizeAttenuation: false });
      const sprite = new Sprite(material);
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 10;
      sprite.visible = false;
      sprite.raycast = () => null;
      items.set(id, { key, entry: { id, zone, linkId, sprite, material, aspect } });
    };
    for (const zone of zones) add(zone.id, zoneKey(zone), zone, () => zoneTexture(zone.label, palette.css(zone.color || '--ink-3'), palette, font, ratio));
    for (const block of blocks) add(block.id, cardKey(block.node.data.item), null, () => labelTexture(block.node.data.item, palette, font, ratio));
    for (const link of namedLinks) {
      const caption = captions.get(link.id)!;
      add(`relation:${link.id}`, `${caption}\0${link.group}`, null, () => zoneTexture(caption, palette.css(relationToken(link.group)), palette, font, ratio), link.id);
    }
    return { palette, font, items };
  }, [content, palette, font]);
  const entries = useMemo(() => [...pool.items.values()].map(({ entry }) => entry), [pool]);
  useEffect(() => {
    const { items } = built.current;
    built.current = pool;
    items.forEach((label, id) => {
      if (pool.items.get(id) !== label) release(label.entry);
      if (!pool.items.has(id)) shown.current.delete(id);
    });
  }, [pool]);
  useEffect(() => () => built.current.items.forEach(({ entry }) => release(entry)), []);
  // Labels live in their own scene, drawn over the finished frame so tilt-shift never blurs them.
  const overlay = useMemo(() => new Scene(), []);
  useEffect(() => {
    if (entries.length) overlay.add(...entries.map(({ sprite }) => sprite));
    invalidate();
    return () => { overlay.clear(); };
  }, [overlay, entries, invalidate]);
  const order = useMemo(() => {
    const score = ({ id, zone, linkId }: LabelEntry) => {
      if (linkId) return 5e5;
      const block = byId.get(id);
      if (zone || !block) return 1e7;
      const { item, degree } = block.node.data;
      const rated = ratedSeverity(item.severity);
      return (id === selectedId ? 1e6 : 0) + (id === currentId ? 1e5 : 0)
        + (rated ? SEVERITY_RANK[rated] : item.severity ? 1 : 0) * 1e4
        + (item.type === 'goal' ? 5e3 : 0) + degree * 10;
    };
    return [...entries].sort((a, b) => score(b) - score(a));
  }, [entries, byId, selectedId, currentId]);
  const live = useRef({ selectedId, highlighted, byId, currentId, linkById });
  live.current = { selectedId, highlighted, byId, currentId, linkById };
  useEffect(() => { invalidate(); }, [selectedId, currentId, highlighted, byId, linkById, motion, invalidate]);

  useFrame((_, delta) => {
    const { selectedId: selected, highlighted: lit, byId: cards, currentId: here, linkById: relations } = live.current;
    const tan = Math.tan((FOV / 2) * (Math.PI / 180));
    const unit = (2 * tan) / Math.max(1, size.height);
    const placed: [number, number, number, number][] = [];
    const place = ({ id, zone, linkId, sprite, material, aspect }: LabelEntry) => {
      const block = zone || linkId ? undefined : cards.get(id);
      const link = linkId ? relations.get(linkId) : undefined;
      if (block) sprite.position.set(block.x, block.height + 0.2, block.z);
      else if (zone) sprite.position.set(zone.x - zone.w / 2 + 1, 0.3, zone.z - zone.d / 2 + 0.3);
      else if (link?.path.length) {
        const anchor = link.path[Math.floor((link.path.length - 1) / 2)];
        sprite.position.set(anchor[0], 0.18, anchor[2]);
      }
      sprite.scale.set(LABEL_PX * unit * aspect, LABEL_PX * unit, 1);
      // Screen pixels per canvas pixel at this card: the 3D counterpart of the flat canvas zoom.
      const zoom = size.height / (2 * tan * camera.position.distanceTo(sprite.position) * UNIT);
      const item = block?.node.data.item;
      // From far away only what the reader is looking for is named, so the chips stay the picture.
      const named = zoom >= QUIET_ZOOM || id === selected || id === here || id === hover.current || item?.type === 'goal' || ratedSeverity(item?.severity) !== null;
      let show = rise.current > 0.8 && (block
        ? named && !block.node.data.dimmed && !(selected && !lit.has(id)) && detailLevel(zoom) === 'overview'
        : link ? Boolean(selected && touches(link, selected)) : Boolean(zone && !selected));
      if (show) {
        projected.copy(sprite.position).project(camera);
        const x = (projected.x + 1) / 2 * size.width, y = (1 - projected.y) / 2 * size.height;
        const w = LABEL_PX * aspect, rect: [number, number, number, number] = [x - w / 2 - 3, y - LABEL_PX - 3, x + w / 2 + 3, y + 3];
        show = projected.z < 1 && rect[2] > 0 && rect[0] < size.width && rect[3] > 0 && rect[1] < size.height
          && !placed.some((other) => rect[0] < other[2] && rect[2] > other[0] && rect[1] < other[3] && rect[3] > other[1]);
        if (show) placed.push(rect);
      }
      const target = show ? 1 : 0;
      material.opacity = motion ? material.opacity + (target - material.opacity) * Math.min(1, delta * 8) : target;
      sprite.visible = material.opacity > 0.02;
      shown.current.set(id, material.opacity);
    };
    const first = hover.current ? order.find(({ id }) => id === hover.current) : undefined;
    if (first) place(first);
    for (const entry of order) if (entry !== first) place(entry);
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(overlay, camera);
    gl.autoClear = true;
    // Priority 2: runs after EffectComposer (priority 1) has written the frame.
  }, 2);

  return null;
}
