import { Component, Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, ListTree, MousePointerClick, NotebookPen, ScanSearch, Waypoints } from 'lucide-react';
import { BorderBeam } from '@/components/ui/border-beam';
import { useSiteTheme } from '@/lib/theme';
import { useLang } from '../i18n.jsx';
import { reducedMotion, useInViewport } from '../shared.jsx';

const CircuitScene = lazy(() => import('../scene/CircuitScene.jsx'));

/* The real pinwhy workspace, exported offline from a synthetic demo board (site/scripts/make-demo.mjs). */
const FRAME_W = 1280;
const FRAME_H = 800;
const TAB_IDS = ['context', 'logic', 'all', 'notes', 'board'];
// Same glyph families as the workspace's own view switch.
const TAB_ICON = { context: ScanSearch, logic: Waypoints, all: ListTree, notes: NotebookPen, board: Box };
const URLS = { context: 'view=context', logic: 'view=logic', all: 'view=all', notes: 'page=notes', board: 'view=context&scene=2.5d' };

function prepareWorkspaceStorage(theme, locale) {
  try {
    localStorage.setItem('pinwhy-theme-v3', theme);
    localStorage.setItem('pinwhy-pref-locale', JSON.stringify(locale));
  } catch { /* the workspace falls back to the system theme and language */ }
}

/** Clicks a control inside the same-origin workspace by its aria-label or visible text. */
function press(frame, label) {
  const doc = frame?.contentDocument;
  if (!doc) return false;
  const btn = [...doc.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent.trim() === label);
  if (!btn) return false;
  btn.click();
  return true;
}

class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
const webglOk = () => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
};

function Workspace({ view, live, onLive }) {
  const { resolved } = useSiteTheme();
  const { lang, t } = useLang();
  const ws = t.stage.ws;
  const box = useRef(null);
  const frame = useRef(null);
  const [scale, setScale] = useState(1);
  const [focus, setFocus] = useState(false);
  const [ready, setReady] = useState(false);
  const [src, setSrc] = useState(null);
  const still = view === 'board' ? 'context' : view;

  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / FRAME_W));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  // The live workspace loads only on request; the language reloads it, the theme is applied in place.
  useEffect(() => {
    if (!live) return;
    prepareWorkspaceStorage(resolved, ws.locale);
    setReady(false);
    setSrc(`/demo/board-${lang}.html?${URLS[still]}`);
  }, [live, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    const doc = frame.current?.contentDocument;
    if (doc && doc.documentElement.dataset.theme !== resolved) press(frame.current, resolved === 'dark' ? ws.toDark : ws.toLight);
  }, [resolved, ready, ws]);

  useEffect(() => {
    if (!ready || view === 'board') return undefined;
    const f = frame.current;
    if (view === 'notes') { press(f, ws.notesOpen); return undefined; }
    const onNotes = f.contentWindow.location.search.includes('page=notes');
    if (onNotes) press(f, ws.notesBack);
    let inner;
    const timer = setTimeout(() => {
      press(f, ws[view]);
      inner = setTimeout(() => press(f, ws.fit), 650);
    }, onNotes ? 250 : 0);
    return () => { clearTimeout(timer); clearTimeout(inner); };
  }, [view, ready, ws]);

  const load = () => {
    const doc = frame.current?.contentDocument;
    if (doc) {
      const style = doc.createElement('style');
      style.textContent = '::-webkit-scrollbar{width:0;height:0}';
      doc.head.appendChild(style);
    }
    setTimeout(() => { setReady(true); setFocus(true); }, 700);
  };

  return (
    <div className="ws" ref={box} style={{ height: FRAME_H * scale }} onPointerLeave={() => setFocus(false)}>
      {/* Real captures of each view (site/scripts/capture.mjs) stand in until the live workspace is opened. */}
      <img className={`ws-still${ready ? ' gone' : ''}`} src={`/shots/stage-${still}-${lang}-${resolved}.webp`}
        alt={t.stage.tabs[still][0]} width={FRAME_W} height={FRAME_H} decoding="async" />
      {src && (
        <iframe ref={frame} key={src.split('?')[0]} title={t.stage.frameTitle} src={src} onLoad={load} tabIndex={focus ? 0 : -1}
          style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${scale})`, pointerEvents: focus ? 'auto' : 'none', opacity: ready ? 1 : 0 }} />
      )}
      {!live && (
        <button className="ws-open" onClick={onLive}>
          <span className="ws-open-btn"><MousePointerClick size={16} strokeWidth={1.8} aria-hidden="true" />{t.stage.open}</span>
        </button>
      )}
      {live && !ready && <div className="ws-loading" role="status"><i />{t.stage.loading}</div>}
      {ready && !focus && (
        <button className="ws-shield" onClick={() => setFocus(true)} aria-label={t.stage.shield}>
          <span>{t.stage.shield}</span>
        </button>
      )}
    </div>
  );
}

export default function Stage() {
  const { t, lang } = useLang();
  const [view, setView] = useState('context');
  const frameRef = useRef(null);
  const onScreen = useInViewport(frameRef);
  const [live, setLive] = useState(false);
  const [gl] = useState(webglOk);
  const [boardSeen, setBoardSeen] = useState(false);
  if (view === 'board' && !boardSeen) setBoardSeen(true);
  const [name, cap] = t.stage.tabs[view];

  // Unfold: the window starts tilted back and settles flat as its top rises from the fold to near the nav.
  const [flat, setFlat] = useState(() => (reducedMotion() ? 1 : 0));
  useEffect(() => {
    if (reducedMotion()) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = frameRef.current;
      if (!el) return;
      const vh = window.innerHeight;
      const top = el.parentElement.getBoundingClientRect().top;
      const k = Math.min(1, Math.max(0, 1 - (top - vh * 0.14) / (vh * 0.7)));
      setFlat(1 - Math.pow(1 - k, 3));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);

  return (
    <section className="stage-wrap" id="views" aria-label={t.stage.aria}>
      <div className="wrap">
        <div className="stage-glow" aria-hidden="true" style={{ opacity: flat }} />
        <div className="stage" ref={frameRef} style={{ transform: `perspective(1800px) rotateX(${(1 - flat) * 20}deg) scale(${0.9 + flat * 0.1})` }}>
          <div className="stage-bar">
            <span className="dots"><i /><i /><i /></span>
            <span className="url"><i className="lock" />localhost:4317<em>/?{URLS[view]}</em></span>
            <span className="demo-badge">{t.stage.badge}</span>
          </div>
          <div className="stage-body">
            <div className={`stage-pane${view !== 'board' ? ' on' : ''}`}>
              <Workspace view={view} live={live} onLive={() => setLive(true)} />
            </div>
            <div className={`stage-pane abs${view === 'board' ? ' on' : ''}`}>
              <div className="stage-poster" />
              {gl && boardSeen && (
                <SceneBoundary>
                  <Suspense fallback={null}>
                    <CircuitScene active={onScreen && view === 'board'} reduced={reducedMotion()} lang={lang} />
                  </Suspense>
                </SceneBoundary>
              )}
              <div className="stage-hint">{t.stage.hint}</div>
            </div>
          </div>
          <BorderBeam size={180} duration={14} colorFrom="#66e0ae" colorTo="#d6b48a" borderWidth={1.5} />
        </div>
        <div className="stage-foot">
          <div className="stage-tabs" role="tablist" aria-label={t.stage.aria}>
            {TAB_IDS.map((id) => (
              <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{(() => { const I = TAB_ICON[id]; return <I size={15} strokeWidth={1.8} aria-hidden="true" />; })()}{t.stage.tabs[id][0]}</button>
            ))}
          </div>
          <p className="stage-caption" key={view + name}><b>{name}</b>{cap}</p>
        </div>
      </div>
    </section>
  );
}
