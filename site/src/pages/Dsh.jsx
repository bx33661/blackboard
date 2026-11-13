import { Boxes, CheckCircle2, ChevronRight, Cpu, Eye, Layers, Lock, ShieldCheck, Sparkles, Terminal, Wrench, Zap } from 'lucide-react';
import { useT } from '../i18n.jsx';
import { REPO, useCopy, useCopyPrompt } from '../shared.jsx';

const HIGHLIGHT_ICONS = [Eye, Wrench, ShieldCheck, Zap];

export default function DshPage() {
  const t = useT();
  const D = t.dshPage;
  const copy = useCopy();
  const copyPrompt = useCopyPrompt();

  return (
    <div className="dsh-page">
      {/* Hero Section */}
      <section className="pt-16 pb-12 sm:pt-20 sm:pb-16" aria-labelledby="dsh-hero-title">
        <div className="hero-paper" aria-hidden="true" />
        <div className="wrap">
          <div className="mb-6">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
              <Boxes size={14} />
              <span>{D.kicker}</span>
            </span>
          </div>
          <h1
            id="dsh-hero-title"
            className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[var(--ink)] leading-[1.12] max-w-5xl"
            style={{ fontFamily: 'var(--sans)' }}
          >
            {D.title}
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-[var(--muted)] max-w-3xl leading-relaxed">
            {D.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            {D.badges.map((b) => (
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
              <Sparkles size={16} />{D.cta}
            </button>
            <a
              className="h-12 px-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] font-medium text-sm inline-flex items-center gap-2.5 hover:bg-[var(--surface-2)] transition-all"
              href={`${REPO}/tree/main/plugins/dsh-pinwhy`}
              target="_blank"
              rel="noreferrer"
            >
              <Terminal size={16} />在 GitHub 查看插件源码
            </a>
          </div>
        </div>
      </section>

      {/* Architecture Pipeline */}
      <section className="section" aria-labelledby="dsh-arch-title">
        <div className="wrap">
          <div className="head rv">
            <div className="kicker">{D.architecture.kicker}</div>
            <h2 className="h2" id="dsh-arch-title">{D.architecture.title}</h2>
            <p className="lead">{D.architecture.desc}</p>
          </div>

          <div className="rv p-8 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-[var(--card-shadow)]">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-sm text-[var(--ink)]">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] w-full md:w-auto justify-center">
                <Cpu size={20} className="text-[var(--accent)]" />
                <span>DeepSeek Harness</span>
              </div>
              <ChevronRight className="text-[var(--muted)] hidden md:block" />
              <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20 font-semibold w-full md:w-auto justify-center">
                <Layers size={20} />
                <span>dsh-pinwhy 插件</span>
              </div>
              <ChevronRight className="text-[var(--muted)] hidden md:block" />
              <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] w-full md:w-auto justify-center">
                <Terminal size={20} className="text-[var(--copper)]" />
                <span>独立 Pinwhy CLI</span>
              </div>
              <ChevronRight className="text-[var(--muted)] hidden md:block" />
              <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] w-full md:w-auto justify-center">
                <Lock size={20} className="text-emerald-500" />
                <span>.pinwhy/events.jsonl</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Feature Highlights */}
      <section className="section" aria-labelledby="dsh-feat-title">
        <div className="wrap">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
            {D.highlights.map((h, idx) => {
              const Icon = HIGHLIGHT_ICONS[idx] || Zap;
              return (
                <div key={idx} className="rv p-8 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-[var(--card-shadow)] flex flex-col justify-between" style={{ '--d': `${idx * 0.08}s` }}>
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="p-2 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                        <Icon size={20} />
                      </span>
                      <span className="font-sans text-xs font-semibold uppercase text-[var(--copper)] tracking-wider">
                        {h.k}
                      </span>
                    </div>
                    <h3 className="font-serif font-bold text-2xl text-[var(--ink)] mb-3">{h.t}</h3>
                    <p className="text-[var(--text)] text-sm leading-relaxed mb-4">{h.desc}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] text-xs font-mono text-[var(--muted)] leading-relaxed">
                    {h.detail}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3 Steps Install Section */}
      <section className="section" aria-labelledby="dsh-install-title">
        <div className="wrap">
          <div className="head rv">
            <div className="kicker">{D.installSection.kicker}</div>
            <h2 className="h2" id="dsh-install-title">{D.installSection.title}</h2>
          </div>

          <div className="space-y-6">
            {D.installSection.steps.map((st, idx) => (
              <div key={idx} className="rv p-6 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-[var(--card-shadow)] flex flex-col md:flex-row md:items-center justify-between gap-6" style={{ '--d': `${idx * 0.1}s` }}>
                <div className="max-w-md">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-sm font-bold text-[var(--accent)]">{st.n}</span>
                    <h3 className="font-serif font-bold text-lg text-[var(--ink)]">{st.t}</h3>
                  </div>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">{st.d}</p>
                </div>
                <div className="flex-1 max-w-xl">
                  {st.cmd && (
                    <button
                      className="w-full text-left p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] font-mono text-xs text-[var(--ink)] hover:border-[var(--accent)] transition-colors flex items-center justify-between group"
                      onClick={() => copy(st.cmd, '命令已复制')}
                    >
                      <code>$ {st.cmd}</code>
                      <span className="text-[var(--muted)] group-hover:text-[var(--accent)] text-xs font-sans">点击复制</span>
                    </button>
                  )}
                  {st.code && (
                    <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] font-mono text-xs text-[var(--ink)] overflow-x-auto whitespace-pre">
                      {st.code}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14 p-8 rounded-2xl bg-[var(--surface-2)] border border-[var(--line)] text-center rv">
            <h3 className="font-serif font-bold text-2xl text-[var(--ink)] mb-3">在熟悉的工作区里，查看项目记忆</h3>
            <p className="text-[var(--muted)] text-sm max-w-xl mx-auto mb-6">
              适配 DSH 0.2.2-rc.2。接入项目后，可让 Agent 检查 Pinwhy 状态，并在内嵌画板里查看记录。
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a className="btn btn-solid" href={`${REPO}/blob/main/plugins/dsh-pinwhy/README.md`} target="_blank" rel="noreferrer">
                阅读插件完整文档
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
