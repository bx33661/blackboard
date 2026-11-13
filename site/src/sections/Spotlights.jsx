import { ArrowUpRight, Check } from 'lucide-react';
import { useT } from '../i18n.jsx';
import { useRoute } from '../router.jsx';

function AuditVisual() {
  return (
    <div className="spv spv-audit" aria-hidden="true">
      <div className="spv-head">
        <span className="dot" /> audit / admin-api
        <span className="badge">SARIF 2.1.0</span>
      </div>
      <ul className="tree">
        <li className="q"><i /> <b>Q1</b> anonymous access boundary?</li>
        <li className="c ok"><i /> <b>C1</b> read endpoints skip auth <em>supports ×3</em></li>
        <li className="c no"><i /> <b>C2</b> stale cache explains 200 <em>refuted</em></li>
        <li className="k"><i /> <b>K1</b> requires anon session <em>condition</em></li>
      </ul>
    </div>
  );
}

function HostVisual() {
  return (
    <div className="spv spv-host" aria-hidden="true">
      <div className="spv-head">
        <span className="dot" /> deepseek-harness
        <span className="badge">plugin · pinwhy</span>
      </div>
      <div className="tools">
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} style={{ '--i': i }} />
        ))}
      </div>
      <div className="sess">
        <span>session a3f9</span>
        <span className="ok"><Check size={11} strokeWidth={2.4} /> path</span>
      </div>
    </div>
  );
}

function SpotCard({ data, visual, tone, onOpen, delay }) {
  return (
    <article className={`sp-card sp-${tone} rv`} style={{ '--d': delay }}>
      {visual}
      <div className="sp-body">
        <div className="sp-kicker"><span className="pip" />{data.kicker}</div>
        <h3 className="sp-title">{data.title}</h3>
        <p className="sp-desc">{data.desc}</p>
        <ul className="sp-list">
          {data.features.map((f) => (
            <li key={f}><Check size={14} strokeWidth={2.2} aria-hidden="true" /><span>{f}</span></li>
          ))}
        </ul>
        <button type="button" onClick={onOpen} className="sp-cta">
          <span>{data.cta}</span>
          <span className="arr"><ArrowUpRight size={15} aria-hidden="true" /></span>
        </button>
      </div>
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
          <SpotCard data={S.security} visual={<AuditVisual />} tone="sec" onOpen={() => navigate('security')} delay="0.05s" />
          <SpotCard data={S.dsh} visual={<HostVisual />} tone="dsh" onOpen={() => navigate('dsh')} delay="0.12s" />
        </div>
      </div>
    </section>
  );
}
