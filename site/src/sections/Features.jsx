import { NumberTicker } from '@/components/ui/number-ticker';
import { useSiteTheme } from '@/lib/theme';
import { useLang } from '../i18n.jsx';

/* Real workspace captures (site/scripts/capture.mjs), one per language and theme. */
function Shot({ name, alt, label }) {
  const { lang } = useLang();
  const { resolved } = useSiteTheme();
  return (
    <figure className={`shot shot-${name}`}>
      <img src={`/shots/${name}-${lang}-${resolved}.webp`} alt={alt} loading="lazy" decoding="async" />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function Local({ T }) {
  return (
    <div className="v-local">
      <div className="tree">
        <div className="hl">your-project/</div>
        <div className="i1">├─ src/</div>
        <div className="i1 hl">└─ .blackboard/</div>
        <div className="i2 hl2">└─ events.jsonl<em>{T.tree}</em></div>
      </div>
      <div className="lo"><i />{T.loopback}</div>
    </div>
  );
}

export default function Features() {
  const { t } = useLang();
  const F = t.features;
  const rows = [...F.rows, { ...F.local, local: true }];
  return (
    <section id="features" className="section" aria-labelledby="feat-title">
      <div className="wrap">
        <div className="head rv">
          <div className="kicker">{F.kicker}</div>
          <h2 className="h2" id="feat-title">{F.title}</h2>
          <p className="lead">{F.lead}</p>
        </div>
        <div>
          {rows.map((r) => (
            <div key={r.k} className={`frow${r.local ? ' frow-local' : ''}`}>
              <div className="fvis rv">
                {r.local ? <Local T={F.local} /> : <Shot name={r.shot} alt={r.t} label={F.real} />}
              </div>
              <div className="ftext rv" style={{ '--d': '.08s' }}>
                <h3><small>{r.k}</small>{r.t}</h3>
                <ul>{r.li.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            </div>
          ))}
        </div>
        <div className="stats rv">
          {F.stats.map(([v, label]) => (
            <div key={label} className="stat">
              <div className="num">{v === 0 ? <span>0</span> : <NumberTicker value={v} />}</div>
              <p>{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
