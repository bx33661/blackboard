import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/600.css';
import '@fontsource/noto-serif-sc/700.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';
import { ThemeProvider, useSiteTheme } from './lib/theme.jsx';
import { LANG_PATH, LangProvider, useLang } from './i18n.jsx';
import { Icon, REPO, ToastProvider, lenisRef, reducedMotion, scrollToId, useCopyPrompt, useReveal } from './shared.jsx';
import Hero from './sections/Hero.jsx';
import Stage from './sections/Stage.jsx';
import Recovery from './sections/Recovery.jsx';
import Features from './sections/Features.jsx';
import Start from './sections/Start.jsx';
import Principles from './sections/Principles.jsx';
import Faq from './sections/Faq.jsx';
import Finale from './sections/Finale.jsx';

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
              onClick={() => { setTheme(k); setOpen(false); }}>
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
  const { lang, setLang, t } = useLang();
  return (
    <div className="lang-switch sans" role="radiogroup" aria-label={t.nav.lang}>
      <span className="thumb" style={{ transform: `translateX(${lang === 'zh' ? 0 : 100}%)` }} aria-hidden="true" />
      {[['zh', '中', 'zh-CN'], ['en', 'EN', 'en']].map(([id, label, tag]) => (
        <a key={id} role="radio" aria-checked={lang === id} className={lang === id ? 'on' : ''} lang={tag} hrefLang={tag}
          href={LANG_PATH[id]} onClick={(e) => { e.preventDefault(); setLang(id); }}>{label}</a>
      ))}
    </div>
  );
}

function Nav() {
  const { t } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const [sheet, setSheet] = useState(false);
  const copyPrompt = useCopyPrompt();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > window.innerHeight * 0.55);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const go = (id) => (e) => { e.preventDefault(); setSheet(false); scrollToId(id); };
  return (
    <header className={`nav${scrolled ? ' scrolled' : ''}`}>
      <div className="nav-pill">
        <a className="nav-brand" href="#top" onClick={go('top')}>
          <img src="/mark.svg" alt="" /><b>Pinwhy</b><span className="ver">v0.2.0</span>
        </a>
        <nav className="nav-links" aria-label="primary">
          {t.nav.links.map(([id, label]) => <a key={id} href={`#${id}`} onClick={go(id)}>{label}</a>)}
        </nav>
        <div className="nav-right">
          <LangSwitch />
          <ThemeMenu />
          <a className="icon-btn gh" href={REPO} target="_blank" rel="noreferrer" aria-label="GitHub"><Icon.github width="18" height="18" /></a>
          <div className="nav-cta">
            <button className="btn btn-solid btn-sm" onClick={copyPrompt}><Icon.copy />{t.nav.copy}</button>
          </div>
          <button className="icon-btn nav-burger" aria-label={t.nav.menu} aria-expanded={sheet} onClick={() => setSheet((v) => !v)}>
            {sheet ? <Icon.x /> : <Icon.menu />}
          </button>
        </div>
      </div>
      {sheet && (
        <nav className="nav-sheet" aria-label="primary">
          {t.nav.links.map(([id, label]) => <a key={id} href={`#${id}`} onClick={go(id)}>{label}</a>)}
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <button className="btn btn-solid" onClick={() => { setSheet(false); copyPrompt(); }}><Icon.copy />{t.nav.copy}</button>
        </nav>
      )}
    </header>
  );
}

function Page() {
  const { lang } = useLang();
  useReveal();
  useEffect(() => {
    if (reducedMotion()) return undefined;
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenisRef.current = lenis;
    let id = requestAnimationFrame(function raf(t) { lenis.raf(t); id = requestAnimationFrame(raf); });
    return () => { cancelAnimationFrame(id); lenis.destroy(); lenisRef.current = null; };
  }, []);
  return (
    <div className={`page lang-${lang}`}>
      <Nav />
      <main id="top">
        <Hero />
        <Stage />
        <Recovery />
        <Features />
        <Start />
        <Principles />
        <Faq />
        <Finale />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <LangProvider>
        <ToastProvider>
          <Page />
        </ToastProvider>
      </LangProvider>
    </ThemeProvider>
  </StrictMode>,
);
