import { useEffect, useState } from 'react';
import { ArrowRight, Copy } from 'lucide-react';
import { BorderBeam } from '@/components/ui/border-beam';
import { useLang, useT } from '../i18n.jsx';
import { Icon, REPO, useCopyPrompt } from '../shared.jsx';

const AGENTS = [
  { name: 'Claude Code', color: '#d97706' },
  { name: 'Cursor', color: '#0284c7' },
  { name: 'Codex', color: '#10b981' },
  { name: 'DeepSeek Harness', color: '#4f46e5' },
  { name: 'Gemini CLI', color: '#2563eb' },
  { name: 'OMP', color: '#059669' },
];

const SUPPORTED_HOSTS = [
  'Claude Code',
  'Cursor',
  'Codex',
  'DeepSeek Harness',
  'Gemini CLI',
  'Copilot CLI',
  'OMP',
  'OpenCode',
];

export default function Hero() {
  const { lang } = useLang();
  const t = useT();
  const copyPrompt = useCopyPrompt();
  const [agentIdx, setAgentIdx] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setAgentIdx((i) => (i + 1) % AGENTS.length);
        setFading(false);
      }, 200);
    }, 2400);
    return () => clearInterval(timer);
  }, []);

  const activeAgent = AGENTS[agentIdx];

  return (
    <section className="hero pt-16 pb-12 sm:pt-20 sm:pb-16" aria-labelledby="hero-title">
      <div className="hero-paper" aria-hidden="true" />
      <div className="wrap">
        {/* Eyebrow Badge */}
        <div className="mb-6">
          <a
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] text-xs text-[var(--muted)] font-medium hover:border-[var(--line-2)] hover:text-[var(--ink)] transition-colors shadow-xs"
            href={t.hero.eyebrowHref}
            target="_blank"
            rel="noreferrer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-[var(--ink)]">Pinwhy v0.2.0</span>
            <span className="text-[var(--line-2)]">|</span>
            <span>{lang === 'zh' ? "安全审计模式与多宿主接入" : "Security audit mode & multi-host setup"}</span>
            <ArrowRight size={13} className="text-[var(--muted)]" />
          </a>
        </div>

        {/* Multica-style Main Heading with Rotating Agent Pill */}
        <h1
          id="hero-title"
          className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[var(--ink)] leading-[1.12] max-w-5xl"
          style={{ fontFamily: 'var(--sans)' }}
        >
          {lang === 'zh' ? (
            <>
              给{' '}
              <span className="relative inline-flex items-center gap-[0.25em] rounded-full border border-emerald-500/25 bg-emerald-500/10 px-[0.38em] py-[0.04em] text-[var(--ink)] align-middle shadow-xs overflow-hidden">
                <BorderBeam size={70} duration={4.5} colorFrom="#10b981" colorTo="#38bdf8" borderWidth={1.5} />
                <span className="text-[var(--accent)] text-[0.8em] font-normal select-none">✳</span>
                <span
                  className="transition-all duration-200 inline-block font-sans font-bold"
                  style={{
                    opacity: fading ? 0 : 1,
                    transform: fading ? 'translateY(4px)' : 'none',
                  }}
                >
                  {activeAgent.name}
                </span>
              </span>{' '}
              留一份有据可查的记忆。
            </>
          ) : (
            <>
              Give{' '}
              <span className="relative inline-flex items-center gap-[0.25em] rounded-full border border-emerald-500/25 bg-emerald-500/10 px-[0.38em] py-[0.04em] text-[var(--ink)] align-middle shadow-xs overflow-hidden">
                <BorderBeam size={70} duration={4.5} colorFrom="#10b981" colorTo="#38bdf8" borderWidth={1.5} />
                <span className="text-[var(--accent)] text-[0.8em] font-normal select-none">✳</span>
                <span
                  className="transition-all duration-200 inline-block font-sans font-bold"
                  style={{
                    opacity: fading ? 0 : 1,
                    transform: fading ? 'translateY(4px)' : 'none',
                  }}
                >
                  {activeAgent.name}
                </span>
              </span>{' '}
              a record to build on.
            </>
          )}
        </h1>
        {/* Subtitle */}
        <p className="mt-6 text-lg sm:text-xl text-[var(--muted)] max-w-3xl leading-relaxed">
          {lang === 'zh'
            ? "把关键判断、证据与未决问题留在项目里。上下文压缩或切换会话后，Agent 可以读回已有进展；人在工作台里，也能看清判断从何而来。"
            : "Keep key judgments, evidence, and open questions in your project. Agents can read back progress across sessions, while people can review the evidence behind each judgment."}
        </p>

        {/* CTA Buttons */}
        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <button
            onClick={copyPrompt}
            className="h-12 px-6 rounded-xl bg-[var(--ink)] text-[var(--bg)] font-medium text-sm inline-flex items-center gap-2.5 shadow-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
          >
            <Copy size={16} />
            <span>{t.hero.cta}</span>
          </button>
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="h-12 px-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] font-medium text-sm inline-flex items-center gap-2.5 hover:bg-[var(--surface-2)] transition-all"
          >
            <Icon.github width="16" height="16" />
            <span>{t.hero.gh}</span>
          </a>
        </div>

        {/* Supported Hosts Bar */}
        <div className="mt-12 pt-7 border-t border-[var(--line)] flex flex-wrap items-center gap-2.5 text-xs text-[var(--muted)]">
          <span className="font-semibold text-[var(--ink)] mr-1">
            {lang === 'zh' ? "支持接入：" : "Works with:"}
          </span>
          {SUPPORTED_HOSTS.map((host) => (
            <span
              key={host}
              className="px-2.5 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text)] font-mono text-[11.5px]"
            >
              {host}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
