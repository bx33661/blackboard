import { Color } from 'three';
import type { RelationGroup } from '../graph';

const NODE_TYPES: Record<string, true> = {
  start: true, goal: true, intent: true, hypothesis: true, question: true, fact: true, observation: true,
  action: true, result: true, finding: true, vuln: true, hint: true, summary: true, note: true,
};
/** The CSS token that carries a node kind's hue; unknown kinds use the note tone, as on the 2D card. */
export const nodeToken = (type: string) => `--node-${Object.hasOwn(NODE_TYPES, type) ? type : 'note'}`;

/** The family colour token of a relation; unclassified links use the muted ink. */
export const relationToken = (group: RelationGroup) => group === 'link' ? '--ink-3' : `--rel-${group}`;

export interface Palette {
  /** Any CSS colour or `--token`, as an `rgb()` string a canvas or three can read. */
  css: (value: string) => string;
  color: (value: string) => Color;
}

/**
 * Resolves CSS colours (tokens, `var()`, `color-mix()`) to sRGB through the browser itself:
 * computed styles may come back as `color(srgb …)` or `oklab(…)`, which three cannot parse, so the
 * value is painted into a 1px canvas and read back.
 */
export function createPalette(): Palette {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const cache = new Map<string, string>();
  const css = (value: string) => {
    let hit = cache.get(value);
    if (hit) return hit;
    probe.style.color = value.startsWith('--') ? `var(${value})` : value;
    ctx.clearRect(0, 0, 1, 1);
    // Attach only while resolving: render replay can discard a palette without running cleanup.
    document.body.appendChild(probe);
    try { ctx.fillStyle = getComputedStyle(probe).color; }
    finally { probe.remove(); }
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    hit = `rgb(${r}, ${g}, ${b})`;
    cache.set(value, hit);
    return hit;
  };
  return { css, color: (value) => new Color(css(value)) };
}
