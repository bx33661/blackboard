import { Color, MeshPhysicalMaterial, Vector3 } from 'three';
import type { Palette } from './palette';

const COMMON = /* glsl */ `
varying vec2 vXZ;
uniform vec3 uBase;
uniform vec3 uInk;
uniform float uPitch;
uniform float uGrid;
uniform float uGlow;
uniform vec3 uPool;
uniform vec3 uScan;
uniform vec3 uScanColor;
uniform float uScanPower;
/** 1 on the integer values of v, fading over about w screen pixels. */
float gridLine(float v, float w) {
  float d = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-4);
  return 1.0 - clamp(d / w, 0.0, 1.0);
}`;

export interface BoardSkin {
  material: MeshPhysicalMaterial;
  /** The sweep from the current position: world x, world z, radius. */
  scan: { value: Vector3 };
  scanPower: { value: number };
}

/**
 * Lacquered solder mask: a field of pads and a faint card-sized grid under a clear coat, darkening away
 * from the middle of the board as if lit by one lamp. Pads fade before they are small enough to shimmer.
 * A sweep can run outwards over the pads from the Agent's position.
 */
export function boardMaterial(palette: Palette, dark: boolean, scanColor: Color, cx: number, cz: number, radius: number): BoardSkin {
  const scan = { value: new Vector3() };
  const scanPower = { value: 0 };
  const uniforms = {
    uBase: { value: new Color(palette.css(dark ? 'color-mix(in srgb, var(--node-goal) 9%, var(--bg))' : 'color-mix(in srgb, var(--surface) 90%, var(--node-goal))')) },
    uInk: { value: palette.color(dark ? 'color-mix(in srgb, var(--ink-3) 60%, var(--ink))' : 'color-mix(in srgb, var(--node-goal) 38%, var(--surface))') },
    uPitch: { value: 0.48 },
    uGrid: { value: 2.88 },
    uGlow: { value: dark ? 0.2 : 0 },
    uPool: { value: new Vector3(cx, cz, radius) },
    uScan: scan,
    uScanColor: { value: scanColor },
    uScanPower: scanPower,
  };
  const material = new MeshPhysicalMaterial({ roughness: dark ? 0.55 : 0.7, metalness: dark ? 0.2 : 0, clearcoat: dark ? 0.7 : 0.35, clearcoatRoughness: 0.5 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec2 cell = vXZ / uPitch;
        float pixel = max(fwidth(cell.x), fwidth(cell.y));
        float pad = 1.0 - smoothstep(0.05, 0.05 + pixel, length(abs(fract(cell - 0.5) - 0.5)));
        pad *= 1.0 - smoothstep(0.04, 0.14, pixel);
        vec2 coarse = vXZ / uGrid;
        float mark = max(pad * 0.4, max(gridLine(coarse.x, 0.8), gridLine(coarse.y, 0.8)) * 0.07);
        float sweep = uScanPower * (1.0 - smoothstep(0.0, 0.9, abs(distance(vXZ, uScan.xy) - uScan.z)));
        float pool = 1.0 - 0.5 * smoothstep(0.35, 1.2, distance(vXZ, uPool.xy) / uPool.z);
        diffuseColor.rgb = mix(uBase, uInk, mark * (1.0 - uGlow)) * pool;`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += uInk * mark * uGlow * pool + uScanColor * sweep * (mark * 3.0 + 0.02);`);
  };
  return { material, scan, scanPower };
}
