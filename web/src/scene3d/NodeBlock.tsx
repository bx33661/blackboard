import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { BoxGeometry, Color, EdgesGeometry, Mesh, type Group, type MeshBasicMaterial, type MeshPhysicalMaterial } from 'three';
import { cardKey, cardTexture } from './card-texture';
import { UNIT, ratedSeverity, type Block } from './model';
import { nodeToken, type Palette } from './palette';
import type { HoverRef } from './shared';

type BlockProps = {
  block: Block; palette: Palette; dark: boolean; font: string; textureScale: number;
  selected: boolean; muted: boolean; current: boolean; fresh: boolean; motion: boolean;
  /** When this chip powers on, 0–1, against the board's boot clock. */
  depth: number;
  boot: { current: number };
  hover: HoverRef;
  onSelect: (id: string) => void;
};

/** A card as a packaged chip soldered to the board: as tall as its severity, the 2D card printed on its lid. */
export function NodeBlock({ block, palette, dark, font, textureScale, selected, muted, current, fresh, motion, depth, boot, hover, onSelect }: BlockProps) {
  const { item, compact } = block.node.data;
  const group = useRef<Group>(null);
  const body = useRef<MeshPhysicalMaterial>(null);
  const seamMaterial = useRef<MeshBasicMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);
  const [hovered, setHovered] = useState(false);
  const flashUntil = useRef(0);
  const seated = useRef(!motion);
  const hue = useMemo(() => palette.color(nodeToken(item.type)), [palette, item.type]);
  const severity = ratedSeverity(item.severity);
  // The package stays neutral so the printed lid is the brightest part: height, the seam of light at
  // the base and the heat around the chip carry severity. The kind's hue only reaches the body in a flash.
  const W = block.w * UNIT, D = block.d * UNIT;
  // Keyed on what the face shows: a stream tick hands over a new but identical item.
  const texture = useMemo(
    () => cardTexture(item, W, D, Boolean(compact), current, palette, font, textureScale),
    [cardKey(item), W, D, compact, current, palette, font, textureScale],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  const outline = useMemo(() => {
    const box = new BoxGeometry(block.w + 0.08, block.height + 0.08, block.d + 0.08);
    const edges = new EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [block.w, block.height, block.d]);
  useEffect(() => () => outline.dispose(), [outline]);
  const side = useMemo(() => new Color(palette.css(dark ? 'color-mix(in srgb, var(--surface-3) 55%, var(--bg))' : 'color-mix(in srgb, var(--ink-3) 45%, var(--surface))')), [palette, dark]);
  const seam = useMemo(() => severity === 'critical' || severity === 'high' ? palette.color(`--severity-${severity}`).multiplyScalar(dark ? 2.4 : 1) : null, [palette, severity, dark]);

  useLayoutEffect(() => {
    if (!motion) {
      flashUntil.current = 0;
      seated.current = true;
      if (group.current) {
        group.current.visible = true;
        group.current.position.y = 0;
      }
      if (body.current) body.current.emissiveIntensity = 0;
      if (seam) seamMaterial.current?.color.copy(seam);
    }
    invalidate();
  }, [block, texture, side, seam, motion, muted, selected, current, hovered, invalidate]);

  // A chip the Agent just wrote pushes up through the board and flashes once.
  useLayoutEffect(() => {
    if (!motion) { flashUntil.current = 0; return; }
    if (!fresh || !group.current) return;
    flashUntil.current = performance.now() + 1600;
    group.current.position.y = -block.height;
  }, [fresh, motion]);

  useFrame((state, delta) => {
    if (!motion) return;
    const node = group.current;
    if (!node) return;
    // The current reaches this chip at its depth on the boot clock; it seats and flashes as it arrives.
    const arrive = depth * 0.8;
    if (boot.current < 1 && boot.current < arrive) {
      seated.current = false;
      node.visible = false;
      node.position.y = -block.height;
      return;
    }
    node.visible = true;
    if (!seated.current) {
      seated.current = true;
      flashUntil.current = performance.now() + 900;
    }
    node.position.y *= 1 - Math.min(1, delta * 7);
    const breath = seam ? 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * (severity === 'critical' ? 2.2 : 1.4)) : 0.5;
    if (seam) seamMaterial.current?.color.copy(seam).multiplyScalar(0.6 + 0.8 * breath);
    if (body.current) {
      const flash = Math.max(0, (flashUntil.current - performance.now()) / 1000);
      body.current.emissiveIntensity = flash * (dark ? 1.4 : 0.3) * (muted ? 0.25 : 1);
    }
  });

  const over = (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); setHovered(true); hover.current = block.id; document.body.style.cursor = 'pointer'; };
  const out = () => { setHovered(false); hover.current = null; document.body.style.cursor = ''; };
  useEffect(() => () => { document.body.style.cursor = ''; }, []);
  const opacity = muted ? 0.25 : 1;
  // Three's raycaster ignores ancestor visibility, so a chip waiting below the board must opt out.
  const raycast: Mesh['raycast'] = function (this: Mesh, raycaster, intersections) {
    if (group.current?.visible) Mesh.prototype.raycast.call(this, raycaster, intersections);
  };

  return (
    <group ref={group} position={[block.x, motion ? -block.height : 0, block.z]} visible={!motion}>
      <RoundedBox
        args={[block.w, block.height, block.d]}
        radius={0.05}
        smoothness={3}
        position-y={block.height / 2}
        castShadow
        receiveShadow
        raycast={raycast}
        onClick={(event) => { event.stopPropagation(); onSelect(block.id); }}
        onPointerOver={over}
        onPointerOut={out}
      >
        {/* Always transparent: three compiles the blend mode once, so toggling it on selection would not take effect. */}
        <meshPhysicalMaterial ref={body} color={side} emissive={hue} emissiveIntensity={0} roughness={0.42} metalness={0.25} clearcoat={0.6} clearcoatRoughness={0.3} transparent opacity={opacity} depthWrite={!muted} />
      </RoundedBox>
      <mesh rotation-x={-Math.PI / 2} position-y={block.height + 0.003} raycast={() => null}>
        <planeGeometry args={[block.w - 0.06, block.d - 0.06]} />
        {/* Lit by its own emission, so the print keeps the card's colours under any light; the lacquer still reflects. */}
        <meshStandardMaterial color="#000000" map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={1} roughness={0.5} metalness={0} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      {/* Hidden while muted: through a faded package the seam would read as a solid slab. */}
      {seam && !muted && (
        <mesh position-y={0.025} raycast={() => null}>
          <boxGeometry args={[block.w + 0.03, 0.03, block.d + 0.03]} />
          <meshBasicMaterial ref={seamMaterial} color={seam} transparent toneMapped={false} />
        </mesh>
      )}
      {(selected || current || hovered) && (
        <lineSegments geometry={outline} position-y={block.height / 2} raycast={() => null}>
          <lineBasicMaterial color={palette.color(selected ? '--ink' : current ? '--live' : '--ink-3').multiplyScalar(dark ? 1.6 : 1)} toneMapped={false} />
        </lineSegments>
      )}
    </group>
  );
}
