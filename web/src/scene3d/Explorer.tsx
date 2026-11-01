import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide, ShaderMaterial, type Mesh, type MeshBasicMaterial } from 'three';
import type { Block } from './model';
import type { Palette } from './palette';

const coneShader = {
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  // MSAA can extrapolate vUv just outside 0–1, and pow() of a negative base is NaN, which bloom then spreads across the frame.
  fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main() { gl_FragColor = vec4(uColor, pow(clamp(vUv.y, 0.0, 1.0), 1.4) * uOpacity); }',
};

/**
 * The Agent's current position: a gem hovering over the card, turning slowly, casting a cone of light
 * and a green glow onto the chip and the board around it, with ripples spreading over the chip.
 */
export function Explorer({ block, palette, dark, motion }: { block: Block; palette: Palette; dark: boolean; motion: boolean }) {
  const live = useMemo(() => palette.color('--live'), [palette]);
  const cone = useMemo(() => new ShaderMaterial({
    ...coneShader,
    uniforms: { uColor: { value: live.clone().multiplyScalar(dark ? 1.3 : 1) }, uOpacity: { value: dark ? 0.32 : 0.22 } },
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  }), [live, dark]);
  useEffect(() => () => cone.dispose(), [cone]);
  const gem = useRef<Mesh>(null);
  const rings = useRef<(Mesh | null)[]>([]);
  const invalidate = useThree((state) => state.invalidate);
  const top = block.height;
  const hover = 1.25;
  const reach = Math.min(block.w, block.d) * 0.5;

  useLayoutEffect(() => {
    if (!motion) {
      if (gem.current) {
        gem.current.rotation.y = 0;
        gem.current.position.y = top + hover;
      }
      for (let i = 0; i < rings.current.length; i++) {
        const ring = rings.current[i];
        if (!ring) continue;
        const phase = 0.35 + i * 0.3;
        ring.scale.setScalar(reach * (0.35 + phase * 1.1));
        (ring.material as MeshBasicMaterial).opacity = (1 - phase) * 0.55;
      }
    }
    invalidate();
  }, [block, cone, motion, reach, top, invalidate]);

  useFrame((state, delta) => {
    if (!motion) return;
    const time = state.clock.elapsedTime;
    if (gem.current) {
      gem.current.rotation.y += delta * 1.1;
      gem.current.position.y = top + hover + Math.sin(time * 1.8) * 0.08;
    }
    for (let i = 0; i < rings.current.length; i++) {
      const ring = rings.current[i];
      if (!ring) continue;
      const phase = (time * 0.5 + i / 2) % 1;
      ring.scale.setScalar(reach * (0.35 + phase * 1.1));
      (ring.material as MeshBasicMaterial).opacity = (1 - phase) * 0.55;
    }
  });

  return (
    <group position={[block.x, 0, block.z]} raycast={() => null}>
      <mesh ref={gem} position-y={top + hover} castShadow>
        <octahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color={live} emissive={live} emissiveIntensity={dark ? 2.4 : 0.7} flatShading roughness={0.2} metalness={0.3} toneMapped={false} />
      </mesh>
      <pointLight position-y={top + hover} color={live} intensity={dark ? 2.5 : 1.5} distance={6} decay={2} />
      <mesh position-y={top + (hover - 0.25) / 2} material={cone}>
        <cylinderGeometry args={[0.08, reach, hover - 0.25, 40, 1, true]} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(ring) => { rings.current[i] = ring; }} rotation-x={-Math.PI / 2} position-y={top + 0.012}>
          <ringGeometry args={[0.92, 1, 64]} />
          <meshBasicMaterial color={live.clone().multiplyScalar(dark ? 1.4 : 1)} transparent side={DoubleSide} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
