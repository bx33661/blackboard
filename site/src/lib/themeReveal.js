import { flushSync } from 'react-dom';

let lastPoint = null;

/** Remember where the user clicked so the reveal can start from there. */
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { lastPoint = { x: e.clientX, y: e.clientY, at: performance.now() }; }, { capture: true, passive: true });
}

const resolve = (theme) =>
  theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;

/** Switches theme with a circular ink-spread reveal from the last pointer position (View Transitions API). */
export function switchThemeWithReveal(theme, setTheme) {
  const root = document.documentElement;
  const nextDark = resolve(theme) === 'dark';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!document.startViewTransition || reduce || root.classList.contains('dark') === nextDark) {
    setTheme(theme);
    return;
  }

  const recent = lastPoint && performance.now() - lastPoint.at < 1500;
  const x = recent ? lastPoint.x : window.innerWidth - 80;
  const y = recent ? lastPoint.y : 36;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const vt = document.startViewTransition(() => {
    // The provider applies the class in an effect; set it here too so the new snapshot is already themed.
    root.classList.toggle('dark', nextDark);
    root.style.colorScheme = nextDark ? 'dark' : 'light';
    flushSync(() => setTheme(theme));
  });
  vt.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
}
