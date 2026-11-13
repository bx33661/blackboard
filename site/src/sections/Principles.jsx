import { HardDrive, Link2, NotebookPen } from 'lucide-react';
import { useT } from '../i18n.jsx';

const ICONS = [Link2, NotebookPen, HardDrive];

export default function Principles() {
  const P = useT().principles;
  return (
    <section id="principles" className="section principles" aria-labelledby="pr-title">
      <div className="wrap">
        <div className="head rv">
          <div className="kicker">{P.kicker}</div>
          <h2 className="h2" id="pr-title">{P.title}</h2>
          <p className="lead">{P.lead}</p>
        </div>
        <ol className="pr-list">
          {P.items.map(([title, desc, code], i) => (
            <li key={title} className="rv" style={{ '--d': `${i * 0.08}s` }}>
              <span className="pr-n">{(() => { const I = ICONS[i]; return <span className="pr-ic"><I size={18} strokeWidth={1.7} aria-hidden="true" /></span>; })()}</span>
              <div className="pr-body">
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
              <code className="pr-code">{code}</code>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
