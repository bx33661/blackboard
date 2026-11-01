import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, NormalBlending, Object3D, type InstancedMesh, type MeshBasicMaterial } from 'three';
import { GOLD, ratedSeverity, type Block } from './model';
import type { Palette } from './palette';

const dummy = new Object3D();
const PIN_PITCH = 0.36;
const PIN_REACH = 0.1;
/** How far heat spreads around a chip and how hot it reads, by recorded severity. Low runs cold. */
const HEAT = { medium: { spread: 0.5, power: 0.35 }, high: { spread: 0.9, power: 0.7 }, critical: { spread: 1.4, power: 1 } };

function pinsOf(block: Block): [number, number, number, boolean][] {
  const pins: [number, number, number, boolean][] = [];
  const across = Math.floor(block.w / PIN_PITCH), down = Math.floor(block.d / PIN_PITCH);
  for (let i = 0; i < across; i++) {
    const x = block.x + (i - (across - 1) / 2) * PIN_PITCH;
    pins.push([x, block.z - block.d / 2, -1, true], [x, block.z + block.d / 2, 1, true]);
  }
  for (let i = 0; i < down; i++) {
    const z = block.z + (i - (down - 1) / 2) * PIN_PITCH;
    pins.push([block.x - block.w / 2, z, -1, false], [block.x + block.w / 2, z, 1, false]);
  }
  return pins;
}

/** Gold-plated legs along every chip's edges, printed before any chip seats; one instanced draw for the board. */
export function Pins({ blocks, palette, faded }: { blocks: Block[]; palette: Palette; faded: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const pins = useMemo(() => blocks.flatMap(pinsOf), [blocks]);
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    pins.forEach(([x, z, side, horizontal], i) => {
      dummy.position.set(x + (horizontal ? 0 : side * PIN_REACH / 2), 0.03, z + (horizontal ? side * PIN_REACH / 2 : 0));
      dummy.scale.set(horizontal ? 0.09 : PIN_REACH * 2, 0.04, horizontal ? PIN_REACH * 2 : 0.09);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
    });
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
    invalidate();
  }, [pins, invalidate]);
  return (
    <instancedMesh key={pins.length} ref={mesh} args={[undefined, undefined, pins.length]} raycast={() => null}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={palette.css(GOLD)} metalness={1} roughness={0.32} transparent opacity={faded ? 0.25 : 1} />
    </instancedMesh>
  );
}

function softTexture(paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  paint(canvas.getContext('2d')!);
  return new CanvasTexture(canvas);
}

/** The soft dark seat under each chip, which grounds it on the board at any camera angle. */
export function ContactShadows({ blocks, boot }: { blocks: Block[]; boot: { current: number } }) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);
  const seat = useMemo(() => softTexture((ctx) => {
    ctx.filter = 'blur(11px)';
    ctx.fillStyle = 'black';
    ctx.fillRect(26, 26, 76, 76);
  }), []);
  useEffect(() => () => seat.dispose(), [seat]);
  // Faded in late: before its chip seats, a shadow is only a stain on the board.
  useFrame(() => { if (material.current) material.current.opacity = 0.6 * Math.max(0, Math.min(1, (boot.current - 0.8) * 5)); });
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    blocks.forEach((block, i) => {
      dummy.position.set(block.x, 0.008, block.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set((block.w + 0.3) * 1.68, (block.d + 0.3) * 1.68, 1);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
    });
    dummy.rotation.set(0, 0, 0);
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
    invalidate();
  }, [blocks, invalidate]);
  return (
    <instancedMesh key={blocks.length} ref={mesh} args={[undefined, undefined, blocks.length]} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={material} map={seat} transparent opacity={0.6 * Math.max(0, Math.min(1, (boot.current - 0.8) * 5))} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/** Heat bleeding onto the board around medium and worse chips, in the severity colour, once the board is powered. */
export function Heat({ blocks, palette, dark, faded, boot }: { blocks: Block[]; palette: Palette; dark: boolean; faded: boolean; boot: { current: number } }) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);
  const spots = useMemo(() => blocks.flatMap((block) => {
    const rated = ratedSeverity(block.node.data.item.severity);
    return rated && rated !== 'low' ? [{ block, rated, ...HEAT[rated] }] : [];
  }), [blocks]);
  const glow = useMemo(() => softTexture((ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(0.75, 'rgba(255,255,255,0.08)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }), []);
  useEffect(() => () => glow.dispose(), [glow]);
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    spots.forEach(({ block, rated, spread, power }, i) => {
      dummy.position.set(block.x, 0.015, block.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(block.w + spread * 2, block.d + spread * 2, 1);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
      // Additive light fades towards black; printed on paper the same fade has to go towards the paper.
      const tone = palette.color(`--severity-${rated}`);
      node.setColorAt(i, dark ? tone.multiplyScalar(power) : tone.lerp(palette.color('--surface'), 1 - power));
    });
    dummy.rotation.set(0, 0, 0);
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
    invalidate();
  }, [spots, palette, dark, invalidate]);
  useFrame(() => {
    if (material.current) material.current.opacity = (dark ? 0.4 : 0.5) * (faded ? 0.25 : 1) * Math.max(0, (boot.current - 0.8) * 5);
  });
  if (!spots.length) return null;
  return (
    <instancedMesh key={spots.length} ref={mesh} args={[undefined, undefined, spots.length]} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={material} map={glow} transparent opacity={(dark ? 0.4 : 0.5) * (faded ? 0.25 : 1) * Math.max(0, (boot.current - 0.8) * 5)} blending={dark ? AdditiveBlending : NormalBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}
