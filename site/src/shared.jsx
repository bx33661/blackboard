import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Menu, Monitor, Moon, Plus, Sun, X } from 'lucide-react';
import { siGithub } from 'simple-icons';
import { useT } from './i18n.jsx';

export const REPO = 'https://github.com/Fruit-Guardians/blackboard';
export const DOCS = `${REPO}/blob/main/docs/USAGE.md`;


export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- copy + toast ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const t = useRef();
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status"><i />{msg}</div>}
    </ToastCtx.Provider>
  );
}
export function useCopy() {
  const toast = useContext(ToastCtx);
  const t = useT();
  return useCallback(async (text, msg) => {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch { toast(t.toast.failed); }
  }, [toast, t]);
}
/** Copies the setup prompt in the current language. */
export function useCopyPrompt() {
  const copy = useCopy();
  const t = useT();
  return useCallback(() => copy(t.prompt, t.toast.prompt), [copy, t]);
}

/* ---------- icons: Lucide for UI, Simple Icons for brand marks ---------- */
const L = (C, size = 18, extra = {}) => function LucideIcon(p) {
  return <C size={size} strokeWidth={1.75} aria-hidden="true" {...extra} {...p} />;
};
export const Icon = {
  copy: L(Copy, 16),
  arrow: L(ArrowRight, 16, { className: 'arrow' }),
  sun: L(Sun),
  moon: L(Moon),
  monitor: L(Monitor),
  menu: L(Menu),
  x: L(X),
  check: L(Check, 16, { strokeWidth: 2.4 }),
  plus: L(Plus),
  github: (p) => <Brand icon={siGithub} size={17} {...p} />,
};

/** A Simple Icons brand mark, drawn in the current text colour. */
export function Brand({ icon, size = 16, className, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={icon.title} className={className} {...p}>
      <path d={icon.path} />
    </svg>
  );
}

/* ---------- reveal on scroll ---------- */
export function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    const scan = () => document.querySelectorAll('.rv:not(.in)').forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
}

/** 0 → 1 progress of a tall element scrolling past the viewport (for sticky scenes). */
export function useScrollProgress(ref) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const v = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      setP((old) => (Math.abs(old - v) > 0.001 ? v : old));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, [ref]);
  return p;
}

/** True while the element is on screen. */
export function useInViewport(ref, margin = '0px') {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref, margin]);
  return on;
}

/* ---------- smooth scroll ---------- */
export const lenisRef = { current: null };
export function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -90, duration: 1.3 });
  else el.scrollIntoView({ behavior: 'smooth' });
}
