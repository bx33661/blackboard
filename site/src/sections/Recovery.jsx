import { useLayoutEffect, useRef, useState } from 'react';
import { useLang } from '../i18n.jsx';
import { useScrollProgress } from '../shared.jsx';

/*
 * Sticky scroll story: the Agent records → context gets compacted (the board is wiped) →
 * one command restores the same scene, with the cursor back where it was.
 */

const NODES = [
  { id: 'g1', c: 'var(--n-goal)', x: 4, y: 6 },
  { id: 'hy1', c: 'var(--n-hyp)', x: 52, y: 6 },
  { id: 'o1', c: 'var(--n-obs)', x: 4, y: 38, src: 'evidence/admin-users.http:12' },
  { id: 'f1', c: 'var(--n-finding)', x: 52, y: 38 },
  { id: 'q1', c: 'var(--n-cur)', x: 28, y: 72, cur: true },
];
const EDGES = [
  { a: 'g1', b: 'hy1', rel: '关联' },
  { a: 'o1', b: 'hy1', rel: '证实' },
  { a: 'hy1', b: 'f1', rel: '推导' },
  { a: 'f1', b: 'q1', rel: '产出' },
];
const NW = 44;



const clamp = (v) => Math.min(1, Math.max(0, v));

export default function Recovery() {
  const { t, lang } = useLang();
  const T = t.how;
  const ref = useRef(null);
  const p = useScrollProgress(ref);
  const stage = useRef(null);
  const [box, setBox] = useState({ w: 100, h: 100, r: {} });
  useLayoutEffect(() => {
    const measure = () => {
      const st = stage.current;
      if (!st) return;
      const r = {};
      st.querySelectorAll('[data-id]').forEach((el) => {
        r[el.dataset.id] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      });
      setBox({ w: st.clientWidth, h: st.clientHeight, r });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, [lang]);
  const phase = p < 0.36 ? 0 : p < 0.62 ? 1 : 2;

  // phase-local progress
  const build = clamp(p / 0.3);
  const wipe = clamp((p - 0.38) / 0.2);
  const typed = clamp((p - 0.64) / 0.12);
  const restore = clamp((p - 0.76) / 0.18);

  const shown = (i) => {
    if (phase === 0) return build * NODES.length > i + 0.2;
    if (phase === 1) return true;
    return restore * NODES.length > i;
  };
  const erased = (n) => phase === 1 && wipe * 110 > n.x + NW / 2;
  const ctx = phase === 0 ? Math.round(18 + build * 70) : phase === 1 ? Math.round(88 + wipe * 12) : Math.round(14 + restore * 8);
  const cmd = 'pinwhy context --budget 4000';
  const typedCmd = cmd.slice(0, Math.round(typed * cmd.length));

  return (
    <section id="how" className="recovery" ref={ref} aria-labelledby="recovery-title">
      <div className="recovery-sticky">
        <div className="wrap recovery-grid">
          <div className="recovery-copy">
            <div className="kicker">{T.kicker}</div>
            <h2 className="h2" id="recovery-title">{T.title[0]}<br />{T.title[1]}</h2>
            <ol className="steps" style={{ '--p': p.toFixed(3) }}>
              {T.steps.map(([title, desc], i) => (
                <li key={title} className={phase === i ? 'on' : phase > i ? 'done' : ''}>
                  <span className="k">0{i + 1}</span>
                  <div><b>{title}</b><p>{desc}</p></div>
                </li>
              ))}
            </ol>
          </div>

          <div className={`rb phase-${phase}`} aria-hidden="true">
            <div className="rb-bar">
              <i /><i /><i />
              <span>.pinwhy/events.jsonl</span>
              <span className={`rb-ctx${ctx > 95 ? ' full' : ''}`}>
                {T.ctx} <span className="track"><b style={{ width: `${Math.min(100, ctx)}%` }} /></span> {Math.min(100, ctx)}%
              </span>
            </div>
            <div className="rb-stage" ref={stage}>
              <svg className="rb-edges" viewBox={`0 0 ${box.w} ${box.h}`}>
                {EDGES.map((e) => {
                  const a = NODES.find((n) => n.id === e.a);
                  const b = NODES.find((n) => n.id === e.b);
                  const vis = shown(NODES.indexOf(a)) && shown(NODES.indexOf(b)) && !(erased(a) || erased(b));
                  const A = box.r[a.id]; const B = box.r[b.id];
                  if (!A || !B) return null;
                  let d;
                  if (Math.abs(A.y - B.y) < 10) {
                    const [l, r] = A.x < B.x ? [A, B] : [B, A];
                    const y = l.y + l.h / 2;
                    d = `M ${l.x + l.w} ${y} L ${r.x} ${r.y + r.h / 2}`;
                  } else {
                    const [t, btm] = A.y < B.y ? [A, B] : [B, A];
                    const x1 = t.x + t.w / 2; const y1 = t.y + t.h;
                    const x2 = btm.x + btm.w / 2; const y2 = btm.y;
                    const my = (y1 + y2) / 2;
                    d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
                  }
                  return (
                    <path key={e.a + e.b} d={d}
                      className={vis ? 'on' : ''} pathLength="1" />
                  );
                })}
              </svg>
              {NODES.map((n, i) => {
                const [kind, title, tag] = T.nodes[n.id];
                return (
                <div key={n.id} data-id={n.id}
                  className={`rb-node${shown(i) ? ' on' : ''}${erased(n) ? ' erased' : ''}${n.cur && phase !== 1 && shown(i) ? ' cur' : ''}`}
                  style={{ left: `${n.x}%`, top: `${n.y}%`, width: `${NW}%`, '--c': n.c }}>
                  <div className="kind">
                    {n.cur && <i className="gem" />}{kind} <span className="id">{n.id}</span>
                    {tag && <em>{tag}</em>}
                  </div>
                  <div className="title">{title}</div>
                  {n.src && <div className="src mono">@ {n.src}</div>}
                </div>
                );
              })}
              <div className="rb-eraser" style={{ left: `${wipe * 120 - 20}%`, opacity: phase === 1 && wipe < 1 ? 1 : 0 }}><i /></div>
              <div className={`rb-restore${phase === 2 && restore > 0 && restore < 1 ? ' on' : ''}`} style={{ top: `${restore * 100}%` }} />
              <div className={`rb-lost${phase === 1 && wipe > 0.9 ? ' on' : ''}`}>
                <span>context compacted</span>
                <small>{T.lost}</small>
              </div>
            </div>
            <div className="rb-term">
              <span className="pr">$</span>
              <span>{phase === 2 ? typedCmd : phase === 0 ? T.writing : ''}</span>
              <span className="caret" />
              {phase === 2 && restore > 0.98 && (
                <span className="rb-ok">{T.ok}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
