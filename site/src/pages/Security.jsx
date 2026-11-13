import { Bug, CheckCircle2, FileCheck, FileCode, GitFork, Link2, Lock, Shield, ShieldAlert, Sparkles, Terminal } from 'lucide-react';
import { useT } from '../i18n.jsx';
import { REPO, useCopyPrompt } from '../shared.jsx';

const CARD_ICONS = [GitFork, Bug, Link2, ShieldAlert];

export default function SecurityPage() {
  const t = useT();
  const S = t.securityPage;
  const copyPrompt = useCopyPrompt();

  return (
    <div className="security-page">
      {/* Hero Section */}
      <section className="pt-16 pb-12 sm:pt-20 sm:pb-16" aria-labelledby="sec-hero-title">
        <div className="hero-paper" aria-hidden="true" />
        <div className="wrap">
          <div className="mb-6">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <Shield size={14} />
              <span>{S.kicker}</span>
            </span>
          </div>
          <h1
            id="sec-hero-title"
            className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[var(--ink)] leading-[1.12] max-w-5xl"
            style={{ fontFamily: 'var(--sans)' }}
          >
            {S.title}
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-[var(--muted)] max-w-3xl leading-relaxed">
            {S.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            {S.badges.map((b) => (
              <span key={b} className="px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text)] font-medium inline-flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span>{b}</span>
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <button
              className="h-12 px-6 rounded-xl bg-[var(--ink)] text-[var(--bg)] font-medium text-sm inline-flex items-center gap-2.5 shadow-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
              onClick={copyPrompt}
            >
              <Sparkles size={16} />{S.cta}
            </button>
            <a
              className="h-12 px-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] font-medium text-sm inline-flex items-center gap-2.5 hover:bg-[var(--surface-2)] transition-all"
              href={`${REPO}/blob/main/skills/pinwhy-code-audit/SKILL.md`}
              target="_blank"
              rel="noreferrer"
            >
              <FileCode size={16} />阅读审计记录方法
            </a>
          </div>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="section" aria-labelledby="pain-title">
        <div className="wrap">
          <div className="head rv">
            <div className="kicker">{S.painPoints.kicker}</div>
            <h2 className="h2" id="pain-title">{S.painPoints.title}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {S.painPoints.items.map((item, idx) => (
              <div key={idx} className="rv p-6 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-[var(--card-shadow)] flex flex-col justify-between" style={{ '--d': `${idx * 0.1}s` }}>
                <div>
                  <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-500 dark:bg-red-500/20 flex items-center justify-center font-mono text-xs font-bold mb-4">
                    0{idx + 1}
                  </div>
                  <h3 className="font-serif font-bold text-xl text-[var(--ink)] mb-3">{item.title}</h3>
                  <div className="text-sm leading-relaxed text-[var(--muted)] mb-4 pb-4 border-b border-[var(--line)]">
                    <span className="font-semibold text-red-500/90 block mb-1">调查难点：</span>
                    {item.problem}
                  </div>
                </div>
                <div className="text-sm leading-relaxed text-[var(--text)]">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">记录方式：</span>
                  {item.solution}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audit Workspace Reading Mode Section */}
      <section className="section" aria-labelledby="workspace-title">
        <div className="wrap">
          <div className="head rv">
            <div className="kicker">{S.workspaceSection.kicker}</div>
            <h2 className="h2" id="workspace-title">{S.workspaceSection.title}</h2>
            <p className="lead">{S.workspaceSection.lead}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {S.workspaceSection.cards.map((card, idx) => {
              const Icon = CARD_ICONS[idx] || Shield;
              return (
                <div key={idx} className="rv p-7 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-[var(--card-shadow)] flex flex-col justify-between" style={{ '--d': `${idx * 0.08}s` }}>
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                          <Icon size={18} />
                        </span>
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--muted)]">
                          {card.type}
                        </span>
                      </div>
                      <span className="font-sans text-xs font-semibold text-[var(--copper)] tracking-wider uppercase">
                        {card.tag}
                      </span>
                    </div>
                    <h3 className="font-serif font-bold text-xl text-[var(--ink)] mb-3">{card.title}</h3>
                    <p className="text-[var(--text)] text-sm leading-relaxed">{card.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Compliance & Output Section */}
      <section className="section" aria-labelledby="compliance-title">
        <div className="wrap">
          <div className="head rv">
            <div className="kicker">{S.complianceSection.kicker}</div>
            <h2 className="h2" id="compliance-title">{S.complianceSection.title}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {S.complianceSection.items.map((item, idx) => (
              <div key={idx} className="rv p-6 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-[var(--card-shadow)]" style={{ '--d': `${idx * 0.09}s` }}>
                <div className="mb-4 text-[var(--accent)]">
                  {idx === 0 ? <FileCheck size={26} /> : idx === 1 ? <Terminal size={26} /> : <Lock size={26} />}
                </div>
                <h3 className="font-serif font-bold text-lg text-[var(--ink)] mb-2">{item.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 p-8 rounded-2xl bg-[var(--surface-2)] border border-[var(--line)] text-center rv">
            <h3 className="font-serif font-bold text-2xl text-[var(--ink)] mb-3">为下一次审计，留一份项目记忆</h3>
            <p className="text-[var(--muted)] text-sm max-w-xl mx-auto mb-6">
              完整 Skill 包包含可选的审计记录方法。完成接入后，可让 Agent 按任务需要读取和使用。
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button className="btn btn-solid" onClick={copyPrompt}>
                <Sparkles size={16} />复制接入指令
              </button>
              <a className="btn btn-line" href={`${REPO}/tree/main/skills/pinwhy-code-audit`} target="_blank" rel="noreferrer">
                了解审计记录方法
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
