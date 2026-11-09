import { useState } from 'react';
import { useT } from '../i18n.jsx';
import { DOCS, Icon } from '../shared.jsx';

export default function Faq() {
  const F = useT().faq;
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="section" aria-labelledby="faq-title">
      <div className="wrap faq-grid">
        <div className="rv">
          <div className="kicker">{F.kicker}</div>
          <h2 className="h2" id="faq-title">{F.title}</h2>
          <p className="lead">{F.more[0]}<a href={DOCS} target="_blank" rel="noreferrer" className="link">{F.more[1]}</a>{F.more[2]}</p>
        </div>
        <div className="faq-list rv" style={{ '--d': '.08s' }}>
          {F.qa.map(([q, a], i) => (
            <div key={i} className={`faq-item${open === i ? ' open' : ''}`}>
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                {q}<Icon.plus />
              </button>
              <div className="faq-a"><div><p>{a}</p></div></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
