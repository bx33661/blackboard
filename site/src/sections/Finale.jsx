import { useT } from '../i18n.jsx';
import { DOCS, Icon, REPO, useCopyPrompt } from '../shared.jsx';

export default function Finale() {
  const t = useT();
  const copyPrompt = useCopyPrompt();
  const links = [DOCS, `${REPO}/blob/main/docs/README.md`, `${REPO}/blob/main/AGENT.md`, `${REPO}/blob/main/CONTRIBUTING.md`, REPO];
  return (
    <>
      <section className="finale" aria-labelledby="fin-title">
        <div className="wrap rv">
          <h2 className="fin-title" id="fin-title">{t.finale.title}<span className="dot" aria-hidden="true"><i /></span></h2>
          <p>{t.finale.lead}</p>
          <div className="hero-cta">
            <button className="btn btn-solid" onClick={copyPrompt}><Icon.copy />{t.finale.cta}</button>
            <a className="btn btn-line" href={DOCS} target="_blank" rel="noreferrer">{t.finale.docs}<Icon.arrow /></a>
          </div>
        </div>
      </section>
      <footer className="foot">
        <div className="wrap foot-in">
          <div className="foot-brand">
            <img src="/mark.svg" alt="" /><b>Pinwhy</b><span>{t.footer.tag}</span>
          </div>
          <nav className="foot-links" aria-label="footer">
            {t.footer.links.map((label, i) => <a key={label} href={links[i]} target="_blank" rel="noreferrer">{label}</a>)}
          </nav>
          <div className="foot-brand">{t.footer.license}</div>
        </div>
      </footer>
    </>
  );
}
