import { ArrowRight, Boxes, CheckCircle2, Shield } from 'lucide-react';
import { useT } from '../i18n.jsx';
import { useRoute } from '../router.jsx';

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
          {/* Security Spotlight Card */}
          <div className="rv p-8 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-[var(--card-shadow)] flex flex-col justify-between" style={{ '--d': '0.05s' }}>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="p-2 rounded-lg bg-red-500/10 text-red-500">
                  <Shield size={20} />
                </span>
                <span className="font-sans text-xs font-semibold uppercase text-red-500 tracking-wider">
                  {S.security.kicker}
                </span>
              </div>
              <h3 className="font-serif font-bold text-2xl text-[var(--ink)] mb-3">{S.security.title}</h3>
              <p className="text-[var(--text)] text-sm leading-relaxed mb-6">{S.security.desc}</p>
              <ul className="space-y-2 mb-6">
                {S.security.features.map((f) => (
                  <li key={f} className="text-xs text-[var(--muted)] flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => navigate('security')}
              className="btn btn-solid w-full justify-center group"
            >
              <span>{S.security.cta}</span>
              <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* DSH Spotlight Card */}
          <div className="rv p-8 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-[var(--card-shadow)] flex flex-col justify-between" style={{ '--d': '0.12s' }}>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="p-2 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Boxes size={20} />
                </span>
                <span className="font-sans text-xs font-semibold uppercase text-[var(--accent)] tracking-wider">
                  {S.dsh.kicker}
                </span>
              </div>
              <h3 className="font-serif font-bold text-2xl text-[var(--ink)] mb-3">{S.dsh.title}</h3>
              <p className="text-[var(--text)] text-sm leading-relaxed mb-6">{S.dsh.desc}</p>
              <ul className="space-y-2 mb-6">
                {S.dsh.features.map((f) => (
                  <li key={f} className="text-xs text-[var(--muted)] flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => navigate('dsh')}
              className="btn btn-solid w-full justify-center group"
            >
              <span>{S.dsh.cta}</span>
              <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
