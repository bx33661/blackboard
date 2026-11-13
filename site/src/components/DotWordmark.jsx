import { useEffect, useRef } from 'react';
import { reducedMotion } from '../shared.jsx';

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * A pixel-grid wordmark drawn on canvas. Cells are pushed by the pointer and
 * spring back; a click drops a pin and sends a shockwave through the grid.
 */
export default function DotWordmark({ text = 'pinwhy', onPin }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box) return undefined;
    const ctx = el.getContext('2d');
    const still = reducedMotion();
    let cells = [];
    let pins = [];
    let waves = [];
    let gap = 8;
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = false;
    let visible = false;
    const pointer = { x: -9999, y: -9999, active: false };
    let ink = '#d4d4d8';
    let accent = '#10b981';

    const readColors = () => {
      const cs = getComputedStyle(box);
      ink = cs.getPropertyValue('--dw-ink').trim() || ink;
      accent = cs.getPropertyValue('--accent').trim() || accent;
    };

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.clientWidth;
      gap = w < 640 ? 5 : w < 1000 ? 7 : 9;
      const fontSize = w / (text.length * 0.56);
      h = Math.round(fontSize * 0.98);
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const off = document.createElement('canvas');
      off.width = Math.ceil(w);
      off.height = Math.ceil(h);
      const o = off.getContext('2d', { willReadFrequently: true });
      o.fillStyle = '#000';
      o.textBaseline = 'alphabetic';
      o.font = `700 ${fontSize}px "Geist Variable", system-ui, sans-serif`;
      const m = o.measureText(text);
      const scale = Math.min(1, w / m.width);
      o.save();
      o.translate((w - m.width * scale) / 2, h * 0.8);
      o.scale(scale, scale);
      o.letterSpacing = '-0.04em';
      o.fillText(text, 0, 0);
      o.restore();
      const data = o.getImageData(0, 0, off.width, off.height).data;

      const next = [];
      const fadeStart = h * 0.42;
      for (let y = gap / 2, row = 0; y < h; y += gap, row += 1) {
        for (let x = gap / 2, col = 0; x < w; x += gap, col += 1) {
          const a = data[(Math.floor(y) * off.width + Math.floor(x)) * 4 + 3];
          if (a < 120) continue;
          const fade = y < fadeStart ? 1 : 1 - (y - fadeStart) / (h - fadeStart);
          const threshold = (BAYER[row % 4][col % 4] + 0.5) / 16;
          if (fade < threshold * 0.95) continue;
          next.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 });
        }
      }
      cells = next;
      pins = pins.filter((p) => p.x < w);
      readColors();
      draw();
    };

    const draw = (now = performance.now()) => {
      ctx.clearRect(0, 0, w, h);
      const size = gap - Math.max(1.5, gap * 0.22);
      ctx.fillStyle = ink;
      for (const c of cells) {
        const d = Math.abs(c.x - c.ox) + Math.abs(c.y - c.oy);
        if (d > 0.6) continue;
        ctx.fillRect(c.x - size / 2, c.y - size / 2, size, size);
      }
      ctx.fillStyle = accent;
      for (const c of cells) {
        const d = Math.abs(c.x - c.ox) + Math.abs(c.y - c.oy);
        if (d <= 0.6) continue;
        ctx.globalAlpha = Math.min(1, 0.35 + d / 30);
        ctx.fillRect(c.x - size / 2, c.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      for (const p of pins) {
        const t = Math.min(1, (now - p.t) / 520);
        const ease = 1 - (1 - t) ** 3;
        const bounce = t < 1 ? Math.sin(t * Math.PI) * 6 * (1 - t) : 0;
        const y = p.y - (1 - ease) * 80 - bounce;
        const r = Math.max(5, gap * 0.75);
        ctx.globalAlpha = 0.18 * ease;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 1, r * 0.8 * ease, r * 0.28 * ease, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, y);
        ctx.lineTo(p.x, y - r * 2.2);
        ctx.stroke();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p.x, y - r * 2.2 - r * 0.55, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath();
        ctx.arc(p.x - r * 0.3, y - r * 2.2 - r * 0.85, r * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = (now) => {
      let moving = false;
      const R = Math.max(70, gap * 11);
      waves = waves.filter((wv) => now - wv.t < 900);
      for (const c of cells) {
        let fx = (c.ox - c.x) * 0.075;
        let fy = (c.oy - c.y) * 0.075;
        if (pointer.active) {
          const dx = c.x - pointer.x;
          const dy = c.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < R && dist > 0.01) {
            const f = (1 - dist / R) ** 2 * 5.5;
            fx += (dx / dist) * f;
            fy += (dy / dist) * f;
          }
        }
        for (const wv of waves) {
          const radius = ((now - wv.t) / 900) * Math.max(w, h) * 0.6;
          const dx = c.ox - wv.x;
          const dy = c.oy - wv.y;
          const dist = Math.hypot(dx, dy);
          const band = Math.abs(dist - radius);
          if (band < 26 && dist > 0.01) {
            const f = (1 - band / 26) * 3.2 * (1 - (now - wv.t) / 900);
            fx += (dx / dist) * f;
            fy += (dy / dist) * f;
          }
        }
        c.vx = (c.vx + fx) * 0.8;
        c.vy = (c.vy + fy) * 0.8;
        c.x += c.vx;
        c.y += c.vy;
        if (!moving && (Math.abs(c.vx) > 0.02 || Math.abs(c.vy) > 0.02 || Math.abs(c.x - c.ox) > 0.3 || Math.abs(c.y - c.oy) > 0.3)) moving = true;
      }
      const pinAnim = pins.some((p) => now - p.t < 560);
      draw(now);
      if (visible && (moving || pointer.active || waves.length || pinAnim)) {
        raf = requestAnimationFrame(step);
      } else {
        running = false;
      }
    };

    const kick = () => {
      if (still || running || !visible) return;
      running = true;
      raf = requestAnimationFrame(step);
    };

    const local = (e) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const move = (e) => {
      const p = local(e);
      pointer.x = p.x; pointer.y = p.y; pointer.active = true;
      kick();
    };
    const leave = () => { pointer.active = false; kick(); };
    const down = (e) => {
      const p = local(e);
      const now = performance.now();
      waves.push({ x: p.x, y: p.y, t: now });
      pins.push({ x: p.x, y: Math.min(h - 4, Math.max(28, p.y)), t: now });
      if (pins.length > 18) pins.shift();
      onPinRef.current?.();
      if (still) draw(now + 1000);
      kick();
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', down);

    const ro = new ResizeObserver(() => build());
    ro.observe(box);
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) kick(); });
    io.observe(box);
    const mo = new MutationObserver(() => { readColors(); draw(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.fonts?.ready.then(build);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect(); mo.disconnect();
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', down);
    };
  }, [text]);

  return (
    <div className="dw" ref={wrap}>
      <canvas ref={canvas} className="dw-canvas" role="img" aria-label={text} />
    </div>
  );
}
