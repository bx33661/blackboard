import { useState } from 'react';
import { useT } from '../i18n.jsx';
import { DOCS, Icon, REPO, useCopyPrompt } from '../shared.jsx';
import DotWordmark from '../components/DotWordmark.jsx';

const PIN_KEY = 'pinwhy-site-pins';

export default function Finale() {
  const t = useT();
  const copyPrompt = useCopyPrompt();
  const [pins, setPins] = useState(() => {
    try { return Number(localStorage.getItem(PIN_KEY)) || 0; } catch { return 0; }
  });
  const addPin = () => setPins((n) => {
    const next = n + 1;
    try { localStorage.setItem(PIN_KEY, String(next)); } catch { /* counter stays in memory */ }
    return next;
  });
  const links = [DOCS, `${REPO}/blob/main/docs/README.md`, `${REPO}/blob/main/AGENT.md`, `${REPO}/blob/main/CONTRIBUTING.md`, REPO];
  const F = t.footer;
  const cols = [
    [F.cols[0], [0, 1]],
    [F.cols[1], [2, 3, 4]],
  ];
  return (
    <>
      <section className="finale" aria-labelledby="fin-title">
        <div className="wrap rv">
          <div className="fin-grid" aria-hidden="true" />
          <h2 className="fin-title" id="fin-title">{t.finale.title}<span className="dot" aria-hidden="true"><i /></span></h2>
          <p>{t.finale.lead}</p>
          <div className="hero-cta">
            <button className="btn btn-solid" onClick={copyPrompt}><Icon.copy />{t.finale.cta}</button>
            <a className="btn btn-line" href={DOCS} target="_blank" rel="noreferrer">{t.finale.docs}<Icon.arrow /></a>
          </div>
        </div>
      </section>
      <footer className="foot">
        <div className="wrap foot-top">
          <div className="foot-about">
            <div className="foot-brand"><img src="/mark.svg" alt="" /><b>Pinwhy</b></div>
            <p>{F.tag}</p>
            <a className="icon-btn foot-gh" href={REPO} target="_blank" rel="noreferrer" aria-label="GitHub">
              <Icon.github width="17" height="17" />
            </a>
            <small>{`© ${new Date().getFullYear()} Pinwhy · ${F.license}`}</small>
          </div>
          {cols.map(([title, idx]) => (
            <nav key={title} className="foot-col" aria-label={title}>
              <h3>{title}</h3>
              {idx.map((i) => (
                <a key={i} href={links[i]} target="_blank" rel="noreferrer">{F.links[i]}<Icon.arrow /></a>
              ))}
            </nav>
          ))}
        </div>
        <div className="wrap foot-play">
          <p className="foot-hint">
            <span>{F.play[0]}</span>
            <span aria-live="polite">{F.play[1]} <b>{pins}</b> {F.play[2]}</span>
          </p>
          <DotWordmark text="Pinwhy" onPin={addPin} />
        </div>
      </footer>
    </>
  );
}
