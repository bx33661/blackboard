import { useT } from '../i18n.jsx';
import { Icon, REPO, useCopyPrompt } from '../shared.jsx';

const WORD = 'Pinwhy';

export default function Hero() {
  const t = useT();
  const copyPrompt = useCopyPrompt();
  const [lead1, lead2, lead3] = t.hero.lead;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-paper" aria-hidden="true" />
      <div className="wrap">
        <a className="hero-pill sans" href={t.hero.eyebrowHref} target="_blank" rel="noreferrer">
          <i />{t.hero.eyebrow}<Icon.arrow />
        </a>
        <h1 className="wordmark" id="hero-title" aria-label="Pinwhy">
          <span className="wm-latin" aria-hidden="true">
            {[...WORD].map((ch, i) => <span key={i} className="ch" style={{ '--i': i }}>{ch}</span>)}
          </span>
          <span className="dot" aria-hidden="true"><i /></span>
        </h1>
        <p className="hero-lead">
          {lead1}<br className="br-d" />{lead2}
          <span className="chalk">
            {lead3}
            <svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
              <path d="M3 9 C 60 3, 120 12, 180 6 S 270 4, 297 8" />
            </svg>
          </span>
        </p>
        <ul className="hero-meta sans">
          {t.hero.meta.map((m) => <li key={m}>{m}</li>)}
        </ul>
        <div className="hero-cta">
          <button className="btn btn-solid" onClick={copyPrompt}><Icon.copy />{t.hero.cta}</button>
          <a className="btn btn-line" href={REPO} target="_blank" rel="noreferrer"><Icon.github />{t.hero.gh}</a>
        </div>
      </div>
    </section>
  );
}
