import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';
import { ThemeProvider, useSiteTheme } from './lib/theme.jsx';
import { RouteProvider, useRoute } from './router.jsx';
import { LangProvider, useLang } from './i18n.jsx';
import { Icon, REPO, ToastProvider, lenisRef, reducedMotion, scrollToId, useCopyPrompt, useReveal } from './shared.jsx';
import Hero from './sections/Hero.jsx';
import Spotlights from './sections/Spotlights.jsx';
import Stage from './sections/Stage.jsx';
import Recovery from './sections/Recovery.jsx';
import Features from './sections/Features.jsx';
import Start from './sections/Start.jsx';
import Principles from './sections/Principles.jsx';
import Faq from './sections/Faq.jsx';
import Finale from './sections/Finale.jsx';
import SecurityPage from './pages/Security.jsx';
import DshPage from './pages/Dsh.jsx';
import CommandPalette, { useModKey } from './components/CommandPalette.jsx';
import { switchThemeWithReveal } from './lib/themeReveal.js';
import { Search } from 'lucide-react';

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return { open, setOpen, ref };
}

function ThemeMenu() {
  const { theme, resolved, setTheme } = useSiteTheme();
  const { t } = useLang();
  const { open, setOpen, ref } = usePopover();
  const opts = [['light', Icon.sun], ['dark', Icon.moon], ['system', Icon.monitor]];
  return (
    <div className="pop-wrap" ref={ref}>
      <button className="icon-btn" aria-label={t.nav.theme} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {resolved === 'dark' ? <Icon.moon /> : <Icon.sun />}
      </button>
      {open && (
        <div className="pop" role="menu">
          {opts.map(([k, I]) => (
            <button key={k} role="menuitemradio" aria-checked={theme === k} className={theme === k ? 'on' : ''}
              onClick={() => { setOpen(false); switchThemeWithReveal(k, setTheme); }}>
              <I size={16} />{t.nav.themes[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A two-option segmented switch: 中 / EN. */
function LangSwitch() {
  const { lang, switchLang } = useRoute();
  const { t } = useLang();
  return (
    <div className="lang-switch sans" role="radiogroup" aria-label={t.nav.lang}>
      <span className="thumb" style={{ transform: `translateX(${lang === 'zh' ? 0 : 100}%)` }} aria-hidden="true" />
      {[['zh', '中', 'zh-CN'], ['en', 'EN', 'en']].map(([id, label, tag]) => (
        <a key={id} role="radio" aria-checked={lang === id} className={lang === id ? 'on' : ''} lang={tag} hrefLang={tag}
          href="#" onClick={(e) => { e.preventDefault(); switchLang(id); }}>{label}</a>
      ))}
    </div>
  );
}

/** Tracks which in-page section is under the nav, for the links that point into the home page. */
function useScrollSpy(ids, enabled) {
  const [current, setCurrent] = useState(null);
  useEffect(() => {
    if (!enabled) { setCurrent(null); return undefined; }
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return undefined;
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setCurrent(hit.target.id);
      else if (window.scrollY < 200) setCurrent(null);
    }, { rootMargin: '-35% 0px -55% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids.join(), enabled]);
  return current;
}

/** Primary links with a single highlight that stretches toward its next target, then catches up. */
function NavLinks({ links, page, onNav }) {
  const box = useRef(null);
  const anchors = useRef([]);
  const [hover, setHover] = useState(null);
  const [blob, setBlob] = useState(null);
  const prev = useRef(null);
  const homeIds = links.filter(([, , target]) => target.startsWith('home#')).map(([, , target]) => target.slice(5));
  const spied = useScrollSpy(homeIds, page === 'home');

  const activeIdx = links.findIndex(([, , target]) => (target.startsWith('home#') ? spied === target.slice(5) : target === page));
  const idx = hover ?? (activeIdx >= 0 ? activeIdx : null);

  useEffect(() => {
    const measure = () => {
      const a = idx == null ? null : anchors.current[idx];
      if (!a || !box.current) { setBlob((b) => (b ? { ...b, show: false } : null)); return; }
      const left = a.offsetLeft; const width = a.offsetWidth;
      const dir = prev.current == null ? 0 : Math.sign(left - prev.current);
      prev.current = left;
      setBlob({ left, width, dir, show: true });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [idx, links]);

  const style = blob ? {
    '--l': `${blob.left}px`,
    '--r': `${box.current ? box.current.offsetWidth - blob.left - blob.width : 0}px`,
    '--tl': blob.dir > 0 ? '.42s' : '.24s',
    '--tr': blob.dir < 0 ? '.42s' : '.24s',
    opacity: blob.show ? 1 : 0,
  } : { opacity: 0 };

  return (
    <nav className="nav-links" aria-label="primary" ref={box} onPointerLeave={() => setHover(null)}>
      <span className="nav-blob" style={style} aria-hidden="true" />
      {links.map(([id, label, target], i) => (
        <a
          key={id}
          ref={(el) => { anchors.current[i] = el; }}
          href={`#${id}`}
          className={i === activeIdx ? 'active' : ''}
          aria-current={i === activeIdx ? 'page' : undefined}
          onPointerEnter={() => setHover(i)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          onClick={onNav(target)}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

function Nav() {
  const { t } = useLang();
  const { page, navigate } = useRoute();
  const [scrolled, setScrolled] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [palette, setPalette] = useState(false);
  const pill = useRef(null);
  const mod = useModKey();
  const copyPrompt = useCopyPrompt();

  useEffect(() => {
    const on = () => {
      setScrolled(window.scrollY > 8);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      pill.current?.style.setProperty('--p', max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : '0');
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const handleNav = (target) => (e) => {
    e.preventDefault();
    setSheet(false);
    if (target === 'home') {
      navigate('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (target === 'security') {
      navigate('security');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (target === 'dsh') {
      navigate('dsh');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (target.startsWith('home#')) {
      const hash = target.replace('home#', '');
      if (page === 'home') {
        scrollToId(hash);
      } else {
        navigate('home', hash);
        setTimeout(() => scrollToId(hash), 60);
      }
    }
  };

  return (
    <header className={`nav${scrolled || sheet ? ' scrolled' : ''}`}>
      <div className="nav-pill" ref={pill}>
        <span className="nav-progress" aria-hidden="true" />
        <a className="nav-brand" href="#top" onClick={handleNav('home')} aria-label="Pinwhy Home">
          <img src="/mark.svg" alt="" />
          <b>Pinwhy</b>
          <span className="ver">v0.2.0</span>
        </a>
        <NavLinks links={t.nav.links} page={page} onNav={handleNav} />
        <div className="nav-right">
          <button className="nav-k" onClick={() => setPalette(true)} aria-label={t.nav.palette.open} aria-haspopup="dialog">
            <Search size={14} strokeWidth={1.75} aria-hidden="true" />
            <kbd>{mod}</kbd><kbd>K</kbd>
          </button>
          <LangSwitch />
          <ThemeMenu />
          <a className="icon-btn" href={REPO} target="_blank" rel="noreferrer" aria-label="GitHub">
            <Icon.github width="16" height="16" />
          </a>
          <button className="nav-cta-btn" onClick={copyPrompt}>
            <Icon.copy size={14} />
            <span>{t.nav.copy}</span>
          </button>
          <button
            className="icon-btn nav-burger"
            aria-label={t.nav.menu}
            aria-expanded={sheet}
            onClick={() => setSheet((v) => !v)}
          >
            {sheet ? <Icon.x size={16} /> : <Icon.menu size={16} />}
          </button>
        </div>
      </div>

      {sheet && (
        <nav className="nav-sheet" aria-label="primary">
          {t.nav.links.map(([id, label, target]) => (
            <a key={id} href={`#${id}`} onClick={handleNav(target)}>{label}</a>
          ))}
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <button className="nav-cta-btn w-full justify-center mt-2" onClick={() => { setSheet(false); copyPrompt(); }}>
            <Icon.copy size={14} />{t.nav.copy}
          </button>
        </nav>
      )}
      <CommandPalette open={palette} setOpen={setPalette} onNav={handleNav} />
    </header>
  );
}

function Page() {
  const { page } = useRoute();
  const { lang } = useLang();
  useReveal();

  useEffect(() => {
    const canTilt = window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reducedMotion();
    let tilted = null;
    const release = () => {
      if (!tilted) return;
      tilted.style.setProperty('--rx', '0deg');
      tilted.style.setProperty('--ry', '0deg');
      tilted = null;
    };
    const onMove = (e) => {
      const card = e.target.closest?.('.bento-card, .pr-list li, .sp-card, .hd');
      if (tilted && tilted !== card) release();
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
      if (canTilt && card.classList.contains('bento-card')) {
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        const max = card.classList.contains('wide') ? 2.2 : 4;
        card.style.setProperty('--rx', `${(-ny * max).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${(nx * max).toFixed(2)}deg`);
        tilted = card;
      }
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', release);
    return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', release); };
  }, []);

  useEffect(() => {
    if (reducedMotion()) return undefined;
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenisRef.current = lenis;
    let id = requestAnimationFrame(function raf(t) { lenis.raf(t); id = requestAnimationFrame(raf); });
    return () => { cancelAnimationFrame(id); lenis.destroy(); lenisRef.current = null; };
  }, [page]);

  return (
    <div className={`page lang-${lang}`}>
      <Nav />
      <main id="top">
        {page === 'security' ? (
          <SecurityPage />
        ) : page === 'dsh' ? (
          <DshPage />
        ) : (
          <>
            <Hero />
            <Stage />
            <Spotlights />
            <Recovery />
            <Features />
            <Start />
            <Principles />
            <Faq />
          </>
        )}
        <Finale />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <RouteProvider>
        <LangProvider>
          <ToastProvider>
            <Page />
          </ToastProvider>
        </LangProvider>
      </RouteProvider>
    </ThemeProvider>
  </StrictMode>,
);
