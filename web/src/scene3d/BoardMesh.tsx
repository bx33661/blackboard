import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, RoundedBox } from '@react-three/drei';
import { DoubleSide } from 'three';
import { boardMaterial } from './board-material';
import { GOLD, type Block, type SceneBounds } from './model';
import type { Palette } from './palette';

const THICKNESS = 0.24;
/** Distance from the board's edge to the printed border and the mounting holes. */
const INSET = 0.38;
/** How far below the board the stage lies, so the board visibly floats over its own shadow. */
const STAGE_DROP = 1.3;

/** A finished board: a lacquered slab with a printed border and plated mounting holes, floating over its own shadow. */
export function BoardMesh({ board, palette, dark, current, motion }: { board: SceneBounds; palette: Palette; dark: boolean; current?: Block; motion: boolean }) {
  const { cx, cz, w, d } = board;
  const skin = useMemo(
    () => boardMaterial(palette, dark, palette.color('--live').multiplyScalar(dark ? 1.5 : 0.9), cx, cz, Math.hypot(w, d) / 2),
    [palette, dark, cx, cz, w, d],
  );
  useEffect(() => () => skin.material.dispose(), [skin]);
  const reach = Math.max(8, Math.min(18, Math.hypot(w, d) / 2));
  useFrame((state) => {
    if (!current || !motion) { skin.scanPower.value = 0; return; }
    const radius = (state.clock.elapsedTime * 2.2) % reach;
    skin.scan.value.set(current.x, current.z, radius);
    skin.scanPower.value = 1 - radius / reach;
  });
  const l = cx - w / 2 + INSET, r = cx + w / 2 - INSET, t = cz - d / 2 + INSET, b = cz + d / 2 - INSET;
  const gold = palette.css(GOLD);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[cx, -STAGE_DROP, cz]} receiveShadow raycast={() => null}>
        <planeGeometry args={[Math.hypot(w, d) * 10, Math.hypot(w, d) * 10]} />
        {/* Catches the shadow only: the stage keeps the scene background's exact colour under any light. */}
        <shadowMaterial opacity={dark ? 0.6 : 0.3} />
      </mesh>
      <RoundedBox args={[w, THICKNESS, d]} radius={0.08} smoothness={3} position={[cx, -THICKNESS / 2, cz]} castShadow receiveShadow raycast={() => null}>
        <primitive object={skin.material} attach="material" />
      </RoundedBox>
      <Line points={[[l, 0.012, t], [r, 0.012, t], [r, 0.012, b], [l, 0.012, b], [l, 0.012, t]]} color={palette.css('--ink-3')} lineWidth={1} transparent opacity={0.35} toneMapped={false} raycast={() => null} />
      {[[l, t], [r, t], [l, b], [r, b]].map(([x, z]) => (
        <mesh key={`${x}:${z}`} rotation-x={-Math.PI / 2} position={[x, 0.014, z]} raycast={() => null}>
          <ringGeometry args={[0.08, 0.17, 40]} />
          <meshStandardMaterial color={gold} metalness={1} roughness={0.3} side={DoubleSide} />
        </mesh>
      ))}
    </>
  );
}
