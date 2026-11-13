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
        <div className="i1 hl">└─ .pinwhy/</div>
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
        <div className="bento">
          {rows.map((r, i) => (
            <article
              key={r.k}
              className={`bento-card rv${i === 0 ? ' wide' : ''}${r.local ? ' is-local' : ''}`}
              style={{ '--d': `${(i % 2) * 0.06}s` }}
            >
              <div className={`bento-vis${r.shot ? ` vis-${r.shot}` : ''}`}>
                {r.local ? <Local T={F.local} /> : <Shot name={r.shot} alt={r.t} label={F.real} />}
              </div>
              <div className="bento-text">
                <span className="bento-k">{r.k}</span>
                <h3>{r.t}</h3>
                <ul>{r.li.map((x, j) => <li key={j}>{x}</li>)}</ul>
              </div>
            </article>
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
