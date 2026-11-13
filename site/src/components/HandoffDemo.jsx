import { useEffect, useRef, useState } from 'react';
import { FileText, RotateCcw } from 'lucide-react';
import { siClaude } from 'simple-icons';
import { useLang } from '../i18n.jsx';
import { Brand, reducedMotion, useInViewport } from '../shared.jsx';

const COPY = {
  zh: {
    a: '会话 1', b: '会话 2', file: '.pinwhy/', records: '条记录',
    lost: 'context compacted', replay: '重播',
    left: [
      ['pin', 'goal', 'g1', '定位越权入口'],
      ['pin', 'evidence', 'o1', 'admin-users.http:12'],
      ['pin', 'finding', 'f1', '缺少角色校验'],
    ],
    cmd: 'pinwhy context --budget 4000',
    right: [['restored', 'g1 · o1 · f1'], ['cursor', 'q1 继续验证修复']],
    aria: '演示：会话 1 写下记录，上下文压缩后，会话 2 读回同一份进展。',
  },
  en: {
    a: 'Session 1', b: 'Session 2', file: '.pinwhy/', records: 'records',
    lost: 'context compacted', replay: 'Replay',
    left: [
      ['pin', 'goal', 'g1', 'Find the authz gap'],
      ['pin', 'evidence', 'o1', 'admin-users.http:12'],
      ['pin', 'finding', 'f1', 'Missing role check'],
    ],
    cmd: 'pinwhy context --budget 4000',
    right: [['restored', 'g1 · o1 · f1'], ['cursor', 'q1 verify the fix']],
    aria: 'Demo: session 1 records its work, context gets compacted, session 2 reads the same progress back.',
  },
};

const LAST = 8;
const TICK = 720;

export default function HandoffDemo() {
  const { lang } = useLang();
  const C = COPY[lang] ?? COPY.en;
  const ref = useRef(null);
  const onScreen = useInViewport(ref);
  const [step, setStep] = useState(() => (reducedMotion() ? LAST : 0));
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!onScreen || step >= LAST || reducedMotion()) return undefined;
    const id = setTimeout(() => setStep((s) => s + 1), step === 0 ? 500 : TICK);
    return () => clearTimeout(id);
  }, [onScreen, step, run]);

  const replay = () => { setStep(reducedMotion() ? LAST : 0); setRun((r) => r + 1); };
  const recs = Math.min(3, Math.max(0, step));
  const compacted = step >= 4;
  const typed = step >= 5 ? C.cmd : '';

  return (
    <div className="hd rv" ref={ref} role="img" aria-label={C.aria} style={{ '--d': '0.2s' }}>
      <div className={`hd-lane${compacted ? ' gone' : ''}`}>
        <header><Brand icon={siClaude} size={13} /><span>{C.a}</span><em>Claude Code</em></header>
        <ol>
          {C.left.map(([verb, kind, id, text], i) => (
            <li key={id} className={step > i ? 'on' : ''}>
              <span className="v">{verb}</span><span className={`k k-${kind}`}>{kind}</span>
              <span className="id">{id}</span><span className="t">{text}</span>
            </li>
          ))}
        </ol>
        <div className={`hd-lost${compacted ? ' on' : ''}`} aria-hidden="true"><span>{C.lost}</span></div>
      </div>

      <div className={`hd-file${recs ? ' on' : ''}${step >= 6 ? ' read' : ''}`}>
        <span className="hd-wire l" /><span className="hd-wire r" />
        <span className="hd-file-ico"><FileText size={15} strokeWidth={1.8} /></span>
        <b>{C.file}</b>
        <small><span key={recs} className="n">{recs}</span> {C.records}</small>
      </div>

      <div className={`hd-lane b${step >= 5 ? ' live' : ''}`}>
        <header><span className="hd-host-dot" /><span>{C.b}</span><em>Codex</em></header>
        <ol>
          <li className={step >= 5 ? 'on' : ''}>
            <span className="pr">$</span><span className="cmd">{typed}</span>
            {step === 5 && <span className="hd-caret" />}
          </li>
          {C.right.map(([k, v], i) => (
            <li key={k} className={step >= 6 + i ? 'on' : ''}>
              <span className="ok">{k}</span><span className="t">{v}</span>
            </li>
          ))}
        </ol>
      </div>

      <button type="button" className={`hd-replay${step >= LAST ? ' on' : ''}`} onClick={replay}>
        <RotateCcw size={13} strokeWidth={2} aria-hidden="true" />{C.replay}
      </button>
    </div>
  );
}
