import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, ShaderMaterial } from 'three';
import { ribbonStrip, touches, type Link, type Zone } from './model';
import { relationToken, type Palette } from './palette';

/** Half the strip's width: room for the glow; the copper itself is a narrow core down its middle. */
const HALF = 0.16;
/** On a dense board only every third trace carries a signal until a selection names the ones that matter. */
const DENSE_SIGNAL_EVERY = 3;

const vertexShader = /* glsl */ `
attribute vec4 aTrace;
attribute vec3 aColor;
attribute vec4 aStyle;
varying vec4 vTrace;
varying vec3 vColor;
varying vec4 vStyle;
void main() {
  vTrace = aTrace;
  vColor = aColor;
  vStyle = aStyle;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// vTrace: distance along the relation's direction, side (-1..1), total length, phase. vStyle: pattern, signal, opacity, depth.
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uBoot;
uniform float uBoost;
uniform float uHalo;
uniform float uSignal;
uniform float uCore;
varying vec4 vTrace;
varying vec3 vColor;
varying vec4 vStyle;
const float TAIL = 1.5;
void main() {
  float flow = vTrace.x, across = abs(vTrace.y), total = max(vTrace.z, 0.001);
  float pixel = max(fwidth(vTrace.y), 1e-4);
  float width = max(uCore, pixel * 0.8);
  float core = 1.0 - smoothstep(width, width + pixel * 1.2, across);
  if (vStyle.x > 1.5) core *= step(fract(flow / 0.18), 0.35);
  else if (vStyle.x > 0.5) core *= step(fract(flow / 0.36), 0.6);
  float edge = clamp(1.0 - across, 0.0, 1.0);
  float halo = exp(-across * across * 10.0) * edge;
  float x = mod(uTime * 2.4 + vTrace.w * (total + TAIL), total + TAIL) - flow;
  float signal = x >= 0.0 && x < TAIL ? 1.0 - x / TAIL : 0.0;
  signal *= signal * vStyle.y * uSignal;
  float arrive = vStyle.w * 0.8 + flow / total * 0.2;
  float on = smoothstep(arrive, arrive + 0.015, uBoot);
  float front = uBoot < 1.0 ? (1.0 - smoothstep(0.0, 0.07, abs(uBoot - arrive))) : 0.0;
  vec3 color = vColor * (1.0 + (signal + front) * uBoost);
  float alpha = (core * vStyle.z + halo * (uHalo * vStyle.z + (signal + front) * 0.75)) * on;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}`;

type TraceProps = { links: Link[]; palette: Palette; dark: boolean; dense: boolean; selectedId: string | null; depths: ReadonlyMap<string, number>; boot: { current: number }; motion: boolean };

/**
 * Every relation as one lit strip of copper in the family colour, all in a single draw. Signals run along
 * them in the relation's recorded direction and the boot current fills them in; both live in the shader,
 * so neither costs a frame's worth of JavaScript. 反驳 stays dashed and 取代 dotted.
 */
export function Traces({ links, palette, dark, dense, selectedId, depths, boot, motion }: TraceProps) {
  const geometry = useMemo(() => {
    const positions: number[] = [], trace: number[] = [], colors: number[] = [], styles: number[] = [], index: number[] = [];
    links.forEach((link, i) => {
      const strip = ribbonStrip(link.points, HALF);
      const active = touches(link, selectedId);
      const color = palette.color(relationToken(link.group));
      const pattern = link.group === 'replace' ? 2 : link.group === 'oppose' ? 1 : 0;
      const signal = (selectedId ? active : !dense || i % DENSE_SIGNAL_EVERY === 0) ? 1 : 0;
      const opacity = selectedId ? active ? 1 : 0.08 : dense ? dark ? 0.55 : 0.8 : 0.9;
      const depth = Math.min(depths.get(link.source) ?? 1, depths.get(link.target) ?? 1);
      const base = positions.length / 3;
      positions.push(...strip.positions);
      strip.along.forEach((along, k) => {
        trace.push(link.reversed ? strip.length - along : along, strip.side[k], strip.length, (i * 0.618) % 1);
        colors.push(color.r, color.g, color.b);
        styles.push(pattern, signal, opacity, depth);
      });
      for (let k = 0; k < strip.along.length / 2 - 1; k++) {
        const a = base + k * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    result.setAttribute('aTrace', new BufferAttribute(new Float32Array(trace), 4));
    result.setAttribute('aColor', new BufferAttribute(new Float32Array(colors), 3));
    result.setAttribute('aStyle', new BufferAttribute(new Float32Array(styles), 4));
    result.setIndex(index);
    return result;
  }, [links, palette, dark, dense, selectedId, depths]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: { uTime: { value: 0 }, uBoot: { value: 0 }, uBoost: { value: dark ? 4.5 : 0.6 }, uHalo: { value: dark ? 0.2 : 0.06 }, uCore: { value: 0.16 }, uSignal: { value: motion ? 1 : 0 } },
    transparent: true, depthWrite: false,
  }), [dark, motion]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uBoot.value = boot.current >= 1 ? 2 : boot.current;
  });
  if (!links.length) return null;
  return <mesh geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />;
}

/** Overview groups: a border printed on the board; the group's name is drawn with the labels. */
export function ZoneOutline({ zone, palette }: { zone: Zone; palette: Palette }) {
  const tint = palette.css(zone.color || '--ink-3');
  const points = useMemo(() => {
    const l = zone.x - zone.w / 2, r = zone.x + zone.w / 2, t = zone.z - zone.d / 2, b = zone.z + zone.d / 2;
    return [[l, 0.02, t], [r, 0.02, t], [r, 0.02, b], [l, 0.02, b], [l, 0.02, t]] as [number, number, number][];
  }, [zone.x, zone.z, zone.w, zone.d]);
  return <Line points={points} color={tint} lineWidth={1.4} transparent opacity={0.7} toneMapped={false} raycast={() => null} />;
}
