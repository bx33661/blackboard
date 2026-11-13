import { ArrowRight, Boxes, Shield } from 'lucide-react';
import { useT } from '../i18n.jsx';
import { useRoute } from '../router.jsx';

function SpotCard({ data, icon: I, tone, onOpen, delay }) {
  return (
    <article className={`sp-card sp-${tone} rv`} style={{ '--d': delay }}>
      <div className="sp-top">
        <span className="sp-ico"><I size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="sp-kicker">{data.kicker}</span>
      </div>
      <h3 className="sp-title">{data.title}</h3>
      <p className="sp-desc">{data.desc}</p>
      <ol className="sp-list">
        {data.features.map((f, i) => (
          <li key={f}><span className="n">{String(i + 1).padStart(2, '0')}</span><span>{f}</span></li>
        ))}
      </ol>
      <button type="button" onClick={onOpen} className="sp-cta">
        <span>{data.cta}</span>
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    </article>
  );
}

export default function Spotlights() {
  const t = useT();
  const { navigate } = useRoute();
  const S = t.spotlights;

  return (
    <section className="section spotlights" aria-labelledby="spot-title">
      <div className="wrap">
        <div className="head rv">
          <div className="kicker">专项场景</div>
          <h2 className="h2" id="spot-title">面向真实复杂任务的深度设计</h2>
          <p className="lead">从长程代码安全审计，到 DeepSeek Harness 原生插件生态，为严苛的工程探索提供可复核的确定性记忆。</p>
        </div>

        <div className="sp-grid">
          <SpotCard data={S.security} icon={Shield} tone="sec" onOpen={() => navigate('security')} delay="0.05s" />
          <SpotCard data={S.dsh} icon={Boxes} tone="dsh" onOpen={() => navigate('dsh')} delay="0.12s" />
        </div>
      </div>
    </section>
  );
}
