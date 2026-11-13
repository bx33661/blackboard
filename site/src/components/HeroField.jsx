import { useEffect, useRef } from 'react';
import { useSiteTheme } from '@/lib/theme';
import { reducedMotion } from '../shared.jsx';

const GAP = 22;
const RADIUS = 150;

/** Dot lattice behind the hero; dots near the pointer swell, brighten and lean away, then settle back. */
export default function HeroField() {
  const canvas = useRef(null);
  const { resolved } = useSiteTheme();

  useEffect(() => {
    const el = canvas.current;
    const host = el?.parentElement;
    if (!el || !host) return undefined;
    const ctx = el.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim() || '#09090b';
    const accent = css.getPropertyValue('--accent').trim() || '#10b981';
    const still = reducedMotion();

    let w = 0; let h = 0; let dots = []; let raf = 0; let idle = 0;
    const ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

    const build = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = host.clientWidth; h = host.clientHeight;
      el.width = w * dpr; el.height = h * dpr;
      el.style.width = `${w}px`; el.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      for (let y = GAP / 2; y < h; y += GAP) {
        for (let x = GAP / 2; x < w; x += GAP) dots.push({ x, y, e: 0 });
      }
    };

    const draw = () => {
      ptr.x += (ptr.tx - ptr.x) * 0.16;
      ptr.y += (ptr.ty - ptr.y) * 0.16;
      ctx.clearRect(0, 0, w, h);
      let moving = false;
      for (const d of dots) {
        const dx = d.x - ptr.x; const dy = d.y - ptr.y;
        const dist = Math.hypot(dx, dy);
        const target = dist < RADIUS ? (1 - dist / RADIUS) ** 2 : 0;
        d.e += (target - d.e) * 0.12;
        if (Math.abs(target - d.e) > 0.002) moving = true;
        // Fade toward the edges so the lattice reads as atmosphere, not a pattern.
        const vx = (d.x / w - 0.5) * 1.3; const vy = (d.y / h - 0.38) * 1.6;
        const base = Math.max(0, 1 - Math.hypot(vx, vy)) * 0.16;
        if (base < 0.01 && d.e < 0.02) continue;
        const push = d.e * 7;
        const px = d.x + (dist ? (dx / dist) * push : 0);
        const py = d.y + (dist ? (dy / dist) * push : 0);
        ctx.globalAlpha = Math.min(1, base + d.e * 0.9);
        ctx.fillStyle = d.e > 0.08 ? accent : ink;
        ctx.beginPath();
        ctx.arc(px, py, 0.9 + d.e * 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const settled = !moving && Math.abs(ptr.tx - ptr.x) < 0.5 && Math.abs(ptr.ty - ptr.y) < 0.5;
      idle = settled ? idle + 1 : 0;
      raf = idle > 4 ? 0 : requestAnimationFrame(draw);
    };
    const wake = () => { idle = 0; if (!raf) raf = requestAnimationFrame(draw); };

    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      ptr.tx = e.clientX - r.left; ptr.ty = e.clientY - r.top;
      if (ptr.x < -5000) { ptr.x = ptr.tx; ptr.y = ptr.ty; }
      wake();
    };
    const onLeave = () => { ptr.tx = -9999; ptr.ty = -9999; ptr.x = -9999; ptr.y = -9999; wake(); };

    build(); draw();
    const ro = new ResizeObserver(() => { build(); wake(); });
    ro.observe(host);
    if (!still) {
      host.addEventListener('pointermove', onMove, { passive: true });
      host.addEventListener('pointerleave', onLeave);
    }
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
    };
  }, [resolved]);

  return <canvas ref={canvas} className="hero-field" aria-hidden="true" />;
}
